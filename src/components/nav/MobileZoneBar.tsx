import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { pageLinkProps } from '@/lib/pageLink';
import type { View } from '@/lib/views';

type ZoneId = NavGroup['id'];

interface MobileZoneBarProps {
  onDashboard: boolean;
  activeZone: ZoneId | null;
  playBadge: number;
  sheetOpen: boolean;
  /** The page each zone opens (its last visited), so the slot can be a real link. */
  zoneViews: Record<ZoneId, View>;
  onGoDashboard: () => void;
  /** Tapping the zone already on screen opens its sheet; another zone opens its last page. */
  onZone: (zone: ZoneId) => void;
}

/**
 * Phone navigation (Basecamp): a floating pill above the home indicator. The current zone wears
 * an emerald pill with its name; the others are icons only.
 */
export function MobileZoneBar({ onDashboard, activeZone, playBadge, sheetOpen, zoneViews, onGoDashboard, onZone }: MobileZoneBarProps) {
  const slots = [
    { id: 'dashboard' as const, icon: NAV_DASHBOARD.icon, label: 'Today', active: onDashboard, view: NAV_DASHBOARD.id, onClick: onGoDashboard, badge: false },
    ...NAV_GROUPS.map((group) => ({
      id: group.id,
      icon: group.icon,
      label: group.label,
      active: activeZone === group.id,
      view: zoneViews[group.id],
      onClick: () => onZone(group.id),
      badge: group.id === 'play' && playBadge > 0,
    })),
  ];

  return (
    <nav
      aria-label="Main"
      className="zone-bar lg:hidden fixed z-30 left-[calc(0.75rem_+_env(safe-area-inset-left))] right-[calc(0.75rem_+_env(safe-area-inset-right))] bottom-[calc(0.625rem_+_env(safe-area-inset-bottom))] mx-auto max-w-md rounded-full border border-overlay-default p-1.5"
    >
      <div className="flex items-center gap-1">
        {slots.map(({ id, icon: Icon, label, active, view, onClick, badge }) => {
          // Every slot is a real link to its page (new tab on Ctrl/Cmd-click). A plain tap on the zone
          // on screen toggles its sheet instead. One element type for all, so the slot's widening
          // transition survives the switch.
          const opensSheet = active && id !== 'dashboard';
          return (
            <a
              key={id}
              {...pageLinkProps(view, onClick)}
              aria-label={opensSheet ? `${label}: show pages` : label}
              aria-current={active ? 'page' : undefined}
              aria-expanded={opensSheet ? sheetOpen : undefined}
              className={cx(
                'zone-slot relative flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-full',
                active ? 'zone-slot-active flex-[1.6] bg-primary-500/15 px-3 text-brand-text' : 'flex-1 text-content-muted active:text-content-secondary',
                FOCUS_RING
              )}
            >
              <Icon size={20} aria-hidden="true" className="shrink-0" />
              {active && <span className="truncate text-sm font-semibold">{label}</span>}
              {badge && <span aria-hidden="true" className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-rose-500" />}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
