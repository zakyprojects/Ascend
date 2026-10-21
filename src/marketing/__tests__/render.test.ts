import { MARKETING_ROUTES } from '../routes';
import { isRenderedRoute, renderMarketingPage } from '../render';
import { absoluteUrl } from '../site';

/**
 * Every public page renders in plain Node (no window/document/localStorage: an app module that
 * touches them at import would throw here) with a complete, unique head.
 */
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const count = (html: string, pattern: RegExp) => (html.match(pattern) || []).length;
const attr = (html: string, pattern: RegExp) => html.match(pattern)?.[1] ?? null;

assert(typeof window === 'undefined' && typeof document === 'undefined', 'runs without a DOM');

const assets = { css: ['/assets/marketing.css'], js: '/assets/marketing.js', modules: [], fonts: [] };
const titles = new Set<string>();
const descriptions = new Set<string>();

for (const route of MARKETING_ROUTES) {
  assert(route.title.length <= 62, `${route.path}: title ≤ 62 chars (${route.title.length})`);
  assert(route.description.length >= 70 && route.description.length <= 160, `${route.path}: description 70–160 chars (${route.description.length})`);
  assert(!titles.has(route.title), `${route.path}: unique title`);
  assert(!descriptions.has(route.description), `${route.path}: unique description`);
  titles.add(route.title);
  descriptions.add(route.description);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(route.updated), `${route.path}: updated is a date`);

  if (!isRenderedRoute(route)) continue;
  const html = renderMarketingPage(route, assets);
  assert(count(html, /<h1[\s>]/g) === 1, `${route.path}: exactly one <h1>`);
  assert(count(html, /<title>/g) === 1, `${route.path}: one <title>`);
  assert(/<main[\s>]/.test(html), `${route.path}: has <main>`);
  const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
  const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
  if (route.index) {
    assert(canonical === absoluteUrl(route.path), `${route.path}: canonical is its own absolute URL`);
    assert(ogUrl === canonical, `${route.path}: og:url = canonical`);
    assert(!html.includes('content="noindex"'), `${route.path}: indexable`);
  } else {
    assert(canonical === null && html.includes('<meta name="robots" content="noindex" />'), `${route.path}: noindex, no canonical`);
  }
  assert(/<meta property="og:image" content="https:\/\/[^"]+\.png\?v=\d+"/.test(html), `${route.path}: absolute og:image`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  assert(!/href="#"|href=""/.test(html), `${route.path}: no empty links`);
}

// Legal pages carry the whole text, not an app shell (bots without JavaScript read it).
for (const route of MARKETING_ROUTES.filter((r) => r.kind === 'legal')) {
  const html = renderMarketingPage(route, assets);
  assert(!html.includes('id="root"') && html.length > 8000, `${route.path}: full static text`);
  assert(html.includes('href="/"') && !html.includes('href="/dashboard"'), `${route.path}: home links go to the landing page`);
}

const landing = renderMarketingPage(MARKETING_ROUTES[0], assets);
const ld = JSON.parse(landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
const types = (ld['@graph'] as { '@type': string }[]).map((node) => node['@type']).sort();
assert(types.join() === 'Organization,WebApplication,WebSite', 'landing graph: WebSite + Organization + WebApplication');
assert(!/aggregateRating|review/i.test(JSON.stringify(ld)), 'no ratings or reviews in structured data');
assert(landing.indexOf('<script>') < landing.indexOf('<meta name="viewport"'), 'landing redirect runs first');

console.log(`\nMarketing render: ${MARKETING_ROUTES.length} routes checked.`);
