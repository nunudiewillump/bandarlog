import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'canonical-group-trailing-slash',
      configureServer(server) {
        server.middlewares.use(groupSlash);
        server.middlewares.use(publicShell);
      },
      configurePreviewServer(server) {
        server.middlewares.use(groupSlash);
        server.middlewares.use(publicShell);
      },
    },
  ],
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
  build: {
    outDir: 'dist',
    emptyOutDir: mode !== 'platform',
    rolldownOptions: { input: mode === 'platform' ? 'platform.html' : 'index.html' },
  },
}));

function groupSlash(
  req: { url?: string },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => unknown;
    end: () => unknown;
  },
  next: () => void,
) {
  if (req.url?.split('?')[0] === '/plataforma') req.url = '/platform.html';
  const match = req.url?.match(/^(\/g\/[a-f0-9]{32})(\?.*)?$/);
  if (match) {
    res.writeHead(308, { Location: match[1] + '/' + (match[2] || '') });
    res.end();
  } else next();
}

// Vite serves the same public static shell used by the production Express route.
// Mark only its HTML navigation routes, never proxied APIs or public/private pages.
function publicShell(
  req: { url?: string; method?: string },
  res: { setHeader: (key: string, value: string) => unknown },
  next: () => void,
) {
  const url = new URL(req.url || '/', 'http://vite.invalid');
  if (
    req.method === 'GET' &&
    /^\/(?:acceso|index\.html|g\/[a-f0-9]{32}\/)$/.test(url.pathname) &&
    !['token', 'ticket', 'proof', 'code', 'state'].some((k) => url.searchParams.has(k))
  )
    res.setHeader('X-Bandarlog-Public-Shell', '1');
  next();
}
