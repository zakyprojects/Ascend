// Editing a saved journal entry (lib/journalEdits.ts): mood and notes change, the id, date and
// createdAt never do, an edit never creates an entry, an earlier entry keeps its points flag and
// its day's award, and editing it leaves today's award exactly as it was.
import type { JournalEntry, PointsEntry } from '@/types';

// Node has no localStorage: a small in-memory one.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
} as Storage;

const { applyJournalEntryEdit, journalEditNotesOk } = await import('../journalEdits');
const { computeJournalAward, journalPointsInSeason } = await import('../points/journalAwards');
const { getSeasonStart } = await import('../time/leagueTime');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const TODAY = '2026-11-07';
const PAST = '2026-11-04';
const todayEntry: JournalEntry = { id: 't', date: TODAY, mood: 'happy', content: 'Wrote today, it went well.', createdAt: '2026-11-07T04:00:00.000Z', pointsAwarded: true };
const pastEntry: JournalEntry = { id: 'p', date: PAST, mood: 'sad', content: 'A hard day at uni.', createdAt: '2026-11-04T15:00:00.000Z', pointsAwarded: true };
const moodOnly: JournalEntry = { id: 'm', date: '2026-10-20', mood: 'neutral', content: '', createdAt: '2026-10-20T10:00:00.000Z', pointsAwarded: false };
// Newest first, as the store keeps them: today's entry comes before the one being edited.
const entries = [todayEntry, pastEntry, moodOnly];

// 1. An earlier entry: mood and notes change, nothing else.
{
  const edit = applyJournalEntryEdit(entries, 'p', 'motivated', '  Better than I thought, actually.  ', TODAY)!;
  assert(!!edit, 'edit applies');
  eq(edit.entry, { ...pastEntry, mood: 'motivated', content: 'Better than I thought, actually.' }, 'only mood and trimmed notes change');
  eq(edit.journalEntries.length, 3, 'no entry added');
  eq(edit.journalEntries[0], todayEntry, "today's entry untouched (not matched by date)");
  eq(edit.journalEntries[1].date, PAST, 'date kept');
  eq(edit.journalEntries[1].createdAt, pastEntry.createdAt, 'createdAt kept');
  eq(edit.journalEntries[2], moodOnly, 'other entries untouched');
  assert(entries[1] === pastEntry && pastEntry.mood === 'sad', 'input not mutated');
}

// 2. Points: the earlier day keeps its flag (even shrunk below the save minimum), today's award is the same row.
{
  const shrunk = applyJournalEntryEdit(entries, 'p', 'sad', 'ok', TODAY)!;
  eq(shrunk.entry.pointsAwarded, true, "an earlier entry keeps its pointsAwarded flag");
  const ledger: PointsEntry = computeJournalAward(entries, TODAY, Date.parse(`${TODAY}T00:00:00`), Date.parse('2026-11-07T10:00:00.000Z'))!;
  const after = computeJournalAward(shrunk.journalEntries, TODAY, Date.parse(`${TODAY}T00:00:00`), Date.parse('2026-11-07T10:00:00.000Z'), ledger);
  eq(after, ledger, "today's award unchanged by an earlier edit");
  const pastBefore = computeJournalAward(entries, PAST, Date.parse(`${PAST}T00:00:00`), Date.parse('2026-11-07T10:00:00.000Z'))!;
  const pastAfter = computeJournalAward(shrunk.journalEntries, PAST, Date.parse(`${PAST}T00:00:00`), Date.parse('2026-11-07T10:00:00.000Z'), pastBefore);
  eq(pastAfter, pastBefore, "the earlier day's award row is the same (+2 stays)");
}

// 3. Today's entry: flag follows the award check; with notes kept, today's award is the same row.
{
  const edit = applyJournalEntryEdit(entries, 't', 'neutral', 'Changed my mind about today.', TODAY)!;
  eq(edit.entry.pointsAwarded, true, "today's entry with notes still earns");
  eq(edit.entry.createdAt, todayEntry.createdAt, "today's createdAt kept");
  const start = Date.parse(`${TODAY}T00:00:00`);
  const now = Date.parse('2026-11-07T10:00:00.000Z');
  const ledger = computeJournalAward(entries, TODAY, start, now)!;
  eq(computeJournalAward(edit.journalEntries, TODAY, start, now, ledger), ledger, "today's award unchanged by today's edit");
}

// 4. Missing entry (deleted on another device) or no change: null, never a new entry.
{
  eq(applyJournalEntryEdit(entries, 'gone', 'happy', 'Some new text here.', TODAY), null, 'missing entry: no-op');
  eq(applyJournalEntryEdit(entries, 'p', 'sad', 'A hard day at uni.  ', TODAY), null, 'unchanged: no-op');
  eq(applyJournalEntryEdit([], 't', 'happy', 'Some new text here.', TODAY), null, 'empty list: no-op');
}

// 5. Mood-only entry: the mood can change and the notes may stay empty.
{
  const edit = applyJournalEntryEdit(entries, 'm', 'happy', '', TODAY)!;
  eq(edit.entry, { ...moodOnly, mood: 'happy' }, 'mood-only entry: mood changes, flag kept (false)');
}

// 6. The edit form's notes rule.
{
  eq(journalEditNotesOk('A hard day at uni.', 'Ten chars!'), true, '10 characters is enough');
  eq(journalEditNotesOk('A hard day at uni.', '  short  '), false, 'under 10 is not');
  eq(journalEditNotesOk('A hard day at uni.', '   '), false, 'cannot empty an entry that had notes');
  eq(journalEditNotesOk('', ''), true, 'a mood-only entry may stay without notes');
  eq(journalEditNotesOk(undefined, ''), true, 'missing content counts as mood only');
  eq(journalEditNotesOk('', 'abc'), false, 'adding notes needs the minimum');
}

// 7. The hero's journal points count this season only (pointsHistory holds every season).
{
  const now = new Date('2027-02-10T12:00:00Z').getTime(); // Season 2 (starts 2027-01-30 00:00 UTC)
  const seasonStart = getSeasonStart(new Date(now)).getTime();
  const row = (id: string, source: string, ms: number): PointsEntry => ({ id, amount: 2, reason: 'Journal', source, timestamp: new Date(ms).toISOString() });
  const history = [
    row('journal_award_old', 'journal', seasonStart - 1), // last ms of the season before
    row('journal_award_a', 'journal', seasonStart),
    row('journal_award_b', 'journal', now),
    row('habit_x', 'habits', now),
  ];
  eq(journalPointsInSeason(history, now), 4, 'only this season\'s journal rows');
  eq(journalPointsInSeason(history, seasonStart - 1), 2, 'the season before has its own row');
}

console.log('journalEdits: all assertions passed');
