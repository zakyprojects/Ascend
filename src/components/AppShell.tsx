import { ReactNode, useCallback, useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LogIn, Plus } from 'lucide-react';
import {
  Button,
  Dialog,
  NavItem as NavItemPrimitive,
  Tabs,
} from '@/components/ui/primitives';
import {
  NAV_DASHBOARD,
  NAV_SETTINGS,
  NAV_HELP,
  NAV_GROUPS,
  DEFAULT_GROUP_VIEWS,
  getGroupForView,
  getViewLabel,
} from './nav/navConfig';
import { Sidebar } from './nav/Sidebar';
import { AccountMenu } from './nav/AccountMenu';
import { MobileZoneBar } from './nav/MobileZoneBar';
import { ZoneSheet } from './nav/ZoneSheet';
import { QuickLog } from './nav/QuickLog';
import { useNavShortcuts } from './nav/useNavShortcuts';
import { useSidebarCollapsed } from './nav/useSidebarCollapsed';
import { CommandPalette } from './nav/CommandPalette';
import { getNavStatuses } from '@/lib/navStatus';
import { prefersReducedMotion } from '@/lib/motion';
import { pageLinkProps } from '@/lib/pageLink';
import { RankChip } from './ui/RankChip';
import { getNewestPointsEntry } from '@/lib/leagues';
import { ViewEntrance } from './ViewEntrance';
import { AppStore } from '@/lib/store';
import { GuestLogoutWarningModal } from './ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from './ui/LogoutConfirmModal';
import { NotificationCenter } from './ui/NotificationCenter';
import { AppLogo } from './ui/AppLogo';
import { ThemeToggle } from './ui/ThemeToggle';
import type { View } from '@/lib/views';
import type { NavigationKind } from '@/lib/useViewRoute';
import { trustedNowMs } from '@/lib/clock';
import { FocusTimerChip } from './pfc/FocusTimerChip';
import { PageSwipeContext, usePageSwipe } from '@/lib/pageSwipe';

// Below lg the window scrolls; from lg up the shell is viewport-high and <main> scrolls.
const DESKTOP_QUERY = '(min-width: 1024px)';

// Phone page swipe order: each zone's page strip, zones in nav order (Dashboard, Settings and help
// pages are outside it). The page strip's container id switches it off where the strip is hidden.
const PAGE_SWIPE_CHAIN: View[] = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
const PAGE_STRIP_ID = 'zone-pages';

function readScroll(main: HTMLElement): number {
  return window.matchMedia(DESKTOP_QUERY).matches ? main.scrollTop : window.scrollY;
}

function writeScroll(main: HTMLElement, top: number): void {
  if (window.matchMedia(DESKTOP_QUERY).matches) main.scrollTo({ top, behavior: 'instant' });
  else window.scrollTo({ top, behavior: 'instant' });
}

export type { View } from '@/lib/views';

interface AppShellProps {
  currentView: View;
  /** How the current view was reached: back/forward restores its scroll, a new visit starts at the top. */
  navigationKind: NavigationKind;
  /** A page change still loading its page: the nav already highlights it and a progress bar runs. */
  pendingView?: View | null;
  /** `search` (optional, e.g. `?section=notifications`) rides along on the new page's address. */
  onViewChange: (view: View, search?: string) => void;
  store: AppStore;
  /** Absent in local-only mode (no Supabase): there is no sign-in to open. */
  onOpenAuth?: () => void;
  children: ReactNode;
}

