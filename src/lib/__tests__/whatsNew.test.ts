// Release note rules (lib/whatsNew.ts, lib/releaseNote.ts): seen mark merge, who sees a note,
// pop up once then inbox only, group order and empty groups, and the shipped note's shape.
import type { ReleaseNote } from '../releaseNote';
const { mergeLastSeenRelease, isReleaseNoteFor, shouldShowWhatsNew, isReleaseNoteInInbox } = await import('../whatsNew');
const { RELEASE_NOTE, RELEASE_NOTE_GROUPS, releaseNoteGroups, MAX_RELEASE_ITEMS, MAX_RELEASE_ITEM_LENGTH } = await import('../releaseNote');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const note: ReleaseNote = { id: 3, releasedAt: '2026-11-10T09:00:00+05:00', new: ['A thing'] };
const before = '2026-11-01T00:00:00.000Z';
const after = '2026-11-10T05:00:00.000Z'; // 10:00 PKT, one hour after the note

// Merge: the higher valid mark wins either way round; invalid values never win.
assert(mergeLastSeenRelease(2, 5) === 5 && mergeLastSeenRelease(5, 2) === 5, 'higher mark wins');
assert(mergeLastSeenRelease(null, 4) === 4 && mergeLastSeenRelease(4, undefined) === 4, 'missing side keeps the other');
assert(mergeLastSeenRelease(null, null) === null, 'both missing stays null');
assert(mergeLastSeenRelease(3, -1) === 3 && mergeLastSeenRelease(3, 1.5) === 3, 'negative / fraction ignored');
assert(mergeLastSeenRelease(NaN as number, 2) === 2, 'NaN ignored');

// Who the note is for: accounts created before it was written.
assert(isReleaseNoteFor(note, before), 'older account gets the note');
assert(!isReleaseNoteFor(note, after), 'account created after the note never gets it');
assert(!isReleaseNoteFor(note, note.releasedAt), 'same instant counts as after');
assert(!isReleaseNoteFor(note, undefined) && !isReleaseNoteFor(note, 'junk'), 'unknown creation time = no');
assert(!isReleaseNoteFor(null, before), 'no note = nothing');

// Pop up once: missing or lower mark shows; the note id or higher never again.
assert(shouldShowWhatsNew(undefined, before, note), 'first launch for an existing account shows');
assert(shouldShowWhatsNew(2, before, note), 'older mark shows the newer note');
assert(!shouldShowWhatsNew(3, before, note) && !shouldShowWhatsNew(7, before, note), 'seen mark never shows again');
assert(!shouldShowWhatsNew(undefined, after, note), 'new account skips it');
assert(!shouldShowWhatsNew(undefined, before, null), 'empty file shows nothing');

// Inbox: only after it was shown, and only for accounts it is for.
assert(!isReleaseNoteInInbox(undefined, before, note) && !isReleaseNoteInInbox(2, before, note), 'not in the inbox before it popped up');
assert(isReleaseNoteInInbox(3, before, note), 'in the inbox once seen');
assert(!isReleaseNoteInInbox(3, after, note), 'never in a new account inbox');
assert(!isReleaseNoteInInbox(3, before, null), 'no note, no inbox entry');

// Groups: fixed order, empty or missing groups dropped, blank lines dropped.
const mixed: ReleaseNote = { id: 1, releasedAt: note.releasedAt, removed: ['Gone'], fixed: [], new: ['Added'], improved: ['  '] };
assert(releaseNoteGroups(mixed).map((g) => g.label).join(',') === 'New,Removed', 'only filled groups, in order');
assert(RELEASE_NOTE_GROUPS.map((g) => g.label).join(',') === 'New,Improved,Changed,Fixed,Removed', 'Keep a Changelog order');
assert(releaseNoteGroups({ id: 1, releasedAt: note.releasedAt }).length === 0, 'a note with no lines has no groups');

// The shipped note (null = none) must be well formed.
if (RELEASE_NOTE) {
  const lines = releaseNoteGroups(RELEASE_NOTE).flatMap((g) => g.items);
  assert(Number.isInteger(RELEASE_NOTE.id) && RELEASE_NOTE.id > 0, 'id is a positive whole number');
  assert(/[+-]\d{2}:\d{2}$|Z$/.test(RELEASE_NOTE.releasedAt) && Number.isFinite(Date.parse(RELEASE_NOTE.releasedAt)), 'releasedAt is ISO with offset');
  assert(lines.length >= 1 && lines.length <= MAX_RELEASE_ITEMS, `1-${MAX_RELEASE_ITEMS} lines`);
  assert(lines.every((l) => l.length <= MAX_RELEASE_ITEM_LENGTH), `lines up to ${MAX_RELEASE_ITEM_LENGTH} chars`);
  assert(new Set(lines).size === lines.length, 'no repeated lines');
}

console.log('whatsNew: all assertions passed');
