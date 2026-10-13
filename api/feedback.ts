/**
 * POST /api/feedback: turns a bug report or an idea into an issue in the private feedback repo.
 *
 * Runs on the server (a Vercel Function; `npm run dev` serves it through vite.config.ts), so the
 * GitHub token never reaches the browser. Environment:
 * - GITHUB_FEEDBACK_TOKEN: fine-grained token for that one repo, Issues + Contents read/write.
 * - GITHUB_FEEDBACK_REPO: "owner/name", defaults to zakyprojects/Ascend-Feedback.
 *
 * Guests may send too, so the endpoint carries its own spam brakes: a honeypot field, a minimum
 * fill time, size caps, and a per-IP limit (best effort: each server instance counts on its own).
 */

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_REPO = 'zakyprojects/Ascend-Feedback';
const MAX_BODY_BYTES = 4_000_000; // Vercel rejects request bodies over 4.5 MB
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1_500_000; // per image, after the browser has shrunk it
const MIN_FILL_MS = 3_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 5;

const SEVERITY_LABELS: Record<string, string> = {
  cosmetic: 'Looks off',
  annoying: 'Gets in the way',
  blocking: 'Blocks me',
};
const IMPACT_LABELS: Record<string, string> = {
  nice: 'Nice to have',
  weekly: "I'd use it weekly",
  big: 'Changes how I use Ascend',
};

const recentByIp = new Map<string, number[]>();

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (recentByIp.size > 1000) {
    for (const [key, times] of recentByIp) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) recentByIp.delete(key);
    }
  }
  const recent = (recentByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    recentByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentByIp.set(ip, recent);
  return false;
}

async function github(token: string, repo: string, path: string, method: string, body: unknown) {
  return fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ascend-feedback',
    },
    body: JSON.stringify(body),
  });
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
  if (!token) return json(503, { error: 'not_configured' });

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

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return json(429, { error: 'rate_limited' });

  const kind = input.kind === 'idea' ? 'idea' : input.kind === 'bug' ? 'bug' : null;
  const ref = text(input.ref, 20).replace(/[^A-Z0-9-]/gi, '');
  const title = text(input.title, 120);
  if (!kind || !ref || !title) return json(400, { error: 'bad_request' });

  const fields = (input.fields ?? {}) as Record<string, unknown>;
  const context = (input.context ?? {}) as Record<string, unknown>;
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMAGES) as ImageIn[];

  // Screenshots go into the repo first, so the issue can show them.
  const imageLines: string[] = [];
  for (const [index, image] of images.entries()) {
    const data = typeof image.data === 'string' ? image.data : '';
    if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length * 0.75 > MAX_IMAGE_BYTES) continue;
    const res = await github(token, repo, `/contents/attachments/${ref}/${index + 1}.jpg`, 'PUT', {
      message: `Attachment for ${ref}`,
      content: data,
    });
    if (res.status === 401) return json(502, { error: 'token_invalid' });
    if (!res.ok) continue; // a missing screenshot must not lose the report itself
    const saved = (await res.json()) as { content?: { html_url?: string } };
    const name = text(image.name, 80).replace(/[[\]]/g, '') || `Screenshot ${index + 1}`;
    if (saved.content?.html_url) imageLines.push(`![${name}](${saved.content.html_url}?raw=true)`);
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
