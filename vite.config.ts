import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: Object.fromEntries(
      [
        '/api',
        '^/g/[a-f0-9]{32}/api',
        '^/g/[a-f0-9]{32}/(manifest.webmanifest|sw.js|offline-store.js|offline.html)',
        '/presentacion',
        '/privacidad',
        '/condiciones',
        '/crear-grupo',
        '/confirmar-grupo',
        '/aprobar-grupo',
        '/entrar',
        '/suscripcion-demo',
        '/robots.txt',
        '/sitemap.xml',
        '^/$',
      ].map((path) => [path, `http://127.0.0.1:${process.env.API_PORT || 3001}`]),
    ),
  },
  build: { outDir: 'dist' },
});
