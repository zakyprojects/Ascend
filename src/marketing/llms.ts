import { MIN_AGE, LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { FEATURE_GROUPS, FEATURE_SLUGS, featurePath, featuresInGroup } from './features/catalog';
import { FEATURE_CONTENT } from './features/content';
import { LANDING_FITS, LANDING_NOT_FOR, LANDING_WHY } from './landingQa';
import { decodeEntities, plainText } from './plainText';
import { MARKETING_ROUTES, type MarketingRoute } from './routes';
import { absoluteUrl, SITE_DEFINITION, SITE_FORMER_NAME, SITE_HOST, SITE_MAKER, SITE_NAME, SITE_TAGLINE } from './site';

/**
 * /llms.txt and /llms-full.txt (llmstxt.org): the site in plain Markdown for AI assistants, written
 * by the prerender from the same data the pages use (catalog, the home page's answers, each feature
 * page's own questions), so it can never say something the site doesn't. vercel.json serves both
 * as text/plain.
 */

/** "Why use AscendDay for habits instead of a separate habit tracker app?" on each feature page. */
const whyUseItem = (slug: (typeof FEATURE_SLUGS)[number]) => FEATURE_CONTENT[slug].faq.find((item) => /^Why .* instead of /.test(item.q));

export function llmsTxt(): string {
  const lines: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DEFINITION}`,
    '',
    `${SITE_NAME} (formerly just ${SITE_FORMER_NAME}, also written Ascend Day) lives at ${SITE_HOST}. Its slogan is “${SITE_TAGLINE}” Instead of one app for habits, another for a journal and another for goals, people log their habits, workouts, reading, skill practice, focus sessions and journal in one place. Each part earns points under fixed rules shown in the app, most with a daily cap; missing a chosen habit or slipping on a tracked bad habit costs points. Season points set a rank, and the same points place everyone in weekly, monthly and season leagues. Planning parts (projects, plans, partner challenges) earn no points of their own.`,
    '',
    '## Who it is for',
    '',
    ...LANDING_FITS.map((line) => `- ${line}`),
    '',
    '## Who it may not suit',
    '',
    ...LANDING_NOT_FOR.map((line) => `- ${line}`),
    '',
    '## Key facts',
    '',
    '- Price: free while in beta; no payments anywhere in the app.',
    '- Platform: a web app that runs in any modern browser on Android, iPhone, Windows, Mac and Linux, and can be installed from the browser (PWA). Not in the app stores yet.',
    `- Account: start as a guest with no sign-up, then save progress to a free account with a username and email (or Google). Minimum age ${MIN_AGE}.`,
    '- Privacy: journal, moods, cravings and the recovery tracker are visible only to the user. League tables show username, avatar, rank and points.',
    '- Not medical: the recovery tracker, focus tools and lessons are self-help and motivation, not treatment, therapy or medical advice.',
    `- Made by: ${SITE_MAKER}, a computer science student in Peshawar, Pakistan.`,
    `- Contact: ${LEGAL_CONTACT_EMAIL}`,
    `- Not affiliated with other apps named ${SITE_FORMER_NAME}.`,
    '',
  ];
  for (const group of FEATURE_GROUPS) {
    lines.push(`## Features: ${group.id} (${group.line.replace(/\.$/, '')})`, '');
    for (const feature of featuresInGroup(group.id)) lines.push(`- [${feature.name}](${absoluteUrl(featurePath(feature.slug))}): ${feature.summary}`);
    lines.push('');
  }
  lines.push('## Why AscendDay works the way it does', '');
  for (const { q, a } of LANDING_WHY) lines.push(`### ${q}`, '', plainText(a), '');
  lines.push(`## Why use ${SITE_NAME} for each part`, '');
  for (const slug of FEATURE_SLUGS) {
    const item = whyUseItem(slug);
    if (item) lines.push(`### ${item.q}`, '', plainText(item.a), '');
  }
  lines.push(
    '## More',
    '',
    `- [Home](${absoluteUrl('/')}): what ${SITE_NAME} is, how points, ranks and leagues work, FAQ`,
    `- [All features](${absoluteUrl('/features')})`,
    `- [About](${absoluteUrl('/about')}): who makes ${SITE_NAME} and why`,
    `- [Privacy Policy](${absoluteUrl('/privacy')})`,
    `- [Terms](${absoluteUrl('/terms')})`,
    `- [Full text of every page](${absoluteUrl('/llms-full.txt')})`,
    ''
  );
  return lines.join('\n');
}

/** The <main> of a rendered page as plain Markdown-ish text: headings, list items and paragraphs on their own lines. */
export function mainText(html: string): string {
  const main = html.match(/<main[\s>][\s\S]*<\/main>/)?.[0] ?? '';
  const text = main
    .replace(/<(svg|script|style|picture|nav)[\s>][\s\S]*?<\/\1>/g, ' ')
    .replace(/<span class="sr-only[^"]*">[\s\S]*?<\/span>/g, ' ')
    .replace(/<span aria-hidden="true"[^>]*>[^<]*<\/span>/g, ' ')
    .replace(/<a [^>]*class="btn-[^"]*"[^>]*>[\s\S]*?<\/a>/g, ' ')
    .replace(/<\/span>\s*<span/g, '</span> <span')
    .replace(/<h1[^>]*>/g, '\n\n# ')
    .replace(/<h2[^>]*>/g, '\n\n## ')
    .replace(/<h3[^>]*>/g, '\n\n### ')
    .replace(/<\/h[1-6]>/g, '\n\n')
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<\/td>\s*<td[^>]*>/g, ': ')
    .replace(/<\/dt>\s*<dd[^>]*>/g, ': ')
    .replace(/<\/(p|div|li|tr|dd|summary|caption|figcaption|blockquote|ol|ul|dl|table)>|<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .replace(/^(#+ )\s*/gm, '$1')
    .replace(/^-\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pages in /llms-full.txt: the indexable marketing pages with their own copy (legal pages are linked from llms.txt). */
export const isLlmsFullRoute = (route: MarketingRoute): boolean =>
  route.index && (route.kind === 'landing' || route.kind === 'hub' || route.kind === 'feature' || route.kind === 'about');

/** Every page's main text, one after another. `rendered` maps a route's file to its HTML. */
export function llmsFullTxt(rendered: Record<string, string>): string {
  const parts = [`# ${SITE_NAME}: the full text of ${SITE_HOST}`, '', `> ${SITE_DEFINITION}`, ''];
  for (const route of MARKETING_ROUTES.filter(isLlmsFullRoute)) {
    const html = rendered[route.file];
    if (!html) throw new Error(`llms-full.txt: ${route.file} was not rendered`);
    parts.push('---', '', `Page: ${route.title}`, `URL: ${absoluteUrl(route.path)}`, '', mainText(html), '');
  }
  return parts.join('\n');
}
