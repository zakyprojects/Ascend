import { syncStorageFailed } from './outbox';

/**
 * The unsaved-changes flag `ascend_dirty_<uid>` (shared by the tabs of a browser). Each mark is a
 * new value, so a finished save can tell whether a newer change set the flag while it ran: it reads
 * the mark when it takes its state and clears the flag only if the mark is still the same. Readers
 * only test whether the flag is set.
 */
const dirtyKey = (userId: string) => `ascend_dirty_${userId}`;
const tabTag = Math.random().toString(36).slice(2, 8);
let counter = 0;

/** Sets the flag with a new mark. Throws like localStorage.setItem (quota). */
export function markDirty(userId: string): void {
  localStorage.setItem(dirtyKey(userId), `${tabTag}-${++counter}`);
}

/** The flag's current mark (null = not set); read it when a save takes its state. */
export function dirtyMark(userId: string): string | null {
  try {
    return localStorage.getItem(dirtyKey(userId));
  } catch {
    return null;
  }
}

/**
 * After a save succeeded for a state taken when the flag read `mark`: clears it, unless a newer
 * change (in any tab) set it meanwhile or the save could not queue its row changes (storage full).
 */
export function clearDirtyAfterSave(userId: string, mark: string | null): void {
  try {
    if (syncStorageFailed(userId)) return;
    if (localStorage.getItem(dirtyKey(userId)) !== mark) return;
    localStorage.removeItem(dirtyKey(userId));
  } catch {
    /* ignore */
  }
}
