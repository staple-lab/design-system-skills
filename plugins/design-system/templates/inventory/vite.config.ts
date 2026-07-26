import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Root is this directory, not the cwd `npm run inventory` runs from — without it the
  // site serves at /inventory/ and `vite --open` lands on a 404.
  root: __dirname,
  // Hash routing + a relative base means the built site deploys to a subpath
  // (GitHub Pages, an S3 prefix) with no server rewrite rules.
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, '../src') },
  },
  server: { port: 6006, open: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
