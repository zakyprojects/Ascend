// Hook test (real useAppState + in-process fake Supabase, see harness/): the journal and lesson
// actions of a signed-in account. Written for C2 (moving them out of useAppState).
//   T20  saving today's entry puts it in state and in journal_entries; getTodayJournalEntry finds it
//        after the re-render (it reads the current state); an edit saves the new text; a lesson read
//        reaches readLessonIds and lesson_reads; deleting the entry removes it and leaves a tombstone.
import { bootHook, story, until, quiet, rows, assert, pass, server, UID } from './harness/bootHook';
import { LESSONS } from '../content/lessons';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('journal.hook (journal + lesson actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);

  assert(h.s().getTodayJournalEntry() === null, 'T20 precondition: no entry today');
  h.s().saveJournalEntry('motivated', 'Hook journal first text');
  await until(() => h.s().getTodayJournalEntry()?.content === 'Hook journal first text', 'T20: getTodayJournalEntry finds the saved entry');
  const id = h.s().getTodayJournalEntry()!.id;
  await until(() => rows('journal_entries').some((r) => r.id === id), 'T20: entry reached journal_entries', 5000);

  h.s().editJournalEntry(id, 'happy', 'Hook journal edited text');
  await until(() => h.s().getTodayJournalEntry()?.content === 'Hook journal edited text', 'T20: edited text in state');
  await until(() => rows('journal_entries').some((r) => r.id === id && JSON.stringify(r).includes('Hook journal edited text')), 'T20: edited text reached the row', 5000);

  const lesson = LESSONS[0].id;
  h.s().markLessonRead(lesson);
  await until(() => h.s().state.readLessonIds.some((x) => x.startsWith(lesson)), 'T20: lesson read in state');
  await until(() => rows('lesson_reads').some((r) => JSON.stringify(r).includes(lesson)), 'T20: lesson read reached lesson_reads', 5000);

  h.s().deleteJournalEntry(id);
  await until(() => h.s().getTodayJournalEntry() === null, 'T20: entry gone (getTodayJournalEntry)');
  assert((h.s().state.deletedEntityIds || []).includes(id), 'T20: deleted entry has a tombstone');
  await until(() => !rows('journal_entries').some((r) => r.id === id), 'T20: entry row deleted', 5000);
  pass('T20 journal save, read-back, edit, delete and lesson read saved');
});
