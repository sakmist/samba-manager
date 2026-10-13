import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5069',
    },
  },
});
