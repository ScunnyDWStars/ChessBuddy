// Builds the ChessBuddy browser extension into dist-extension/:
// the review app (as review.html) plus the files in extension/.
// Load it in Chrome/Edge via chrome://extensions → "Load unpacked".
import { build } from 'vite';
import { cpSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist-extension');

rmSync(out, { recursive: true, force: true });
await build({ root, logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });
renameSync(join(out, 'index.html'), join(out, 'review.html'));
for (const file of readdirSync(join(root, 'extension'))) {
  cpSync(join(root, 'extension', file), join(out, file), { recursive: true });
}
console.log(`Extension built in ${out}`);

if (process.argv.includes('--zip')) {
  const zip = join(root, 'chessbuddy-extension.zip');
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
  console.log(`Zipped to ${zip}`);
}
