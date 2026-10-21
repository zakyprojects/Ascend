/**
 * The public site's fixed facts (landing, /features, legal pages, sitemap): one place, so the name,
 * descriptor and address read the same on every page, in the structured data and in link previews.
 */

/** The production address. Canonicals, og:url, the sitemap and robots.txt use it. */
export const SITE_URL = 'https://ascend-neon.vercel.app';

export const SITE_NAME = 'Ascend';

/** The brand descriptor (WebSite.alternateName, landing title): always written this way. */
export const SITE_DESCRIPTOR = 'Ascend – Gamified Self-Improvement';

/** Ascend's line since the first release (index.html meta description). */
export const SITE_TAGLINE = 'Train the mind. Rise.';

/** The maker, as the Terms name him (lib/legal.ts LEGAL_OPERATOR). */
export const SITE_MAKER = 'Zakria Khan';

/** An absolute URL on this site for a path that starts with `/`. */
export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}
