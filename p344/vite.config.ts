import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  server: {
    port: 5173,
  },
});
