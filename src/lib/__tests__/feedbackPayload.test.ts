// Fixtures for what the feedback form and the /contact page send (lib/feedbackPayload.ts): only the
// chosen kind's fields go out, the rating is a whole 1–5 on "Something else" only, the reply flag
// never carries an email, and the contact body carries the sender's email and Turnstile token.
import {
  FEEDBACK_KINDS,
  buildContactPayload,
  buildFeedbackPayload,
  isFeedbackKind,
  looksLikeEmail,
  newFeedbackRefAt,
  validRating,
  type FeedbackPayloadInput,
} from '../feedbackPayload';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// Rating rule.
for (const ok of [1, 2, 3, 4, 5, '3', ' 5 ']) assert(validRating(ok) === Number(String(ok).trim()), `rating ${JSON.stringify(ok)} kept`);
for (const bad of [0, 6, -1, 2.5, '2.5', '', 'five', null, undefined, NaN, Infinity, true, [3], {}]) {
  assert(validRating(bad) === null, `rating ${JSON.stringify(bad)} dropped`);
}

assert(FEEDBACK_KINDS.map((k) => k.value).join() === 'bug,idea,other', 'three choices, in order');
assert(FEEDBACK_KINDS.map((k) => k.label).join() === 'Report a bug,Suggest an idea,Something else', 'choice labels');
assert(isFeedbackKind('other') && !isFeedbackKind('review') && !isFeedbackKind(undefined), 'kind guard');

const allFields = {
  whatHappened: 'Streak reset',
  steps: '1. Open Habits',
  expected: 'Kept',
  severity: 'blocking',
  problem: 'Hard to plan',
  idea: 'Weekly email',
  impact: 'weekly',
  message: '  Loving it so far  ',
  area: 'Habits',
};
const base: FeedbackPayloadInput = {
  kind: 'bug',
  ref: 'ASC-TEST01',
  title: '  Streak bug  ',
  fields: allFields,
  rating: 4,
  replyOk: false,
  context: { Browser: 'Chrome' },
  images: [{ name: 'a.jpg', data: '/9j/abc' }],
  startedAt: 1000,
  website: '',
};

const bug = buildFeedbackPayload(base);
const bugFields = bug.fields as Record<string, unknown>;
assert(bug.kind === 'bug' && bug.title === 'Streak bug', 'bug: kind and trimmed title');
assert(Object.keys(bugFields).sort().join() === 'area,expected,severity,steps,whatHappened', 'bug: only bug fields');
assert(!('rating' in bugFields), 'bug: no rating even when one is set');
assert((bug.images as unknown[]).length === 1, 'bug: screenshots kept');
assert(bug.replyOk === false && !JSON.stringify(bug).includes('@'), 'bug: no reply, no email anywhere');

const idea = buildFeedbackPayload({ ...base, kind: 'idea', replyOk: true });
assert(Object.keys(idea.fields as object).sort().join() === 'area,idea,impact,problem', 'idea: only idea fields');
assert(idea.replyOk === true && !JSON.stringify(idea).includes('@'), 'idea: reply flag only, the email is never in the body');

const other = buildFeedbackPayload({ ...base, kind: 'other' });
const otherFields = other.fields as Record<string, unknown>;
assert(other.title === '' && otherFields.message === 'Loving it so far', 'other: no title, trimmed message');
assert(otherFields.rating === 4 && Object.keys(otherFields).sort().join() === 'area,message,rating', 'other: message, area, rating');
assert((other.images as unknown[]).length === 0, 'other: no screenshots');
assert(!('rating' in (buildFeedbackPayload({ ...base, kind: 'other', rating: 7 }).fields as object)), 'other: an out-of-range rating is dropped');
assert(!('rating' in (buildFeedbackPayload({ ...base, kind: 'other', rating: null }).fields as object)), 'other: no rating when none chosen');
assert(!('area' in (buildFeedbackPayload({ ...base, kind: 'other', fields: { ...allFields, area: '' } }).fields as object)), 'empty fields are left out');

// The signed-out contact body.
const contact = buildContactPayload({
  kind: 'idea',
  ref: 'ASC-TEST02',
  name: '  Ali  ',
  email: ' ali@example.com ',
  message: '  Dark mode on the site  ',
  captchaToken: 'tok',
  context: { Device: 'Touch' },
  fillMs: 4200.6,
  website: '',
});
assert(contact.name === 'Ali' && contact.email === 'ali@example.com', 'contact: trimmed name and email');
assert(JSON.stringify(contact.fields) === '{"message":"Dark mode on the site"}', 'contact: one message field');
assert(contact.captchaToken === 'tok' && contact.fillMs === 4201 && !('startedAt' in contact), 'contact: token and fill time, no device clock');
assert(!('images' in contact) && !('rating' in (contact.fields as object)) && contact.title === '', 'contact: no screenshots, rating or title');

for (const ok of ['a@b.co', 'zakria.khan+x@mail.example.pk']) assert(looksLikeEmail(ok), `email ${ok} ok`);
for (const bad of ['', 'a@b', 'a b@c.com', '@b.com', 'a@.com', 'a@b.com>', `${'x'.repeat(250)}@b.com`]) assert(!looksLikeEmail(bad), `email ${bad} refused`);

assert(/^ASC-[A-Z0-9]{6}$/.test(newFeedbackRefAt(1_794_000_000_000)), 'ref shape');

console.log('feedbackPayload fixtures: all passed');
