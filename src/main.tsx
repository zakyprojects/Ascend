import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('gallery')) {
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
