import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api/realtime': { target: 'http://127.0.0.1:8787', changeOrigin: false } };
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true, proxy },
});
