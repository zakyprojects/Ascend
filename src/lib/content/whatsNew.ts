import type { ReleaseNote } from '../releaseNote';

/*
 * "What's new" rules (settings doc `lastSeenRelease` = id of the newest note already shown).
 * A note is for an account only if the account existed before the note was written. It pops up
 * once (until the mark reaches its id); after that it stays in the notification panel only.
 */

function isValidMark(mark: number | null | undefined): mark is number {
  return typeof mark === 'number' && Number.isInteger(mark) && mark >= 0;
}

/** Two devices converge on the higher mark, so a note shown on one never shows again on another. */
export function mergeLastSeenRelease(base: number | null | undefined, incoming: number | null | undefined): number | null {
  if (!isValidMark(base)) return isValidMark(incoming) ? incoming : null;
  if (!isValidMark(incoming)) return base;
  return Math.max(base, incoming);
}

/** True when the account was created before the note was written (an unknown time counts as no). */
export function isReleaseNoteFor(note: ReleaseNote | null, accountCreatedAt: string | null | undefined): note is ReleaseNote {
  if (!note || !accountCreatedAt) return false;
  const created = Date.parse(accountCreatedAt);
  const released = Date.parse(note.releasedAt);
  return Number.isFinite(created) && Number.isFinite(released) && created < released;
}

/** Pop the note up now: it is for this account and not shown yet. */
export function shouldShowWhatsNew(
  stored: number | null | undefined,
  accountCreatedAt: string | null | undefined,
  note: ReleaseNote | null
): note is ReleaseNote {
  if (!isReleaseNoteFor(note, accountCreatedAt)) return false;
  return !isValidMark(stored) || stored < note.id;
}

/** List the note in the notification panel: it is for this account and was already shown. */
export function isReleaseNoteInInbox(
  stored: number | null | undefined,
  accountCreatedAt: string | null | undefined,
  note: ReleaseNote | null
): note is ReleaseNote {
  return isReleaseNoteFor(note, accountCreatedAt) && isValidMark(stored) && stored >= note.id;
}
