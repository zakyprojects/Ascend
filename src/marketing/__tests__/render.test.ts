import { FEATURES, FEATURE_SLUGS, featurePath } from '../features/catalog';
import { FEATURE_CONTENT } from '../features/content';
import { MARKETING_ROUTES } from '../routes';
import { isRenderedRoute, renderMarketingPage } from '../render';
import { absoluteUrl } from '../site';
import { TIERS } from '@/lib/tiers';
import { LESSONS } from '@/lib/lessons';
import { SOBRIETY_MILESTONE_POINTS } from '@/lib/pointsConfig';
import { RECOVERY_MILESTONES } from '@/lib/recoveryAwards';
import { fmt, pts } from '../features/format';

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
// The landing page is a real page: its text in the HTML, and plain links to every feature, sign-up and sign-in.
const landingText = landing.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
assert(landingText.split(/\s+/).filter(Boolean).length >= 400, 'landing has at least 400 words of text');
for (const slug of FEATURE_SLUGS) assert(landing.includes(`href="${featurePath(slug)}"`), `landing links ${featurePath(slug)}`);
for (const href of ['/signup', '/login', '/features', '/privacy']) assert(landing.includes(`href="${href}"`), `landing links ${href}`);

const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const wordsOf = (html: string) => textOf(html).split(/\s+/).filter(Boolean).length;

// /features links every feature page.
const hub = renderMarketingPage(MARKETING_ROUTES.find((r) => r.kind === 'hub')!, assets);
for (const slug of FEATURE_SLUGS) assert(hub.includes(`href="${featurePath(slug)}"`), `/features links ${featurePath(slug)}`);
assert(hub.includes('"@type":"BreadcrumbList"'), '/features has a BreadcrumbList');

// Written feature pages are full pages, not doorways: real length, the points section, a visible
// breadcrumb matching the BreadcrumbList, related pages, sign-up, and no two pages alike.
const featureTexts: string[] = [];
for (const route of MARKETING_ROUTES.filter((r) => r.kind === 'feature' && r.slug)) {
  const html = renderMarketingPage(route, assets);
  const content = FEATURE_CONTENT[route.slug!];
  assert(wordsOf(html) >= 900, `${route.path}: at least 900 words on the page (${wordsOf(html)})`);
  assert(html.includes('id="how-points-work"'), `${route.path}: has the points section the hero links to`);
  assert(html.includes('aria-label="Breadcrumb"') && html.includes(`"name":"${FEATURES[route.slug!].name}"`), `${route.path}: breadcrumb`);
  assert(content.related.length >= 3 && content.related.length <= 4 && !content.related.includes(route.slug!), `${route.path}: 3–4 related pages`);
  for (const other of content.related) assert(html.includes(`href="${featurePath(other)}"`), `${route.path}: links ${other}`);
  assert(html.includes('href="/signup"') && html.includes('href="/features"'), `${route.path}: links sign-up and /features`);
  assert(content.faq.length >= 4 && content.faq.length <= 6, `${route.path}: 4–6 questions`);
  featureTexts.push(textOf(html));
}
assert(featureTexts.length === FEATURE_SLUGS.length, 'every feature page is checked');

// The ranks page's ladder is the app's own (lib/tiers.ts), rank for rank.
const ranksPage = renderMarketingPage(MARKETING_ROUTES.find((r) => r.slug === 'ranks')!, assets);
TIERS.forEach((tier, i) => assert(ranksPage.includes(`${i + 1}. ${tier.name}`) && ranksPage.includes(pts(fmt(tier.minPoints))), `ranks page lists ${tier.name} at ${tier.minPoints}`));
// Health-adjacent pages carry their not-medical-advice note; recovery also its milestones and a helpline.
const pageOf = (slug: string) => renderMarketingPage(MARKETING_ROUTES.find((r) => r.slug === slug)!, assets);
const recoveryPage = pageOf('recovery');
assert(recoveryPage.includes('Ascend is not treatment, therapy or medical advice.') && recoveryPage.includes('1-800-662-4357'), 'recovery page: not-treatment note and helpline');
for (const m of RECOVERY_MILESTONES) assert(recoveryPage.includes(`${m.hours / 24} days clean (${m.label})`) && recoveryPage.includes(`+${pts(SOBRIETY_MILESTONE_POINTS[m.key])}`), `recovery page lists ${m.label}`);
const brainPage = pageOf('brain-lessons');
assert(brainPage.includes('General education, not medical advice.') && brainPage.includes(`${LESSONS.length} short lessons`), 'brain-lessons page: note and lesson count');
// No page is another with the names swapped: most of each page's sentences are its own.
const sentences = (text: string) => new Set(text.split(/[.!?]\s+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 40));
featureTexts.forEach((text, i) => {
  const own = sentences(text);
  featureTexts.forEach((other, j) => {
    if (i === j) return;
    const shared = [...sentences(other)].filter((s) => own.has(s)).length;
    assert(shared / own.size < 0.2, `feature pages ${i} and ${j} share ${shared} of ${own.size} sentences`);
  });
});

// Link previews: each page that can be shared has its own card (only the 404 borrows home's), a
// 1200×630 PNG under 300 KB (public/og, read from the PNG header).
for (const route of MARKETING_ROUTES) {
  if (route.kind !== 'notFound' && route.kind !== 'landing') assert(route.ogImage !== 'home', `${route.path}: its own link-preview image`);
}
const ogFiles = import.meta.glob<string>('../../../public/og/*.png', { query: '?inline', import: 'default', eager: true });
const u32 = (bytes: string, at: number) => ((bytes.charCodeAt(at) << 24) | (bytes.charCodeAt(at + 1) << 16) | (bytes.charCodeAt(at + 2) << 8) | bytes.charCodeAt(at + 3)) >>> 0;
for (const name of new Set(MARKETING_ROUTES.map((r) => r.ogImage))) {
  const dataUrl = ogFiles[`../../../public/og/${name}.png`];
  assert(Boolean(dataUrl), `og/${name}.png exists`);
  const png = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  assert(png.slice(1, 4) === 'PNG' && u32(png, 16) === 1200 && u32(png, 20) === 630, `og/${name}.png is a 1200×630 PNG`);
  assert(png.length < 300 * 1024, `og/${name}.png is under 300 KB (${Math.round(png.length / 1024)} KB)`);
}
console.log(`\nMarketing render: ${MARKETING_ROUTES.length} routes checked.`);
