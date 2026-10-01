import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { UciEngine, type UciTransport } from '../src/lib/engine/engine';

const require = createRequire(import.meta.url);
const engineDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');

/** Loads the vendored Stockfish WASM build in Node (same files the browser uses). */
export async function createNodeEngine(): Promise<UciEngine> {
  // The package is "type": "module", so load the CommonJS engine build from a .cjs copy.
  const dir = mkdtempSync(join(tmpdir(), 'chessbuddy-sf-'));
  const engineJs = join(dir, 'stockfish.cjs');
  copyFileSync(join(engineDir, 'stockfish-19-lite-single.js'), engineJs);
  copyFileSync(join(engineDir, 'stockfish-19-lite-single.wasm'), join(dir, 'stockfish.wasm'));
  const init = require(engineJs);
  let listener: (line: string) => void = () => {};
  const mod: Record<string, unknown> = {
    locateFile: (p: string) => (p.includes('.wasm') ? join(dir, 'stockfish.wasm') : engineJs),
    listener: (line: string) => listener(line),
  };
  await init()(mod);
  const isReady = mod._isReady as (() => boolean) | undefined;
  while (isReady && !isReady()) await new Promise((r) => setTimeout(r, 10));
  const ccall = mod.ccall as (name: string, ret: null, types: string[], args: string[], o: object) => void;
  const transport: UciTransport = {
    send: (cmd) => setImmediate(() => ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) })),
    onLine: (cb) => {
      listener = cb;
    },
    terminate: () => {
      listener = () => {};
    },
  };
  return new UciEngine(transport);
}
