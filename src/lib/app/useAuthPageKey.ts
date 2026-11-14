import { useState } from 'react';

/**
 * Key for the sign-in page (/login, /signup). It changes when a sign-in that was loading its account
 * (or stuck on the first-load gate) ends with no account on screen: Sign out from the gate, or the
 * session dropped while loading. The page stays mounted under the loader all that time and has
 * already run its success screen and hand-off, so the same instance would show "Welcome back" and
 * no form; a new key gives the user a fresh page.
 */
export function useAuthPageKey(sessionPending: boolean, signedIn: boolean): number {
  const [key, setKey] = useState(0);
  const [wasPending, setWasPending] = useState(sessionPending);
  if (wasPending !== sessionPending) {
    setWasPending(sessionPending);
    if (!sessionPending && !signedIn) setKey((k) => k + 1);
  }
  return key;
}
