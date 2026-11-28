import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const backendUrl = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

/** In teacher dev mode, `/` serves the teacher entry instead of the Electron-only kiosk. */
function teacherRoot(): Plugin {
  return {
    name: 'holobox-teacher-root',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = request.url;
        if (url && (url === '/' || url.startsWith('/?'))) {
          const query = url.includes('?') ? `?${url.split('?').slice(1).join('?')}` : '';
          request.url = `/teacher.html${query}`;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: mode === 'teacher' ? [react(), teacherRoot()] : [react()],
  server: {
    port: 5173,
    host: process.env.VITE_HOST || '127.0.0.1',
    proxy: { '/api': { target: backendUrl, changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      input: {
        kiosk: resolve(__dirname, 'index.html'),
        teacher: resolve(__dirname, 'teacher.html'),
      },
    },
  },
  base: './',
}));
