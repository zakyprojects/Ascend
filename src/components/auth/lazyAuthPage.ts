import type { ComponentType } from 'react';
import type { AuthPageProps } from './AuthPage';

/**
 * The sign-in pages are their own chunk: signed-in visits never need them. main.tsx starts
 * loading it behind the splash, and App holds the boot loader until it is here, so a signed-out
 * visit never flashes an empty screen.
 */

let loaded: ComponentType<AuthPageProps> | null = null;
let pending: Promise<ComponentType<AuthPageProps>> | null = null;

export function preloadAuthPage(): Promise<ComponentType<AuthPageProps>> {
  pending ??= import('./AuthPage').then(
    (module) => (loaded = module.AuthPage),
    (error) => {
      pending = null; // a later attempt may succeed (back online)
      throw error;
    }
  );
  return pending;
}

/** The page component when its chunk has already loaded, else null. */
export function loadedAuthPage(): ComponentType<AuthPageProps> | null {
  return loaded;
}
