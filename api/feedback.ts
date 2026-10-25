/**
 * POST /api/feedback: turns a bug report or an idea into an issue in the private feedback repo.
 *
 * Runs on the server (a Vercel Function; `npm run dev` serves it through vite.config.ts), so the
 * GitHub token never reaches the browser. Environment:
 * - GITHUB_FEEDBACK_TOKEN: fine-grained token for that one repo, Issues + Contents read/write.
 * - GITHUB_FEEDBACK_REPO: "owner/name", defaults to zakyprojects/Ascend-Feedback.
 * - SUPABASE_URL + SUPABASE_ANON_KEY (or the app's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY):
 *   to check the sender's session.
 *
 * Only the app may send: a same-origin JSON POST carrying the sender's Supabase session (guests
 * have one too), checked with Supabase Auth. Spam brakes on top: a honeypot field, a minimum fill
 * time, size caps, JPEG-only screenshots, a per-account limit (best effort: each server instance
 * counts on its own) and a cap on issues filed per day across everyone.
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
const DAY_MS = 24 * 60 * 60_000;

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

/** The signed-in (or guest) user's id for the request's bearer token, or null. */
async function sessionUserId(request: Request, supabaseUrl: string, anonKey: string): Promise<string | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` },
    });
    if (!res.ok) return null;
    const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
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

type Lookup = { found: true } | { found: false; filedToday?: number } | { error: Response };

/**
 * Is there already an issue for this ref? Uses the issues list (consistent right after a create),
 * not the Search API (its index lags, which is exactly when a retry comes). Also counts the issues
 * filed in the last 24 hours on the first page (for the daily cap).
 */
async function findIssueByRef(token: string, repo: string, ref: string): Promise<Lookup> {
  const titlePrefix = `[${ref}]`;
  const bodyMarker = `_Ref ${ref}_`;
  let filedToday: number | undefined;
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
    const issues = (await res.json().catch(() => [])) as Array<{ title?: string; body?: string | null; created_at?: string }>;
    if (!Array.isArray(issues)) return { found: false };
    if (page === 1) {
      const since = Date.now() - DAY_MS;
      filedToday = issues.filter((i) => Date.parse(i.created_at ?? '') > since).length;
    }
    if (issues.some((i) => (i.title ?? '').startsWith(titlePrefix) || (i.body ?? '').includes(bodyMarker))) {
      return { found: true };
    }
    if (issues.length < 100) return { found: false, filedToday };
  }
  return { found: false, filedToday };
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

export async function POST(request: Request): Promise<Response> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return json(503, { error: 'not_configured' });

  // A JSON body needs a CORS preflight, so another site's page can't post here unseen.
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'bad_request' });
  }
  const sender = await sessionUserId(request, supabaseUrl, anonKey);
  if (!sender) return json(401, { error: 'unauthorized' });

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
  const startedAt = Number(input.startedAt);
  if (text(input.website, 200) || !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return json(200, { ok: true, ref: text(input.ref, 20) });
  }

  if (rateLimited(sender)) return json(429, { error: 'rate_limited' });

  const kind = input.kind === 'idea' ? 'idea' : input.kind === 'bug' ? 'bug' : null;
  const ref = text(input.ref, 20).replace(/[^A-Z0-9-]/gi, '');
  const title = text(input.title, 120);
  if (!kind || !ref || !title) return json(400, { error: 'bad_request' });

  const running = inFlightByRef.get(ref);
  if (running) return (await running).clone();
  const work = fileReport(token, repo, kind, ref, title, input);
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
  kind: 'bug' | 'idea',
  ref: string,
  title: string,
  input: Record<string, unknown>
): Promise<Response> {
  // A retry of a send that already went through: answer with the issue that exists.
  const lookup = await findIssueByRef(token, repo, ref);
  if ('error' in lookup) return lookup.error;
  if (lookup.found) return json(200, { ok: true, ref });
  // `in` narrows under any compiler settings (Vercel's function check runs without strict).
  const filedToday = 'filedToday' in lookup ? (lookup.filedToday ?? 0) : 0;
  if (filedToday >= DAILY_MAX) return json(429, { error: 'daily_limit' });

  const fields = (input.fields ?? {}) as Record<string, unknown>;
  const context = (input.context ?? {}) as Record<string, unknown>;
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMAGES) as ImageIn[];

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

  const contextRows = Object.entries(context)
    .map(([key, value]) => [text(key, 30), text(value, 120)])
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `| ${key} | ${value.replace(/\|/g, '/')} |`);

  const body = [
    kind === 'bug'
      ? [
          section('What happened', text(fields.whatHappened, 4000)),
          section('Steps', text(fields.steps, 4000)),
          section('Expected', text(fields.expected, 4000)),
          section('How bad', SEVERITY_LABELS[text(fields.severity, 20)] ?? ''),
        ]
          .filter(Boolean)
          .join('\n')
      : [
          section('The problem', text(fields.problem, 4000)),
          section('The idea', text(fields.idea, 4000)),
          section('How useful', IMPACT_LABELS[text(fields.impact, 20)] ?? ''),
        ]
          .filter(Boolean)
          .join('\n'),
    imageLines.length ? `### Screenshots\n${imageLines.join('\n')}\n` : '',
    contextRows.length ? `### Context\n| | |\n|---|---|\n${contextRows.join('\n')}\n` : '',
    `_Ref ${ref}_`,
  ]
    .filter(Boolean)
    .join('\n');

  const area = text(fields.area, 40);
  const labels = [kind, area && `area: ${area}`, kind === 'bug' && fields.severity ? `severity: ${text(fields.severity, 20)}` : '']
    .filter(Boolean) as string[];

  const issue = { title: `[${ref}] ${title}`, body, labels };
  let res = await github(token, repo, '/issues', 'POST', issue);
  // A label the token may not create (422) must not lose the report: send it without labels.
  if (res.status === 422) res = await github(token, repo, '/issues', 'POST', { title: issue.title, body });
  if (res.status === 401) return json(502, { error: 'token_invalid' });
  if (res.status === 403 || res.status === 404) return json(502, { error: 'token_no_access' });
  if (!res.ok) return json(502, { error: 'github_error' });

  return json(200, { ok: true, ref });
}
