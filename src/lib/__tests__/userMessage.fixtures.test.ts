import { NETWORK_MESSAGE, toUserMessage } from '../userMessage';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const FALLBACK = "Couldn't save. Try again.";
const raised = (message: string) => ({ message, code: 'P0001' });

function runFixtures() {
  // Our own friendly texts pass through.
  for (const text of [
    'Username is already taken',
    'Username can only be changed once per 24 hours. Next change in 3 hours.',
    'Your profile is not ready yet. Try again in a moment.',
    "You're not signed in. Sign in and try again.",
    'This overlaps another block.',
  ]) {
    assert(toUserMessage(raised(text), FALLBACK) === text, `passes through: ${text}`);
  }

  // SQL guard texts get the fallback.
  for (const text of [
    'Unauthorized: You are not a member of this partnership.',
    'Not authenticated',
    'not signed in',
    'journal_entries row abc is dated in the future (2026-10-21)',
    'habit h1 completion 2026-10-21 is in the future',
    'Notification payload too large',
    'p_days must be >= 0',
    'ascend_league_points: give up to 26 matching start/end pairs',
  ]) {
    assert(toUserMessage(raised(text), FALLBACK) === FALLBACK, `hidden: ${text}`);
  }

  // Database codes, technical text, network failures, empty errors.
  assert(toUserMessage({ message: 'anything', code: '23505' }, FALLBACK) === FALLBACK, 'SQLSTATE code');
  assert(toUserMessage({ message: 'x', code: 'PGRST204' }, FALLBACK) === FALLBACK, 'PostgREST code');
  assert(toUserMessage(new Error('new row violates row-level security policy'), FALLBACK) === FALLBACK, 'RLS text');
  assert(toUserMessage(new TypeError('Failed to fetch'), FALLBACK) === NETWORK_MESSAGE, 'network');
  assert(toUserMessage(null, FALLBACK) === FALLBACK, 'null error');
  assert(toUserMessage(new Error('   '), FALLBACK) === FALLBACK, 'blank message');

  console.log('\nAll userMessage fixture assertions PASSED successfully!');
}

runFixtures();
