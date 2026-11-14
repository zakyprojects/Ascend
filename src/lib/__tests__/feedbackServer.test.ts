// Fixtures for POST /api/feedback (api/feedback.ts) with a fake fetch: the issue body (rating only
// for "Something else", the account email only when the sender asked for a reply, @mentions
// defused), and the signed-out gate (no Turnstile secret = refused, bad or missing token = refused
// before anything reaches GitHub, a good token files an issue labelled "contact"). The signed-in
// path never needs the Turnstile secret.
import { POST, PUBLIC_SENDER_NOTE, buildIssue, defuseMentions, issueTitle, parseKind, parseRating } from '../../../api/feedback';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ---- Pure parts --------------------------------------------------------------------------------
assert(parseKind('other') === 'other' && parseKind('bug') === 'bug' && parseKind('review') === null, 'kinds');
assert(parseRating(5) === 5 && parseRating('1') === 1 && parseRating(0) === null && parseRating(3.5) === null && parseRating('x') === null, 'rating rule');
assert(defuseMentions('hi @zakria and @team-x') === 'hi @\u200bzakria and @\u200bteam-x', '@mentions defused');
assert(defuseMentions('mail me at ali@example.com') === 'mail me at ali@example.com', 'an email address is left alone');
assert(issueTitle('', '\n  First line here\nsecond') === 'First line here', 'title from the first line');
assert(issueTitle('', 'x'.repeat(100)).length === 80 && issueTitle('', 'x'.repeat(100)).endsWith('…'), 'long first line cut to 80');
assert(issueTitle('Own title', 'msg') === 'Own title', 'own title kept');

const account = { type: 'account' as const, id: 'uid-1', email: 'zak@example.com' };
const other = buildIssue({
  kind: 'other', ref: 'ASC-1', title: '', fields: { message: 'Going well @someone', rating: 4, area: 'Habits' },
  context: { Browser: 'Chrome' }, imageLines: [], sender: account, replyOk: false,
});
assert(other.title === '[ASC-1] Going well @\u200bsomeone', 'other: title from the message, defused');
assert(other.body.includes('### Message\nGoing well @\u200bsomeone') && other.body.includes('4 / 5'), 'other: message and rating');
assert(!other.body.includes('zak@example.com') && !other.body.includes('Reply to'), 'other: no email without the tick');
assert(other.labels.join() === 'feedback,area: Habits', 'other: labels');

const replied = buildIssue({
  kind: 'other', ref: 'ASC-2', title: '', fields: { message: 'Hi', rating: 9 },
  context: {}, imageLines: [], sender: account, replyOk: true,
});
assert(replied.body.includes('### Reply to\nzak@example.com'), 'reply ticked: account email in the issue');
assert(!replied.body.includes('/ 5'), 'out-of-range rating dropped');
const guestReply = buildIssue({
  kind: 'other', ref: 'ASC-3', title: '', fields: { message: 'Hi' }, context: {}, imageLines: [],
  sender: { type: 'account', id: 'guest', email: '' }, replyOk: true,
});
assert(!guestReply.body.includes('Reply to'), 'a guest (no email) gets no reply line');
const bugWithRating = buildIssue({
  kind: 'bug', ref: 'ASC-4', title: 'Broke', fields: { whatHappened: 'It broke', severity: 'blocking', rating: 2 },
  context: {}, imageLines: [], sender: account, replyOk: false,
});
assert(!bugWithRating.body.includes('/ 5') && bugWithRating.labels.includes('severity: blocking'), 'bug: no rating, severity label');

// ---- The handler, with a fake fetch ------------------------------------------------------------
type Call = { url: string; init?: RequestInit };
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
env.GITHUB_FEEDBACK_TOKEN = 'gh-test';
env.GITHUB_FEEDBACK_REPO = 'owner/feedback';
env.SUPABASE_URL = 'https://db.example';
env.SUPABASE_PUBLISHABLE_KEY = 'pk';

let calls: Call[] = [];
let issueList: Array<{ title: string; body: string; created_at: string; labels: string[] }> = [];
let siteverify: { success: boolean; action?: string } = { success: true, action: 'contact' };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.endsWith('/auth/v1/user')) {
    const auth = new Headers(init?.headers).get('authorization');
    if (auth === 'Bearer good') return Response.json({ id: 'uid-1', email: 'zak@example.com', is_anonymous: false });
    return new Response('{}', { status: 401 });
  }
  if (url.includes('turnstile/v0/siteverify')) return Response.json(siteverify);
  if (url.includes('/issues?')) return Response.json(issueList);
  if (url.endsWith('/issues')) return Response.json({ number: 1 }, { status: 201 });
  return new Response('not found', { status: 404 });
}) as typeof fetch;

