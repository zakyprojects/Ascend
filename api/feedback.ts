/**
 * POST /api/feedback: turns a bug report, an idea or any other message into an issue in the
 * private feedback repo.
 *
 * Runs on the server (a Vercel Function; `npm run dev` serves it through vite.config.ts), so the
 * GitHub token never reaches the browser. Environment:
 * - GITHUB_FEEDBACK_TOKEN: fine-grained token for that one repo, Issues + Contents read/write.
 * - GITHUB_FEEDBACK_REPO: "owner/name", defaults to zakyprojects/Ascend-Feedback.
 * - SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (or the app's VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY):
 *   to check the sender's session.
 * - TURNSTILE_SECRET_KEY: Cloudflare Turnstile secret, only for signed-out senders (the public
 *   /contact page). Without it signed-out messages are refused (503); the app's path is unaffected.
 *
 * Same-origin JSON POSTs only. Two kinds of sender:
 * - In the app: carries the sender's Supabase session (guests have one too), checked with
 *   Supabase Auth. The reply email, when the sender ticks "Can I reply to you?", is read from that
 *   session, never from the request.
 * - Signed out (/contact): no session; a Turnstile token checked with Cloudflare's Siteverify
 *   instead, the sender's own email to reply to, no screenshots, and a lower daily cap.
 * Spam brakes on top: a honeypot field, a minimum fill time, size caps, JPEG-only screenshots, a
 * per-sender limit (best effort: each server instance counts on its own) and a cap on issues filed
 * per day across everyone. @mentions are defused so a message can't ping anyone on GitHub.
 *
 * Idempotent by ref: the form keeps one ref across retries, so a retry after a lost response finds
 * the issue the first send made (title "[ref] …" or body "_Ref ref_") and returns it instead of
 * filing it again. Screenshots already uploaded under that ref are reused.
 */

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_REPO = 'zakyprojects/Ascend-Feedback';
const MAX_BODY_BYTES = 4_000_000; // Vercel rejects request bodies over 4.5 MB
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1_500_000; // per image, after the browser has shrunk it
const MIN_FILL_MS = 3_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 5;
const DAILY_MAX = 50; // issues filed in the last 24 hours, by everyone
const PUBLIC_DAILY_MAX = 20; // of those, from signed-out senders (label "contact" or PUBLIC_SENDER_NOTE)
const DAY_MS = 24 * 60 * 60_000;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** The Turnstile action the /contact page solves (src/marketing/contactForm.ts). */
export const CONTACT_CAPTCHA_ACTION = 'contact';
/** Label on issues from signed-out senders (counted for PUBLIC_DAILY_MAX). */
export const CONTACT_LABEL = 'contact';
/**
 * Written after a signed-out sender's address in the issue body. Counted too, because an issue
 * re-filed without labels (GitHub refused them, 422) has no CONTACT_LABEL.
 */
export const PUBLIC_SENDER_NOTE = '(signed out, from the contact page)';

export type FeedbackKind = 'bug' | 'idea' | 'other';

const SEVERITY_LABELS: Record<string, string> = {
  cosmetic: 'Looks off',
  annoying: 'Gets in the way',
  blocking: 'Blocks me',
};
const IMPACT_LABELS: Record<string, string> = {
  nice: 'Nice to have',
  weekly: "I'd use it weekly",
  big: 'Changes how I use AscendDay',
};

const recentBySender = new Map<string, number[]>();

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parseKind(value: unknown): FeedbackKind | null {
  return value === 'bug' || value === 'idea' || value === 'other' ? value : null;
}

/** The optional private 1–5 rating: a whole number 1 to 5, anything else is no rating. */
export function parseRating(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** A plausible email address (the sender's own, to reply to). */
export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/.test(value);
}

/**
 * "@name" would notify that GitHub user: a zero-width space after the @ keeps the text but not the
 * ping. An @ inside a word (an email address) is not a mention and stays as it is.
 */
export function defuseMentions(value: string): string {
  return value.replace(/(^|[^A-Za-z0-9_.+-])@(?=[A-Za-z0-9_-])/g, '$1@\u200b');
}

/** The issue title: the sender's own, or (a message without one) the start of the message. */
export function issueTitle(title: string, message: string): string {
  if (title) return title;
  const firstLine = message.split('\n').find((line) => line.trim())?.trim() ?? '';
  return firstLine.length > 80 ? `${firstLine.slice(0, 79).trimEnd()}…` : firstLine;
}

function rateLimited(sender: string): boolean {
  const now = Date.now();
  if (recentBySender.size > 1000) {
    for (const [key, times] of recentBySender) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) recentBySender.delete(key);
    }
  }
  const recent = (recentBySender.get(sender) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    recentBySender.set(sender, recent);
    return true;
  }
  recent.push(now);
  recentBySender.set(sender, recent);
  return false;
}

