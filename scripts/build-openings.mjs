// Builds src/data/openings.json from the lichess chess-openings TSV files
// (https://github.com/lichess-org/chess-openings, CC0).
// Every position reached along a named line is "book". Named positions map to
// [eco, name]; intermediate positions map to 0.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'scripts', 'openings-src');
const outFile = join(root, 'src', 'data', 'openings.json');

const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');
const book = {};

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.tsv')).sort()) {
  const lines = readFileSync(join(srcDir, file), 'utf8').trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of sans) {
      chess.move(san);
      const key = epd(chess.fen());
      if (!(key in book)) book[key] = 0;
    }
    const key = epd(chess.fen());
    // Prefer the first (most general) name for a position.
    if (!book[key]) book[key] = [eco, name];
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(book));
console.log(`Wrote ${Object.keys(book).length} book positions to ${outFile}`);
