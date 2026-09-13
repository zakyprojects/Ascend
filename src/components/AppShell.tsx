import { ReactNode, useState } from 'react';
import { getSeasonLabel } from '@/lib/leagues';
import {
  LayoutDashboard,
  CheckSquare,
  BookOpen,
  Award,
  Trophy,
  GraduationCap,
  Brain,
  X,
  LogIn,
  LogOut,
  Activity,
  Zap,
  ShieldAlert,
  HeartPulse,
  BrainCircuit,
  Compass,
  Users,
  BookMarked,
  Settings,
  Target,
  FolderKanban,
  Clock,
} from 'lucide-react';
import { TierBadge } from './ui/TierBadge';
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

interface NavItem {
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
  badgeCount?: number;
}

interface AppShellProps {
  currentView: View;
  onViewChange: (view: View) => void;
  store: AppStore;
  onOpenAuthModal: () => void;
  children: ReactNode;
}

export function AppShell({ currentView, onViewChange, store, onOpenAuthModal, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guestLogoutWarningOpen, setGuestLogoutWarningOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      setLogoutConfirmOpen(false);
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

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'habits', label: 'Habits', icon: CheckSquare },
    { id: 'weekly-goals', label: 'Weekly Goals', icon: Target },
    { id: 'projects-goals', label: 'Projects & Goals', icon: FolderKanban },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'exercise', label: 'Exercise', icon: Activity },
    { id: 'reading', label: 'Reading Hub', icon: BookOpen },
    { id: 'skills', label: 'Skills', icon: Zap },
    { id: 'bad-habits', label: 'Bad Habits', icon: ShieldAlert },
    { id: 'recovery', label: 'Recovery', icon: HeartPulse },
    { id: 'prefrontal', label: 'PFC / Focus', icon: BrainCircuit },
    { id: 'time-tracker', label: 'Time Tracker', icon: Clock },
    { id: 'plans', label: 'Plans', icon: Compass },
    { id: 'partner', label: 'Partner', icon: Users, badgeCount: pendingIncomingInvitesCount },
    { id: 'neuroplasticity', label: 'Neuro', icon: Brain },
    { id: 'lessons', label: 'Lessons', icon: GraduationCap },
    { id: 'leagues', label: 'Leagues', icon: Trophy },
    { id: 'tiers', label: 'Ranks', icon: Award },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen md:h-screen bg-bg-900 flex md:overflow-hidden">
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
                <span className="whitespace-nowrap shrink-0 text-[10px] badge-season px-1.5 py-0.5 rounded-full font-bold">
                  {getSeasonLabel()}
                </span>
                <span className="whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-md badge-beta text-[9px] font-bold uppercase tracking-wider">
                  Beta
                </span>
              </div>
              <div className="text-[10px] text-content-disabled uppercase tracking-widest mt-0.5">Self Growth</div>
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary-500/15 text-brand-text'
                    : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={20} className={active ? 'text-brand-text' : ''} />
                  <span>{item.label}</span>
                </div>
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-overlay-subtle">
          <div className="card p-4">
            <div className="stat-label mb-2">Your Rank</div>
            <TierBadge totalPoints={seasonPoints} size="md" showName />
            <div className="mt-2 text-xs text-content-disabled">
              {seasonPoints.toLocaleString()} points
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 md:h-full md:overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden glass border-b border-overlay-subtle px-4 py-3 flex items-center justify-between sticky top-0 z-30">
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
            {currentUser ? (
              <div className="flex items-center gap-1.5 bg-bg-800 px-2.5 py-1 rounded-lg border border-overlay-default text-xs">
                <span>{userAvatar}</span>
                <span className="font-bold text-content-secondary truncate max-w-[80px]">{username}</span>
                <NotificationCenter store={store} compact />
                <button
                  onClick={() => onViewChange('settings')}
                  title="Settings"
                  className="text-content-muted hover:text-content-secondary ml-0.5"
                >
                  <Settings size={13} />
                </button>
                <button onClick={handleLogoutClick} title="Log Out" className="text-content-muted hover:text-rose-theme ml-0.5">
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
              >
                <LogIn size={13} />
                Sign In
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-secondary hover:bg-overlay-subtle"
            >
              {mobileMenuOpen ? <X size={20} /> : <LayoutDashboard size={20} />}
            </button>
          </div>
        </header>

        {/* Mobile menu modal */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-bg-950/95 backdrop-blur-md pt-16 px-4 pb-6 overflow-y-auto">
            <div className="flex flex-col h-full space-y-4">
              <div className="card p-3">
                <div className="stat-label mb-1">Your Rank</div>
                <TierBadge totalPoints={seasonPoints} size="md" showName />
                <div className="mt-1 text-xs text-content-disabled">
                  {seasonPoints.toLocaleString()} points
                </div>
              </div>

              {/* User Account / Sign In Widget */}
              <div className="pb-2">
                {currentUser ? (
                  <div className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{userAvatar}</span>
                      <div>
                        <div className="text-xs font-bold text-content-secondary">{username}</div>
                        <div className="text-[10px] text-content-muted truncate max-w-[140px]">
                          {currentUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLogoutClick}
                      className="btn-ghost text-xs text-rose-theme hover:bg-rose-500/10 py-1 px-2"
                    >
                      Log Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMobileMenuOpen(false); onOpenAuthModal(); }}
                    className="w-full py-2 bg-primary-500/20 text-brand-text border border-primary-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-2"
                  >
                    <LogIn size={15} />
                    Sign In / Register
                  </button>
                )}
              </div>

              <nav className="space-y-1 flex-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onViewChange(item.id); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active ? 'bg-primary-500/15 text-brand-text' : 'text-content-muted hover:bg-overlay-subtle'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={20} />
                        <span>{item.label}</span>
                      </div>
                      {item.badgeCount && item.badgeCount > 0 ? (
                        <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {item.badgeCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-overlay-subtle px-1 py-1.5 z-30 overflow-x-auto">
          <div className="flex items-center justify-around min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all relative ${
                    active ? 'text-brand-text' : 'text-content-disabled'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                  {item.badgeCount && item.badgeCount > 0 ? (
                    <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-rose-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <GuestLogoutWarningModal
        open={guestLogoutWarningOpen}
        onClose={() => setGuestLogoutWarningOpen(false)}
        onSaveProgressFirst={onOpenAuthModal}
        onLogoutAnyway={store.logout}
      />

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        isLoggingOut={isLoggingOut}
      />
    </div>
  );
}