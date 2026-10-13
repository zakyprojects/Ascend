import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const buildVersion = `${pkg.version}-${Date.now()}`;
const buildTimeIso = new Date().toISOString();

function versionGeneratorPlugin(): Plugin {
  return {
    name: 'version-generator',
    buildStart() {
      const versionData = JSON.stringify({ version: buildVersion, buildTime: buildTimeIso });
      try {
        writeFileSync(fileURLToPath(new URL('./public/version.json', import.meta.url)), versionData);
      } catch (err) {
        console.error('Failed to write public/version.json', err);
      }
    },
    writeBundle() {
      const versionData = JSON.stringify({ version: buildVersion, buildTime: buildTimeIso });
      try {
        writeFileSync(fileURLToPath(new URL('./dist/version.json', import.meta.url)), versionData);
      } catch (err) {
        // dist might not exist yet if not in build mode
      }
    }
  };
}

/**
 * Serves the Vercel Functions in /api during `npm run dev` (Vercel runs them in production).
 * Server-only secrets (GITHUB_FEEDBACK_TOKEN, no VITE_ prefix) come from .env.local and stay
 * on the dev server; they never reach the browser bundle.
 */
function apiFunctionsPlugin(): Plugin {
  return {
    name: 'api-functions',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const key of ['GITHUB_FEEDBACK_TOKEN', 'GITHUB_FEEDBACK_REPO']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }
      server.middlewares.use('/api/feedback', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
          }
          const mod = await server.ssrLoadModule('/api/feedback.ts');
          const handler = mod[req.method ?? 'GET'] as ((request: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            res.end();
            return;
          }
          const response = await handler(
            new Request(`http://localhost${req.originalUrl ?? '/api/feedback'}`, {
              method: req.method,
              headers,
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
            })
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(`[api/feedback] ${String(err)}`);
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionGeneratorPlugin(), apiFunctionsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
    __APP_BUILD__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    host: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries in their own chunks: they change far less often than the app, so a deploy
        // leaves them cached (assets are immutable for a year, vercel.json).
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
});
