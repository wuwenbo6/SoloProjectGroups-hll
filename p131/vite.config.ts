import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/plugins.xml': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/rss.xml': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/icons': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
