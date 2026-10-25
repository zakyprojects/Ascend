/**
 * The public site's fixed facts (landing, /features, legal pages, sitemap): one place, so the name,
 * descriptor and address read the same on every page, in the structured data and in link previews.
 */

/** The production address. Canonicals, og:url, the sitemap and robots.txt use it. */
export const SITE_URL = 'https://ascendday.com';

/** The address as people type it (no scheme), for page copy. */
export const SITE_HOST = new URL(SITE_URL).host;

/** The visible name on every public page: one word, the same as the domain (WebSite/Organization name, og:site_name, titles). */
export const SITE_NAME = 'AscendDay';

/**
 * The app's first name. Kept as a search keyword (structured data alternateName, one natural
 * mention on home and /about), never as the displayed name: "Ascend" alone is shared by many apps.
 */
export const SITE_FORMER_NAME = 'Ascend';

/** The brand descriptor (landing eyebrow, footer): always written this way. */
export const SITE_DESCRIPTOR = `${SITE_NAME} – Gamified Self-Improvement`;

/** Other names people search for (WebSite/Organization/WebApplication alternateName). */
export const SITE_ALTERNATE_NAMES = [SITE_FORMER_NAME, 'Ascend Day', 'Ascend App', 'Ascend – Gamified Self-Improvement'];

/** The slogan since the AscendDay name (2026-10-25): ascend = rise, day = daily. Hero, footer, og images. */
export const SITE_TAGLINE = 'Step up every day.';

/** The maker, as the Terms name him (lib/legal.ts LEGAL_OPERATOR). */
export const SITE_MAKER = 'Zakria Khan';

/**
 * IndexNow key (Bing, Yandex; Google ignores it). Public by design: public/<key>.txt holds the same
 * string. After a deploy with changed pages, ping api.indexnow.org with keyLocation = that file.
 */
export const INDEXNOW_KEY = '55f3fa6edac40bdd7ec7319a638ae4c8';

/** An absolute URL on this site for a path that starts with `/`. */
export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}
