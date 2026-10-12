import type { ReactNode } from 'react';
import { PanelLeftOpen, Search } from 'lucide-react';
import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { AppLogo } from '@/components/ui/AppLogo';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import { TIERS, getCurrentTier, getProgressToNextTier, getTierIndex } from '@/lib/tiers';

type ZoneId = NavGroup['id'];

interface ZoneRailProps {
  onDashboard: boolean;
  /** Zone of the page on screen (null on Dashboard and Settings). */
  activeZone: ZoneId | null;
  /** Zone the panel is showing. */
  panelZone: ZoneId;
  panelCollapsed: boolean;
  seasonPoints: number;
  playBadge: number;
  onGoDashboard: () => void;
  onZone: (zone: ZoneId) => void;
  onExpandPanel: () => void;
  onSearch: () => void;
  /** The notification bell. */
  bell: ReactNode;
  /** The account avatar and its menu. */
  account: ReactNode;
}

/**
 * Desktop navigation rail (Basecamp): the zones sit on one climbing line, and the season's climb
 * fills that line from the bottom up, so the rail doubles as an altitude meter.
 */
export function ZoneRail({
  onDashboard,
  activeZone,
  panelZone,
  panelCollapsed,
  seasonPoints,
  playBadge,
  onGoDashboard,
  onZone,
  onExpandPanel,
  onSearch,
  bell,
  account,
}: ZoneRailProps) {
  const tier = getCurrentTier(seasonPoints);
  const altitude = Math.min(1, (getTierIndex(seasonPoints) + getProgressToNextTier(seasonPoints).percent / 100) / (TIERS.length - 1));
  const shortcut = IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K';

  return (
    <div className="flex h-full w-[4.25rem] shrink-0 flex-col items-center gap-2 py-4">
      <button
        type="button"
        onClick={onGoDashboard}
        aria-label="Ascend, go to Dashboard"
        title="Ascend"
        className={cx('rounded-[22%]', FOCUS_RING)}
      >
        <AppLogo className="h-9 w-9 rounded-[22%] object-cover" />
      </button>

      <RailButton label={`Go to… (${shortcut})`} onClick={onSearch}>
        <Search size={18} aria-hidden="true" />
      </RailButton>
      {bell}

      {/* The route: Dashboard, then the four zones. The line behind them is the season's climb. */}
      <div className="relative mt-3 flex flex-col items-center gap-4 py-1">
        <span aria-hidden="true" className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-overlay-default" />
        <span
          aria-hidden="true"
          className="rail-altitude absolute bottom-3 left-1/2 w-px -translate-x-1/2 bg-brand-text"
          style={{ height: `calc((100% - 1.5rem) * ${altitude})` }}
        />
        <ZoneButton icon={NAV_DASHBOARD.icon} label={NAV_DASHBOARD.label} active={onDashboard} onClick={onGoDashboard} />
        {NAV_GROUPS.map((group) => (
          <ZoneButton
            key={group.id}
            icon={group.icon}
            label={group.label}
            active={activeZone === group.id}
            shown={!panelCollapsed && panelZone === group.id && activeZone !== group.id}
            badge={group.id === 'play' && playBadge > 0}
            onClick={() => onZone(group.id)}
          />
        ))}
      </div>
      <span className="sr-only">
        Season: {tier.name}, {seasonPoints.toLocaleString()} points
      </span>

      <div className="flex-1" />

      {panelCollapsed && (
        <RailButton label="Show pages ([)" onClick={onExpandPanel}>
          <PanelLeftOpen size={18} aria-hidden="true" />
        </RailButton>
      )}
      {account}
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'flex h-10 w-10 items-center justify-center rounded-xl text-content-muted hover:bg-overlay-subtle hover:text-content-secondary',
        FOCUS_RING,
        TRANSITION
      )}
    >
      {children}
    </button>
  );
}

interface ZoneButtonProps {
  icon: NavGroup['icon'];
  label: string;
  active: boolean;
  /** The panel shows this zone while another page is on screen. */
  shown?: boolean;
  badge?: boolean;
  onClick: () => void;
}

function ZoneButton({ icon: Icon, label, active, shown = false, badge = false, onClick }: ZoneButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      title={label}
      className={cx(
        'group/zone relative flex h-11 w-11 items-center justify-center rounded-2xl border',
        active
          ? 'zone-active border-primary-500/40 bg-bg-800 text-brand-text'
          : shown
            ? 'border-overlay-default bg-bg-800 text-content-secondary'
            : 'border-overlay-subtle bg-bg-900 text-content-muted hover:border-overlay-default hover:text-content-secondary',
        FOCUS_RING,
        TRANSITION
      )}
    >
      <Icon size={19} aria-hidden="true" className="transition-transform duration-base ease-emphasized group-hover/zone:-translate-y-0.5 motion-reduce:transition-none" />
      {badge && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
    </button>
  );
}
