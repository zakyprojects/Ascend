import { FEATURES } from './features/catalog';
import type { MarketingRoute } from './routes';
import { absoluteUrl, SITE_DESCRIPTOR, SITE_NAME, SITE_URL } from './site';

/** The built CSS/JS a page loads (from dist/.vite/manifest.json; the dev server passes its own). */
export interface PageAssets {
  css: string[];
  /** The page's module script (src/marketing/client.ts once built). */
  js: string | null;
  /** Chunks the module script imports (modulepreload, fetched alongside it). */
  modules: string[];
  /** Font files to preload (the faces on the first screen). */
  fonts: string[];
}

/** Bump with the files in public/og so link previews fetch the new image. */
export const OG_IMAGE_VERSION = 1;

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Theme before first paint: the theme saved in the app (the key the app's own theme script and
 * store use), else the device's light/dark setting. The toggle (client.ts) saves the choice under
 * the same key, so the app opens in it too. Inline, so its sha256 is in vercel.json's CSP
 * (checkSeo fails on a missing hash).
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('ascend_theme_preference');if(t!=='light'&&t!=='dark')t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f6f8f7':'#0a0b0f');}catch(e){}})();`;

/**
 * Landing page only, first thing in <head>: a visit that belongs to the app goes there before
 * anything paints. Old `#/habits` links (KEEP IN SYNC with index.html's shim), a Supabase auth
 * hash or `?code=`, the old `/?quick-log` shortcut, and anyone with a saved session (signed in or
 * guest; same test as lib/supabase.ts storedAuthSession) go to the app; everyone else sees the
 * landing page. The app never sends anyone back to `/`, and the script acts only at `/` (so a
 * misrouted app address that got this page can never bounce), so it cannot loop.
 */
export const LANDING_REDIRECT_SCRIPT = `(function(){try{if(location.pathname!=='/')return;var h=location.hash,s=location.search,go=null;if(h.indexOf('#/')===0){var id=decodeURIComponent(h.slice(2)).replace(/^\\/+|\\/+$/g,'').toLowerCase();var r={'':'dashboard','index.html':'dashboard',books:'reading',prefrontal:'prefrontal-cortex'};if(Object.prototype.hasOwnProperty.call(r,id))id=r[id];if(!/^[a-z0-9-]+$/.test(id))id='dashboard';go='/'+id+s;}else if(/[#&](access_token|error)=/.test(h)||/[?&](code|quick-log)(=|&|$)/.test(s)){go='/dashboard'+s+h;}else{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(!k||!/^sb-[a-z0-9]+-auth-token$/.test(k))continue;var v=JSON.parse(localStorage.getItem(k)||'null');if(v&&typeof v.refresh_token==='string'&&v.refresh_token){go='/dashboard'+s+h;break;}}}if(go){document.documentElement.style.visibility='hidden';location.replace(go);}}catch(e){}})();`;

/** Every inline executable script a marketing page can carry (checkSeo hashes them into the CSP). */
export const MARKETING_INLINE_SCRIPTS = [THEME_SCRIPT, LANDING_REDIRECT_SCRIPT];

const ogImageUrl = (name: string) => `${SITE_URL}/og/${name}.png?v=${OG_IMAGE_VERSION}`;

/** Title, description, canonical, robots and the link-preview tags of one page. */
export function seoTags(route: MarketingRoute): string[] {
  const url = absoluteUrl(route.path);
  const tags = [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
  ];
  if (route.index) {
    tags.push(
      `<link rel="canonical" href="${url}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large" />`
    );
  } else {
    tags.push(`<meta name="robots" content="noindex" />`);
  }
  tags.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    ...(route.index ? [`<meta property="og:url" content="${url}" />`] : []),
    `<meta property="og:title" content="${escapeHtml(route.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:image" content="${ogImageUrl(route.ogImage)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(route.ogAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(route.ogAlt)}" />`
  );
  return tags;
}

/** The same icon links as the app shell (index.html), plus the 48px+ icon search results use. */
const ICON_TAGS = [
  `<link rel="icon" href="/favicon.ico?v=5" sizes="32x32" />`,
  `<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=5" />`,
  `<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png?v=5" />`,
  `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=5" />`,
  `<link rel="manifest" href="/manifest.json?v=5" />`,
];

/** JSON-LD for the page: the site's entity graph on `/`, a breadcrumb on /features pages. */
export function structuredData(route: MarketingRoute): object | null {
  if (route.kind === 'landing') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: SITE_NAME,
          alternateName: [SITE_DESCRIPTOR, 'Ascend App'],
          url: `${SITE_URL}/`,
          inLanguage: 'en',
          publisher: { '@id': `${SITE_URL}/#org` },
        },
        {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#org`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/android-chrome-512x512.png`,
        },
        {
          '@type': 'WebApplication',
          '@id': `${SITE_URL}/#app`,
          name: SITE_NAME,
          alternateName: SITE_DESCRIPTOR,
          url: `${SITE_URL}/`,
          applicationCategory: 'LifestyleApplication',
          operatingSystem: 'Web, Android, iOS (PWA)',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          publisher: { '@id': `${SITE_URL}/#org` },
        },
      ],
    };
  }
  const crumbs: { name: string; path: string }[] = [{ name: 'Home', path: '/' }];
  if (route.kind === 'hub' || route.kind === 'feature') crumbs.push({ name: 'Features', path: '/features' });
  if (route.kind === 'feature' && route.slug) crumbs.push({ name: FEATURES[route.slug].name, path: route.path });
  if (crumbs.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** JSON inside <script type="application/ld+json">: `<` escaped so text can never close the tag. */
const jsonLd = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c');

/** The whole <head> of a prerendered marketing page. */
export function marketingHead(route: MarketingRoute, assets: PageAssets): string {
  const data = structuredData(route);
  const parts = [
    `<meta charset="UTF-8" />`,
    ...(route.kind === 'landing' ? [`<script>${LANDING_REDIRECT_SCRIPT}</script>`] : []),
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`,
    ...seoTags(route),
    ...ICON_TAGS,
    `<meta name="theme-color" content="#0a0b0f" />`,
    `<script>${THEME_SCRIPT}</script>`,
    ...assets.fonts.map((href) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${href}" />`),
    ...assets.css.map((href) => `<link rel="stylesheet" crossorigin href="${href}" />`),
    ...(assets.js ? [`<script type="module" crossorigin src="${assets.js}"></script>`] : []),
    ...assets.modules.map((href) => `<link rel="modulepreload" crossorigin href="${href}" />`),
    ...(data ? [`<script type="application/ld+json">${jsonLd(data)}</script>`] : []),
  ];
  return parts.join('\n    ');
}
