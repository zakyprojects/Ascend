import { Moon, Sun } from 'lucide-react';
import { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { NAV_GROUPS, NAV_HELP, type NavGroup } from '@/components/nav/navConfig';
import { cx, FOCUS_RING, Switch } from '@/components/ui/primitives';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { pageLinkProps } from '@/lib/pageLink';
import { pathForLegalRoute } from '@/lib/routes';
import { toggleThemeWithReveal } from '@/lib/themeTransition';
import { SettingRow, SettingsCard } from './SettingRow';

export function PrivacySection({ store }: { store: AppStore }) {
  const currentUser = store.state.currentUser;
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const isPublic = currentUser?.isProfilePublic ?? true;
  const acceptsInvites = currentUser?.acceptPartnerInvites ?? true;

  return (
    <SettingsCard title="Privacy">
      <div className="-my-1 divide-y divide-overlay-subtle">
        <SettingRow
          title="Public profile"
          description={
            <>
              <p>Show your streak and stats to others on the leaderboards.</p>
              <p>Hiding yours also hides other members&apos; stats from you. Partners always see your stats.</p>
            </>
          }
          control={
            <Switch
              checked={isPublic}
              loading={isKeyLoading('switch:privacy')}
              onChange={() => executeWithKey('switch:privacy', store.toggleProfilePrivacy)}
              label="Public profile"
            />
          }
        />
        <SettingRow
          title="Partner invites"
          description={
            <>
              <p>Let others find you by your ID and send you partner invites.</p>
              <p>Turning this off blocks new invites. Current partners stay connected.</p>
            </>
          }
          control={
            <Switch
              checked={acceptsInvites}
              loading={isKeyLoading('switch:invites')}
              onChange={() => executeWithKey('switch:invites', store.toggleAcceptPartnerInvites)}
              label="Accept partner invites"
            />
          }
        />
      </div>
    </SettingsCard>
  );
}

const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
] as const;

export function AppearanceSection({ store }: { store: AppStore }) {
  const theme = store.state.themePreference === 'light' ? 'light' : 'dark';
  return (
    <SettingsCard title="Appearance">
      <SettingRow
        className="py-0"
        title="Theme"
        description="Dark is the default."
        control={
          <div role="group" aria-label="Theme" className="inline-flex rounded-xl border border-overlay-default bg-bg-700 p-1">
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
              const active = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={(event) => {
                    if (!active) toggleThemeWithReveal(event.currentTarget, store.toggleThemePreference);
                  }}
                  className={cx(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                    active ? 'bg-bg-500 text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary',
                    FOCUS_RING
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        }
      />
    </SettingsCard>
  );
}

/** One plain line per page group for App info's "What's inside". */
const GROUP_INFO: Record<NavGroup['id'], string> = {
  track: 'Habits, bad habits you’re quitting, exercise, reading, skills, and your day planned in time blocks.',
  mind: 'A focus timer, a journal, a recovery tracker for quitting things like smoking or social media, and how your brain rewires itself.',
  plan: 'Weekly goals, projects, longer improvement plans, and short reads on how habits and focus work.',
  play: 'Earn points, climb the ranks, compete in leagues each season, and pair up with partners who keep you on track.',
};

export function AppInfoSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="App info">
      <div>
        <p className="text-sm font-medium text-content-primary">Ascend</p>
        <p className="mt-0.5 text-xs text-content-muted tabular-nums">
          Version {__APP_VERSION__} · Build {__APP_BUILD__}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-content-secondary">
          Ascend turns self-improvement into a season you can win. What you do each day earns points, points move you
          up the ranks and your league, and a partner can keep you on track. Points start again every season, so someone
          who joins late still has a real chance. Signed in, your data syncs across your devices.
        </p>
      </div>
      <div className="space-y-3 border-t border-overlay-subtle pt-4">
        <h3 className="text-sm font-semibold text-content-primary">What's inside</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {NAV_GROUPS.map(({ id, label, icon: Icon }) => (
            <div key={id} className="flex gap-3 rounded-xl border border-overlay-subtle p-3">
              <Icon size={16} className="mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-sm font-medium text-content-primary">{label}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-content-muted">{GROUP_INFO[id]}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-overlay-subtle pt-4">
        {NAV_HELP.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            {...pageLinkProps(id, onNavigate)}
            className={cx(
              'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-overlay-default px-3.5 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-overlay-subtle',
              FOCUS_RING
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </a>
        ))}
      </div>
      {/* A new tab, so this page (and anything typed here) stays as it is. */}
      <div className="-mb-2 flex flex-wrap items-center gap-x-5">
        {(['privacy', 'terms'] as const).map((route) => (
          <a
            key={route}
            href={pathForLegalRoute(route)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx('inline-flex min-h-11 items-center rounded-lg text-xs font-medium text-brand-text hover:underline underline-offset-2', FOCUS_RING)}
          >
            {route === 'privacy' ? 'Privacy Policy' : 'Terms'}
          </a>
        ))}
      </div>
    </SettingsCard>
  );
}
