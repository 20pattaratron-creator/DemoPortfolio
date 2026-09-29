import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  // Vercel serves the app from the domain root. Keep relative base for local
  // static previews or a future GitHub Pages build.
  base: process.env.VERCEL ? '/' : './',
  server: { port: 5173, host: '0.0.0.0' },
  preview: { port: 4173, host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html')
      }
    }
  }
}));
