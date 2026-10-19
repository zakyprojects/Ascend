import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Version = package.json (bumped with `npm version`). Build = the build's date in Pakistan time,
// shown to users. Build id = the exact build moment, never shown; UpdateBanner compares it so
// every deploy, even two on the same day, is detected as new.
const buildMoment = new Date();
const buildDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
  .format(buildMoment)
  .replaceAll('-', '.');
const buildId = String(buildMoment.getTime());

/** Emits dist/version.json at build time only; nothing is written into the source tree. */
function versionFilePlugin(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, build: buildDate, buildId }),
      });
    },
  };
}

/**
 * Serves the Vercel Functions in /api during `npm run dev` (Vercel runs them in production).
 * Server-only secrets (GITHUB_FEEDBACK_TOKEN, no VITE_ prefix) come from .env.local and stay
 * on the dev server; they never reach the browser bundle. The Supabase URL/anon key are passed
 * too, so the function can check the sender's session as it does on Vercel.
 */
function apiFunctionsPlugin(): Plugin {
  return {
    name: 'api-functions',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const key of ['GITHUB_FEEDBACK_TOKEN', 'GITHUB_FEEDBACK_REPO', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
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
  plugins: [react(), versionFilePlugin(), apiFunctionsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(buildDate),
    __APP_BUILD_ID__: JSON.stringify(buildId),
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
