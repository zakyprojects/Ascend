/**
 * sign-in-username: signs in with a username and password, without ever showing the account's email.
 *
 * The app's sign-in field takes an email or a username. An email signs in straight with Supabase
 * Auth; a username comes here. The account is found by username (case-insensitive) with the
 * service role, its email is read on the server, and the normal Supabase password sign-in runs with
 * the anon key. Only the session tokens go back; the app hands them to `supabase.auth.setSession`.
 *
 * - A wrong password and an unknown username get the same 401 { error: 'invalid_credentials' }.
 * - Failed attempts are counted per username and per caller IP (public.ascend_sign_in_blocked /
 *   ascend_sign_in_result, migration 20261019230100); over the limit the answer is 429
 *   { error: 'rate_limited' } before Auth is called. Supabase Auth's own limit sees this
 *   function's address (one bucket for everyone); its 429 is passed on the same way.
 * - The app's Turnstile token (`captchaToken`) is passed to Auth, which verifies it; it is never
 *   checked here (a token works once). A refused token = 400 { error: 'captcha_failed' }, and the
 *   app retries with a fresh one.
 * - The email is never returned, logged or put in an error.
 *
 * Deploy with "Verify JWT" OFF (a sign-in endpoint: callers have no user token).
 * No secrets to set: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided.
 * Optional ALLOWED_ORIGINS: comma-separated browser origins allowed by CORS (default: production
 * plus http://localhost / 127.0.0.1 on any port).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

// Same rule as src/lib/usernameRules.ts and ascend_change_username.
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const MAX_PASSWORD_LENGTH = 256;
const MAX_CAPTCHA_TOKEN_LENGTH = 4096;
const DEFAULT_ORIGINS = ['https://ascend-neon.vercel.app'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession);

const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : DEFAULT_ORIGINS;

/** CORS for the app's own origins only; other sites' pages get no Allow-Origin. */
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) || (!configuredOrigins.length && LOCAL_ORIGIN.test(origin));
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** The caller's address (first x-forwarded-for hop), or '' when unknown. */
function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64);
}

/** Too many recent failures for this username or IP. A missing/failed gate never blocks. */
async function blocked(username: string, ip: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('ascend_sign_in_blocked', { p_username: username, p_ip: ip });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Best effort: a failed write never changes the answer. */
async function recordResult(username: string, ip: string, failed: boolean): Promise<void> {
  try {
    await admin.rpc('ascend_sign_in_result', { p_username: username, p_ip: ip, p_failed: failed });
  } catch {
    /* ignored */
  }
}

/** The account's email for a username, or null (no such user, a guest, or no email). */
async function emailForUsername(username: string): Promise<string | null> {
  // ilike without wildcards = case-insensitive equality; "_" is a wildcard in LIKE, so escape it.
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, username')
    .ilike('username', username.replace(/_/g, '\\_'))
    .limit(2);
  if (error) throw new Error('lookup');
  const lower = username.toLowerCase();
  const row = (rows ?? []).find((r) => typeof r.username === 'string' && r.username.toLowerCase() === lower);
  if (!row) return null;
  const { data, error: userError } = await admin.auth.admin.getUserById(row.id);
  if (userError || !data?.user) return null;
  if (data.user.is_anonymous || !data.user.email) return null;
  return data.user.email;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  const invalid = () => reply(401, { error: 'invalid_credentials' });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });

  let username: unknown;
  let password: unknown;
  let captchaToken: unknown;
  try {
    ({ username, password, captchaToken } = await req.json());
  } catch {
    return reply(400, { error: 'body' });
  }
  if (typeof username !== 'string' || typeof password !== 'string') return reply(400, { error: 'body' });
  if (captchaToken !== undefined && (typeof captchaToken !== 'string' || captchaToken.length > MAX_CAPTCHA_TOKEN_LENGTH)) {
    return reply(400, { error: 'body' });
  }
  const name = username.trim();
  if (!USERNAME_PATTERN.test(name) || !password || password.length > MAX_PASSWORD_LENGTH) return invalid();

  const ip = clientIp(req);
  try {
    if (await blocked(name, ip)) return reply(429, { error: 'rate_limited' });

    // An unknown username counts as a failure too, so its answer matches a wrong password.
    const email = await emailForUsername(name);
    if (!email) {
      await recordResult(name, ip, true);
      return invalid();
    }

    const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), noSession);
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken as string | undefined },
    });
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') return reply(429, { error: 'rate_limited' });
      if (error.code === 'captcha_failed') return reply(400, { error: 'captcha_failed' });
      // Auth checks the password before confirmation, so this tells only someone who has it.
      if (error.code === 'email_not_confirmed') return reply(403, { error: 'email_not_confirmed' });
      await recordResult(name, ip, true);
      return invalid();
    }
    if (!data.session) return invalid();
    await recordResult(name, ip, false);
    return reply(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return reply(500, { error: 'server' });
  }
});
