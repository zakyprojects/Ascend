import { FEATURES, FEATURE_SLUGS, featurePath } from '../features/catalog';
import { FEATURE_CONTENT } from '../features/content';
import { MARKETING_ROUTES } from '../routes';
import { isRenderedRoute, renderMarketingPage } from '../render';
import { shellWithHead } from '../prerender';
import appShell from '../../../index.html?raw';
import { absoluteUrl, SITE_FORMER_NAME, SITE_NAME, SITE_TAGLINE } from '../site';
import { TIERS } from '@/lib/tiers';
import { LESSONS } from '@/lib/lessons';
import { SOBRIETY_MILESTONE_POINTS } from '@/lib/pointsConfig';
import { RECOVERY_MILESTONES } from '@/lib/recoveryAwards';
import { fmt, pts } from '../features/format';
import { FUEL_MENU, fuelMailto, MAKER_STORY } from '@/components/settings/makerContent';
import { faqItemsFor } from '../head';
import { LANDING_WHY } from '../landingQa';
import { isLlmsFullRoute, llmsFullTxt, llmsTxt } from '../llms';
import { decodeEntities } from '../plainText';
import { SITE_DEFINITION } from '../site';

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
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const titles = new Set<string>();
const descriptions = new Set<string>();

for (const route of MARKETING_ROUTES) {
  assert(route.title.length <= 60, `${route.path}: title ≤ 60 chars (${route.title.length})`);
  const minDescription = route.index ? 120 : 70;
  assert(
    route.description.length >= minDescription && route.description.length <= 160,
    `${route.path}: description ${minDescription}–160 chars (${route.description.length})`
  );
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
  assert(route.title.includes(SITE_NAME), `${route.path}: title carries ${SITE_NAME}`);
  assert(html.includes(`<meta property="og:site_name" content="${SITE_NAME}" />`), `${route.path}: og:site_name is ${SITE_NAME}`);
  // The name is in the footer of every page drawn with the marketing layout (legal pages are the
  // app's LegalPage and have no marketing footer).
  if (route.kind !== 'legal') assert(textOf(html).includes(`${SITE_NAME} is free and in beta`), `${route.path}: footer names ${SITE_NAME}`);
  // "Ascend" alone is a keyword, not the shown name: outside the few disambiguation lines, the
  // page text always says AscendDay. (The /about maker story is app text, checked separately.)
  if (route.kind !== 'legal') {
    let text = textOf(html).replace(/&#x27;|&#39;/g, "'");
    if (route.kind === 'about') for (const part of MAKER_STORY) for (const t of part.paragraphs) text = text.split(t).join(' ');
    for (const allowed of ['other apps named Ascend', 'other apps called Ascend', 'use the name Ascend', `formerly ${SITE_FORMER_NAME}`, `formerly just ${SITE_FORMER_NAME}`, `first called just ${SITE_FORMER_NAME}`, `${SITE_FORMER_NAME}, Ascend Day`])
      text = text.split(allowed).join(' ');
    const stray = text.match(/.{0,40}\bAscend\b(?! ?Day).{0,40}/);
    assert(!stray, `${route.path}: shows the name AscendDay, not "Ascend" (${stray?.[0]})`);
  }
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
// "AscendDay" as a name: home title, h1, description and every node of the graph.
const nodeOf = (type: string) => (ld['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === type)!;
const names = (value: unknown) => (Array.isArray(value) ? value : [value]);
assert(attr(landing, /<title>([^<]+)<\/title>/)!.startsWith(SITE_NAME), 'landing title starts with AscendDay');
const landingH1 = textOf(landing.match(/<h1[\s\S]*?<\/h1>/)![0]);
assert(landingH1.includes(SITE_NAME) && landingH1.includes(SITE_TAGLINE), 'landing h1 names AscendDay and the slogan');
assert(MARKETING_ROUTES[0].description.startsWith(SITE_NAME) && MARKETING_ROUTES[0].description.includes(`formerly ${SITE_FORMER_NAME}`), 'landing description starts with the name and keeps the old one');
for (const type of ['WebSite', 'Organization', 'WebApplication']) {
  assert(nodeOf(type).name === SITE_NAME, `${type}.name is ${SITE_NAME}`);
  assert(names(nodeOf(type).alternateName).includes(SITE_FORMER_NAME), `${type}.alternateName includes ${SITE_FORMER_NAME}`);
}
assert(names(nodeOf('WebSite').alternateName).includes('Ascend Day'), 'WebSite.alternateName includes Ascend Day');
assert(typeof (nodeOf('Organization').founder as { name?: string })?.name === 'string', 'Organization has a nested founder');
assert(landing.indexOf('<script>') < landing.indexOf('<meta name="viewport"'), 'landing redirect runs first');
// The landing page is a real page: its text in the HTML, and plain links to every feature, sign-up and sign-in.
const landingText = landing.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
assert(landingText.split(/\s+/).filter(Boolean).length >= 400, 'landing has at least 400 words of text');
for (const slug of FEATURE_SLUGS) assert(landing.includes(`href="${featurePath(slug)}"`), `landing links ${featurePath(slug)}`);
for (const href of ['/signup', '/login', '/features', '/privacy', '/about']) assert(landing.includes(`href="${href}"`), `landing links ${href}`);

const wordsOf = (html: string) => textOf(html).split(/\s+/).filter(Boolean).length;

// /about is a real page with the maker's story (the same text as Settings > About us) and the support menu.
const about = renderMarketingPage(MARKETING_ROUTES.find((r) => r.kind === 'about')!, assets);
for (const part of MAKER_STORY) for (const text of part.paragraphs) assert(textOf(about).includes(text), `/about has: ${text.slice(0, 30)}`);
for (const { name } of FUEL_MENU) assert(about.includes(fuelMailto(name).replace(/&/g, '&amp;')), `/about support links ${name}`);
assert(count(about, /href="\/about"/g) >= 2, '/about is linked from the header and the footer');

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
  assert(content.faq.length >= 4 && content.faq.length <= 8, `${route.path}: 4–8 questions`);
  assert(content.faq.some((item) => /^Why use AscendDay .* instead of /.test(item.q)), `${route.path}: answers why use AscendDay for it`);
  featureTexts.push(textOf(html));
}
assert(featureTexts.length === FEATURE_SLUGS.length, 'every feature page is checked');

// The ranks page's ladder is the app's own (lib/tiers.ts), rank for rank.
const ranksPage = renderMarketingPage(MARKETING_ROUTES.find((r) => r.slug === 'ranks')!, assets);
TIERS.forEach((tier, i) => assert(ranksPage.includes(`${i + 1}. ${tier.name}`) && ranksPage.includes(pts(fmt(tier.minPoints))), `ranks page lists ${tier.name} at ${tier.minPoints}`));
// Health-adjacent pages carry their not-medical-advice note; recovery also its milestones and a helpline.
const pageOf = (slug: string) => renderMarketingPage(MARKETING_ROUTES.find((r) => r.slug === slug)!, assets);
const recoveryPage = pageOf('recovery');
assert(recoveryPage.includes('AscendDay is not treatment, therapy or medical advice.') && recoveryPage.includes('1-800-662-4357'), 'recovery page: not-treatment note and helpline');
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
// Sign-in pages: the app shell gets one <h1> (the og:title) in place of the splash's loading label.
for (const route of MARKETING_ROUTES.filter((r) => r.kind === 'auth')) {
  const html = shellWithHead(appShell, route);
  const h1s = html.match(/<h1[\s>][^]*?<\/h1>/g) ?? [];
  assert(h1s.length === 1 && h1s[0].includes(`>${route.ogTitle}</h1>`), `${route.path}: one <h1> reading "${route.ogTitle}"`);
}
// FAQPage structured data on home and every feature page: built from the questions the page shows,
// one Question per visible item, answers as plain text that also reads on the page.
const squash = (text: string) => decodeEntities(text).replace(/\s+/g, '').trim();
for (const route of MARKETING_ROUTES.filter((r) => r.kind === 'landing' || r.kind === 'feature')) {
  const html = renderMarketingPage(route, assets);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faqLd = blocks.find((block) => block['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  const items = faqItemsFor(route);
  assert(Boolean(faqLd) && faqLd!.mainEntity.length === items.length && items.length > 0, `${route.path}: FAQPage with every visible question`);
  const visible = squash(textOf(html));
  for (const entity of faqLd!.mainEntity) {
    assert(visible.includes(squash(entity.name)), `${route.path}: FAQ question on the page: ${entity.name}`);
    assert(entity.acceptedAnswer.text.length > 20 && !/[<>]/.test(entity.acceptedAnswer.text), `${route.path}: plain-text answer for ${entity.name}`);
    assert(visible.includes(squash(entity.acceptedAnswer.text)), `${route.path}: FAQ answer reads on the page: ${entity.name}`);
  }
  assert(textOf(html).includes(SITE_DEFINITION), `${route.path}: carries the one-sentence definition`);
}
for (const { q } of LANDING_WHY) assert(textOf(landing).includes(q), `landing answers: ${q}`);
const app = nodeOf('WebApplication') as { featureList?: string[]; screenshot?: string[]; isAccessibleForFree?: boolean };
assert(app.isAccessibleForFree === true && app.featureList?.length === FEATURE_SLUGS.length && (app.screenshot?.length ?? 0) > 0, 'WebApplication: free, featureList per feature, screenshots');

// llms.txt / llms-full.txt: an H1, the definition, every feature page, the why answers.
const llms = llmsTxt();
assert(llms.startsWith(`# ${SITE_NAME}\n`) && llms.includes(`> ${SITE_DEFINITION}`), 'llms.txt: H1 and definition');
for (const slug of FEATURE_SLUGS) assert(llms.includes(`(${absoluteUrl(featurePath(slug))})`), `llms.txt links ${slug}`);
for (const { q } of LANDING_WHY) assert(llms.includes(`### ${q}`), `llms.txt answers: ${q}`);
assert(!/undefined|\[object Object\]|<[a-z]/.test(llms), 'llms.txt: plain text only');
const rendered = Object.fromEntries(MARKETING_ROUTES.filter(isLlmsFullRoute).map((r) => [r.file, renderMarketingPage(r, assets)]));
const full = llmsFullTxt(rendered);
for (const route of MARKETING_ROUTES.filter(isLlmsFullRoute)) assert(full.includes(`URL: ${absoluteUrl(route.path)}`), `llms-full.txt has ${route.path}`);
assert(!/undefined|\[object Object\]|<[a-z]/.test(full) && full.length > 50000, 'llms-full.txt: plain text of every page');

console.log(`\nMarketing render: ${MARKETING_ROUTES.length} routes checked.`);
