/*
 * The release note users see once after a production push (lib/whatsNew.ts).
 *
 * Only the newest note exists: a new note REPLACES this one (the old text is gone).
 * - `id`: a whole number, higher than every earlier note's id (the next note is id + 1). The seen
 *   mark only goes up, so a reused or lower id would never show.
 * - `releasedAt`: when the note was written, ISO with offset ('2026-11-10T09:00:00+05:00'). It is the
 *   date shown, and accounts created after it never see this note (new users only see later notes).
 * - `title`: optional heading; "What's new" when left out.
 * - Groups `new`, `improved`, `changed`, `fixed`, `removed` (always shown in that order): short
 *   plain English lines. Leave a group out (or empty) when it has nothing; it then never shows.
 *   1-4 lines in total.
 * Only user-visible pushes get a note; small fixes get none (leave it as it is).
 */

export interface ReleaseNote {
  id: number;
  releasedAt: string;
  title?: string;
  new?: string[];
  improved?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
}

export type ReleaseNoteGroupKey = 'new' | 'improved' | 'changed' | 'fixed' | 'removed';

/** Group order and headings (Keep a Changelog style). */
export const RELEASE_NOTE_GROUPS: readonly { key: ReleaseNoteGroupKey; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'improved', label: 'Improved' },
  { key: 'changed', label: 'Changed' },
  { key: 'fixed', label: 'Fixed' },
  { key: 'removed', label: 'Removed' },
];

export const MAX_RELEASE_ITEMS = 4;
export const MAX_RELEASE_ITEM_LENGTH = 120;
export const DEFAULT_RELEASE_TITLE = "What's new";

/** The groups that have lines, in fixed order; empty ones are dropped. */
export function releaseNoteGroups(note: ReleaseNote): { key: ReleaseNoteGroupKey; label: string; items: string[] }[] {
  return RELEASE_NOTE_GROUPS.flatMap(({ key, label }) => {
    const items = (note[key] ?? []).filter((line) => line.trim() !== '');
    return items.length > 0 ? [{ key, label, items }] : [];
  });
}

export const RELEASE_NOTE: ReleaseNote | null = {
  id: 1,
  releasedAt: '2026-11-09T21:25:00+05:00',
  new: [
    'Reading: switch a book between pages and chapters anytime. 1 chapter counts as 20 pages, and you can edit both numbers.',
    'Recovery: tapped Clean today by mistake? Tap the tick to undo it the same day.',
  ],
  changed: [
    'Recovery: tap "Clean today" once a day to earn 1 point. This daily check-in replaces milestone points.',
    "Focus: every 12 minutes of focus now gives 1 point, and today's sessions add up. No finish bonus.",
  ],
};