export function AppShell({ currentView, navigationKind, pendingView = null, onViewChange, store, onOpenAuth, children }: AppShellProps) {
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const closeZoneSheet = useCallback(() => setZoneSheetOpen(false), []);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestLogoutWarningOpen, setGuestLogoutWarningOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  const [lastByGroup, setLastByGroup] = useState(DEFAULT_GROUP_VIEWS);
  const activeGroupId = getGroupForView(currentView);
  // What the nav marks as current: the page a tap is heading to, so the tap answers at once.
  const navView = pendingView ?? currentView;
  useEffect(() => { if (activeGroupId) setLastByGroup(prev => prev[activeGroupId] === currentView ? prev : { ...prev, [activeGroupId]: currentView }); }, [currentView, activeGroupId]);
  const activeGroup = NAV_GROUPS.find((g) => g.id === activeGroupId);
  // Derived once per data change (and at most once a minute for their time-of-day parts), not on
  // every shell render (a dialog opening, a sheet toggling).
  const minute = Math.floor(trustedNowMs() / 60_000);
  const { state: appState, isHabitDone, getLeagueData } = store;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `minute` refreshes the time-of-day status
  const navStatuses = useMemo(() => getNavStatuses(appState, isHabitDone), [appState, isHabitDone, minute]);

  useNavShortcuts({
    onPageIndex: (index) => {
      const item = (activeGroup ?? NAV_GROUPS[0]).items[index];
      if (item) goTo(item.id);
    },
  });

  // Scroll memory: each view's last position, recorded as the user scrolls (back/forward has
  // already switched the view by the time we could read the old one).
  const mainRef = useRef<HTMLElement>(null);
  const scrollByView = useRef(new Map<View, number>());
  const scrollOwnerRef = useRef(currentView);
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    // Also flags the scroll edge (index.css: header/main top fade once content passes under it).
    const record = () => {
      const top = readScroll(main);
      scrollByView.current.set(scrollOwnerRef.current, top);
      document.documentElement.toggleAttribute('data-scrolled', top > 4);
    };
    main.addEventListener('scroll', record, { passive: true });
    window.addEventListener('scroll', record, { passive: true });
    return () => {
      main.removeEventListener('scroll', record);
      window.removeEventListener('scroll', record);
    };
  }, []);
  // Phones: the header slides away while reading down and returns on any scroll up (Safari style).
  useEffect(() => {
    const root = document.documentElement;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      root.toggleAttribute('data-header-hidden', dy > 0 && y > 80 && !window.matchMedia(DESKTOP_QUERY).matches);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      root.removeAttribute('data-header-hidden');
    };
  }, []);
  // Before paint: a new visit opens at the top, back/forward returns to where the user was.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    scrollOwnerRef.current = currentView;
    const target = navigationKind === 'pop' ? scrollByView.current.get(currentView) ?? 0 : 0;
    writeScroll(main, target);
    document.documentElement.toggleAttribute('data-scrolled', target > 4);
    document.documentElement.removeAttribute('data-header-hidden');
    if (target === 0) return;
    // Content that grows a frame later (measured lists) can clamp the first attempt.
    const frame = requestAnimationFrame(() => {
      if (readScroll(main) < target) writeScroll(main, target);
    });
    return () => cancelAnimationFrame(frame);
  }, [currentView, navigationKind]);

  // iOS tab bar: choosing the page you are already on glides back to its top. Stable across
  // renders (reads the page from a ref), so the memoized nav below keeps its props.
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const goTo = useCallback(
    (view: View, search?: string) => {
      if (view !== currentViewRef.current) return onViewChange(view, search);
      const main = mainRef.current;
      if (!main) return;
      const behavior: ScrollBehavior = prefersReducedMotion() ? 'instant' : 'smooth';
      if (window.matchMedia(DESKTOP_QUERY).matches) main.scrollTo({ top: 0, behavior });
      else window.scrollTo({ top: 0, behavior });
    },
    [onViewChange]
  );
  const goDashboard = useCallback(() => goTo(NAV_DASHBOARD.id), [goTo]);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const pageSwipe = usePageSwipe(pageAreaRef, { chain: PAGE_SWIPE_CHAIN, current: currentView, stripId: PAGE_STRIP_ID, go: goTo });
  const openZone = useCallback(
    (zone: keyof typeof lastByGroup) => (activeGroupId === zone ? setZoneSheetOpen((v) => !v) : onViewChange(lastByGroup[zone])),
    [activeGroupId, lastByGroup, onViewChange]
  );

  useEffect(() => {
    document.title = currentView === 'dashboard' ? 'Ascend - Self-Improvement' : `${getViewLabel(currentView)} · Ascend`;
  }, [currentView]);

  const isDarkTheme = store.state.themePreference !== 'light';
  const currentUser = store.state.currentUser;
  const username = store.state.username;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `minute` follows the season clock
  const seasonPoints = useMemo(() => getLeagueData('ninetyDay').userPoints, [getLeagueData, minute]);
  // By timestamp: a sync pull can leave the stored ledger out of order (rank-up freshness check).
  const latestPointsTimestamp = useMemo(() => getNewestPointsEntry(appState.pointsHistory)?.timestamp, [appState.pointsHistory]);
  const userAvatar = currentUser?.avatar || '🧑';

  const handleLogoutClick = () => {
    if (currentUser?.isAnonymous) {
      setGuestLogoutWarningOpen(true);
    } else {
      setLogoutConfirmOpen(true);
    }
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await store.logout();
    } catch (err) {
      console.error('Logout error in AppShell:', err);
    } finally {
      setLogoutConfirmOpen(false);
      setIsLoggingOut(false);
    }
  };

  const handleGuestLogoutAnyway = async () => {
    setIsLoggingOut(true);
    try {
      if (await store.logoutGuest()) setGuestLogoutWarningOpen(false);
    } catch (err) {
      console.error('Guest logout error in AppShell:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const currentUsername = store.state.username || '';
  const currentUserId = store.state.currentUser?.id;
  const pendingIncomingInvitesCount = (store.state.partnerInvites || []).filter(
    (i) =>
      i.status === 'pending' &&
      (i.toUsername.toLowerCase() === currentUsername.toLowerCase() ||
        (currentUserId && i.toUserId === currentUserId))
  ).length;

  return (
    <div className="relative isolate flex-1 lg:min-h-0 bg-bg-900 flex lg:overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div aria-hidden="true" className="app-atmosphere" />
      {pendingView && <div aria-hidden="true" className="page-progress" />}
      {/* Desktop navigation: one column with every page, or its icon rail (nav/Sidebar). */}
      <aside className="relative z-sticky hidden lg:flex h-full glass border-r border-overlay-subtle shrink-0">
        <Sidebar
          currentView={navView}
          activeGroup={getGroupForView(navView)}
          statuses={navStatuses}
          partnerBadge={pendingIncomingInvitesCount}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onNavigate={goTo}
          onSearch={() => setPaletteOpen(true)}
          onQuickLog={() => setQuickLogOpen(true)}
          bell={currentUser ? <NotificationCenter store={store} onNavigate={goTo} compact align="sidebar" /> : null}
          standing={<RankChip seasonPoints={seasonPoints} latestEntryTimestamp={latestPointsTimestamp} />}
          renderAccount={(placement) => (
            <AccountMenu
              placement={placement}
              user={currentUser ? { name: username || 'You', avatar: userAvatar, isGuest: Boolean(currentUser.isAnonymous) } : null}
              settingsActive={currentView === NAV_SETTINGS.id}
              isDark={isDarkTheme}
              onToggleTheme={store.toggleThemePreference}
              onOpenSettings={() => goTo(NAV_SETTINGS.id)}
              currentView={currentView}
              onOpenView={goTo}
              onOpenAuth={onOpenAuth}
              onLogout={handleLogoutClick}
            />
          )}
        />
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-full lg:overflow-hidden">
        {/* Mobile header */}
        <header className="app-header lg:hidden glass border-b px-4 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AppLogo className="w-8 h-8 rounded-[22%] object-cover shrink-0" />
            <span className="font-display font-bold text-content-primary">Ascend</span>
            <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-lg badge-beta text-3xs font-semibold">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Quick log" onClick={() => setQuickLogOpen(true)}>
              <Plus size={20} aria-hidden="true" />
            </Button>
            {currentUser && <NotificationCenter store={store} onNavigate={goTo} compact />}
            {!currentUser && onOpenAuth && (
              <button
                onClick={onOpenAuth}
                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
              >
                <LogIn size={13} aria-hidden="true" />
                Sign in
              </button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Account menu"
              onClick={() => setAccountOpen(true)}
            >
              <span aria-hidden="true">{userAvatar}</span>
            </Button>
          </div>
        </header>

        {/* Main content. Below lg the window scrolls, so main must not be a scroll container there
            (the scroll-rise timeline would bind to it and never move); it only clips sideways. */}
        <main ref={mainRef} data-page-area className="relative flex-1 max-lg:overflow-x-clip lg:overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] lg:pb-0">
          {activeGroup && (
            <div id={PAGE_STRIP_ID} className="lg:hidden px-4 pt-3">
              <Tabs
                items={activeGroup.items.map((i) => ({
                  id: i.id,
                  label: i.label,
                  badge:
                    i.id === 'partner' && pendingIncomingInvitesCount > 0
                      ? pendingIncomingInvitesCount
                      : undefined,
                  status: navStatuses[i.id]?.tone,
                }))}
                value={navView}
                onChange={(id) => goTo(id as View)}
                variant="underline"
                size="sm"
                scrollable
                ariaLabel={`${activeGroup.label} pages`}
              />
            </div>
          )}
          {/* Page width: fills wide screens instead of a fixed narrow column (pages split into
              PageColumns from xl up); the cap stops lines growing past comfortable reading. */}
          <div ref={pageAreaRef} data-tab-swipe="" className="max-w-[88rem] mx-auto px-4 sm:px-6 xl:px-8 2xl:px-10 py-6 xl:py-8">
            <PageSwipeContext.Provider value={pageSwipe}>
              <ViewEntrance key={currentView}>
                {children}
              </ViewEntrance>
            </PageSwipeContext.Provider>
          </div>
        </main>

        <FocusTimerChip hidden={currentView === 'prefrontal'} onOpen={() => goTo('prefrontal')} />

        {/* Mobile navigation: floating zone bar; the zone on screen opens its sheet. */}
        <MobileZoneBar
          onDashboard={navView === NAV_DASHBOARD.id}
          activeZone={getGroupForView(navView)}
          playBadge={pendingIncomingInvitesCount}
          sheetOpen={zoneSheetOpen}
          zoneViews={lastByGroup}
          onGoDashboard={goDashboard}
          onZone={openZone}
        />
        <ZoneSheet
          open={zoneSheetOpen}
          group={activeGroup}
          currentView={navView}
          statuses={navStatuses}
          partnerBadge={pendingIncomingInvitesCount}
          onNavigate={goTo}
          onClose={closeZoneSheet}
        />
      </div>

      <GuestLogoutWarningModal
        open={guestLogoutWarningOpen}
        onClose={() => setGuestLogoutWarningOpen(false)}
        onSaveProgressFirst={() => onOpenAuth?.()}
        onLogoutAnyway={handleGuestLogoutAnyway}
        isLoggingOut={isLoggingOut}
      />

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        isLoggingOut={isLoggingOut}
      />

      <Dialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={currentUser ? username : 'Account'}
      >
        <div className="space-y-2">
          {currentUser && (
            <p className="text-xs font-medium text-content-muted">
              {currentUser.isAnonymous ? 'Guest account' : 'Signed in'}
            </p>
          )}
          {currentUser?.isAnonymous && onOpenAuth && (
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setAccountOpen(false);
                onOpenAuth();
              }}
            >
              Save progress
            </Button>
          )}
          {!currentUser && onOpenAuth && (
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setAccountOpen(false);
                onOpenAuth();
              }}
            >
              Sign in or register
            </Button>
          )}
          <NavItemPrimitive
            icon={NAV_SETTINGS.icon}
            label={NAV_SETTINGS.label}
            layout="row"
            active={currentView === 'settings'}
            {...pageLinkProps('settings', (view) => {
              setAccountOpen(false);
              onViewChange(view);
            })}
          />
          {NAV_HELP.map((entry) => (
            <NavItemPrimitive
              key={entry.id}
              icon={entry.icon}
              label={entry.label}
              layout="row"
              active={currentView === entry.id}
              {...pageLinkProps(entry.id, (view) => {
                setAccountOpen(false);
                onViewChange(view);
              })}
            />
          ))}
          <div className="flex items-center justify-between rounded-xl px-3 py-1">
            <span className="text-sm font-medium text-content-secondary">{isDarkTheme ? 'Dark theme' : 'Light theme'}</span>
            <ThemeToggle isDark={isDarkTheme} onToggle={store.toggleThemePreference} />
          </div>
          {currentUser && (
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setAccountOpen(false);
                handleLogoutClick();
              }}
            >
              Log out
            </Button>
          )}
        </div>
      </Dialog>

      <QuickLog
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        store={store}
        statuses={navStatuses}
        onNavigate={goTo}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        currentView={currentView}
        onViewChange={onViewChange}
      />
    </div>
  );
}
