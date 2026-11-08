import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` makes a normal web build in dist/.
// `npm run build:single` inlines everything into one HTML file in dist-single/,
// which is handy for sharing a playable build as a single page.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