/** The page that sent this is on this same site (a browser always sends Origin on a POST). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

interface SessionUser {
  id: string;
  /** The account's email; none for a guest. */
  email: string;
}

/** The signed-in (or guest) user for the request's bearer token, or null. */
async function sessionUser(request: Request, supabaseUrl: string, publishableKey: string): Promise<SessionUser | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${match[1]}` },
    });
    if (!res.ok) return null;
    const user = (await res.json().catch(() => null)) as { id?: unknown; email?: unknown; is_anonymous?: unknown } | null;
    if (typeof user?.id !== 'string') return null;
    const email = typeof user.email === 'string' && user.is_anonymous !== true ? user.email : '';
    return { id: user.id, email };
  } catch {
    return null;
  }
}

/** The caller's IP as Vercel forwards it (first hop), for the signed-out rate limit and Siteverify. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return (forwarded.split(',')[0] || request.headers.get('x-real-ip') || '').trim().slice(0, 64);
}

/**
 * Cloudflare Siteverify for a signed-out sender's Turnstile token. Fails closed: no token, a
 * network error or any answer but success with our action is a no.
 */
export async function verifyTurnstile(secret: string, token: string, remoteIp: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) return false;
    const result = (await res.json().catch(() => null)) as { success?: unknown; action?: unknown } | null;
    return result?.success === true && result.action === CONTACT_CAPTCHA_ACTION;
  } catch {
    return false;
  }
}

/** Base64 of a JPEG starts with "/9j/" (bytes FF D8 FF). */
function isJpegBase64(data: string): boolean {
  return data.startsWith('/9j/');
}

async function github(token: string, repo: string, path: string, method: string, body?: unknown) {
  return fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ascend-feedback',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Requests per ref still running on this instance: a retry that lands while the first send is
// still filing the issue waits for it instead of filing a second one.
const inFlightByRef = new Map<string, Promise<Response>>();

const LOOKUP_PAGES = 3; // newest 300 issues: a retry comes seconds or minutes after the first send

type Lookup = { found: true } | { found: false; filedToday?: number; publicToday?: number } | { error: Response };

/**
 * Is there already an issue for this ref? Uses the issues list (consistent right after a create),
 * not the Search API (its index lags, which is exactly when a retry comes). Also counts the issues
 * filed in the last 24 hours on the first page, all and from signed-out senders (the daily caps).
 */
async function findIssueByRef(token: string, repo: string, ref: string): Promise<Lookup> {
  const titlePrefix = `[${ref}]`;
  const bodyMarker = `_Ref ${ref}_`;
  let filedToday: number | undefined;
  let publicToday: number | undefined;
  for (let page = 1; page <= LOOKUP_PAGES; page += 1) {
    let res: Response;
    try {
      res = await github(token, repo, `/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`, 'GET');
    } catch {
      return { found: false }; // can't look: file it rather than lose it
    }
    if (res.status === 401) return { error: json(502, { error: 'token_invalid' }) };
    if (res.status === 403 || res.status === 404) return { error: json(502, { error: 'token_no_access' }) };
    if (!res.ok) return { found: false };
    const issues = (await res.json().catch(() => [])) as Array<{
      title?: string;
      body?: string | null;
      created_at?: string;
      labels?: Array<{ name?: string } | string>;
    }>;
    if (!Array.isArray(issues)) return { found: false };
    if (page === 1) {
      const since = Date.now() - DAY_MS;
      const today = issues.filter((i) => Date.parse(i.created_at ?? '') > since);
      filedToday = today.length;
      publicToday = today.filter(
        (i) =>
          (i.labels ?? []).some((label) => (typeof label === 'string' ? label : label?.name) === CONTACT_LABEL) ||
          (i.body ?? '').includes(PUBLIC_SENDER_NOTE)
      ).length;
    }
    if (issues.some((i) => (i.title ?? '').startsWith(titlePrefix) || (i.body ?? '').includes(bodyMarker))) {
      return { found: true };
    }
    if (issues.length < 100) return { found: false, filedToday, publicToday };
  }
  return { found: false, filedToday, publicToday };
}

/** Uploads one screenshot; a file already there under this ref (an earlier try) is reused. */
async function uploadScreenshot(token: string, repo: string, path: string, ref: string, data: string) {
  const res = await github(token, repo, `/contents/${path}`, 'PUT', { message: `Attachment for ${ref}`, content: data });
  if (res.status === 401) return { status: 401 as const };
  if (res.ok) {
    const saved = (await res.json().catch(() => null)) as { content?: { html_url?: string } } | null;
    return { url: saved?.content?.html_url };
  }
  // 422 = the path exists (created by a send whose issue never got made, or whose reply was lost).
  if (res.status === 422) {
    const existing = await github(token, repo, `/contents/${path}`, 'GET');
    if (existing.ok) {
      const file = (await existing.json().catch(() => null)) as { html_url?: string } | null;
      return { url: file?.html_url };
    }
  }
  return {};
}

function section(title: string, value: string): string {
  return value ? `### ${title}\n${value}\n` : '';
}

