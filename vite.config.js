import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@data': resolve(__dirname, 'data'),
      '@src': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3001,
    host: process.env.WDTT_VITE_HOST || '127.0.0.1',
    strictPort: true,
    open: process.env.WDTT_VITE_OPEN === '1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
