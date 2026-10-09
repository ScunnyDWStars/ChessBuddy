import type { EngineLine } from '../types';
import { LineCollector } from './uci';

export interface AnalyzeOptions {
  depth: number;
  multipv: number;
}

/** Anything that can evaluate a position. Implemented by the browser worker pool and the Node test engine. */
export interface Analyzer {
  analyze(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]>;
  terminate(): void;
}

/** Minimal transport to a UCI engine: send a command, receive output lines. */
export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

interface Job {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (lines: EngineLine[]) => void;
  reject: (err: unknown) => void;
}

/** Drives a single UCI engine, running one search at a time. */
export class UciEngine implements Analyzer {
  private queue: Job[] = [];
  private current: { job: Job; collector: LineCollector } | null = null;
  private ready: Promise<void>;
  private multipv = 1;
  private dead = false;

  constructor(private transport: UciTransport) {
    let markReady: () => void;
    this.ready = new Promise((r) => (markReady = r));
    transport.onLine((line) => {
      if (line === 'readyok') markReady();
      else this.handle(line);
    });
    transport.send('uci');
    transport.send('setoption name Hash value 32');
    transport.send('isready');
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]> {
    if (this.dead) return Promise.reject(new Error('Engine terminated'));
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject });
      void this.ready.then(() => this.pump());
    });
  }

  terminate(): void {
    this.dead = true;
    this.transport.terminate();
    const err = new Error('Engine terminated');
    this.current?.job.reject(err);
    this.queue.forEach((j) => j.reject(err));
    this.queue = [];
    this.current = null;
  }

  private pump(): void {
    if (this.current || this.dead) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = { job, collector: new LineCollector() };
    if (job.opts.multipv !== this.multipv) {
      this.multipv = job.opts.multipv;
      this.transport.send(`setoption name MultiPV value ${job.opts.multipv}`);
    }
    this.transport.send(`position fen ${job.fen}`);
    this.transport.send(`go depth ${job.opts.depth}`);
  }

  private handle(line: string): void {
    if (!this.current) return;
    if (line.startsWith('info ')) {
      this.current.collector.push(line);
    } else if (line.startsWith('bestmove')) {
      const { job, collector } = this.current;
      this.current = null;
      const side = job.fen.split(' ')[1] === 'b' ? 'b' : 'w';
      job.resolve(collector.result(side));
      this.pump();
    }
  }
}

/** Spreads analysis requests over several engines. */
export class EnginePool implements Analyzer {
  private next = 0;
  constructor(private engines: UciEngine[]) {}

  get size(): number {
    return this.engines.length;
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<EngineLine[]> {
    const idle = this.engines.find((e) => !e.busy);
    const engine = idle ?? this.engines[this.next++ % this.engines.length];
    return engine.analyze(fen, opts);
  }

  terminate(): void {
    this.engines.forEach((e) => e.terminate());
  }
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

function workerTransport(): UciTransport {
  const worker = new Worker(ENGINE_URL);
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      worker.onmessage = (e: MessageEvent) => {
        if (typeof e.data === 'string') e.data.split('\n').forEach((l) => l && cb(l));
      };
    },
    terminate: () => worker.terminate(),
  };
}

let sharedPool: EnginePool | null = null;

/** Returns a lazily created pool of Stockfish web workers sized to the device. */
export function getBrowserEngine(): EnginePool {
  if (!sharedPool) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    // Phones with little memory get two engines so the browser doesn't kill the tab.
    const memory = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
    const count = Math.max(1, Math.min(memory !== undefined && memory <= 4 ? 2 : 4, cores - 1));
    sharedPool = new EnginePool(Array.from({ length: count }, () => new UciEngine(workerTransport())));
  }
  return sharedPool;
}

export function resetBrowserEngine(): void {
  sharedPool?.terminate();
  sharedPool = null;
}
