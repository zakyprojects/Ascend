import type { ReactNode } from 'react';
import { PanelLeftOpen, Plus, Search } from 'lucide-react';
import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { ZONE_KEYS } from './useNavShortcuts';
import { AppLogo } from '@/components/ui/AppLogo';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import { getCurrentTier } from '@/lib/tiers';

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

/** Desktop navigation rail (Basecamp): logo and tools on top, then Dashboard and the four zones. */
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

      {/* Dashboard and the four zones, set off from the tools by a hairline. */}
      <span aria-hidden="true" className="my-1 h-px w-6 bg-overlay-default" />
      <div className="flex flex-col items-center gap-1.5">
        <ZoneButton
          icon={NAV_DASHBOARD.icon}
          label={NAV_DASHBOARD.label}
          shortcut="G D"
          active={onDashboard}
          onClick={onGoDashboard}
          onHover={() => onZoneHover(null)}
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
  onClick: () => void;
  onHover?: () => void;
}

function ZoneButton({ icon: Icon, label, shortcut, active, shown = false, badge = false, onClick, onHover }: ZoneButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => event.pointerType === 'mouse' && onHover?.()}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      title={`${label} (${shortcut})`}
      className={cx(
        'relative flex h-10 w-10 items-center justify-center rounded-xl',
        active
          ? 'bg-overlay-default text-content-primary'
          : shown
            ? 'bg-overlay-subtle text-content-secondary'
            : 'text-content-muted hover:bg-overlay-subtle hover:text-content-secondary',
        FOCUS_RING,
        TRANSITION
      )}
    >
      <Icon size={18} aria-hidden="true" />
      {badge && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
    </button>
  );
}
