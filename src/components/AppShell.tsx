import { ReactNode, useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  NAV_GROUPS,
  DEFAULT_GROUP_VIEWS,
  getGroupForView,
  getViewLabel,
  type NavGroup,
} from './nav/navConfig';
import { useNavPanel } from './nav/useNavPanel';
import { ZoneRail } from './nav/ZoneRail';
import { ZonePanel } from './nav/ZonePanel';
import { AccountMenu } from './nav/AccountMenu';
import { MobileZoneBar } from './nav/MobileZoneBar';
import { ZoneSheet } from './nav/ZoneSheet';
import { QuickLog } from './nav/QuickLog';
import { useNavShortcuts } from './nav/useNavShortcuts';

/** Hover peek: rest this long on a zone before its pages show; they linger this long after leaving. */
const PEEK_OPEN_MS = 140;
const PEEK_CLOSE_MS = 220;
import { CommandPalette } from './nav/CommandPalette';
import { getNavStatuses, getUpNext } from '@/lib/navStatus';
import { prefersReducedMotion } from '@/lib/motion';
import { RankChip } from './ui/RankChip';
import { ViewEntrance } from './ViewEntrance';
import { AppStore } from '@/lib/store';
import { GuestLogoutWarningModal } from './ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from './ui/LogoutConfirmModal';
import { NotificationCenter } from './ui/NotificationCenter';
import { AppLogo } from './ui/AppLogo';
import { ThemeToggle } from './ui/ThemeToggle';
import type { View } from '@/lib/views';
import type { NavigationKind } from '@/lib/useViewRoute';

// Below lg the window scrolls; from lg up the shell is viewport-high and <main> scrolls.
const DESKTOP_QUERY = '(min-width: 1024px)';

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
  onViewChange: (view: View) => void;
  store: AppStore;
  onOpenAuthModal: () => void;
  children: ReactNode;
}

