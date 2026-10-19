import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } };
export default defineConfig({
  plugins: [react(), {
    name: 'canonical-local-navigation',
    configureServer(server) {
      // Keep local authentication on one origin before the browser loads the app.
      server.middlewares.use((request, response, next) => {
        const isDocument = request.headers['sec-fetch-dest'] === 'document'
          && request.headers['sec-fetch-mode'] === 'navigate';
        if (request.headers.host !== 'localhost:5174'
          || !['GET', 'HEAD'].includes(request.method ?? '')
          || !isDocument
          || !request.url?.startsWith('/')
          || request.url.startsWith('/api')) return next();

        response.statusCode = 307;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Location', `http://127.0.0.1:5174${request.url}`);
        response.end();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true, proxy },
});
