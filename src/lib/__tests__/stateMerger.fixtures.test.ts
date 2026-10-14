// Characterization fixtures for the state merger: they pin down the merge
// contracts hydration, writeSync and reconnect rely on today, so a later
// change to stateMerger.ts that alters behaviour fails here first.
import { DEFAULT_STATE, type AppState } from '@/types';
import { isLegitimateTombstoneId, mergeAppState, mergeAppStateWithGuardResult } from '../stateMerger';
import { computeStateDataWeight } from '../dataWeight';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function state(overrides: Partial<AppState>): AppState {
  return { ...DEFAULT_STATE, ...overrides } as AppState;
}

function journal(id: string, content: string, updatedAt: string) {
  return { id, content, createdAt: '2026-10-01T10:00:00.000Z', updatedAt } as unknown as AppState['journalEntries'][number];
}

function ids(items: { id?: string }[] | undefined): string[] {
  return (items || []).map((i) => i.id as string).sort();
}

function runFixtures() {
  console.log('Running stateMerger fixtures tests...\n');

  // 1. Union by id: neither side's items are dropped for being missing on the other side.
  {
    const base = state({ journalEntries: [journal('j1', 'a', '2026-10-01T10:00:00.000Z')] });
    const inc = state({ journalEntries: [journal('j2', 'b', '2026-10-01T10:00:00.000Z')] });
    const merged = mergeAppState(base, inc);
    assert(ids(merged.journalEntries).join() === 'j1,j2', 'union keeps base-only and incoming-only entries');
  }

  // 2. Blob without collections vs full local state (writeSync / reconnect shape), both directions.
  {
    const blob = state({ journalEntries: [] });
    const full = state({ journalEntries: [journal('j1', 'a', '2026-10-01T10:00:00.000Z')] });
    assert(ids(mergeAppState(blob, full, 'writeSync').journalEntries).join() === 'j1', 'empty base keeps incoming items');
    assert(ids(mergeAppState(full, blob, 'hydration').journalEntries).join() === 'j1', 'empty incoming never deletes base items');
  }

  // 3. Last-write-wins by updatedAt, whichever side is newer.
  {
    const older = state({ journalEntries: [journal('j1', 'old', '2026-10-01T10:00:00.000Z')] });
    const newer = state({ journalEntries: [journal('j1', 'new', '2026-10-02T10:00:00.000Z')] });
    const a = mergeAppState(older, newer).journalEntries[0] as unknown as { content: string };
    const b = mergeAppState(newer, older).journalEntries[0] as unknown as { content: string };
    assert(a.content === 'new', 'newer incoming wins');
    assert(b.content === 'new', 'newer base wins over older incoming');
  }

  // 4. Tombstones remove items from either side; an explicit restore lifts the tombstone.
  {
    const base = state({ journalEntries: [journal('j1', 'a', '2026-10-01T10:00:00.000Z')] });
    const tomb = state({ journalEntries: [], deletedEntityIds: ['j1'] });
    assert(mergeAppState(base, tomb).journalEntries.length === 0, 'incoming tombstone removes base item');
    assert(mergeAppState(tomb, base).journalEntries.length === 0, 'base tombstone removes incoming item');
    const restored = state({
      journalEntries: [journal('j1', 'a', '2026-10-03T10:00:00.000Z')],
      restoredEntityIds: ['j1'],
    });
    assert(ids(mergeAppState(tomb, restored).journalEntries).join() === 'j1', 'restoredEntityIds lifts the tombstone');
  }

  // 5. Tombstone sanitizer rejects poisoned composite and weekly-award ids, keeps clean ids.
  {
    assert(!isLegitimateTombstoneId('habit123_2026-09-01'), 'date-slot composite rejected');
    assert(!isLegitimateTombstoneId('weekly_review_2026-W40'), 'weekly reflection award id rejected');
    assert(!isLegitimateTombstoneId(''), 'empty id rejected');
    assert(isLegitimateTombstoneId('p_abc123'), 'points entry id kept');
    assert(isLegitimateTombstoneId('3f2b6a0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'), 'uuid kept');
  }

  // 6. Habit completions from both devices are merged, not replaced by the LWW winner.
  {
    const habit = (updatedAt: string, completions: string[]) =>
      ({
        id: 'h1',
        name: 'Read',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt,
        completions,
      }) as unknown as AppState['habits'][number];
    const base = state({ habits: [habit('2026-10-01T10:00:00.000Z', ['2026-10-01'])] });
    const inc = state({ habits: [habit('2026-10-02T10:00:00.000Z', ['2026-10-02'])] });
    const merged = mergeAppState(base, inc).habits.find((h) => h.id === 'h1');
    const dates = JSON.stringify(merged?.completions);
    assert(Boolean(merged), 'habit survives merge');
    assert(dates.includes('2026-10-01') && dates.includes('2026-10-02'), 'completions from both sides kept');
  }

  // 7. Legacy blob `books` are absorbed into libraryBooks once (by id or title).
  {
    const legacy = state({
      books: [{ id: 'b1', title: 'Atomic Habits', author: 'James Clear', totalPages: 300, currentPage: 40 }] as unknown as AppState['books'],
    });
    const merged = mergeAppState(legacy, state({}));
    const lib = merged.libraryBooks.filter((b) => b.id === 'b1');
    assert(lib.length === 1, 'legacy book absorbed into libraryBooks');
    assert(lib[0].currentPage === 40 && lib[0].status === 'reading', 'legacy progress and status carried over');
    const again = mergeAppState(merged, legacy);
    assert(again.libraryBooks.filter((b) => b.title === 'Atomic Habits').length === 1, 'absorption is not repeated');
  }

  // 8. Duplicate habit_completed awards for the same habit+period collapse to the earliest one.
  {
    const award = (id: string, timestamp: string) =>
      ({
        id,
        amount: 10,
        source: 'habit_completed',
        reason: 'Habit completed',
        timestamp,
        metadata: { habitId: 'h1', periodKey: '2026-10-01' },
      }) as unknown as AppState['pointsHistory'][number];
    const base = state({ pointsHistory: [award('p_late', '2026-10-01T12:00:00.000Z')] });
    const inc = state({ pointsHistory: [award('p_early', '2026-10-01T09:00:00.000Z')] });
    const merged = mergeAppState(base, inc);
    const awards = merged.pointsHistory.filter((p) => p.source === 'habit_completed');
    assert(awards.length === 1 && awards[0].id === 'p_early', 'earliest duplicate award kept');
  }

  // 9. Merge is idempotent for collections.
  {
    const s = state({
      journalEntries: [journal('j1', 'a', '2026-10-01T10:00:00.000Z'), journal('j2', 'b', '2026-10-01T11:00:00.000Z')],
    });
    const once = mergeAppState(s, s);
    const twice = mergeAppState(once, once);
    assert(ids(twice.journalEntries).join() === 'j1,j2', 'merging a state with itself changes nothing');
  }

  // 10. Guard flags a wipe against a watermark, and retainedState ignores tombstones.
  {
    const entries = Array.from({ length: 10 }, (_, i) => journal(`j${i}`, 'x', '2026-10-01T10:00:00.000Z'));
    const full = state({ journalEntries: entries });
    const watermark = computeStateDataWeight(full);
    const wipe = state({ journalEntries: [], deletedEntityIds: entries.map((e) => e.id as string) });
    const result = mergeAppStateWithGuardResult(full, wipe, watermark);
    assert(result.hasSuspiciousDrop, 'mass tombstone wipe is flagged');
    assert(result.retainedState.journalEntries.length === 10, 'retainedState keeps the items');
    const calm = mergeAppStateWithGuardResult(full, full, watermark);
    assert(!calm.hasSuspiciousDrop, 'no false positive on an unchanged state');
  }

  console.log('\nAll stateMerger fixture assertions PASSED successfully!');
}

runFixtures();
