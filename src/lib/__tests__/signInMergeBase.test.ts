// A sign-in merges the loaded account with the state on screen only when that state is not
// another account's: a tab still holding an earlier account must not carry its items into the
// account that just signed in (and so save them there).
import { DEFAULT_STATE, type AppState, type UserProfile } from '@/types';
import { mergeAppStateWithGuardResult, signInMergeBase } from '../stateMerger';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function user(id: string, isAnonymous = false): UserProfile {
  return { id, uid: '1', email: `${id}@x.test`, username: id, avatar: '🧑', createdAt: '2026-10-01T00:00:00.000Z', isAnonymous } as UserProfile;
}

function journal(id: string) {
  return { id, content: id, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' } as unknown as AppState['journalEntries'][number];
}

function state(overrides: Partial<AppState>): AppState {
  return { ...DEFAULT_STATE, ...overrides } as AppState;
}

function ids(items: { id?: string }[] | undefined): string[] {
  return (items || []).map((i) => i.id as string).sort();
}

function run() {
  console.log('Running signInMergeBase tests...\n');

  const loaded = state({ currentUser: user('new'), username: 'new', journalEntries: [journal('n1')] });

  // 1. A tab still holding another account: nothing of it reaches the new account.
  {
    const oldTab = state({ currentUser: user('old'), username: 'old', journalEntries: [journal('o1'), journal('o2')] });
    const base = signInMergeBase(oldTab, loaded, 'new');
    assert(base === loaded, 'another account on screen: the loaded state stands alone');
    const merged = mergeAppStateWithGuardResult(loaded, base, undefined).mergedState;
    assert(JSON.stringify(ids(merged.journalEntries)) === JSON.stringify(['n1']), 'no foreign items in the new account');
    assert(merged.currentUser?.id === 'new', 'the new account stays the signed-in one');
  }

  // 2. The same account (a guest upgrading keeps its id): unsaved items on screen are kept.
  {
    const guestTab = state({ currentUser: user('new', true), username: 'new', journalEntries: [journal('n1'), journal('g1')] });
    const base = signInMergeBase(guestTab, loaded, 'new');
    assert(base === guestTab, 'same id: the state on screen is merged');
    const merged = mergeAppStateWithGuardResult(loaded, base, undefined).mergedState;
    assert(JSON.stringify(ids(merged.journalEntries)) === JSON.stringify(['g1', 'n1']), 'same account keeps its unsaved items');
  }

  // 3. A signed-out state belongs to no account: merged as before.
  {
    const signedOut = state({ themePreference: 'light' });
    assert(signInMergeBase(signedOut, loaded, 'new') === signedOut, 'signed-out state is merged as before');
  }

  console.log('\nAll signInMergeBase assertions PASSED successfully!');
}

run();
