import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` produces one self-contained HTML file that opens by double-click.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  base: './',
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
