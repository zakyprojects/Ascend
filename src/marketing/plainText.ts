import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Text that is written for the page as React (FAQ answers with links, numbers from the app's code)
 * as plain text, for the structured data and llms.txt. Rendered from the same nodes the page
 * shows, so the copy is never written twice. Build time only (react-dom/server).
 */

/** The few entities renderToStaticMarkup writes, back to characters. */
export const decodeEntities = (html: string): string =>
  html
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&');

export function plainText(node: ReactNode): string {
  if (typeof node === 'string') return node.replace(/\s+/g, ' ').trim();
  const html = renderToStaticMarkup(createElement(Fragment, null, node));
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
