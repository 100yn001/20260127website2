import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Mirror production routing in dev: vercel.json will 307 `/` → `/app`.
const redirectRootToApp = (): Plugin => ({
  name: 'redirect-root-to-app',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/') {
        res.statusCode = 302;
        res.setHeader('Location', '/app');
        res.end();
        return;
      }
      next();
    });
  },
});

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
};

// Serve the production Expo export (repo-root dist/, `npx expo export
// --platform web`) under /app, the same way vercel.json rewrites
// /app/(.*) → /app/index.html. The expo dev server can't be used here:
// expo-router ignores experiments.baseUrl in development, so /app-prefixed
// URLs only route correctly against a production export.
const serveExpoExport = (): Plugin => ({
  name: 'serve-expo-export-under-app',
  configureServer(server) {
    const exportDir = path.resolve(__dirname, '..', 'dist');
    server.middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0];
      if (url !== '/app' && !url.startsWith('/app/')) {
        next();
        return;
      }
      const rel = decodeURIComponent(url.slice('/app'.length)) || '/';
      let filePath = path.join(exportDir, rel);
      if (!filePath.startsWith(exportDir)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const isFile = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      if (!isFile) {
        filePath = path.join(exportDir, 'index.html');
        if (!fs.existsSync(filePath)) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Expo export missing — run: npx expo export --platform web');
          return;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), redirectRootToApp(), serveExpoExport()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
