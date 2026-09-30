import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'app', emptyOutDir: true, target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
