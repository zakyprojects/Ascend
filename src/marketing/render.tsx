import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { marketingHead, type PageAssets } from './head';
import type { MarketingRoute } from './routes';
import { About } from './pages/About';
import { FeaturePage } from './pages/FeaturePage';
import { FeaturesHub } from './pages/FeaturesHub';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';

/**
 * A marketing page as a complete HTML document: static markup, no hydration (client.ts only adds
 * the theme switch, the menu, scroll rise and analytics). Runs at build time in plain Node, so
 * nothing reachable from here may touch window/document/localStorage at import (the test in
 * __tests__/render.test.ts renders every route without them).
 */
function pageElement(route: MarketingRoute): ReactElement {
  switch (route.kind) {
    case 'landing':
      return <Landing />;
    case 'hub':
      return <FeaturesHub />;
    case 'feature':
      if (!route.slug) throw new Error(`Feature route without a slug: ${route.path}`);
      return <FeaturePage slug={route.slug} />;
    case 'about':
      return <About />;
    case 'notFound':
      return <NotFound />;
    case 'legal':
      // The same page the app shows in-app; links are plain addresses here, home is the landing page.
      if (!route.legal) throw new Error(`Legal route without a page: ${route.path}`);
      return <LegalPage page={route.legal} onNavigate={() => undefined} homeHref="/" />;
    default:
      throw new Error(`Not a rendered page: ${route.path} (${route.kind})`);
  }
}

/** Routes rendered by renderMarketingPage (auth pages are the app shell with their own head). */
export const isRenderedRoute = (route: MarketingRoute): boolean => route.kind !== 'auth';

export function renderMarketingPage(route: MarketingRoute, assets: PageAssets): string {
  const body = renderToStaticMarkup(pageElement(route));
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    ${marketingHead(route, assets)}
  </head>
  <body>
    ${body}
  </body>
</html>
`;
}
