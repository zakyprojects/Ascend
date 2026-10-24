import vercelJson from '../../../vercel.json?raw';
import appShell from '../../../index.html?raw';
import serviceWorker from '../../../public/sw.js?raw';
import { pathForAuthRoute, pathForView } from '../routes';
import { VIEWS } from '../views';
import { buildSite } from '@/marketing/prerender';
import { MARKETING_ROUTES } from '@/marketing/routes';
import { APP_PATHS, checkSite } from '@/marketing/seoChecks';
import type { VercelConfig } from '@/marketing/vercelRules';

/**
 * vercel.json against the app and the public site, without a deploy (there is no preview
 * project: production is the first real run). The site is built in memory exactly as the
 * prerender writes it, and every address is answered the way Vercel answers it
 * (src/marketing/vercelRules.ts): app pages, aliases, public pages, sign-in and legal pages, the
 * API, build files, static files, unknown and capitalised addresses, headers and the CSP.
 */
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const config = JSON.parse(vercelJson) as VercelConfig;

// The app-shell rewrite and its noindex header list exactly the app's pages (views.ts + reset).
const viewSource = `/:view(${[...VIEWS.map((view) => pathForView(view)), pathForAuthRoute('reset-password')].map((p) => p.slice(1)).join('|')})`;
assert(APP_PATHS.length === VIEWS.length + 1, 'every view plus /reset-password');
assert(
  (config.rewrites ?? []).some((r) => r.source === viewSource && r.destination === '/app-shell'),
  `app-shell rewrite is ${viewSource} (update vercel.json when views.ts changes)`
);
assert(
  (config.headers ?? []).some((h) => h.source === viewSource && h.headers.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex')),
  'app pages carry X-Robots-Tag noindex (same source as the rewrite)'
);
// D9: the old address sends every path, the root included, to the domain permanently (query kept by Vercel).
// '/:path*' left '/' unredirected live (10-24), so the source is '/(.*)'.
const oldHost = (config.redirects ?? []).filter((r) => r.has?.some((h) => h.type === 'host'));
assert(
  oldHost.length === 1 &&
    oldHost[0].source === '/(.*)' &&
    oldHost[0].destination === 'https://ascendday.com/$1' &&
    oldHost[0].permanent === true &&
    oldHost[0].has?.length === 1 &&
    oldHost[0].has[0].value === 'ascend-neon.vercel.app',
  'one permanent host redirect ascend-neon.vercel.app -> https://ascendday.com, same path'
);
// The CSP is enforced (report-only ended 2026-10-24); violations still report to Sentry.
const headerKeys = (config.headers ?? []).flatMap((rule) => rule.headers.map((h) => h.key.toLowerCase()));
assert(headerKeys.includes('content-security-policy'), 'vercel.json sends an enforced Content-Security-Policy');
assert(!headerKeys.includes('content-security-policy-report-only'), 'no report-only CSP left beside the enforced one');
assert(!(config.rewrites ?? []).some((r) => /\(\.\*\)|\[\^\.\]\*/.test(r.source) && r.destination.endsWith('.html')), 'no catch-all HTML rewrite (it would hide real 404s)');

const manifest = {
  'src/marketing/client.ts': { file: 'assets/marketing-test.js', css: ['assets/marketing-test.css'], isEntry: true, imports: ['_shared.js'] },
  '_shared.js': { file: 'assets/shared-test.js' },
};
const assetFiles = ['assets/marketing-test.js', 'assets/marketing-test.css', 'assets/shared-test.js', 'assets/geist-latin-wght-normal-abc.woff2'];
const written = buildSite({ shellHtml: appShell, manifest, assetFiles });

const files = new Map<string, string>(Object.entries(written));
// public/ is copied into the build as is (the pictures the pages show and the link previews included).
const publicFiles = Object.keys(import.meta.glob(['../../../public/screens/*', '../../../public/og/*'])).map((path) => path.replace('../../../public/', ''));
for (const file of [...assetFiles, ...publicFiles, 'sw.js', 'manifest.json', 'version.json', 'favicon.svg']) files.set(file, '');

assert(written['app-shell.html'] === appShell, 'the app shell is written unchanged');
assert(written['login.html'].includes('<title>Sign in – Ascend</title>') && written['login.html'].includes('id="root"'), 'login = app shell with its own title');
assert((written['login.html'].match(/<title>/g) || []).length === 1, 'login has one <title>');
assert(!/Ascend - Self-Improvement/.test(written['signup.html']), 'signup lost the generic title');

const errors = await checkSite(files, config);
assert(errors.length === 0, `site checks:\n  ${errors.join('\n  ')}`);

// The service worker keeps public pages apart from the app shell: its list = the public pages.
const swPattern = serviceWorker.match(/const MARKETING_PAGE = \/(.+)\/;/)?.[1];
assert(Boolean(swPattern), 'sw.js has MARKETING_PAGE');
const marketingPage = new RegExp(swPattern!);
for (const route of MARKETING_ROUTES) {
  assert(marketingPage.test(route.path) === (route.kind !== 'auth'), `sw.js MARKETING_PAGE ${route.kind === 'auth' ? 'excludes' : 'includes'} ${route.path}`);
}
for (const path of APP_PATHS) assert(!marketingPage.test(path), `sw.js MARKETING_PAGE excludes app page ${path}`);

console.log(`\nvercel.json: ${APP_PATHS.length} app pages, ${Object.keys(written).length} built files checked.`);
