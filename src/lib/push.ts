/**
 * Web Push on this device: notifications arrive while the app is closed.
 *
 * The browser's subscription is saved with save_push_subscription and removed with
 * remove_push_subscription (supabase/migrations/20261017080000_web_push.sql); the server sends
 * through the send-push Edge Function. Opt-in per device, off until the user turns it on.
 *
 * The device remembers which account turned push on (PUSH_OWNER_KEY). On every app start that
 * account's subscription is checked and saved again (syncPushSubscription), so a server row lost
 * to cleanup, an account switch or a browser-rotated endpoint comes back without a tap.
 */
import { supabase } from './supabase';

// Public half of the VAPID key pair (the private half is a send-push secret). Safe to ship.
const VAPID_PUBLIC_KEY = 'BCm0FKHm8dST6fMA1txExLaijZvgYrl20Zy_jmS9oCDazA7lyEVVsnrYiNxXTw829zeFvaDoEl_VzMSgkP8ydGU';

// Account that turned push on for this device; cleared when it is turned off (or on logout).
const PUSH_OWNER_KEY = 'ascend_push_owner';
// Endpoint the service worker replaced in 'pushsubscriptionchange' (public/sw.js), kept in this
// cache until the page removes it from the account.
const PUSH_CACHE_NAME = 'ascend-push-v1';
const OLD_ENDPOINT_KEY = '/__ascend/push-old-endpoint';
// Set once the "Turn on notifications" card (PushPromptCard) is answered on this device: closed,
// the browser's question answered, or push turned off in Settings. Cleared when push is turned
// off for the user (logout), so the next sign-in here is offered it again.
const PUSH_PROMPT_DONE_KEY = 'ascend_push_prompt_done';
// A service worker that never becomes ready (failed install, blocked storage) must not hang the
// Settings switch.
const SW_READY_TIMEOUT_MS = 8000;

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

function readOwner(): string | null {
  try {
    return localStorage.getItem(PUSH_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(PUSH_OWNER_KEY, userId);
    else localStorage.removeItem(PUSH_OWNER_KEY);
  } catch {
    /* storage blocked: push still works, it just isn't re-saved on the next start */
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Push isn't ready on this device yet. Reload Ascend and try again.")),
      SW_READY_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration();
  return registration.pushManager.getSubscription();
}

function subscribe(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
  });
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  if (error) throw error;
}

/**
 * 'on' when this browser has a subscription that this account turned on. A device subscribed
 * before the owner was recorded counts as on for whoever is signed in (it is claimed on sync).
 */
export async function getPushStatus(userId?: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const owner = readOwner();
  if (owner && userId && owner !== userId) return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/**
 * Whether to offer the "Turn on notifications" card: push works in this browser and is not
 * blocked, nobody turned it on here (no owner, no subscription: an owner's lost subscription is
 * restored by syncPushSubscription instead), and the card was not answered on this device yet.
 */
export async function shouldOfferPush(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission === 'denied' || readOwner()) return false;
  try {
    if (localStorage.getItem(PUSH_PROMPT_DONE_KEY)) return false;
  } catch {
    return false; // storage blocked: a closed card could not stay closed
  }
  return !(await currentSubscription());
}

/** The card is answered on this device and not offered again. */
export function markPushPromptDone(): void {
  try {
    localStorage.setItem(PUSH_PROMPT_DONE_KEY, '1');
  } catch {
    /* storage blocked: shouldOfferPush already keeps the card away */
  }
}

/** The endpoint the service worker replaced, removed from this account once, then forgotten. */
async function removeReplacedEndpoint(current: string | null): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(PUSH_CACHE_NAME);
  const stored = await cache.match(OLD_ENDPOINT_KEY);
  if (!stored) return;
  const oldEndpoint = (await stored.text()).trim();
  if (oldEndpoint && oldEndpoint !== current) {
    const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: oldEndpoint });
    if (error) throw error;
  }
  await cache.delete(OLD_ENDPOINT_KEY);
}

/**
 * On app start (and when the service worker reports a new subscription): when this account
 * turned push on here and permission is still granted, saves the browser's subscription to the
 * account again, subscribing afresh if the browser dropped it. Idempotent (the RPC upserts by
 * endpoint). Never asks for permission and never throws; failures are logged and retried on the
 * next start.
 */
export async function syncPushSubscription(userId: string): Promise<void> {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return;
    const owner = readOwner();
    if (owner && owner !== userId) return; // another account turned push on here
    const registration = await readyRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!owner && !subscription) return; // never turned on here
    if (!subscription) subscription = await subscribe(registration);
    await saveSubscription(subscription);
    writeOwner(userId);
    await removeReplacedEndpoint(subscription.endpoint).catch((err) =>
      console.warn('[push] could not remove the replaced subscription:', err)
    );
  } catch (err) {
    console.warn("[push] could not re-save this device's subscription:", err);
  }
}

/** Asks for permission (only from a tap), subscribes this browser and saves it to the account. */
export async function enablePush(userId?: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = await readyRegistration();
  const subscription = (await registration.pushManager.getSubscription()) ?? (await subscribe(registration));
  try {
    await saveSubscription(subscription);
  } catch (error) {
    await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
  writeOwner(userId ?? null);
  return 'on';
}

/**
 * Removes this browser from the account and unsubscribes it. Safe to call when off. Push that was
 * on makes the card eligible again (logout); Settings marks it answered right after.
 */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  writeOwner(null);
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    localStorage.removeItem(PUSH_PROMPT_DONE_KEY);
  } catch {
    /* storage blocked: the card is not offered anyway */
  }
  const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe().catch(() => undefined);
  if (error) throw error;
}
