// partnerLimitText (lib/partnerRules.ts): the server's partner-limit errors (send/accept invite
// RPCs, exact strings as of 2026-11-10) read as plain words; other messages are left alone.
const { partnerLimitText } = await import('../partnerRules');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (got: unknown, want: unknown, msg: string) =>
  assert(got === want, `${msg}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

const TARGET = 'Target user has reached the maximum limit of 5 accountability partners.';
const SELF = 'You have reached the maximum limit of 5 accountability partners.';

eq(partnerLimitText(TARGET, 'Sher_Ali'), 'Sher_Ali already has 5 partners.', 'other side, name known');
eq(partnerLimitText(TARGET), 'They already have 5 partners.', 'other side, name unknown');
eq(partnerLimitText(SELF, 'Sher_Ali'), 'You already have 5 partners. Remove one first.', 'own limit');
eq(partnerLimitText('This invite is no longer available'), null, 'other errors untouched');
eq(partnerLimitText(''), null, 'empty');

console.log('partnerLimitText: all passed');
