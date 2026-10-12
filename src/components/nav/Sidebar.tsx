import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { AppLogo } from '@/components/ui/AppLogo';
import { NavItem, NavSection } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import { useHoverGlide } from '@/lib/useHoverGlide';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';

type ZoneId = NavGroup['id'];

const STORAGE_KEY = 'ascend_nav_closed_groups';

function loadClosed(): ZoneId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is ZoneId => NAV_GROUPS.some((g) => g.id === id)) : [];
  } catch {
    return [];
  }
}

interface SidebarProps {
  currentView: View;
  /** Group of the page on screen (null on Dashboard and Settings); unfolded when it changes. */
  activeGroup: ZoneId | null;
  statuses: NavStatuses;
  partnerBadge: number;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  onQuickLog: () => void;
  /** The notification bell. */
  bell: ReactNode;
  /** Season standing (RankChip). */
  standing: ReactNode;
  /** The account avatar and its menu (top row, Linear style). */
  account: ReactNode;
}

/**
 * Desktop navigation: one column (Linear/Notion style). Dashboard, then every group with all its
 * pages, each page one click away. Groups fold; which ones are folded is remembered.
 */
export function Sidebar({
  currentView,
  activeGroup,
  statuses,
  partnerBadge,
  onNavigate,
  onSearch,
  onQuickLog,
  bell,
  standing,
  account,
}: SidebarProps) {
  const [closed, setClosed] = useState<ZoneId[]>(loadClosed);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(closed));
    } catch {
      /* storage unavailable: state stays in memory */
    }
  }, [closed]);
  // Opening a page inside a folded group unfolds it.
  useEffect(() => {
    if (activeGroup) setClosed((prev) => (prev.includes(activeGroup) ? prev.filter((g) => g !== activeGroup) : prev));
  }, [activeGroup]);
  const toggle = (id: ZoneId) => setClosed((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const navRef = useRef<HTMLElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  useHoverGlide(navRef, glideRef);
  const shortcut = IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K';

  return (
    <div className="flex h-full w-64 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => onNavigate(NAV_DASHBOARD.id)}
          className={cx('flex min-w-0 flex-1 items-center gap-2.5 rounded-lg', FOCUS_RING)}
        >
          <AppLogo className="h-7 w-7 shrink-0 rounded-[22%] object-cover" />
          <span className="truncate text-sm font-semibold text-content-primary">Ascend</span>
        </button>
        <button
          type="button"
          onClick={onQuickLog}
          aria-label="Quick log"
          title="Quick log"
          className={cx('rounded-lg p-2 text-content-muted hover:bg-overlay-subtle hover:text-content-secondary', FOCUS_RING, TRANSITION)}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {bell}
        {account}
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onSearch}
          className={cx(
            'flex w-full items-center gap-2 rounded-lg border border-overlay-subtle px-3 py-1.5 text-sm text-content-muted hover:border-overlay-default hover:text-content-secondary',
            FOCUS_RING,
            TRANSITION
          )}
        >
          <Search size={15} aria-hidden="true" />
          <span className="flex-1 text-left">Go to…</span>
          <span className="kbd">{shortcut}</span>
        </button>
      </div>

      <nav ref={navRef} aria-label="Pages" className="relative isolate flex-1 overflow-y-auto px-3 pb-3">
        <NavItem
          icon={NAV_DASHBOARD.icon}
          label={NAV_DASHBOARD.label}
          active={currentView === NAV_DASHBOARD.id}
          onClick={() => onNavigate(NAV_DASHBOARD.id)}
          layout="trail"
        />
        {NAV_GROUPS.map((group) => {
          const open = !closed.includes(group.id);
          const listId = `nav-group-${group.id}`;
          const badge = group.id === 'play' ? partnerBadge : 0;
          return (
            <div key={group.id} className="mt-3">
              <NavSection
                label={group.label}
                expanded={open}
                onToggle={() => toggle(group.id)}
                controlsId={listId}
                badgeCount={badge}
              />
              {open && (
                <div id={listId} className="space-y-px">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      active={currentView === item.id}
                      onClick={() => onNavigate(item.id)}
                      layout="trail"
                      badgeCount={item.id === 'partner' ? partnerBadge : undefined}
                      status={statuses[item.id]}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <span ref={glideRef} aria-hidden="true" className="hover-glide rounded-lg" />
      </nav>

      <div className="border-t border-overlay-subtle p-4">{standing}</div>
    </div>
  );
}
