import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEngine } from './nodeEngine';
import type { UciEngine } from '../src/lib/engine/engine';
import { analyzeGame } from '../src/lib/analyze';
import { parsePgn } from '../src/lib/pgn';
import type { OpeningBook } from '../src/lib/openings';
import book from '../src/data/openings.json';
import { SAMPLE_GAMES } from '../src/data/samples';

// Runs the real Stockfish WASM build (the same files the browser loads) over sample games.
let engine: UciEngine;
beforeAll(async () => {
  engine = await createNodeEngine();
});
afterAll(() => engine?.terminate());

const sample = (id: string) => parsePgn(SAMPLE_GAMES.find((s) => s.id === id)!.pgn);

describe('full game analysis', () => {
  it('reviews the Opera Game', async () => {
    const review = await analyzeGame(sample('opera'), engine, { depth: 12, book: book as unknown as OpeningBook });
    const bySan = (san: string) => review.moves.find((m) => m.san === san)!;

    expect(review.opening?.name).toBe('Philidor Defense');
    expect(review.moves[0].classification).toBe('book');
    expect(bySan('Qb8+').classification).toBe('brilliant');
    expect(bySan('Nxb8').classification).toBe('forced');
    expect(bySan('Rd8#').classification).toBe('best');
    expect(review.summary.w.accuracy).toBeGreaterThan(review.summary.b.accuracy);
    expect(review.summary.w.counts.blunder).toBe(0);
    // Every move gets coaching text.
    expect(review.moves.every((m) => m.feedback.text.length > 10)).toBe(true);
  });

  it('finds the hung piece and missed mate in the club game', async () => {
    const review = await analyzeGame(sample('club-blitz'), engine, { depth: 12, book: book as unknown as OpeningBook });
    const bxh6 = review.moves.find((m) => m.san === 'Bxh6')!;
    expect(bxh6.classification).toBe('blunder');
    expect(bxh6.feedback.motifs).toContain('hangs-piece');

    const rg7 = review.moves.find((m) => m.san === 'Rg7')!;
    expect(rg7.feedback.motifs).toContain('allows-mate');

    const qh6 = review.moves.find((m) => m.ply === 27)!;
    expect(qh6.feedback.motifs).toContain('missed-mate');

    const ids = review.insights.w.map((i) => i.id);
    expect(ids).toContain('hanging');
    expect(ids).toContain('missed-tactics');
  });
});
