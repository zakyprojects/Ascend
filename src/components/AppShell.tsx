import { ReactNode, useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  LogIn,
  LogOut,
  Search,
  Settings,
} from 'lucide-react';
import {
  Button,
  Dialog,
  NavItem as NavItemPrimitive,
  NavSection,
  Tabs,
} from '@/components/ui/primitives';
import {
  NAV_DASHBOARD,
  NAV_SETTINGS,
  NAV_GROUPS,
  DEFAULT_GROUP_VIEWS,
  getGroupForView,
  getViewLabel,
} from './nav/navConfig';
import { useSidebarGroups } from './nav/useSidebarGroups';
import { CommandPalette } from './nav/CommandPalette';
import { IS_APPLE_PLATFORM } from '@/lib/platform';
import { useHoverGlide } from '@/lib/useHoverGlide';
import { RankChip } from './ui/RankChip';
import { ViewEntrance } from './ViewEntrance';
import { AppStore } from '@/lib/store';
import { GuestLogoutWarningModal } from './ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from './ui/LogoutConfirmModal';
import { NotificationCenter } from './ui/NotificationCenter';
import { AppLogo } from './ui/AppLogo';
import { AscentBackdrop } from './ui/AscentBackdrop';
import { ThemeToggle } from './ui/ThemeToggle';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
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
  const { isOpen, toggle, open } = useSidebarGroups();
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestLogoutWarningOpen, setGuestLogoutWarningOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [lastByGroup, setLastByGroup] = useState(DEFAULT_GROUP_VIEWS);
  const activeGroupId = getGroupForView(currentView);
  useEffect(() => { if (activeGroupId) setLastByGroup(prev => prev[activeGroupId] === currentView ? prev : { ...prev, [activeGroupId]: currentView }); }, [currentView, activeGroupId]);
  useEffect(() => { if (activeGroupId) open(activeGroupId); }, [activeGroupId, open]);

  const activeGroup = NAV_GROUPS.find((g) => g.id === activeGroupId);

  // Scroll memory: each view's last position, recorded as the user scrolls (back/forward has
  // already switched the view by the time we could read the old one).
  const mainRef = useRef<HTMLElement>(null);
  const sidebarNavRef = useRef<HTMLElement>(null);
  const sidebarGlideRef = useRef<HTMLSpanElement>(null);
  useHoverGlide(sidebarNavRef, sidebarGlideRef);
  const scrollByView = useRef(new Map<View, number>());
  const scrollOwnerRef = useRef(currentView);
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const record = () => scrollByView.current.set(scrollOwnerRef.current, readScroll(main));
    main.addEventListener('scroll', record, { passive: true });
    window.addEventListener('scroll', record, { passive: true });
    return () => {
      main.removeEventListener('scroll', record);
      window.removeEventListener('scroll', record);
    };
  }, []);
  // Before paint: a new visit opens at the top, back/forward returns to where the user was.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    scrollOwnerRef.current = currentView;
    const target = navigationKind === 'pop' ? scrollByView.current.get(currentView) ?? 0 : 0;
    writeScroll(main, target);
    if (target === 0) return;
    // Content that grows a frame later (measured lists) can clamp the first attempt.
    const frame = requestAnimationFrame(() => {
      if (readScroll(main) < target) writeScroll(main, target);
    });
    return () => cancelAnimationFrame(frame);
  }, [currentView, navigationKind]);

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
      <div aria-hidden="true" className="app-atmosphere">
        <AscentBackdrop />
      </div>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 h-full glass border-r border-overlay-subtle shrink-0 overflow-y-auto">
        <div className="p-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <AppLogo className="w-9 h-9 rounded-[22%] object-cover shrink-0" />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="font-display font-bold text-content-primary text-lg leading-none">Ascend</div>
                <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-beta text-3xs font-bold uppercase tracking-wider">
                  Beta
                </span>
              </div>
            </div>
          </div>
          <ThemeToggle isDark={isDarkTheme} onToggle={store.toggleThemePreference} />
        </div>

        {/* User Account / Login Card in Sidebar */}
        <div className="px-3 mb-4">
          {currentUser ? (
            <div className="card p-3 bg-bg-800/80 border border-overlay-default space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-lg shrink-0">
                  {userAvatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-content-secondary truncate">{username}</p>
                  <p className={`text-2xs font-medium truncate ${currentUser.isAnonymous ? 'text-warning-text' : 'text-brand-text'}`}>
                    {currentUser.isAnonymous ? 'Guest Account' : 'Account Active'}
                  </p>
                </div>
                <NotificationCenter store={store} compact align="sidebar" />
                <button
                  onClick={() => onViewChange('settings')}
                  title="Settings & Preferences"
                  className={`p-1.5 rounded-lg transition-all ${
                    currentView === 'settings'
                      ? 'bg-primary-500/20 text-brand-text border border-primary-500/30'
                      : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
                  } ${TAP_TARGET_Y}`}
                >
                  <Settings size={15} />
                </button>
                <button
                  onClick={handleLogoutClick}
                  title="Log Out"
                  className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-all ${TAP_TARGET_Y}`}
                >
                  <LogOut size={15} />
                </button>
              </div>

              {currentUser.isAnonymous && (
                <button
                  onClick={onOpenAuthModal}
                  className="w-full py-1.5 px-2 bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/30 text-brand-text font-semibold text-micro rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Save Progress — Create Account</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="w-full card p-3 bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/30 flex items-center justify-center gap-2 text-brand-text font-medium text-xs rounded-xl transition-all"
            >
              <LogIn size={16} />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts={IS_APPLE_PLATFORM ? 'Meta+K' : 'Control+K'}
            className="w-full flex items-center gap-2 rounded-xl border border-overlay-subtle bg-bg-800/60 px-3 py-2 text-xs text-content-muted hover:text-content-secondary hover:border-overlay-default transition-colors"
          >
            <Search size={14} aria-hidden="true" />
            <span className="flex-1 text-left">Go to…</span>
            <span className="inline-flex gap-0.5" aria-hidden="true">
              <kbd className="kbd">{IS_APPLE_PLATFORM ? '⌘' : 'Ctrl'}</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>
        </div>

        <nav ref={sidebarNavRef} className="relative isolate flex-1 px-3 space-y-1 overflow-y-auto">
          <NavItemPrimitive
            icon={NAV_DASHBOARD.icon}
            label={NAV_DASHBOARD.label}
            active={currentView === NAV_DASHBOARD.id}
            onClick={() => onViewChange(NAV_DASHBOARD.id)}
            layout="row"
            density="compact"
          />
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
              <NavSection
                label={group.label}
                expanded={isOpen(group.id)}
                onToggle={() => toggle(group.id)}
                badgeCount={group.id === 'play' ? pendingIncomingInvitesCount : undefined}
                controlsId={`nav-group-${group.id}`}
              />
              {isOpen(group.id) && (
                <div id={`nav-group-${group.id}`} className="space-y-1">
                  {group.items.map((item) => (
                    <NavItemPrimitive
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      active={currentView === item.id}
                      onClick={() => onViewChange(item.id)}
                      layout="row"
                      density="compact"
                      badgeCount={item.id === 'partner' ? pendingIncomingInvitesCount : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-overlay-subtle pt-2 mt-2">
            <NavItemPrimitive
              icon={NAV_SETTINGS.icon}
              label={NAV_SETTINGS.label}
              active={currentView === NAV_SETTINGS.id}
              onClick={() => onViewChange(NAV_SETTINGS.id)}
              layout="row"
              density="compact"
            />
          </div>
          <span ref={sidebarGlideRef} aria-hidden="true" className="hover-glide rounded-xl" />
        </nav>

        <div className="p-3 border-t border-overlay-subtle">
          <RankChip
            seasonPoints={seasonPoints}
            latestEntryTimestamp={store.state.pointsHistory?.[0]?.timestamp}
          />
        </div>
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-full lg:overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden glass border-b border-overlay-subtle px-4 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AppLogo className="w-8 h-8 rounded-[22%] object-cover shrink-0" />
            <span className="font-display font-bold text-content-primary">Ascend</span>
            <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-beta text-3xs font-bold uppercase tracking-wider">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDarkTheme} onToggle={store.toggleThemePreference} />
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

        {/* Main content */}
        <main ref={mainRef} data-page-area className="relative flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] lg:pb-0">
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
                }))}
                value={currentView}
                onChange={(id) => onViewChange(id as View)}
                variant="underline"
                size="sm"
                scrollable
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

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-overlay-subtle pt-1.5 pb-[calc(0.375rem_+_env(safe-area-inset-bottom))] pl-[calc(0.25rem_+_env(safe-area-inset-left))] pr-[calc(0.25rem_+_env(safe-area-inset-right))] z-30">
          <div className="grid grid-cols-5">
            <NavItemPrimitive
              icon={NAV_DASHBOARD.icon}
              label={NAV_DASHBOARD.label}
              active={currentView === 'dashboard'}
              onClick={() => onViewChange('dashboard')}
              layout="stack"
            />
            {NAV_GROUPS.map((group) => (
              <NavItemPrimitive
                key={group.id}
                icon={group.icon}
                label={group.label}
                active={activeGroupId === group.id}
                onClick={() => onViewChange(lastByGroup[group.id])}
                layout="stack"
                badgeCount={group.id === 'play' ? pendingIncomingInvitesCount : undefined}
              />
            ))}
          </div>
        </nav>
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
              className={`text-xs font-medium ${currentUser.isAnonymous ? 'text-warning-text' : 'text-brand-text'}`}
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

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        currentView={currentView}
        onViewChange={onViewChange}
      />
    </div>
  );
}
