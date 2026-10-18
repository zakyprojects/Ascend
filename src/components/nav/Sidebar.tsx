import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Search, type LucideIcon } from 'lucide-react';
import { NAV_DASHBOARD, NAV_GROUPS, type NavGroup } from './navConfig';
import { AppLogo } from '@/components/ui/AppLogo';
import { NavItem, NavSection } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import { useHoverGlide } from '@/lib/useHoverGlide';
import { pageLinkProps } from '@/lib/pageLink';
import type { View } from '@/lib/views';
import type { NavStatus, NavStatuses } from '@/lib/navStatus';

type ZoneId = NavGroup['id'];
export type AccountPlacement = 'below' | 'side';

const STORAGE_KEY = 'ascend_nav_closed_groups';

/** Sidebar widths. The collapse toggle is a small round button centred on the sidebar's right
 *  edge (half inside, half outside), so it rides the edge in both states. */
const EXPANDED_WIDTH = 'w-64';
const RAIL_WIDTH = 'w-14';
/** Width slide shared by the column, the panel fade and the rail fade (~220ms, emphasized ease). */
const SLIDE = 'duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

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
  /** Icon rail instead of the full column (desktop collapse; remembered by AppShell). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (view: View) => void;
  onSearch: () => void;
  onQuickLog: () => void;
  /** The notification bell. */
  bell: ReactNode;
  /** Season standing (RankChip). */
  standing: ReactNode;
  /** The account avatar and its menu: top row when expanded (menu below), rail foot when collapsed (menu beside). */
  renderAccount: (placement: AccountPlacement) => ReactNode;
}

interface Tip {
  label: string;
  hint?: string;
  left: number;
  top: number;
}

/**
 * Desktop navigation: one column (Linear/Notion style). Dashboard, then every group with all its
 * pages, each page one click away. Groups fold; which ones are folded is remembered.
 * Collapses to an icon rail; the collapse button never moves between the two states.
 */
