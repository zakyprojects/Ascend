import { escapeHtml, seoTags, type PageAssets } from './head';
import { llmsFullTxt, llmsTxt } from './llms';
import { isRenderedRoute, renderMarketingPage } from './render';
import { MARKETING_ROUTES, type MarketingRoute } from './routes';
import { absoluteUrl, SITE_URL } from './site';

/**
 * What the build adds to dist/ after `vite build` (scripts/prerender.ts does the file I/O):
 *   app-shell.html            the app's index.html, served for every app route (vercel.json)
 *   index.html, features*.html, 404.html   static marketing pages
 *   login.html, signup.html   the app shell with that page's title, description and previews
 *   sitemap.xml, robots.txt
 *   llms.txt, llms-full.txt   the site in plain text for AI assistants (llms.ts)
 */

/** The entry of dist/.vite/manifest.json that the marketing pages load. */
export const MARKETING_ENTRY = 'src/marketing/client.ts';

export interface ViteManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
  isEntry?: boolean;
}

/** The faces on the marketing pages' first screen (body text and the serif heading), latin only. */
const FIRST_SCREEN_FONTS = [/^assets\/geist-latin-wght-normal-[\w-]+\.woff2$/, /^assets\/instrument-serif-latin-400-normal-[\w-]+\.woff2$/];

export function marketingAssets(manifest: Record<string, ViteManifestChunk>, assetFiles: string[]): PageAssets {
  const entry = manifest[MARKETING_ENTRY];
  if (!entry?.isEntry) throw new Error(`${MARKETING_ENTRY} is not an entry in the Vite manifest`);
  return {
    css: (entry.css ?? []).map((file) => `/${file}`),
    js: `/${entry.file}`,
    modules: (entry.imports ?? []).map((key) => `/${manifest[key].file}`),
    fonts: assetFiles.filter((file) => FIRST_SCREEN_FONTS.some((pattern) => pattern.test(file))).map((file) => `/${file}`),
  };
}

/** The app shell with a sign-in page's own head tags in place of the generic ones (the body is unchanged). */
export function shellWithHead(shellHtml: string, route: MarketingRoute): string {
  const generic = /^\s*<(title>[^<]*<\/title|meta (name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*)>\s*$/;
  const lines = shellHtml.split('\n');
  const first = lines.findIndex((line) => /<title>/.test(line));
  if (first < 0) throw new Error('App shell has no <title>');
  const indent = lines[first].match(/^\s*/)?.[0] ?? '';
  const kept = lines.filter((line, i) => i === first || !generic.test(line));
  const at = kept.findIndex((line) => /<title>/.test(line));
  kept.splice(at, 1, ...seoTags(route).map((tag) => indent + tag));
  // The raw HTML of a sign-in page has no heading until React loads, so the splash's loading label
  // becomes the page's <h1> (the same words as its og:title). React replaces it with the form's own <h1>.
  const label = /<p id="splash-label"([^>]*)>[^<]*<\/p>/;
  const html = kept.join('\n');
  if (!label.test(html)) throw new Error('App shell has no splash label');
  return html.replace(label, (_, attrs: string) => `<h1 id="splash-label"${attrs}>${escapeHtml(route.ogTitle)}</h1>`);
}

export function sitemapXml(routes: MarketingRoute[] = MARKETING_ROUTES): string {
  const urls = routes
    .filter((route) => route.index)
    .map((route) => `  <url>\n    <loc>${absoluteUrl(route.path)}</loc>\n    <lastmod>${route.updated}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Every crawler may read every public page (AI crawlers included, owner decision 2026-10-21); the API is off limits. */
export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/** Every file the prerender writes, by its path in dist/. */
export function buildSite(input: {
  shellHtml: string;
  manifest: Record<string, ViteManifestChunk>;
  assetFiles: string[];
}): Record<string, string> {
  const assets = marketingAssets(input.manifest, input.assetFiles);
  const files: Record<string, string> = { 'app-shell.html': input.shellHtml };
  for (const route of MARKETING_ROUTES) {
    if (route.kind === 'auth') files[route.file] = shellWithHead(input.shellHtml, route);
    else if (isRenderedRoute(route)) files[route.file] = renderMarketingPage(route, assets);
  }
  files['sitemap.xml'] = sitemapXml();
  files['robots.txt'] = robotsTxt();
  files['llms.txt'] = llmsTxt();
  files['llms-full.txt'] = llmsFullTxt(files);
  return files;
}