let n = 0;
function request(body: Record<string, unknown>, bearer?: string) {
  n += 1;
  return new Request('https://ascendday.com/api/feedback', {
    method: 'POST',
    headers: {
      origin: 'https://ascendday.com',
      host: 'ascendday.com',
      'content-type': 'application/json',
      'x-forwarded-for': `203.0.113.${n}, 10.0.0.1`,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    // eslint-disable-next-line no-restricted-syntax -- the server compares with its own clock
    body: JSON.stringify({ ref: `ASC-T${n}`, startedAt: Date.now() - 10_000, website: '', ...body }),
  });
}
const contactBody = (extra: Record<string, unknown> = {}) => ({
  kind: 'other', email: 'visitor@example.com', name: 'Ali', fields: { message: 'Hello from the site' }, fillMs: 8000,
  captchaToken: 'tok', ...extra,
});
const githubPosts = () => calls.filter((c) => c.url.endsWith('/issues') && c.init?.method === 'POST');
const status = async (res: Response) => [res.status, ((await res.json()) as { error?: string }).error ?? 'ok'].join(' ');

// Signed out, no Turnstile secret: refused, nothing filed.
delete env.TURNSTILE_SECRET_KEY;
calls = [];
assert((await status(await POST(request(contactBody())))) === '503 not_configured', 'signed out without the secret: 503');
assert(calls.length === 0, 'signed out without the secret: no outside call');

// The signed-in path works without the secret.
calls = [];
const signedIn = await POST(request({ kind: 'other', fields: { message: 'Fine', rating: 5 }, replyOk: true }, 'good'));
assert((await status(signedIn)) === '200 ok', 'signed in without the Turnstile secret: sent');
assert(!calls.some((c) => c.url.includes('siteverify')), 'signed in: no Turnstile check');
const signedInIssue = JSON.parse(String(githubPosts()[0]?.init?.body)) as { body: string; labels: string[] };
assert(signedInIssue.body.includes('zak@example.com') && signedInIssue.body.includes('5 / 5'), 'signed in: email (ticked, from the session) and rating');
assert(!signedInIssue.labels.includes('contact'), 'signed in: not labelled contact');

// A session that no longer works is told so, never treated as signed out.
env.TURNSTILE_SECRET_KEY = 'secret';
assert((await status(await POST(request(contactBody(), 'expired')))) === '401 unauthorized', 'bad session: 401');

// Signed out with the secret: a token is required and checked before GitHub.
calls = [];
assert((await status(await POST(request(contactBody({ captchaToken: '' }))))) === '403 captcha_failed', 'no token: 403');
siteverify = { success: false };
assert((await status(await POST(request(contactBody())))) === '403 captcha_failed', 'rejected token: 403');
siteverify = { success: true, action: 'sign_in' };
assert((await status(await POST(request(contactBody())))) === '403 captcha_failed', 'token for another action: 403');
assert(githubPosts().length === 0 && !calls.some((c) => c.url.includes('api.github.com')), 'refused tokens: GitHub never called');
assert((await status(await POST(request(contactBody({ email: 'not-an-email' }))))) === '400 bad_request', 'signed out: a real email is required');

siteverify = { success: true, action: 'contact' };
calls = [];
const sent = await POST(request(contactBody({ images: [{ name: 'x', data: '/9j/AAAA' }] })));
assert((await status(sent)) === '200 ok', 'good token: sent');
const verify = calls.find((c) => c.url.includes('siteverify'));
const verifyForm = new URLSearchParams(String(verify?.init?.body));
assert(verifyForm.get('secret') === 'secret' && verifyForm.get('response') === 'tok' && verifyForm.get('remoteip')?.startsWith('203.0.113.') === true, 'Siteverify gets secret, token and the first forwarded IP');
const publicIssue = JSON.parse(String(githubPosts()[0]?.init?.body)) as { body: string; labels: string[] };
assert(publicIssue.labels.includes('contact') && publicIssue.labels.includes('feedback'), 'signed out: labelled contact');
assert(publicIssue.body.includes('Ali · visitor@example.com') && publicIssue.body.includes('Hello from the site'), 'signed out: sender and message');
assert(!calls.some((c) => c.url.includes('/contents/')), 'signed out: screenshots are not uploaded');

// Signed-out daily cap: an issue re-filed without labels (422) still counts by its body note.
// eslint-disable-next-line no-restricted-syntax -- the server compares with its own clock
const createdNow = new Date(Date.now() - 60_000).toISOString();
const unlabelled = { title: '[ASC-OLD] x', body: `### Reply to\nvisitor@example.com ${PUBLIC_SENDER_NOTE}`, created_at: createdNow, labels: [] };
issueList = Array.from({ length: 20 }, () => unlabelled);
calls = [];
assert((await status(await POST(request(contactBody())))) === '429 daily_limit', 'signed out: 20 unlabelled contact issues today hit the cap');
assert(githubPosts().length === 0, 'signed out at the cap: nothing filed');
calls = [];
assert((await status(await POST(request(contactBody(), 'good')))) === '200 ok', 'signed in: the signed-out cap does not apply');
issueList = Array.from({ length: 20 }, () => ({ ...unlabelled, body: 'signed-in report' }));
calls = [];
assert((await status(await POST(request(contactBody())))) === '200 ok', 'signed out: signed-in issues do not count toward the cap');
issueList = [];

// Bots: the honeypot still answers a quiet ok and files nothing.
calls = [];
assert((await status(await POST(request(contactBody({ website: 'spam' }))))) === '200 ok' && calls.length === 0, 'honeypot: quiet ok, nothing sent');
calls = [];
assert((await status(await POST(request(contactBody({ fillMs: 500 }))))) === '200 ok' && calls.length === 0, 'too fast: quiet ok, nothing sent');

console.log('feedbackServer fixtures: all passed');
