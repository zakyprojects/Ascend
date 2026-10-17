/**
 * send-push: delivers one new in-app notification to the recipient's devices as a Web Push.
 *
 * Called only by the notifications_send_push trigger (supabase/migrations/20261017080000_web_push.sql)
 * with { notification_id } and the shared x-ascend-push-secret header. The body is never trusted
 * beyond the id: the notification and the devices are read here with the service role.
 *
 * Deploy with "Verify JWT" OFF (the secret header is the check). Secrets:
 * - PUSH_WEBHOOK_SECRET: same value as the Vault secret ascend_push_secret
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: the key pair; the public key also lives in src/lib/push.ts
 * - VAPID_SUBJECT: mailto: contact, e.g. mailto:mzakriakhan55@gmail.com
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// A notification older than this is not pushed (a delayed retry would arrive out of context).
const MAX_AGE_MS = 60 * 60 * 1000;

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

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

  const { data: notice, error } = await db
    .from('notifications')
    .select('id, recipient_id, title, message, read, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply(500, { error: error.message });
  if (!notice || notice.read || Date.now() - Date.parse(notice.created_at) > MAX_AGE_MS) {
    return reply(200, { sent: 0 });
  }

  const { data: devices, error: devicesError } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', notice.recipient_id);
  if (devicesError) return reply(500, { error: devicesError.message });

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
          { TTL: 12 * 60 * 60, urgency: 'normal' }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription for good.
        if (status === 404 || status === 410) gone.push(device.endpoint);
        else console.warn('push failed', status, (err as Error).message);
      }
    })
  );

  if (gone.length > 0) {
    await db.from('push_subscriptions').delete().in('endpoint', gone);
  }
  return reply(200, { sent, removed: gone.length });
});
