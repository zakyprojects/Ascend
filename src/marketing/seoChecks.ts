import { pathForAuthRoute, pathForView } from '@/lib/routes';
import { VIEWS } from '@/lib/views';
import { MARKETING_ROUTES } from './routes';
import { absoluteUrl } from './site';
import { headersFor, resolveRoute, type VercelConfig } from './vercelRules';

/**
 * Checks on the finished dist/ (scripts/prerender.ts runs them after writing it; the build fails
 * on any problem, so a broken site never deploys). `files` = every path in dist/ and, for
 * HTML/XML/TXT, its text.
 */

/** Every app page's address: the shell answers them, never indexed. */
export const APP_PATHS = [...VIEWS.map((view) => pathForView(view)), pathForAuthRoute('reset-password')];

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The bodies of a page's inline scripts that run (JSON-LD is data, not governed by script-src). */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(([, attrs = '']) => !/\ssrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs))
    .map(([, , body]) => body);
}

function cspScriptHashes(config: VercelConfig): Set<string> {
  const csp = (config.headers ?? [])
    .flatMap((rule) => rule.headers)
    .find((h) => /^content-security-policy/i.test(h.key))?.value;
  return new Set([...(csp ?? '').matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]));
}

export async function checkSite(files: Map<string, string>, config: VercelConfig): Promise<string[]> {
  const errors: string[] = [];
  const exists = (file: string) => files.has(file);

  // Every inline script on every page is allowed by the CSP (enforced since 2026-10-24).
  const hashes = cspScriptHashes(config);
  for (const [file, text] of files) {
    if (!file.endsWith('.html')) continue;
    for (const body of inlineScripts(text)) {
      const hash = await sha256Base64(body);
      if (!hashes.has(hash)) errors.push(`${file}: inline script sha256-${hash} is not in vercel.json's CSP`);
    }
  }

  // Public pages: their file, 200, no noindex header, self canonical.
  for (const route of MARKETING_ROUTES) {
    if (!exists(route.file)) {
      errors.push(`${route.path}: ${route.file} was not written`);
      continue;
    }
    const resolved = resolveRoute(config, route.path, exists);
    const expected = route.kind === 'notFound' ? null : route.file;
    if (expected && (resolved.type !== 'file' || resolved.file !== expected)) {
      errors.push(`${route.path}: served as ${JSON.stringify(resolved)}, expected ${expected}`);
    }
    const robots = headersFor(config, route.path)['x-robots-tag'];
    if (route.index && robots) errors.push(`${route.path}: public page gets X-Robots-Tag ${robots}`);
    if (route.index && !files.get(route.file)!.includes(`<link rel="canonical" href="${absoluteUrl(route.path)}"`)) {
      errors.push(`${route.path}: no self canonical`);
    }
    if (!exists(`og/${route.ogImage}.png`)) errors.push(`${route.path}: link preview og/${route.ogImage}.png is not in the build`);
  }

  // App pages: the app shell, noindex.
  for (const path of APP_PATHS) {
    const resolved = resolveRoute(config, path, exists);
    if (resolved.type !== 'file' || resolved.file !== 'app-shell.html') errors.push(`${path}: not served the app shell (${JSON.stringify(resolved)})`);
    if (!/noindex/.test(headersFor(config, path)['x-robots-tag'] ?? '')) errors.push(`${path}: app page without X-Robots-Tag noindex`);
  }

  // Old and alternative addresses: permanent redirects to the one address of the page.
  const redirects: [string, string][] = [
    ['/books', '/reading'],
    ['/prefrontal', '/prefrontal-cortex'],
    ['/habits/', '/habits'],
    ['/dashboard/', '/dashboard'],
    ['/features/journal/', '/features/journal'],
    ['/index.html', '/'],
    ['/features/journal.html', '/features/journal'],
  ];
  for (const [from, to] of redirects) {
    const resolved = resolveRoute(config, from, exists);
    if (resolved.type !== 'redirect' || resolved.status !== 308 || resolved.location !== to) {
      errors.push(`${from}: expected a 308 to ${to}, got ${JSON.stringify(resolved)}`);
    }
  }


  // Static files: served as themselves, with their cache rules.
  const statics: [string, RegExp][] = [
    ['/sw.js', /no-cache/],
    ['/manifest.json', /no-cache/],
    ['/version.json', /no-cache/],
    ['/robots.txt', /max-age=3600/],
    ['/sitemap.xml', /max-age=3600/],
    ['/favicon.svg', /^$/],
  ];
  const asset = [...files.keys()].find((file) => /^assets\/.+\.js$/.test(file));
  if (asset) statics.push([`/${asset}`, /immutable/]);
  for (const [path, cache] of statics) {
    if (!exists(path.slice(1))) {
      errors.push(`${path}: missing from the output`);
      continue;
    }
    const resolved = resolveRoute(config, path, exists);
    if (resolved.type !== 'file' || resolved.file !== path.slice(1)) errors.push(`${path}: served as ${JSON.stringify(resolved)}`);
    if (!cache.test(headersFor(config, path)['cache-control'] ?? '')) errors.push(`${path}: Cache-Control does not match ${cache}`);
  }
  const missingAsset = resolveRoute(config, '/assets/gone-123.js', exists);
  if (missingAsset.type !== 'file' || missingAsset.file !== 'api/missing-asset') {
    errors.push(`/assets/gone-123.js: not answered by /api/missing-asset (${JSON.stringify(missingAsset)})`);
  }

  // Every response carries the security headers.
  for (const path of ['/', '/dashboard', '/features/journal', '/no-such-page']) {
    const headers = headersFor(config, path);
    if (headers['x-content-type-options'] !== 'nosniff' || !headers['content-security-policy']) {
      errors.push(`${path}: security headers missing`);
    }
  }

  // Unknown addresses are real 404s (also a mistyped feature, and a page name in capitals, which
  // Vercel's matching may or may not accept: it must never be a public page); the API is noindex.
  for (const path of ['/no-such-page', '/features/no-such-feature', '/dashboard/extra', '/api']) {
    const unknown = resolveRoute(config, path, exists);
    if (unknown.type !== 'notFound' || !exists('404.html')) errors.push(`${path}: not a 404 (${JSON.stringify(unknown)})`);
  }
  const capitals = resolveRoute(config, '/Habits', exists);
  if (!(capitals.type === 'notFound' || (capitals.type === 'file' && capitals.file === 'app-shell.html'))) {
    errors.push(`/Habits: served as ${JSON.stringify(capitals)}`);
  }
  if (!/noindex/.test(headersFor(config, '/api/feedback')['x-robots-tag'] ?? '')) errors.push('/api/*: no X-Robots-Tag noindex');

  // Pictures on the public pages: the file is in the build, with its size (no layout shift) and alt text.
  for (const [file, text] of files) {
    if (!file.endsWith('.html')) continue;
    for (const [tag] of text.matchAll(/<img\b[^>]*>/g)) {
      const src = tag.match(/\ssrc="([^"]+)"/)?.[1] ?? '';
      if (!src.startsWith('/') || !exists(src.slice(1).replace(/\?.*$/, ''))) errors.push(`${file}: picture ${src || '(no src)'} is not in the build`);
      if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) errors.push(`${file}: picture ${src} has no width/height`);
      if (!/\salt="[^"]{10,}"/.test(tag)) errors.push(`${file}: picture ${src} has no real alt text`);
    }
  }

  // Sitemap: every URL is a public page that exists; robots.txt points at it.
  const sitemap = files.get('sitemap.xml') ?? '';
  for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const route = MARKETING_ROUTES.find((r) => absoluteUrl(r.path) === loc);
    if (!route || !route.index) errors.push(`sitemap: ${loc} is not a public page`);
  }
  if (!/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m.test(files.get('robots.txt') ?? '')) errors.push('robots.txt: no Sitemap line');

  return errors;
}