export function AppShell({ currentView, navigationKind, onViewChange, store, onOpenAuthModal, children }: AppShellProps) {
  const { collapsed: panelCollapsed, setCollapsed: setPanelCollapsed, toggle: togglePanel } = useNavPanel();
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const closeZoneSheet = useCallback(() => setZoneSheetOpen(false), []);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestLogoutWarningOpen, setGuestLogoutWarningOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [lastByGroup, setLastByGroup] = useState(DEFAULT_GROUP_VIEWS);
  const activeGroupId = getGroupForView(currentView);
  useEffect(() => { if (activeGroupId) setLastByGroup(prev => prev[activeGroupId] === currentView ? prev : { ...prev, [activeGroupId]: currentView }); }, [currentView, activeGroupId]);
  // The desktop panel shows the current page's zone; on Dashboard/Settings it keeps the last one.
  const [panelZone, setPanelZone] = useState(activeGroupId ?? NAV_GROUPS[0].id);
  useEffect(() => { if (activeGroupId) setPanelZone(activeGroupId); }, [activeGroupId]);

  const activeGroup = NAV_GROUPS.find((g) => g.id === activeGroupId);
  const panelGroup = NAV_GROUPS.find((g) => g.id === panelZone) ?? NAV_GROUPS[0];
  const navStatuses = getNavStatuses(store.state, store.isHabitDone);

  // Hover peek (desktop, panel hidden): resting on a zone shows its pages floating over the page;
  // they stay while the pointer is on the rail or the peek, and go a moment after it leaves both.
  const [peekZone, setPeekZone] = useState<NavGroup['id'] | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peekGroup = peekZone ? NAV_GROUPS.find((group) => group.id === peekZone) ?? null : null;
  const onZoneHover = (zone: NavGroup['id'] | null) => {
    clearTimeout(peekTimer.current);
    if (!panelCollapsed) return;
    if (zone) peekTimer.current = setTimeout(() => setPeekZone(zone), peekZone ? 0 : PEEK_OPEN_MS);
    else peekTimer.current = setTimeout(() => setPeekZone(null), PEEK_CLOSE_MS);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  useEffect(() => {
    if (!panelCollapsed) setPeekZone(null);
  }, [panelCollapsed]);
  useEffect(() => {
    if (!peekZone) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setPeekZone(null);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [peekZone]);

  useNavShortcuts({
    onDashboard: () => goTo(NAV_DASHBOARD.id),
    onSettings: () => goTo(NAV_SETTINGS.id),
    onZone: (zone) => {
      setPanelZone(zone);
      setPanelCollapsed(false);
      onViewChange(lastByGroup[zone]);
    },
    onPageIndex: (index) => {
      const item = panelGroup.items[index];
      if (item) goTo(item.id);
    },
  });
  const upNext = getUpNext(navStatuses);

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

  // iOS tab bar: choosing the page you are already on glides back to its top.
  const goTo = (view: View) => {
    if (view !== currentView) return onViewChange(view);
    const main = mainRef.current;
    if (!main) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'instant' : 'smooth';
    if (window.matchMedia(DESKTOP_QUERY).matches) main.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  };

  useEffect(() => {
    document.title = currentView === 'dashboard' ? 'Ascend - Self-Improvement' : `${getViewLabel(currentView)} · Ascend`;
  }, [currentView]);

  const isDarkTheme = store.state.themePreference !== 'light';
  const currentUser = store.state.currentUser;
  const username = store.state.username;
  const totalPoints = store.state.totalPoints;
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;
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
      await store.logout();
    } catch (err) {
      console.error('Guest logout error in AppShell:', err);
    } finally {
      setGuestLogoutWarningOpen(false);
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
    <div className="relative isolate min-h-screen lg:h-dvh bg-bg-900 flex lg:overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Desktop navigation (Basecamp): zone rail + the zone's pages. One click on a zone goes
          straight to the page last open there (Discord/Slack style) and shows its siblings in the
          panel; clicking the zone on screen again hides the panel (as do [ and its own button). */}
      <aside className="relative z-sticky hidden lg:flex h-full glass border-r border-overlay-subtle shrink-0">
        <ZoneRail
          onDashboard={currentView === NAV_DASHBOARD.id}
          activeZone={activeGroupId}
          panelZone={panelZone}
          panelCollapsed={panelCollapsed}
          seasonPoints={seasonPoints}
          playBadge={pendingIncomingInvitesCount}
          onGoDashboard={() => goTo(NAV_DASHBOARD.id)}
          onZoneHover={onZoneHover}
          onZone={(zone) => {
            setPeekZone(null);
            // The zone already on screen with its panel open: a second click hides the panel.
            if (activeGroupId === zone && panelZone === zone && !panelCollapsed) {
              setPanelCollapsed(true);
              return;
            }
            setPanelZone(zone);
            setPanelCollapsed(false);
            if (activeGroupId !== zone) onViewChange(lastByGroup[zone]);
          }}
          onExpandPanel={togglePanel}
          onSearch={() => setPaletteOpen(true)}
          onQuickLog={() => setQuickLogOpen(true)}
          bell={currentUser ? <NotificationCenter store={store} compact align="sidebar" /> : null}
          account={
            <AccountMenu
              user={currentUser ? { name: username || 'You', avatar: userAvatar, isGuest: Boolean(currentUser.isAnonymous) } : null}
              settingsActive={currentView === NAV_SETTINGS.id}
              isDark={isDarkTheme}
              onToggleTheme={store.toggleThemePreference}
              onOpenSettings={() => goTo(NAV_SETTINGS.id)}
              onOpenAuth={onOpenAuthModal}
              onLogout={handleLogoutClick}
            />
          }
        />
        {/* Hidden rather than unmounted when collapsed: RankChip inside raises the rank-up toast. */}
        <div className={panelCollapsed ? 'hidden' : 'contents'}>
          <ZonePanel
            group={panelGroup}
            currentView={currentView}
            partnerBadge={pendingIncomingInvitesCount}
            statuses={navStatuses}
            upNext={upNext}
            onNavigate={goTo}
            onCollapse={togglePanel}
            footer={<RankChip seasonPoints={seasonPoints} latestEntryTimestamp={store.state.pointsHistory?.[0]?.timestamp} />}
          />
        </div>
        {peekGroup && (
          <div
            onPointerEnter={() => clearTimeout(peekTimer.current)}
            onPointerLeave={() => onZoneHover(null)}
            className="zone-peek absolute inset-y-0 left-full"
          >
            <ZonePanel
              group={peekGroup}
              currentView={currentView}
              partnerBadge={pendingIncomingInvitesCount}
              statuses={navStatuses}
              upNext={upNext}
              onNavigate={(view) => {
                setPeekZone(null);
                goTo(view);
              }}
              className="border-r border-overlay-default bg-bg-800 shadow-2xl"
            />
          </div>
        )}
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-full lg:overflow-hidden">
        {/* Mobile header */}
        <header className="app-header lg:hidden glass border-b px-4 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AppLogo className="w-8 h-8 rounded-[22%] object-cover shrink-0" />
            <span className="font-display font-bold text-content-primary">Ascend</span>
            <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-neutral text-3xs font-bold uppercase tracking-wider">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Quick log" onClick={() => setQuickLogOpen(true)}>
              <Plus size={20} aria-hidden="true" />
            </Button>
            {currentUser && <NotificationCenter store={store} compact />}
            {!currentUser && (
              <button
                onClick={onOpenAuthModal}
                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
              >
                <LogIn size={13} />
                Sign In
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
            <div className="lg:hidden px-4 pt-3">
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
                value={currentView}
                onChange={(id) => goTo(id as View)}
                variant="underline"
                size="sm"
                scrollable
                pageTabs
                ariaLabel={`${activeGroup.label} pages`}
              />
            </div>
          )}
          {/* Page width: fills wide screens instead of a fixed narrow column (pages split into
              PageColumns from xl up); the cap stops lines growing past comfortable reading. */}
          <div className="max-w-[88rem] mx-auto px-4 sm:px-6 xl:px-8 2xl:px-10 py-6 xl:py-8">
            <ViewEntrance key={currentView}>
              {children}
            </ViewEntrance>
          </div>
        </main>

        {/* Mobile navigation: floating zone bar; the zone on screen opens its sheet. */}
        <MobileZoneBar
          onDashboard={currentView === NAV_DASHBOARD.id}
          activeZone={activeGroupId}
          playBadge={pendingIncomingInvitesCount}
          sheetOpen={zoneSheetOpen}
          onGoDashboard={() => goTo(NAV_DASHBOARD.id)}
          onZone={(zone) => (activeGroupId === zone ? setZoneSheetOpen((v) => !v) : onViewChange(lastByGroup[zone]))}
        />
        <ZoneSheet
          open={zoneSheetOpen}
          group={activeGroup}
          currentView={currentView}
          statuses={navStatuses}
          upNext={upNext}
          partnerBadge={pendingIncomingInvitesCount}
          onNavigate={goTo}
          onClose={closeZoneSheet}
        />
      </div>

      <GuestLogoutWarningModal
        open={guestLogoutWarningOpen}
        onClose={() => setGuestLogoutWarningOpen(false)}
        onSaveProgressFirst={onOpenAuthModal}
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
            <p
              className={`text-xs font-medium ${currentUser.isAnonymous ? 'text-content-muted' : 'text-brand-text'}`}
            >
              {currentUser.isAnonymous ? 'Guest Account' : 'Account Active'}
            </p>
          )}
          {currentUser?.isAnonymous && (
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setAccountOpen(false);
                onOpenAuthModal();
              }}
            >
              Save Progress — Create Account
            </Button>
          )}
          {!currentUser && (
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setAccountOpen(false);
                onOpenAuthModal();
              }}
            >
              Sign In / Register
            </Button>
          )}
          <NavItemPrimitive
            icon={NAV_SETTINGS.icon}
            label={NAV_SETTINGS.label}
            layout="row"
            active={currentView === 'settings'}
            onClick={() => {
              setAccountOpen(false);
              onViewChange('settings');
            }}
          />
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
              Log Out
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
