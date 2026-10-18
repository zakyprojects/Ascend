import { useEffect, useState } from 'react';
import { BellOff } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { NotificationPreferenceKey } from '@/types';
import { Switch } from '@/components/ui/primitives';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import { toUserMessage } from '@/lib/userMessage';
import { useToast } from '@/components/ui/Toast';
import { disablePush, enablePush, getPushStatus, type PushStatus } from '@/lib/push';
import { FOCUS_NOTIFS_PREF_KEY } from '@/components/pfc/focusSession';
import { SettingRow, SettingsCard } from './SettingRow';

/** Server-sent notification types the user can switch off; off means the server never creates them. */
const NOTIFICATION_PREFERENCES: { key: NotificationPreferenceKey; title: string; description: string }[] = [
  {
    key: 'notifDailyReminder',
    title: 'Daily reminder',
    description: '8 PM: a reminder when something for today is still unchecked.',
  },
  {
    key: 'notifPartnerActivity',
    title: 'Partner activity',
    description: 'Nudges, finished challenges and missed habits from your partners.',
  },
  {
    key: 'notifSundayPlanning',
    title: 'Sunday planning reminder',
    description: "Sundays at 7 PM: review last week's goals and plan the next.",
  },
];

function browserPermission(): NotificationPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
}

function readFocusAlerts(): boolean {
  try {
    return localStorage.getItem(FOCUS_NOTIFS_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function NotificationsSection({ store }: { store: AppStore }) {
  const currentUser = store.state.currentUser;
  const { showErrorToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const [focusAlerts, setFocusAlerts] = useState(readFocusAlerts);
  const [permission, setPermission] = useState<NotificationPermission>(browserPermission);
  const [pushStatus, setPushStatus] = useState<PushStatus>('off');
  const { isLoading: isPushSaving, executeFn: executePushToggle } = useAsyncAction();

  const userId = currentUser?.id;

  // Read again when the user comes back to the tab: permission may have changed in the browser's
  // own settings meanwhile (S13).
  useEffect(() => {
    const refresh = () => {
      setPermission(browserPermission());
      getPushStatus(userId)
        .then(setPushStatus)
        .catch(() => setPushStatus('off'));
    };
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [userId]);

  const handlePushToggle = () =>
    executePushToggle(async () => {
      try {
        if (pushStatus === 'on') {
          await disablePush();
          setPushStatus('off');
        } else {
          setPushStatus(await enablePush(userId));
          setPermission(browserPermission());
        }
      } catch (err) {
        console.error('[push] toggle failed:', err);
        showErrorToast("Couldn't change push notifications", toUserMessage(err, 'Please try again.'));
        // Off at once (a service worker that never got ready must not keep the switch spinning),
        // then the real state in the background.
        setPushStatus('off');
        getPushStatus(userId)
          .then(setPushStatus)
          .catch(() => undefined);
      }
    });

  const handleFocusAlerts = async () => {
    const next = !focusAlerts;
    setFocusAlerts(next);
    try {
      localStorage.setItem(FOCUS_NOTIFS_PREF_KEY, String(next));
    } catch {
      /* storage blocked: the switch still shows the choice for this visit */
    }
    if (next && typeof window !== 'undefined' && 'Notification' in window && permission === 'default') {
      try {
        setPermission(await Notification.requestPermission());
      } catch (e) {
        console.warn('Error requesting notification permission:', e);
      }
    }
  };

  const blocked = permission === 'denied' || pushStatus === 'denied';

  return (
    <SettingsCard title="Notifications">
      <div className="-my-1 divide-y divide-overlay-subtle">
        <SettingRow
          title="Push notifications on this device"
          description={
            pushStatus === 'unsupported'
              ? "This browser can't get push notifications. On iPhone, add Ascend to your Home Screen first."
              : 'Get your notifications even when Ascend is closed.'
          }
          control={
            <Switch
              checked={pushStatus === 'on'}
              disabled={pushStatus === 'unsupported' || pushStatus === 'denied'}
              loading={isPushSaving}
              onChange={handlePushToggle}
              label="Push notifications on this device"
            />
          }
        />
        {NOTIFICATION_PREFERENCES.map((pref) => (
          <SettingRow
            key={pref.key}
            title={pref.title}
            description={pref.description}
            control={
              <Switch
                checked={currentUser?.[pref.key] ?? true}
                loading={isKeyLoading(`switch:${pref.key}`)}
                onChange={() => executeWithKey(`switch:${pref.key}`, () => store.toggleNotificationPreference(pref.key))}
                label={pref.title}
              />
            }
          />
        ))}
        <SettingRow
          title="Focus session alerts"
          description="A system alert on this device when a focus session ends."
          control={<Switch checked={focusAlerts} onChange={handleFocusAlerts} label="Focus session alerts" />}
        />
      </div>

      {blocked && (
        <p role="status" className="flex items-start gap-2 text-xs leading-relaxed text-rose-theme">
          <BellOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Notifications are blocked in this browser. Allow them in the site settings to get these alerts.</span>
        </p>
      )}
      <p className="border-t border-overlay-subtle pt-3 text-xs leading-relaxed text-content-muted">
        Penalty notices, recovery milestones and partner invites and replies always show in your inbox. Penalty notices are never
        pushed.
      </p>
    </SettingsCard>
  );
}
