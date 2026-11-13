import { focusAlertsEnabled, PFC_PATH } from './focusSession';
import { celebrationFeedback } from '@/lib/ui/actionFeedback';
import { playActionSound, type ActionSound } from '@/lib/ui/actionSounds';

/**
 * Focus timer alerts are shown by the page itself when it sees the session end, so they arrive
 * only while the app is running (a minimised mobile app is usually paused by the system).
 * A click opens the PFC page: the service worker posts `ascend:navigate` to an open window
 * (public/sw.js; App opens the page), the plain Notification fallback calls `onOpen` directly.
 */

const SW_READY_TIMEOUT_MS = 2000;

export const notificationsSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Asks once without blocking the caller (called from a click so browsers allow the prompt). */
export function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  try {
    return Notification.requestPermission().catch(() => Notification.permission);
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  // `ready` never settles when the worker failed to register: don't wait for it forever.
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS));
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch {
    return null;
  }
}

export async function showFocusNotification(title: string, body: string, onOpen: () => void): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !focusAlertsEnabled()) return;
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/android-chrome-192x192.png',
    badge: '/notification-badge.png',
    tag: 'ascend-focus',
    renotify: true,
    data: { url: PFC_PATH },
  };

  const reg = await serviceWorkerRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    try {
      await reg.showNotification(title, options);
      return;
    } catch {
      /* fall back to the page notification below */
    }
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      onOpen();
      n.close();
    };
  } catch {
    /* Android Chrome has no Notification constructor; nothing more to try */
  }
}

/** Break over: two soft rising bell tones (Web Audio, like the tick sounds; no audio file). */
const BREAK_OVER_CHIME: ActionSound = {
  id: 'focus-break-over',
  name: 'Break over',
  hint: 'Two soft rising bell tones',
  layers: [
    { kind: 'tone', wave: 'sine', from: 784, length: 0.5, level: 0.9 },
    { kind: 'tone', wave: 'sine', from: 1046.5, length: 0.7, level: 0.9, delay: 0.22 },
  ],
};

/**
 * The cue when a break ends while the app is open: the chime, a buzz, or nothing, following the
 * user's tick choice in Settings > Sound & vibration (like the rank-up).
 */
export function breakOverFeedback(): void {
  celebrationFeedback((ctx, peak) => playActionSound(ctx, BREAK_OVER_CHIME, peak), [60, 80, 60]);
}
