import { FEATURE_SLUGS, FEATURES, featurePath, type FeatureSlug } from './features/catalog';
import { SITE_NAME } from './site';

/**
 * Every public page the build writes (src/marketing/prerender.ts → scripts/prerender.ts), one
 * manifest for the pages, the sitemap, robots.txt and the checks. App pages are not here: they
 * are the app shell (app-shell.html, noindex, vercel.json).
 *
 *   landing / hub / feature / about / notFound: rendered from React components to static HTML
 *   legal: the app's LegalPage rendered to static HTML (the app shows the same page in-app)
 *   auth: the app shell with this page's head (the sign-in screen itself needs the app)
 */
export type MarketingKind = 'landing' | 'hub' | 'feature' | 'about' | 'legal' | 'auth' | 'notFound';

export interface MarketingRoute {
  path: string;
  /** Output file in dist/ (Vercel cleanUrls serves `features/journal.html` at `/features/journal`). */
  file: string;
  kind: MarketingKind;
  slug?: FeatureSlug;
  legal?: 'privacy' | 'terms';
  /** `<title>`, brand last. */
  title: string;
  /** Link-preview title: the title without the brand. */
  ogTitle: string;
  description: string;
  /** public/og/<ogImage>.png (1200×630). */
  ogImage: string;
  ogAlt: string;
  /** false: noindex, no canonical, not in the sitemap. */
  index: boolean;
  /**
   * Last real content change (YYYY-MM-DD) for the sitemap's lastmod. Bump it when the page's text
   * changes; never set from the build time.
   */
  updated: string;
}

/** The brand at the end of a title, removed for og:title. */
const BRAND_SUFFIX = ` – ${SITE_NAME}`;
const ogTitleOf = (title: string) => (title.endsWith(BRAND_SUFFIX) ? title.slice(0, -BRAND_SUFFIX.length) : title);

/**
 * The marketing footer (every page drawn with MarketingLayout) and the home, about, sign-in and
 * feature copy changed on this date (2026-10-30: the "why" answers and FAQ on home and every feature page).
 * Bump a route's own date when only its text changes.
 */
const SITE_COPY_UPDATED = '2026-10-30';

const featureRoutes: MarketingRoute[] = FEATURE_SLUGS.map((slug) => {
  const f = FEATURES[slug];
  return {
    path: featurePath(slug),
    file: `features/${slug}.html`,
    kind: 'feature',
    slug,
    title: f.title,
    ogTitle: ogTitleOf(f.title),
    description: f.description,
    ogImage: slug,
    ogAlt: f.ogAlt,
    index: true,
    updated: SITE_COPY_UPDATED,
  };
});

export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: '/',
    file: 'index.html',
    kind: 'landing',
    title: 'AscendDay – Gamified Self-Improvement App',
    ogTitle: 'AscendDay – Gamified Self-Improvement App',
    description:
      'AscendDay (formerly Ascend): a free gamified self-improvement app. Track habits, journal, read and train, earn points, climb weekly, monthly and 90-day leagues.',
    ogImage: 'home',
    ogAlt: 'AscendDay – Gamified Self-Improvement. Step up every day.',
    index: true,
    updated: SITE_COPY_UPDATED,
  },
  {
    path: '/features',
    file: 'features.html',
    kind: 'hub',
    title: 'AscendDay Features – All-in-One Gamified Self-Improvement',
    ogTitle: 'AscendDay Features – All-in-One Gamified Self-Improvement',
    description:
      'Every gamified self-improvement feature in AscendDay, an all-in-one app: habits, workouts, reading, skills, time blocking, journal, goals, plans and leagues.',
    ogImage: 'features',
    ogAlt: 'All AscendDay features: track, mind, plan and play',
    index: true,
    updated: SITE_COPY_UPDATED,
  },
  ...featureRoutes,
  {
    path: '/about',
    file: 'about.html',
    kind: 'about',
    title: 'About AscendDay – Who Makes It and Why',
    ogTitle: 'About AscendDay – Who Makes It and Why',
    description:
      'AscendDay is made by Zakria Khan, a computer science student in Peshawar, to turn the drive to compete into real habits. The story and how to help.',
    ogImage: 'about',
    ogAlt: 'About AscendDay: who makes it, and why',
    index: true,
    updated: SITE_COPY_UPDATED,
  },
  {
    path: '/login',
    file: 'login.html',
    kind: 'auth',
    title: 'Sign in – AscendDay',
    ogTitle: 'Sign in to AscendDay',
    description:
      'Sign in to AscendDay with your username, email or Google account to open your habits, journal, goals, leagues and season rank.',
    ogImage: 'login',
    ogAlt: 'Sign in to AscendDay: welcome back, your climb is waiting',
    index: true,
    updated: SITE_COPY_UPDATED,
  },
  {
    path: '/signup',
    file: 'signup.html',
    kind: 'auth',
    title: 'Create your free account – AscendDay',
    ogTitle: 'Create your free AscendDay account',
    description:
      'Create a free AscendDay account to track habits, journal, read and train, earn points and climb the leagues. Or start as a guest and save your progress later.',
    ogImage: 'signup',
    ogAlt: 'Create your free AscendDay account, or start as a guest',
    index: true,
    updated: '2026-10-25', // app shell: no footer; its splash label became the page's <h1>
  },
  {
    path: '/privacy',
    file: 'privacy.html',
    kind: 'legal',
    legal: 'privacy',
    title: 'Privacy Policy – AscendDay',
    ogTitle: 'AscendDay Privacy Policy',
    description:
      'What AscendDay collects and why, who can see it, which services process it, how long it is kept and how to delete your account. In plain language.',
    ogImage: 'privacy',
    ogAlt: 'AscendDay Privacy Policy: what AscendDay collects and who can see it',
    index: true,
    updated: '2026-10-25', // legal text (LegalPage, no marketing footer): AscendDay name, Last updated 25 October 2026 (5021878)
  },
  {
    path: '/terms',
    file: 'terms.html',
    kind: 'legal',
    legal: 'terms',
    title: 'Terms – AscendDay',
    ogTitle: 'AscendDay Terms',
    description:
      'The rules for using AscendDay: who can use it, accounts, fair play in leagues, your content, why points have no money value and why it is not medical advice.',
    ogImage: 'terms',
    ogAlt: 'AscendDay Terms: the rules for using AscendDay',
    index: true,
    updated: '2026-10-25', // legal text (LegalPage, no marketing footer): AscendDay name, Last updated 25 October 2026 (5021878)
  },
  {
    path: '/404',
    file: '404.html',
    kind: 'notFound',
    title: 'Page not found – AscendDay',
    ogTitle: 'Page not found',
    description: 'This page doesn’t exist on AscendDay. Go to the home page or see every feature.',
    ogImage: 'home',
    ogAlt: 'AscendDay – Gamified Self-Improvement. Step up every day.',
    index: false,
    updated: SITE_COPY_UPDATED,
  },
];

export const routeByPath = (path: string): MarketingRoute | undefined => MARKETING_ROUTES.find((r) => r.path === path);
