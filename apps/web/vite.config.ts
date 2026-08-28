import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

// The web app always talks to a same-origin `/api`, so there are no CORS or
// cookie-domain concerns in either dev (this proxy) or production (nginx).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