export function Sidebar({
  currentView,
  activeGroup,
  statuses,
  partnerBadge,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onSearch,
  onQuickLog,
  bell,
  standing,
  renderAccount,
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
  const collapseShortcut = IS_APPLE_PLATFORM ? '⌘\\' : 'Ctrl \\';

  // The state that is not on screen stays mounted (so it can fade) but is inert: no focus, no clicks.
  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = collapsed;
    if (railRef.current) railRef.current.inert = !collapsed;
  }, [collapsed]);

  // Rail tooltips (and the toggle's): one floating label beside the hovered or focused control.
  // Portalled, because the column clips its overflow while its width slides.
  const [tip, setTip] = useState<Tip | null>(null);
  const hideTip = useCallback(() => setTip(null), []);
  const tipProps = (label: string, hint?: string) => {
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setTip({ label, hint, left: r.right + 10, top: r.top + r.height / 2 });
    };
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType !== 'touch' && show(e.currentTarget),
      onPointerLeave: hideTip,
      onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(e.currentTarget),
      onBlur: hideTip,
    };
  };
  useEffect(hideTip, [collapsed, currentView, hideTip]);

  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const railItem = (icon: LucideIcon, label: string, view: View, status?: NavStatus, badge = 0) => (
    <RailButton
      key={view}
      icon={icon}
      label={label}
      active={currentView === view}
      named={collapsed}
      status={status}
      badge={badge}
      {...pageLinkProps(view, onNavigate)}
      {...tipProps(label, status?.meta ?? status?.label)}
    />
  );

  return (
    <div className={cx('relative h-full shrink-0 transition-[width]', SLIDE, collapsed ? RAIL_WIDTH : EXPANDED_WIDTH)}>
      {/* The one toggle, shared by both states: centred on the edge, level with the top row. Outside the
          clipping box below so its outer half shows. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        aria-controls="app-sidebar"
        aria-keyshortcuts={IS_APPLE_PLATFORM ? 'Meta+\\' : 'Control+\\'}
        className={cx(
          'absolute right-[-0.5px] top-5 z-10 flex h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-overlay-subtle bg-bg-800 text-content-muted shadow-sm hover:bg-bg-700 hover:text-content-primary',
          FOCUS_RING,
          TRANSITION
        )}
        {...tipProps(toggleLabel, collapseShortcut)}
      >
        {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
      </button>

      {/* Clips both states while the width slides. */}
      <div className="absolute inset-0 overflow-hidden">

      {/* Expanded column. Fixed width, so its contents never reflow while the edge slides over them. */}
      <div
        ref={panelRef}
        id="app-sidebar"
        aria-hidden={collapsed || undefined}
        className={cx(
          'absolute inset-y-0 left-0 flex flex-col transition-[opacity,visibility]',
          EXPANDED_WIDTH,
          SLIDE,
          collapsed ? 'invisible opacity-0' : 'visible opacity-100'
        )}
      >
        <div className="flex items-center gap-0.5 pb-3 pl-3 pr-5 pt-4">
          <a
            {...pageLinkProps(NAV_DASHBOARD.id, onNavigate)}
            className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-lg pl-0.5', FOCUS_RING)}
          >
            <AppLogo variant="small" className="h-7 w-7 shrink-0" />
            <span className="truncate text-sm font-semibold text-content-primary">Ascend</span>
          </a>
          <button
            type="button"
            onClick={onQuickLog}
            aria-label="Quick log"
            title="Quick log"
            className={cx('rounded-lg p-2 text-content-muted hover:bg-overlay-subtle hover:text-content-secondary', FOCUS_RING, TRANSITION)}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onSearch}
            aria-label="Go to"
            aria-keyshortcuts={IS_APPLE_PLATFORM ? 'Meta+K' : 'Control+K'}
            title={`Go to (${shortcut})`}
            className={cx('rounded-lg p-2 text-content-muted hover:bg-overlay-subtle hover:text-content-secondary', FOCUS_RING, TRANSITION)}
          >
            <Search size={16} aria-hidden="true" />
          </button>
          {bell}
          {renderAccount('below')}
        </div>

        <nav ref={navRef} aria-label="Pages" className="relative isolate flex-1 overflow-y-auto px-3 pb-3">
          {/* While collapsed nothing here is active, so only the rail carries the named nav pill. */}
          <NavItem
            icon={NAV_DASHBOARD.icon}
            label={NAV_DASHBOARD.label}
            active={!collapsed && currentView === NAV_DASHBOARD.id}
            {...pageLinkProps(NAV_DASHBOARD.id, onNavigate)}
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
                        active={!collapsed && currentView === item.id}
                        {...pageLinkProps(item.id, onNavigate)}
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

      {/* Collapsed rail: icons only, each with a tooltip; today's status as a small dot. */}
      <div
        ref={railRef}
        aria-hidden={!collapsed || undefined}
        className={cx(
          'absolute inset-y-0 left-0 flex flex-col items-center transition-[opacity,visibility]',
          RAIL_WIDTH,
          SLIDE,
          collapsed ? 'visible opacity-100' : 'invisible opacity-0'
        )}
      >
        <div className="flex flex-col items-center gap-1 pb-2 pt-4">
          <RailButton icon={Plus} label="Quick log" onClick={onQuickLog} {...tipProps('Quick log')} />
          <RailButton icon={Search} label="Go to…" onClick={onSearch} {...tipProps('Go to…', shortcut)} />
          {bell}
        </div>
        <div aria-hidden="true" className="h-px w-6 shrink-0 bg-overlay-subtle" />
        <nav
          aria-label="Pages"
          onScroll={hideTip}
          className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {railItem(NAV_DASHBOARD.icon, NAV_DASHBOARD.label, NAV_DASHBOARD.id)}
          {NAV_GROUPS.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className="flex flex-col items-center gap-0.5">
              <div aria-hidden="true" className="my-1.5 h-px w-4 bg-overlay-subtle" />
              {group.items.map((item) =>
                railItem(item.icon, item.label, item.id, statuses[item.id], item.id === 'partner' ? partnerBadge : 0)
              )}
            </div>
          ))}
        </nav>
        <div className="flex w-full justify-center border-t border-overlay-subtle py-3">{renderAccount('side')}</div>
      </div>
      </div>

      {tip &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: tip.left, top: tip.top }}
            className="pointer-events-none fixed z-popover flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-overlay-default bg-bg-800 px-2.5 py-1.5 text-xs font-medium text-content-primary shadow-md"
          >
            {tip.label}
            {tip.hint && <span className="text-content-muted">{tip.hint}</span>}
          </div>,
          document.body
        )}
    </div>
  );
}

interface RailButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** A page link (`<a href>`) rather than an action button. */
  href?: string;
  active?: boolean;
  /** Carries the named nav pill (page-change glide); only the visible rail does. */
  named?: boolean;
  status?: NavStatus;
  badge?: number;
  onPointerEnter?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave?: () => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
}

function RailButton({ icon: Icon, label, onClick, href, active = false, named = false, status, badge = 0, ...tipHandlers }: RailButtonProps) {
  const spoken = [label, status?.label, badge > 0 ? `${badge} new` : null].filter(Boolean).join(', ');
  const Root: React.ElementType = href ? 'a' : 'button';
  return (
    <Root
      {...(href ? { href } : { type: 'button' })}
      onClick={onClick}
      aria-label={spoken}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        active ? 'text-brand-text' : 'text-content-muted hover:bg-overlay-subtle hover:text-content-secondary',
        FOCUS_RING,
        TRANSITION
      )}
      {...tipHandlers}
    >
      {active && (
        <span aria-hidden="true" {...(named ? { 'data-nav-pill': '' } : {})} className="absolute inset-0 rounded-lg bg-primary-500/15" />
      )}
      <Icon size={16} aria-hidden="true" className="relative" />
      {badge > 0 ? (
        <span aria-hidden="true" className="absolute right-[3px] top-[3px] h-2 w-2 rounded-full border border-bg-900 bg-rose-500" />
      ) : status ? (
        <span
          aria-hidden="true"
          className={cx(
            'absolute right-[3px] top-[3px] h-1.5 w-1.5 rounded-full',
            status.tone === 'done' ? 'bg-brand-text' : status.tone === 'risk' ? 'bg-warning' : 'border border-content-muted'
          )}
        />
      ) : null}
    </Root>
  );
}
