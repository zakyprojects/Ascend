import { useMemo, useState } from 'react';
import type { AppStore } from '@/lib/store/store';
import type { AppNotification } from '@/types';
import { trustedNowMs } from '@/lib/time/clock';

// In-memory stand-ins for the store parts a few shared components take as props (dev Gallery only).
// Nothing here talks to Supabase: every method changes React state in this page and nothing else.

const MINUTE = 60 * 1000;

function notice(id: string, type: string, message: string, minutesAgo: number, read: boolean, extra: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    recipientId: 'gallery-user',
    type,
    message,
    read,
    createdAt: new Date(trustedNowMs() - minutesAgo * MINUTE).toISOString(),
    ...extra,
  };
}

/** A mix of notice kinds: partner invite and nudge (unread), a missed habit, a challenge, an older read one. */
export function demoNotifications(): AppNotification[] {
  return [
    notice('n1', 'partner_invite', 'sara_k wants to be your accountability partner.', 4, false, { actorUsername: 'sara_k', actorAvatar: '🦊' }),
    notice('n2', 'partner_nudge', 'sara_k nudged you: time for your evening walk.', 35, false, { actorUsername: 'sara_k', actorAvatar: '🦊' }),
    notice('n3', 'missed_habit', 'You missed Drink 2 litres of water yesterday.', 60 * 14, false, { payload: { period: '2026-11-06' } }),
    notice('n4', 'challenge_completed', 'You and sara_k finished the 7-day reading challenge.', 60 * 30, true, { actorUsername: 'sara_k', actorAvatar: '🦊' }),
    notice('n5', 'sunday_planning', 'Set a few goals for next week, and look back at this one.', 60 * 24 * 3, true, { title: 'Plan next week' }),
  ];
}

export type FakeNotificationsStatus = 'loading' | 'ready' | 'failed';

/**
 * The slice of AppStore that NotificationCenter reads (state.notifications, notificationsStatus and
 * six actions), in memory. Cast to AppStore for the prop; any other store field is undefined here.
 */
export function useFakeNotificationStore(initial: () => AppNotification[] = demoNotifications, initialStatus: FakeNotificationsStatus = 'ready') {
  const [notifications, setNotifications] = useState<AppNotification[]>(initial);
  const [status, setStatus] = useState<FakeNotificationsStatus>(initialStatus);
  const store = useMemo(() => {
    const markRead = (ids: string[]) => setNotifications((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    const fake = {
      state: { notifications },
      notificationsStatus: status,
      markNotificationRead: (id: string) => markRead([id]),
      markNotificationsRead: (ids: string[]) => markRead(ids),
      markAllNotificationsRead: () => setNotifications((list) => list.map((n) => ({ ...n, read: true }))),
      clearNotifications: (ids: string[]) => setNotifications((list) => list.filter((n) => !ids.includes(n.id))),
      clearReadNotifications: () => setNotifications((list) => list.filter((n) => !n.read)),
      refreshNotifications: async () => {
        setStatus('ready');
      },
    };
    return fake as unknown as AppStore;
  }, [notifications, status]);
  return {
    store,
    reset: () => {
      setNotifications(initial());
      setStatus(initialStatus);
    },
    setNotifications,
    setStatus,
  };
}
