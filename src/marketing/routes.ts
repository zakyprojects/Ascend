import { FEATURE_SLUGS, FEATURES, featurePath, type FeatureSlug } from './features/catalog';

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
const BRAND_SUFFIX = ' – Ascend';
const ogTitleOf = (title: string) => (title.endsWith(BRAND_SUFFIX) ? title.slice(0, -BRAND_SUFFIX.length) : title);

const LAUNCH = '2026-10-21';

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
    updated: LAUNCH,
  };
});

export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: '/',
    file: 'index.html',
    kind: 'landing',
    title: 'Ascend – Gamified Self-Improvement App',
    ogTitle: 'Ascend – Gamified Self-Improvement App',
    description:
      'Ascend is a free gamified self-improvement web app: track habits, journal, read and train, earn points, and climb weekly, monthly and 90-day leagues.',
    ogImage: 'home',
    ogAlt: 'Ascend – Gamified Self-Improvement. Train the mind. Rise.',
    index: true,
    updated: LAUNCH,
  },
  {
    path: '/features',
    file: 'features.html',
    kind: 'hub',
    title: 'Ascend Features – Habits, Journal, Leagues & More',
    ogTitle: 'Ascend Features – Habits, Journal, Leagues & More',
    description:
      'Every part of Ascend in one place: habits, bad habits, workouts, reading, skills, time blocking, recovery, focus, journal, goals, plans, leagues and ranks.',
    ogImage: 'features',
    ogAlt: 'All Ascend features: track, mind, plan and play',
    index: true,
    updated: LAUNCH,
  },
  ...featureRoutes,
  {
    path: '/about',
    file: 'about.html',
    kind: 'about',
    title: 'About Ascend – Who Makes It and Why',
    ogTitle: 'About Ascend – Who Makes It and Why',
    description:
      'Ascend is made by Zakria Khan, a computer science student in Peshawar, to turn the drive to compete into real habits. The story, the idea and how to support it.',
    ogImage: 'about',
    ogAlt: 'About Ascend: who makes it, and why',
    index: true,
    updated: '2026-10-21',
  },
  {
    path: '/login',
    file: 'login.html',
    kind: 'auth',
    title: 'Sign in – Ascend',
    ogTitle: 'Sign in to Ascend',
    description: 'Sign in to Ascend with your username or email to open your habits, journal, goals, leagues and rank.',
    ogImage: 'login',
    ogAlt: 'Sign in to Ascend: welcome back, your climb is waiting',
    index: true,
    updated: LAUNCH,
  },
  {
    path: '/signup',
    file: 'signup.html',
    kind: 'auth',
    title: 'Create your free account – Ascend',
    ogTitle: 'Create your free Ascend account',
    description:
      'Create a free Ascend account to track habits, journal, read and train, earn points and climb the leagues. Or start as a guest and save your progress later.',
    ogImage: 'signup',
    ogAlt: 'Create your free Ascend account, or start as a guest',
    index: true,
    updated: LAUNCH,
  },
  {
    path: '/privacy',
    file: 'privacy.html',
    kind: 'legal',
    legal: 'privacy',
    title: 'Privacy Policy – Ascend',
    ogTitle: 'Ascend Privacy Policy',
    description:
      'What Ascend collects and why, who can see it, which services process it, how long it is kept and how to delete your account. In plain language.',
    ogImage: 'privacy',
    ogAlt: 'Ascend Privacy Policy: what Ascend collects and who can see it',
    index: true,
    updated: LAUNCH,
  },
  {
    path: '/terms',
    file: 'terms.html',
    kind: 'legal',
    legal: 'terms',
    title: 'Terms – Ascend',
    ogTitle: 'Ascend Terms',
    description:
      'The rules for using Ascend: who can use it, your account, fair play in leagues, your content, why points have no money value, and why it is not medical advice.',
    ogImage: 'terms',
    ogAlt: 'Ascend Terms: the rules for using Ascend',
    index: true,
    updated: LAUNCH,
  },
  {
    path: '/404',
    file: '404.html',
    kind: 'notFound',
    title: 'Page not found – Ascend',
    ogTitle: 'Page not found',
    description: 'This page doesn’t exist on Ascend. Go to the home page or see every feature.',
    ogImage: 'home',
    ogAlt: 'Ascend – Gamified Self-Improvement. Train the mind. Rise.',
    index: false,
    updated: LAUNCH,
  },
];

export const routeByPath = (path: string): MarketingRoute | undefined => MARKETING_ROUTES.find((r) => r.path === path);
