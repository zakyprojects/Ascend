import { DELETE_REAUTH_MS, googleDeleteReauthResult, parseGoogleDeleteMark, type GoogleDeleteMark } from '../googleDeleteReauth';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const start = Date.parse('2026-11-10T10:00:00.000Z');
const mark: GoogleDeleteMark = { userId: 'u1', at: start, signedInAt: '2026-11-09T08:00:00.000Z' };
const back = (over: Partial<Parameters<typeof googleDeleteReauthResult>[1]> = {}) =>
  googleDeleteReauthResult(mark, {
    userId: 'u1',
    lastSignInAt: '2026-11-10T10:00:40.000Z',
    redirectError: false,
    nowMs: start + 60_000,
    ...over,
  });

// A new Google sign-in of the same account within the window: confirmed.
assert(back() === 'confirmed', 'fresh sign-in of the same account is confirmed');

// Google cancelled / refused: the page returns with an error and the old session.
assert(back({ redirectError: true }) === 'not-finished', 'a redirect error is never confirmed');

// Back from Google, or Settings reopened later: last_sign_in_at did not move.
assert(back({ lastSignInAt: mark.signedInAt }) === 'not-finished', 'an unchanged sign-in time is not confirmed');
assert(back({ lastSignInAt: null }) === 'not-finished', 'no sign-in time is not confirmed');
assert(back({ lastSignInAt: 'garbage' }) === 'not-finished', 'an unreadable sign-in time is not confirmed');

// A device clock far ahead does not matter: the comparison is server time against server time.
assert(back({ nowMs: start + 1000 }) === 'confirmed', 'device time plays no part in the sign-in check');

// Another Google account was picked: never confirmed for it.
assert(back({ userId: 'u2' }) === 'other-account', 'a different account is reported, not confirmed');

// Past the server's 5 minutes, or a mark from the future: nothing.
assert(back({ nowMs: start + DELETE_REAUTH_MS }) === null, 'an expired mark is ignored');
assert(back({ nowMs: start - 1 }) === null, 'a mark from the future is ignored');
assert(googleDeleteReauthResult(null, { userId: 'u1', lastSignInAt: null, redirectError: false, nowMs: start }) === null, 'no mark, nothing');

// A mark without the earlier sign-in time: the sign-in must come after the check started.
const bare: GoogleDeleteMark = { userId: 'u1', at: start, signedInAt: null };
assert(
  googleDeleteReauthResult(bare, { userId: 'u1', lastSignInAt: '2026-11-10T09:59:00.000Z', redirectError: false, nowMs: start + 1000 }) === 'not-finished',
  'without the earlier time, a sign-in before the check is not confirmed'
);
assert(
  googleDeleteReauthResult(bare, { userId: 'u1', lastSignInAt: '2026-11-10T10:00:05.000Z', redirectError: false, nowMs: start + 10_000 }) === 'confirmed',
  'without the earlier time, a sign-in after the check is confirmed'
);

// Parsing the stored mark.
assert(parseGoogleDeleteMark(null) === null, 'no stored mark');
assert(parseGoogleDeleteMark('not json') === null, 'broken json');
assert(parseGoogleDeleteMark('{"userId":"u1"}') === null, 'missing time');
const parsed = parseGoogleDeleteMark(JSON.stringify({ userId: 'u1', at: start }));
assert(parsed?.userId === 'u1' && parsed.at === start && parsed.signedInAt === null, 'old mark without signedInAt parses');

console.log('googleDeleteReauth: all assertions passed');
