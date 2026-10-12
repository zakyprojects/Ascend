import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './index.css';
import { installPageVisibilityFlag } from './lib/motion';

installPageVisibilityFlag();

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