interface ImageIn {
  name?: unknown;
  data?: unknown;
}

/** Who sent it, as far as the issue is concerned. */
export type FeedbackSender =
  | { type: 'account'; id: string; email: string }
  | { type: 'public'; name: string; email: string };

export interface IssueInput {
  kind: FeedbackKind;
  ref: string;
  title: string;
  fields: Record<string, unknown>;
  context: Record<string, unknown>;
  /** Markdown image lines of the uploaded screenshots. */
  imageLines: string[];
  sender: FeedbackSender;
  /** The sender ticked "Can I reply to you?" (signed-out senders give their email to be replied to). */
  replyOk: boolean;
}

/**
 * The issue for one message: title, Markdown body and labels. Pure (tested in
 * src/lib/__tests__/feedbackServer.test.ts). The reply email is in the body only when the sender
 * asked for a reply; the rating only for "Something else", and only a whole 1–5.
 */
export function buildIssue(input: IssueInput): { title: string; body: string; labels: string[] } {
  const { kind, ref, fields, context, imageLines, sender } = input;
  const field = (name: string) => defuseMentions(text(fields[name], 4000));
  const message = field('message');
  const title = defuseMentions(issueTitle(text(input.title, 120), message)) || 'Feedback';

  const sections =
    sender.type === 'public'
      ? [section('Message', message)]
      : kind === 'bug'
        ? [
            section('What happened', field('whatHappened')),
            section('Steps', field('steps')),
            section('Expected', field('expected')),
            section('How bad', SEVERITY_LABELS[text(fields.severity, 20)] ?? ''),
          ]
        : kind === 'idea'
          ? [
              section('The problem', field('problem')),
              section('The idea', field('idea')),
              section('How useful', IMPACT_LABELS[text(fields.impact, 20)] ?? ''),
            ]
          : [section('Message', message)];
  const rating = kind === 'other' && sender.type === 'account' ? parseRating(fields.rating) : null;
  if (rating !== null) sections.push(section('How it’s working (private rating)', `${rating} / 5`));

  let replyTo = '';
  if (sender.type === 'public') {
    const name = defuseMentions(text(sender.name, 80)).replace(/[<>]/g, '');
    replyTo = `${name ? `${name} · ` : ''}${sender.email} ${PUBLIC_SENDER_NOTE}`;
  } else if (input.replyOk && sender.email) {
    replyTo = `${sender.email} (account email, the sender asked for a reply)`;
  }

  const contextRows = Object.entries(context)
    .map(([key, value]) => [text(key, 30), defuseMentions(text(value, 120))])
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `| ${key} | ${value.replace(/\|/g, '/')} |`);

  const body = [
    sections.filter(Boolean).join('\n'),
    replyTo ? section('Reply to', replyTo) : '',
    imageLines.length ? `### Screenshots\n${imageLines.join('\n')}\n` : '',
    contextRows.length ? `### Context\n| | |\n|---|---|\n${contextRows.join('\n')}\n` : '',
    `_Ref ${ref}_`,
  ]
    .filter(Boolean)
    .join('\n');

  const area = text(fields.area, 40);
  const labels = [
    kind === 'other' ? 'feedback' : kind,
    sender.type === 'public' ? CONTACT_LABEL : '',
    area && `area: ${area}`,
    kind === 'bug' && sender.type === 'account' && fields.severity ? `severity: ${text(fields.severity, 20)}` : '',
  ].filter(Boolean) as string[];

  return { title: `[${ref}] ${title}`, body, labels };
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !publishableKey) return json(503, { error: 'not_configured' });

  // A JSON body needs a CORS preflight, so another site's page can't post here unseen.
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'bad_request' });
  }

  // A request with a session must carry a valid one (an ended sign-in is told so, never treated as
  // signed out). Without one, the sender is signed out: only possible once Turnstile is set up.
  const signedIn = /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
  const account = signedIn ? await sessionUser(request, supabaseUrl, publishableKey) : null;
  if (signedIn && !account) return json(401, { error: 'unauthorized' });
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!signedIn && !turnstileSecret) return json(503, { error: 'not_configured' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: 'bad_request' });
  }

  // Honeypot and fill time: people never see the field and take longer than a few seconds.
  // Bots get a quiet "ok" so they don't learn what stopped them.
  // The public page sends how long the form was open (its own clock may be wrong); the app sends when
  // it opened, on the app's server-checked clock.
  const fillMs = Number(input.fillMs);
  const startedAt = input.fillMs !== undefined && Number.isFinite(fillMs) ? Date.now() - fillMs : Number(input.startedAt);
  if (text(input.website, 200) || !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return json(200, { ok: true, ref: text(input.ref, 20) });
  }

  const ip = clientIp(request);
  if (rateLimited(account ? account.id : `ip:${ip || 'unknown'}`)) return json(429, { error: 'rate_limited' });

  const kind = parseKind(input.kind);
  const ref = text(input.ref, 20).replace(/[^A-Z0-9-]/gi, '');
  const fields = (input.fields ?? {}) as Record<string, unknown>;
  const title = text(input.title, 120);
  if (!kind || !ref) return json(400, { error: 'bad_request' });

  let sender: FeedbackSender;
  if (account) {
    // Bug reports and ideas have a title; "Something else" is one message.
    if (kind === 'other' ? !text(fields.message, 4000) : !title) return json(400, { error: 'bad_request' });
    sender = { type: 'account', id: account.id, email: account.email };
  } else {
    const email = text(input.email, 254);
    if (!text(fields.message, 4000) || !isEmail(email)) return json(400, { error: 'bad_request' });
    if (!(await verifyTurnstile(turnstileSecret!, text(input.captchaToken, 2048), ip))) {
      return json(403, { error: 'captcha_failed' });
    }
    sender = { type: 'public', name: text(input.name, 80), email };
  }

  const running = inFlightByRef.get(ref);
  if (running) return (await running).clone();
  const work = fileReport(token, repo, { kind, ref, title, fields, sender, replyOk: input.replyOk === true }, input);
  inFlightByRef.set(ref, work);
  try {
    return (await work).clone();
  } finally {
    inFlightByRef.delete(ref);
  }
}

