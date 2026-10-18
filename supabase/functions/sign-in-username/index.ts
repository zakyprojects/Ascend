/**
 * sign-in-username: signs in with a username and password, without ever showing the account's email.
 *
 * The app's sign-in field takes an email or a username. An email signs in straight with Supabase
 * Auth; a username comes here. The account is found by username (case-insensitive) with the
 * service role, its email is read on the server, and the normal Supabase password sign-in runs with
 * the anon key. Only the session tokens go back; the app hands them to `supabase.auth.setSession`.
 *
 * - A wrong password and an unknown username get the same 401 { error: 'invalid_credentials' }.
 * - Supabase Auth's own rate limit applies (it sees this function's address, so username sign-ins
 *   share one limit); a 429 is passed on as { error: 'rate_limited' }.
 * - The email is never returned, logged or put in an error.
 *
 * Deploy with "Verify JWT" OFF (a sign-in endpoint: callers have no user token).
 * No secrets to set: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

// Same rule as src/lib/usernameRules.ts and ascend_change_username.
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const MAX_PASSWORD_LENGTH = 256;

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const invalid = () => reply(401, { error: 'invalid_credentials' });

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method' });

  let username: unknown;
  let password: unknown;
  try {
    ({ username, password } = await req.json());
  } catch {
    return reply(400, { error: 'body' });
  }
  if (typeof username !== 'string' || typeof password !== 'string') return reply(400, { error: 'body' });
  const name = username.trim();
  if (!USERNAME_PATTERN.test(name) || !password || password.length > MAX_PASSWORD_LENGTH) return invalid();

  try {
    const email = await emailForUsername(name);
    if (!email) return invalid();

    const auth = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), noSession);
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') return reply(429, { error: 'rate_limited' });
      // Auth checks the password before confirmation, so this tells only someone who has it.
      if (error.code === 'email_not_confirmed') return reply(403, { error: 'email_not_confirmed' });
      return invalid();
    }
    if (!data.session) return invalid();
    return reply(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return reply(500, { error: 'server' });
  }
});
