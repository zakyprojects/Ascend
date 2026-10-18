/**
 * send-push: delivers one new in-app notification to the recipient's devices as a Web Push.
 *
 * Called only by the notifications_send_push trigger (supabase/migrations/20261017080000_web_push.sql)
 * with { notification_id } and the shared x-ascend-push-secret header. The body is never trusted
 * beyond the id: the notification and the devices are read here with the service role.
 *
 * Deploy with "Verify JWT" OFF (the secret header is the check; pg_net sends no Authorization header):
 *   supabase functions deploy send-push --project-ref qokeodigrywwsyglcfjj --no-verify-jwt
 * Secrets:
 * - PUSH_WEBHOOK_SECRET: same value as the Vault secret ascend_push_secret
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: the key pair; the public key also lives in src/lib/push.ts
 * - VAPID_SUBJECT: mailto: contact, e.g. mailto:mzakriakhan55@gmail.com
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// A notification older than this is not pushed (a delayed retry would arrive out of context).
const MAX_AGE_MS = 60 * 60 * 1000;
// Database reads are retried: a read can fail for a moment with "JWT issued at future" (the
// gateway's token is a little ahead of the database clock) or a network blip. 3 tries over ~2 s.
const READ_RETRY_DELAYS_MS = [400, 1500];
// Push options: 'high' so Android delivers at once instead of holding it until the phone wakes
// from Doze; a phone that is offline longer than TTL drops it (a reminder that late is stale).
const PUSH_OPTIONS = { TTL: 4 * 60 * 60, urgency: 'high' as const };

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a read, retrying on error; logs every failed try (no secrets, no endpoints). */
async function readWithRetry<T>(
  what: string,
  context: Record<string, unknown>,
  read: () => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>
): Promise<{ data: T | null; error: string | null }> {
  let lastError = 'unknown';
  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await read();
    if (!error) return { data, error: null };
    lastError = error.message;
    console.error('send-push read failed', { what, attempt: attempt + 1, code: error.code ?? null, error: error.message, ...context });
    if (attempt < READ_RETRY_DELAYS_MS.length) await sleep(READ_RETRY_DELAYS_MS[attempt]);
  }
  return { data: null, error: lastError };
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (req.headers.get('x-ascend-push-secret') !== env('PUSH_WEBHOOK_SECRET')) return reply(401, { error: 'secret' });

  let id: unknown;
  try {
    id = (await req.json())?.notification_id;
  } catch {
    return reply(400, { error: 'body' });
  }
  if (typeof id !== 'string') return reply(400, { error: 'id' });

  const noticeId = id;
  const { data: notice, error } = await readWithRetry('notification', { notification_id: noticeId }, () =>
    db
      .from('notifications')
      .select('id, recipient_id, type, title, message, read, created_at')
      .eq('id', noticeId)
      .maybeSingle()
  );
  if (error) return reply(500, { error });
  if (!notice || notice.read || Date.now() - Date.parse(notice.created_at) > MAX_AGE_MS) {
    return reply(200, { sent: 0 });
  }

  const logContext = { notification_id: notice.id, type: notice.type, user_id: notice.recipient_id };
  const { data: devices, error: devicesError } = await readWithRetry('devices', logContext, () =>
    db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', notice.recipient_id)
  );
  if (devicesError) return reply(500, { error: devicesError });

  const payload = JSON.stringify({
    id: notice.id,
    title: notice.title || 'Ascend',
    body: notice.message || '',
    url: '/',
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    (devices ?? []).map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          PUSH_OPTIONS
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? null;
        // 404/410: the browser dropped this subscription for good.
        if (status === 404 || status === 410) gone.push(device.endpoint);
        else {
          const body = (err as { body?: unknown }).body;
          console.error('send-push delivery failed', {
            ...logContext,
            status,
            error: (err as Error).message,
            body: typeof body === 'string' ? body.slice(0, 200) : null,
          });
        }
      }
    })
  );

  if (gone.length > 0) {
    const { error: deleteError } = await db.from('push_subscriptions').delete().in('endpoint', gone);
    if (deleteError) console.error('send-push cleanup failed', { ...logContext, removed: gone.length, error: deleteError.message });
  }
  if (sent === 0 && (devices ?? []).length > gone.length) {
    console.error('send-push sent nothing', { ...logContext, devices: (devices ?? []).length, removed: gone.length });
  }
  return reply(200, { sent, removed: gone.length });
});
