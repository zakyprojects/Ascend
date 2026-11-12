import { useEffect, useState } from 'react';
import type { AppStore } from './store/store';
import { RELEASE_NOTE } from './releaseNote';
import { shouldShowWhatsNew } from './whatsNew';

/** After the boot loader has left and after the rank-up overlay's own delay (900 ms), so that one goes first. */
const SHOW_DELAY_MS = 1200;

/**
 * Pops the release note up once (rules in lib/whatsNew). Decided only once the signed-in account's
 * server data is applied, never on a device cache. Waits while `blocked` (another boot dialog is
 * open). The seen mark is saved at once when it opens, so a reload or another device never repeats
 * it; after that the note lives in the notification panel.
 */
export function useWhatsNew(store: AppStore, blocked: boolean) {
  const currentUser = store.state.currentUser;
  const ready = store.isServerDataApplied && !store.isSessionLoading && Boolean(currentUser);
  const due = ready && shouldShowWhatsNew(store.state.lastSeenRelease, currentUser?.createdAt, RELEASE_NOTE);
  const { setLastSeenRelease } = store;

  const [open, setOpen] = useState(false);

  // Signed out or switching accounts: never carry an open note over.
  if (!ready && open) setOpen(false);

  useEffect(() => {
    if (!due || blocked || open || !RELEASE_NOTE) return;
    const id = RELEASE_NOTE.id;
    const timer = setTimeout(() => {
      setLastSeenRelease(id);
      setOpen(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, blocked, open, setLastSeenRelease]);

  return {
    whatsNewOpen: open && RELEASE_NOTE !== null,
    closeWhatsNew: () => setOpen(false),
  };
}
