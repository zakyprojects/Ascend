import type { AppShell } from './AppShell';
import type { FocusSessionProvider } from './pfc/FocusSessionProvider';

/**
 * The signed-in frame (AppShell: nav, header, notifications, dialogs; FocusSessionProvider) is its
 * own chunk, so the sign-in pages never download it. main.tsx starts loading it behind the splash
 * on every app page, and App starts it as soon as someone is signed in; App holds the loader until
 * it is here, so the app never shows without its frame.
 */

export interface AppShellParts {
  AppShell: typeof AppShell;
  FocusSessionProvider: typeof FocusSessionProvider;
}

let loaded: AppShellParts | null = null;
let pending: Promise<AppShellParts> | null = null;

export function preloadAppShell(): Promise<AppShellParts> {
  pending ??= Promise.all([import('./AppShell'), import('./pfc/FocusSessionProvider')]).then(
    ([shell, focus]) => (loaded = { AppShell: shell.AppShell, FocusSessionProvider: focus.FocusSessionProvider }),
    (error) => {
      pending = null; // a later attempt may succeed (back online)
      throw error;
    }
  );
  return pending;
}

/** The frame's components when its chunk has already loaded, else null. */
export function loadedAppShell(): AppShellParts | null {
  return loaded;
}
