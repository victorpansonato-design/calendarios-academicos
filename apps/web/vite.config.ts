import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // a API roda em :3001 (npm run dev na raiz sobe as duas)
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
