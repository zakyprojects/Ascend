import { focusAlertsEnabled, PFC_PATH } from './focusSession';

/**
 * Focus timer alerts are shown by the page itself when it sees the session end, so they arrive
 * only while the app is running (a minimised mobile app is usually paused by the system).
 * A click opens the PFC page: the service worker posts `ascend:navigate` to an open window
 * (public/sw.js), the plain Notification fallback calls `onOpen` directly.
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
    badge: '/favicon-32x32.png',
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
