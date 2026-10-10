import { ReactNode, useState, useEffect, useRef } from 'react';
import {
  LogIn,
  LogOut,
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
} from './nav/navConfig';
import { useSidebarGroups } from './nav/useSidebarGroups';
import { RankChip } from './ui/RankChip';
import { ViewEntrance } from './ViewEntrance';
import { AppStore } from '@/lib/store';
import { GuestLogoutWarningModal } from './ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from './ui/LogoutConfirmModal';
import { NotificationCenter } from './ui/NotificationCenter';

export type View =
  | 'dashboard'
  | 'habits'
  | 'time-tracker'
  | 'weekly-goals'
  | 'projects-goals'
  | 'journal'
  | 'exercise'
  | 'reading'
  | 'books'
  | 'skills'
  | 'bad-habits'
  | 'recovery'
  | 'prefrontal'
  | 'neuroplasticity'
  | 'lessons'
  | 'plans'
  | 'partner'
  | 'leagues'
  | 'tiers'
  | 'settings';

interface AppShellProps {
  currentView: View;
  onViewChange: (view: View) => void;
  store: AppStore;
  onOpenAuthModal: () => void;
  children: ReactNode;
}

export function AppShell({ currentView, onViewChange, store, onOpenAuthModal, children }: AppShellProps) {
  const { isOpen, toggle, open } = useSidebarGroups();
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestLogoutWarningOpen, setGuestLogoutWarningOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [lastByGroup, setLastByGroup] = useState(DEFAULT_GROUP_VIEWS);
  const activeGroupId = getGroupForView(currentView);
  useEffect(() => { if (activeGroupId) setLastByGroup(prev => prev[activeGroupId] === currentView ? prev : { ...prev, [activeGroupId]: currentView }); }, [currentView, activeGroupId]);
  useEffect(() => { if (activeGroupId) open(activeGroupId); }, [activeGroupId, open]);

  const activeGroup = NAV_GROUPS.find((g) => g.id === activeGroupId);

  // Views that already played their entrance this session. Revisits render
  // instantly: replaying on every tab switch would make navigation feel slow.
  const enteredViewsRef = useRef<Set<View>>(new Set());
  useEffect(() => {
    enteredViewsRef.current.add(currentView);
  }, [currentView]);

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
    <div className="min-h-screen md:h-screen bg-bg-900 flex md:overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-full glass border-r border-overlay-subtle shrink-0 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt="Ascend Logo"
              className="w-9 h-9 rounded-xl object-cover shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="font-display font-bold text-content-primary text-lg leading-none">Ascend</div>
                <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-beta text-[9px] font-bold uppercase tracking-wider">
                  Beta
                </span>
              </div>
            </div>
          </div>
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
                  <p className={`text-[10px] font-medium truncate ${currentUser.isAnonymous ? 'text-warning-text' : 'text-brand-text'}`}>
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
                  }`}
                >
                  <Settings size={15} />
                </button>
                <button
                  onClick={handleLogoutClick}
                  title="Log Out"
                  className="p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-all"
                >
                  <LogOut size={15} />
                </button>
              </div>

              {currentUser.isAnonymous && (
                <button
                  onClick={onOpenAuthModal}
                  className="w-full py-1.5 px-2 bg-gradient-to-r from-primary-500/20 to-primary-600/20 hover:from-primary-500/30 hover:to-primary-600/30 border border-primary-500/30 text-brand-text font-semibold text-[11px] rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Save Progress — Create Account</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="w-full card p-3 bg-gradient-to-r from-primary-500/20 to-primary-600/20 hover:from-primary-500/30 hover:to-primary-600/30 border border-primary-500/30 flex items-center justify-center gap-2 text-brand-text font-medium text-xs rounded-xl transition-all"
            >
              <LogIn size={16} />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
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
        </nav>

        <div className="p-3 border-t border-overlay-subtle">
          <RankChip
            seasonPoints={seasonPoints}
            latestEntryTimestamp={store.state.pointsHistory?.[0]?.timestamp}
          />
        </div>
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 md:h-full md:overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden glass border-b border-overlay-subtle px-4 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <img
              src="/favicon.svg"
              alt="Ascend Logo"
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
            <span className="font-display font-bold text-content-primary">Ascend</span>
            <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-beta text-[9px] font-bold uppercase tracking-wider">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
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
        <main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0">
          {activeGroup && (
            <div className="md:hidden px-4 pt-3">
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
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <ViewEntrance key={currentView} animate={!enteredViewsRef.current.has(currentView)}>
              {children}
            </ViewEntrance>
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-overlay-subtle pt-1.5 pb-[calc(0.375rem_+_env(safe-area-inset-bottom))] pl-[calc(0.25rem_+_env(safe-area-inset-left))] pr-[calc(0.25rem_+_env(safe-area-inset-right))] z-30">
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
    </div>
  );
}
