import { Moon, Sun } from 'lucide-react';
import { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { NAV_HELP } from '@/components/nav/navConfig';
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

export function AppInfoSection({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <SettingsCard title="App info">
      <div>
        <p className="text-sm font-medium text-content-primary">Ascend</p>
        <p className="mt-0.5 text-xs text-content-muted tabular-nums">
          Version {__APP_VERSION__} · Build {__APP_BUILD__}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-content-muted">
          Track habits, exercise, reading and skills, compete in leagues, and keep each other on track with partners.
        </p>
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
