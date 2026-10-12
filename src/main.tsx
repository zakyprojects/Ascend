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
import { installListExit } from './lib/listExit';

installPageVisibilityFlag();
installWindowFocusFlag();
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
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
