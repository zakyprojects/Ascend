import vercelJson from '../../../vercel.json?raw';
import appShell from '../../../index.html?raw';
import { pathForAuthRoute, pathForView } from '../routes';
import { VIEWS } from '../views';
import { buildSite } from '@/marketing/prerender';
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
  (config.rewrites ?? []).some((r) => r.source === viewSource && r.destination === '/app-shell.html'),
  `app-shell rewrite is ${viewSource} (update vercel.json when views.ts changes)`
);
assert(
  (config.headers ?? []).some((h) => h.source === viewSource && h.headers.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex')),
  'app pages carry X-Robots-Tag noindex (same source as the rewrite)'
);
assert(!(config.rewrites ?? []).some((r) => /\(\.\*\)|\[\^\.\]\*/.test(r.source) && r.destination.endsWith('.html')), 'no catch-all HTML rewrite (it would hide real 404s)');

const manifest = {
  'src/marketing/client.ts': { file: 'assets/marketing-test.js', css: ['assets/marketing-test.css'], isEntry: true, imports: ['_shared.js'] },
  '_shared.js': { file: 'assets/shared-test.js' },
};
const assetFiles = ['assets/marketing-test.js', 'assets/marketing-test.css', 'assets/shared-test.js', 'assets/geist-latin-wght-normal-abc.woff2'];
const written = buildSite({ shellHtml: appShell, manifest, assetFiles });

const files = new Map<string, string>(Object.entries(written));
for (const file of [...assetFiles, 'sw.js', 'manifest.json', 'version.json', 'favicon.svg']) files.set(file, '');

assert(written['app-shell.html'] === appShell, 'the app shell is written unchanged');
assert(written['login.html'].includes('<title>Sign in – Ascend</title>') && written['login.html'].includes('id="root"'), 'login = app shell with its own title');
assert((written['login.html'].match(/<title>/g) || []).length === 1, 'login has one <title>');
assert(!/Ascend - Self-Improvement/.test(written['signup.html']), 'signup lost the generic title');

const errors = await checkSite(files, config);
assert(errors.length === 0, `site checks:\n  ${errors.join('\n  ')}`);

console.log(`\nvercel.json: ${APP_PATHS.length} app pages, ${Object.keys(written).length} built files checked.`);
