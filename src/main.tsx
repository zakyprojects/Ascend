import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Design v3 type: Geist for the interface, Instrument Serif for the big moments (page titles,
// hero numbers), Geist Mono for small labels, timers and counters.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './index.css';
import { installPageVisibilityFlag, installWindowFocusFlag } from './lib/motion';
import { installCardSpotlight } from './lib/cardSpotlight';
import { installListExit } from './lib/listExit';
import { authRouteFromPath, nextFromSearch, viewFromLocation, viewFromPath } from './lib/routes';
import { installPagePrefetch, preloadView } from './components/views/lazyViews';
import { preloadAuthPage } from './components/auth/lazyAuthPage';

installPageVisibilityFlag();
installWindowFocusFlag();
installCardSpotlight();
installListExit();

const root = createRoot(document.getElementById('root')!);

const devParams = new URLSearchParams(window.location.search);

if (import.meta.env.DEV && devParams.has('splash-preview')) {
  // Dev only: render nothing so index.html's pre-React splash stays on screen (embedded by the gallery).
} else if (import.meta.env.DEV && devParams.has('gallery')) {
  import('./dev/Gallery').then(({ Gallery }) =>
    root.render(
      <StrictMode>
        <Gallery />
      </StrictMode>
    )
  );
} else {
  // The page in the address bar (on a sign-in page: the page it returns to) starts loading now,
  // alongside the session check behind the splash. So does the sign-in page: whether it is
  // needed is only known after the check, and it must not flash in late.
  const onAuthPage = authRouteFromPath(window.location.pathname) && !window.location.hash.startsWith('#/');
  const firstView = onAuthPage ? viewFromPath(nextFromSearch(window.location.search).split('?')[0]) : viewFromLocation();
  if (firstView) preloadView(firstView).catch(() => undefined);
  preloadAuthPage().catch(() => undefined);
  installPagePrefetch();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
