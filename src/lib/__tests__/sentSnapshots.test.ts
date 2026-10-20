// Skip-unchanged bookkeeping used by writeOwnProfile and saveUserDataToSupabase (supabase.ts).
import { SentSnapshots, snapshotOf } from '../sentSnapshots';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const A = 'user-a';
const B = 'user-b';

// Empty: nothing matches, so the first save of a session always writes.
{
  const s = new SentSnapshots();
  assert(!s.matches(A, 'profile-private', snapshotOf({ stats: { x: 1 } })), 'empty store never matches');
}

// Remembered value matches only the same content, account and target.
{
  const s = new SentSnapshots();
  const snap = snapshotOf({ stats: { habitsCompletedTodayCount: 2 }, device_timezone: 'Asia/Karachi' });
  s.remember(A, 'profile-private', snap);
  assert(s.matches(A, 'profile-private', snapshotOf({ stats: { habitsCompletedTodayCount: 2 }, device_timezone: 'Asia/Karachi' })), 'same content matches');
  assert(!s.matches(A, 'profile-private', snapshotOf({ stats: { habitsCompletedTodayCount: 3 }, device_timezone: 'Asia/Karachi' })), 'changed stat does not match');
  assert(!s.matches(A, 'profile-private', snapshotOf({ stats: { habitsCompletedTodayCount: 2 }, device_timezone: 'Europe/Paris' })), 'changed timezone does not match');
  assert(!s.matches(A, 'profile-public', snap), 'other target does not match');
  assert(!s.matches(B, 'profile-private', snap), 'other account does not match');
}

// forget(userId) clears one account only; forget() clears all (sign-in / sign-out).
{
  const s = new SentSnapshots();
  s.remember(A, 'profile-public', '1');
  s.remember(A, 'blob', '2');
  s.remember(B, 'profile-public', '3');
  s.forget(A);
  assert(!s.matches(A, 'profile-public', '1') && !s.matches(A, 'blob', '2'), 'forget(A) clears A');
  assert(s.matches(B, 'profile-public', '3'), 'forget(A) keeps B');
  s.forget();
  assert(!s.matches(B, 'profile-public', '3'), 'forget() clears everyone');
}

// An account id that is a prefix of another is not cleared with it.
{
  const s = new SentSnapshots();
  s.remember('ab', 'blob', 'x');
  s.forget('a');
  assert(s.matches('ab', 'blob', 'x'), 'prefix id kept');
}

// snapshotOf: undefined and null are the same; key order is part of the snapshot (a false
// "changed" costs one write, never a skipped one).
{
  assert(snapshotOf(undefined) === snapshotOf(null), 'undefined == null');
  assert(snapshotOf({ a: 1, b: 2 }) !== snapshotOf({ b: 2, a: 1 }), 'key order is significant');
}

console.log('sentSnapshots fixtures passed');
