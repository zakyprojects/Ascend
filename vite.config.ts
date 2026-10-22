import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { headersFor, resolveRoute, type VercelConfig } from './src/marketing/vercelRules';

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

/**
 * Signed-out visits start on the sign-in page, which used to load in a chain: main bundle, then
 * the AuthPage chunk (requested from main.tsx), then its fonts (found only once the CSS applied).
 * This adds preload links to index.html so the browser fetches them alongside the main bundle:
 * the AuthPage chunk and the chunks it imports, and the latin files of the two faces on the
 * sign-in page's first screen (Geist, Instrument Serif regular). Signed-in visits fetch the
 * AuthPage chunks too (~16 KB gzip, cached afterwards). Build only; matched by module id and
 * file name, so a renamed AuthPage or font silently drops its preload (the page still works).
 */
function signInPreloadPlugin(): Plugin {
  const AUTH_PAGE = '/src/components/auth/AuthPage.tsx';
  const FONTS = [/^assets\/geist-latin-wght-normal-.*\.woff2$/, /^assets\/instrument-serif-latin-400-normal-.*\.woff2$/];
  return {
    name: 'sign-in-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
        const auth = chunks.find((chunk) => chunk.facadeModuleId?.replaceAll('\\', '/').endsWith(AUTH_PAGE));
        const scripts = new Set<string>();
        const visit = (fileName: string) => {
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk' || scripts.has(fileName) || chunk.isEntry) return;
          scripts.add(fileName);
          chunk.imports.forEach(visit);
        };
        if (auth) visit(auth.fileName);
        const fonts = Object.keys(bundle).filter((name) => FONTS.some((pattern) => pattern.test(name)));
        const tags = [
          ...[...scripts].filter((name) => !html.includes(`/${name}"`)).map((name) => `<link rel="modulepreload" crossorigin href="/${name}">`),
          ...fonts.map((name) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${name}">`),
        ];
        return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
      },
    },
  };
}

/**
 * The public pages (src/marketing) in `npm run dev`: `/`, `/features` and `/features/<slug>` are
 * rendered on each request from the same code the build prerenders; every other address (the app,
 * `/login`, `/privacy`, `/?gallery`, `/?splash-preview`) falls through to the app as before.
 */
function marketingDevPlugin(): Plugin {
  return {
    name: 'marketing-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost');
        if (req.method !== 'GET' || url.searchParams.has('gallery') || url.searchParams.has('splash-preview')) return next();
        try {
          const routes = await server.ssrLoadModule('/src/marketing/routes.ts');
          const route = routes.routeByPath(url.pathname);
          const render = await server.ssrLoadModule('/src/marketing/render.tsx');
          if (!route || !render.isRenderedRoute(route) || route.kind === 'notFound') return next();
          // The stylesheet is linked in <head> (as the build does) so the page never paints unstyled
          // while client.ts loads; client.ts's own import of it then only adds HMR.
          const html = render.renderMarketingPage(route, { css: ['/src/marketing/marketing.css'], js: '/src/marketing/client.ts', modules: [], fonts: [] });
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await server.transformIndexHtml(url.pathname, html));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

/**
 * `npm run preview` answers like Vercel: vercel.json's redirects, clean URLs, rewrites, headers
 * and the 404 page (src/marketing/vercelRules.ts), instead of Vite's send-index.html-for-all.
 * So `/dashboard` gets the app shell and `/` the landing page locally too.
 */
function vercelPreviewPlugin(): Plugin {
  return {
    name: 'vercel-preview',
    configurePreviewServer(server) {
      const dist = server.config.build.outDir;
      const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf-8')) as VercelConfig;
      const exists = (file: string) => {
        const path = join(dist, file);
        return existsSync(path) && statSync(path).isFile();
      };
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost');
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/@')) return next();
        for (const [key, value] of Object.entries(headersFor(config, url.pathname))) res.setHeader(key, value);
        const route = resolveRoute(config, url.pathname, exists);
        if (route.type === 'redirect') {
          res.statusCode = route.status;
          res.setHeader('Location', route.location + url.search);
          res.end();
          return;
        }
        if (!route.file.endsWith('.html')) {
          req.url = `/${route.file}${url.search}`;
          return next();
        }
        res.statusCode = route.status;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(join(dist, route.file)));
      });
    },
  };
}

/**
 * Crash reports show real file names and lines: on a build with SENTRY_AUTH_TOKEN (Vercel only,
 * never .env.local), source maps are made, uploaded to Sentry under this release, then deleted
 * from dist so they are never served. Without the token nothing is made or uploaded.
 */
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionFilePlugin(),
    signInPreloadPlugin(),
    apiFunctionsPlugin(),
    marketingDevPlugin(),
    vercelPreviewPlugin(),
    sentryUpload &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: `ascend@${pkg.version}` },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
      }),
  ],
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
    sourcemap: sentryUpload ? 'hidden' : false,
    // dist/.vite/manifest.json: the prerender (scripts/prerender.ts) reads the marketing entry's files.
    manifest: true,
    rollupOptions: {
      // The app (index.html, becomes app-shell.html) and the public pages' small script + styles.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        marketing: fileURLToPath(new URL('./src/marketing/client.ts', import.meta.url)),
      },
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
