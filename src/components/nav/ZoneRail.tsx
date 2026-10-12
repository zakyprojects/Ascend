import type { ReactNode } from 'react';
import { PanelLeftOpen, Plus, Search } from 'lucide-react';
import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { ZONE_KEYS } from './useNavShortcuts';
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
  /** Pointer resting on a zone button (null: it left the rail). Drives the hover peek. */
  onZoneHover: (zone: ZoneId | null) => void;
  onExpandPanel: () => void;
  onSearch: () => void;
  onQuickLog: () => void;
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
  onZoneHover,
  onExpandPanel,
  onSearch,
  onQuickLog,
  bell,
  account,
}: ZoneRailProps) {
  const tier = getCurrentTier(seasonPoints);
  const altitude = Math.min(1, (getTierIndex(seasonPoints) + getProgressToNextTier(seasonPoints).percent / 100) / (TIERS.length - 1));
  const shortcut = IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K';

  return (
    <div onPointerLeave={() => onZoneHover(null)} className="flex h-full w-[4.25rem] shrink-0 flex-col items-center gap-2 py-4">
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
      <RailButton label="Quick log" onClick={onQuickLog}>
        <Plus size={19} aria-hidden="true" />
      </RailButton>
      {bell}

      {/* The route: the four zones climb up from Dashboard (basecamp) at the foot of the line, which
          fills with the season's climb. Dashboard sits at the bottom, round and smaller, so it is
          never mistaken for the first zone. */}
      <div className="relative mt-3 flex flex-col items-center gap-4 py-1">
        <span aria-hidden="true" className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-overlay-default" />
        <span
          aria-hidden="true"
          className="rail-altitude absolute bottom-3 left-1/2 w-px -translate-x-1/2 bg-brand-text"
          style={{ height: `calc((100% - 1.5rem) * ${altitude})` }}
        />
        {NAV_GROUPS.map((group) => (
          <ZoneButton
            key={group.id}
            icon={group.icon}
            label={group.label}
            shortcut={`G ${ZONE_KEYS[group.id].toUpperCase()}`}
            active={activeZone === group.id}
            shown={!panelCollapsed && panelZone === group.id && activeZone !== group.id}
            badge={group.id === 'play' && playBadge > 0}
            onClick={() => onZone(group.id)}
            onHover={() => onZoneHover(group.id)}
          />
        ))}
        <ZoneButton
          basecamp
          icon={NAV_DASHBOARD.icon}
          label={NAV_DASHBOARD.label}
          shortcut="G D"
          active={onDashboard}
          onClick={onGoDashboard}
          onHover={() => onZoneHover(null)}
        />
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
  shortcut: string;
  active: boolean;
  /** The panel shows this zone while another page is on screen. */
  shown?: boolean;
  badge?: boolean;
  /** Dashboard: a smaller round node at the foot of the route instead of a zone tile. */
  basecamp?: boolean;
  onClick: () => void;
  onHover?: () => void;
}

function ZoneButton({ icon: Icon, label, shortcut, active, shown = false, badge = false, basecamp = false, onClick, onHover }: ZoneButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => event.pointerType === 'mouse' && onHover?.()}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      title={`${label} (${shortcut})`}
      className={cx(
        'group/zone relative flex items-center justify-center border',
        basecamp ? 'mt-2 h-9 w-9 rounded-full' : 'h-11 w-11 rounded-2xl',
        active
          ? 'zone-active border-primary-500/40 bg-bg-800 text-brand-text'
          : shown
            ? 'border-overlay-default bg-bg-800 text-content-secondary'
            : 'border-overlay-subtle bg-bg-900 text-content-muted hover:border-overlay-default hover:text-content-secondary',
        FOCUS_RING,
        TRANSITION
      )}
    >
      <Icon size={basecamp ? 16 : 19} aria-hidden="true" className="transition-transform duration-base ease-emphasized group-hover/zone:-translate-y-0.5 motion-reduce:transition-none" />
      {badge && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
    </button>
  );
}
