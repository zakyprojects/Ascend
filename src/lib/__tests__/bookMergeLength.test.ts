// A book's length must come from the same (newer) copy as its unit and
// progress. Before the fix the merger always took the INCOMING totalAmount,
// so an older incoming copy could pair the newer unit with the old length.
import { DEFAULT_STATE, type AppState, type UserBook } from '@/types';
import { mergeAppState } from '../store/stateMerger';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function state(libraryBooks: UserBook[]): AppState {
  return { ...DEFAULT_STATE, libraryBooks } as AppState;
}

function book(overrides: Partial<UserBook>): UserBook {
  return {
    id: 'b1',
    title: 'The Power of Now',
    author: 'Eckhart Tolle',
    status: 'reading',
    pointsReward: 0,
    pointsAwarded: 0,
    addedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  } as UserBook;
}

function run() {
  console.log('Running book merge length tests...\n');
  // Older copy: 5 of 10 chapters. Newer copy: switched to 100 of 236 pages.
  const older = book({ unit: 'chapters', currentAmount: 5, currentPage: 5, totalAmount: 10, totalPages: 10, updatedAt: '2026-11-09T10:00:00.000Z' });
  const newer = book({ unit: 'pages', currentAmount: 100, currentPage: 100, totalAmount: 236, totalPages: 236, updatedAt: '2026-11-09T11:00:00.000Z' });

  for (const [label, base, inc] of [['newer base, older incoming', newer, older], ['older base, newer incoming', older, newer]] as const) {
    const merged = mergeAppState(state([base]), state([inc])).libraryBooks[0];
    assert(merged.unit === 'pages', `${label}: unit from the newer copy`);
    assert(merged.currentAmount === 100, `${label}: progress from the newer copy`);
    assert(merged.totalAmount === 236 && merged.totalPages === 236, `${label}: length from the newer copy`);
  }

  // A newer copy without a length (legacy shape) still falls back to the other copy.
  {
    const noLength = book({ unit: 'pages', currentAmount: 20, updatedAt: '2026-11-09T12:00:00.000Z' });
    const merged = mergeAppState(state([older]), state([noLength])).libraryBooks[0];
    assert(merged.totalAmount === 10, 'missing length falls back to the other copy');
  }

  console.log('All book merge length tests passed.');
}

run();
