/**
 * Web Push on this device: notifications arrive while the app is closed.
 *
 * The browser's subscription is saved with save_push_subscription and removed with
 * remove_push_subscription (supabase/migrations/20261017080000_web_push.sql); the server sends
 * through the send-push Edge Function. Opt-in per device, off until the user turns it on.
 */
import { supabase } from './supabase';

// Public half of the VAPID key pair (the private half is a send-push secret). Safe to ship.
const VAPID_PUBLIC_KEY = 'BCm0FKHm8dST6fMA1txExLaijZvgYrl20Zy_jmS9oCDazA7lyEVVsnrYiNxXTw829zeFvaDoEl_VzMSgkP8ydGU';

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks for permission (only from a tap), subscribes this browser and saves it to the account. */
export async function enablePush(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  if (error) {
    await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
  return 'on';
}

/** Removes this browser from the account and unsubscribes it. Safe to call when off. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe().catch(() => undefined);
  if (error) throw error;
}
