import { lazy } from 'react';
import { reloadOnceForStaleChunk } from '@/lib/chunkReload';

/**
 * The Terms, Privacy Policy and About page are their own chunk: most visits never open them.
 * main.tsx starts loading it when the app opens on `/privacy`, `/terms` or `/about`.
 */

let pending: Promise<typeof import('./LegalPage')> | null = null;

export function preloadLegalPage(): Promise<typeof import('./LegalPage')> {
  pending ??= import('./LegalPage').catch((error: unknown) => {
    pending = null; // a later attempt may succeed (back online)
    throw error;
  });
  return pending;
}

export const LegalPage = lazy(() =>
  preloadLegalPage().then(
    (module) => ({ default: module.LegalPage }),
    (error: unknown) => {
      reloadOnceForStaleChunk();
      throw error;
    }
  )
);
