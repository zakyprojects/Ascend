import type { MouseEvent } from 'react';
import type { View } from './views';
import { pathForView } from './routes';

/**
 * Props for a real link to a page (`<a href="/habits">`): a plain left click stays in the app
 * (navigate, no reload); Ctrl/Cmd/Shift/Alt-click and middle-click keep the browser's own
 * behaviour (new tab, new window, download), and the href is there to copy or hover.
 */
export function pageLinkProps(view: View, navigate: (view: View) => void) {
  return {
    href: pathForView(view),
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(view);
    },
  };
}
