import { ARM, poseFor, type EmberProps } from '../Ember';

function assert(condition: unknown, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

type Input = Parameters<typeof poseFor>[0];
const IDLE: Input = { phase: 'idle', focus: null, caret: 0, passwordVisible: false, hoverTrail: null, google: null };
const at = (over: Partial<EmberProps>, split = true, formSide: 'left' | 'right' = 'right') =>
  poseFor({ ...IDLE, ...over }, false, split, true, formSide);

const covered = (pose: ReturnType<typeof poseFor>) => pose.left === ARM.cover && pose.right === ARM.cover;
const isIntent = (pose: ReturnType<typeof poseFor>) => pose.gaze === 'google' && pose.wink && !pose.wave;
const isLeaving = (pose: ReturnType<typeof poseFor>) => pose.wave && pose.eyes === 'happy' && !pose.wink;

// Success and submitting beat everything Google.
assert(at({ phase: 'success', google: 'leaving' }).eyes === 'happy' && !at({ phase: 'success', google: 'leaving' }).wave, 'success > leaving');
assert(at({ phase: 'success', google: 'intent' }).left === ARM.cheer, 'success > intent');
const submitting = at({ phase: 'submitting', google: 'leaving' });
assert(submitting.mouth === 'o' && !submitting.wave, 'submitting > leaving');
assert(!at({ phase: 'submitting', google: 'intent' }).wink, 'submitting > intent');

// Leaving beats the password cover and peek (a click on Google may not blur the field).
assert(isLeaving(at({ focus: 'password', google: 'leaving' })), 'leaving > password cover');
assert(isLeaving(at({ focus: 'password', passwordVisible: true, google: 'leaving' })), 'leaving > password peek');

// Intent never uncovers the eyes while a hidden password has focus, and never beats the peek.
for (const focus of ['password', 'confirm'] as const) {
  const pose = at({ focus, google: 'intent' });
  assert(covered(pose) && !pose.wink && pose.gaze !== 'google', `${focus} cover > intent`);
  assert(!at({ focus, passwordVisible: true, google: 'intent' }).wink, `${focus} peek > intent`);
}

// Intent beats text focus (desktop autofocus on the email field) and both choice hovers.
assert(isIntent(at({ focus: 'email', caret: 0.5, google: 'intent' })), 'intent > email focus');
assert(isIntent(at({ focus: 'username', google: 'intent' })), 'intent > username focus');
assert(isIntent(at({ hoverTrail: 'account', google: 'intent' })), 'intent > account hover');
assert(isIntent(at({ hoverTrail: 'guest', google: 'intent' })), 'intent > guest hover');

// Without Google the old poses are unchanged.
assert(at({ focus: 'email' }).gaze === 'field' && !at({ focus: 'email' }).wink, 'email focus without Google');
assert(at({ hoverTrail: 'account' }).left === ARM.eager, 'account hover without Google');
assert(at({}).gaze === 'pointer' && !at({}).wink && !at({}).wave, 'idle');

// One hand only, on the form side (desktop split by side; phones use the right hand).
const right = at({ google: 'intent' }, true, 'right');
assert(right.right === ARM.point && right.left === ARM.rest, 'intent: right hand when the form is right');
const left = at({ google: 'intent' }, true, 'left');
assert(left.left === ARM.point && left.right === ARM.rest, 'intent: left hand when the form is left');
const phone = at({ google: 'leaving' }, false, 'left');
assert(phone.right === ARM.wave && phone.left === ARM.rest, 'leaving on phones: right hand');

// Intent is distinct from the Create account (both arms) and Guest (soft eyes) poses.
const intent = at({ google: 'intent' });
assert(intent.left !== intent.right && intent.eyes === 'open', 'intent is one-handed with open eyes');

// The worried overlay still applies over Google intent.
const worried = poseFor({ ...IDLE, google: 'intent' }, true, true, true, 'right');
assert(worried.brows === 'worried' && worried.wink, 'worried over intent');

// Leaving keeps the badge out of the waving hand.
assert(!at({ google: 'leaving', badge: 'A' }).badge, 'no badge while waving');

console.log('emberPose: all assertions passed');