async function fileReport(
  token: string,
  repo: string,
  message: Omit<IssueInput, 'context' | 'imageLines'>,
  input: Record<string, unknown>
): Promise<Response> {
  const { ref, sender } = message;
  // A retry of a send that already went through: answer with the issue that exists.
  const lookup = await findIssueByRef(token, repo, ref);
  if ('error' in lookup) return lookup.error;
  if (lookup.found) return json(200, { ok: true, ref });
  // `in` narrows under any compiler settings (Vercel's function check runs without strict).
  const filedToday = 'filedToday' in lookup ? (lookup.filedToday ?? 0) : 0;
  const publicToday = 'publicToday' in lookup ? (lookup.publicToday ?? 0) : 0;
  if (filedToday >= DAILY_MAX) return json(429, { error: 'daily_limit' });
  if (sender.type === 'public' && publicToday >= PUBLIC_DAILY_MAX) return json(429, { error: 'daily_limit' });

  const context = (input.context ?? {}) as Record<string, unknown>;
  // Signed-out senders can't attach screenshots (nothing ties a file to a person).
  const images = (sender.type === 'account' && Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMAGES) as ImageIn[];

  // Screenshots go into the repo first, so the issue can show them.
  const imageLines: string[] = [];
  for (const [index, image] of images.entries()) {
    const data = typeof image.data === 'string' ? image.data : '';
    if (!/^[A-Za-z0-9+/=]+$/.test(data) || !isJpegBase64(data) || data.length * 0.75 > MAX_IMAGE_BYTES) continue;
    const saved = await uploadScreenshot(token, repo, `attachments/${ref}/${index + 1}.jpg`, ref, data).catch(() => ({}));
    if ('status' in saved) return json(502, { error: 'token_invalid' });
    if (!('url' in saved) || !saved.url) continue; // a missing screenshot must not lose the report itself
    const name = text(image.name, 80).replace(/[[\]]/g, '') || `Screenshot ${index + 1}`;
    imageLines.push(`![${name}](${saved.url}?raw=true)`);
  }

  const issue = buildIssue({ ...message, context, imageLines });
  let res = await github(token, repo, '/issues', 'POST', issue);
  // A label the token may not create (422) must not lose the report: send it without labels.
  if (res.status === 422) res = await github(token, repo, '/issues', 'POST', { title: issue.title, body: issue.body });
  if (res.status === 401) return json(502, { error: 'token_invalid' });
  if (res.status === 403 || res.status === 404) return json(502, { error: 'token_no_access' });
  if (!res.ok) return json(502, { error: 'github_error' });

  return json(200, { ok: true, ref });
}
