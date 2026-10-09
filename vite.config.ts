import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes dist/sw.js: a service worker that precaches every built file so the
 * installed app (PWA) opens and analyses games offline.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'chessbuddy-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split(sep).join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      const hash = createHash('sha1');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(fileURLToPath(new URL('./scripts/sw-template.js', import.meta.url)), 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...precache.map((f) => `./${f}`)], null, 2)),
      );
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react(), serviceWorker()],
  // The opening book is a lazily loaded ~85 kB (gzipped) JSON chunk.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
