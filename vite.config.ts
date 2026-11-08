import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Every file under `dir`, as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  try {
    walk(dir);
  } catch {
    // No public folder: nothing to add.
  }
  return out;
}

/**
 * Writes sw.js (from sw/sw.js) next to the build, listing every file the game needs so the web
 * version works offline, with a version that changes whenever any of them does.
 */
function serviceWorker(): Plugin {
  return {
    name: 'scrap-orbit-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.map')), ...listFiles('public')]
        .filter((f) => f !== 'index.html' && f !== 'og.jpg')
        .map((f) => (f === './' ? f : './' + f));
      const hash = createHash('sha256');
      for (const [name, item] of Object.entries(bundle)) hash.update(name).update(item.type === 'chunk' ? item.code : String(item.source));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('sw/sw.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// `npm run build` makes a normal web build in dist/.
// `npm run build:single` inlines everything into one HTML file in dist-single/,
// which is handy for sharing a playable build as a single page.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [serviceWorker()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
