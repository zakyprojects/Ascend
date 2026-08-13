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
} from 'lucide-react';
import { TierBadge } from './ui/TierBadge';
import { AppStore } from '@/lib/store';
import { GuestLogoutWarningModal } from './ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from './ui/LogoutConfirmModal';
import { NotificationCenter } from './ui/NotificationCenter';

export type View =
  | 'dashboard'
  | 'habits'
  | 'weekly-goals'
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

  const unreadNotifsCount = (store.state.partnerNotifications || []).filter((n) => !n.read).length;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'habits', label: 'Habits', icon: CheckSquare },
    { id: 'weekly-goals', label: 'Weekly Goals', icon: Target },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'exercise', label: 'Exercise', icon: Activity },
    { id: 'reading', label: 'Reading', icon: BookOpen },
    { id: 'books', label: 'Books', icon: BookMarked },
    { id: 'skills', label: 'Skills', icon: Zap },
    { id: 'bad-habits', label: 'Bad Habits', icon: ShieldAlert },
    { id: 'recovery', label: 'Recovery', icon: HeartPulse },
    { id: 'prefrontal', label: 'PFC / Focus', icon: BrainCircuit },
    { id: 'plans', label: 'Plans', icon: Compass },
    { id: 'partner', label: 'Partner', icon: Users, badgeCount: unreadNotifsCount },
    { id: 'neuroplasticity', label: 'Neuro', icon: Brain },
    { id: 'lessons', label: 'Lessons', icon: GraduationCap },
    { id: 'leagues', label: 'Leagues', icon: Trophy },
    { id: 'tiers', label: 'Ranks', icon: Award },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen md:h-screen bg-bg-900 flex md:overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-full glass border-r border-white/5 shrink-0 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt="Ascend Logo"
              className="w-9 h-9 rounded-xl object-cover shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <div className="font-display font-bold text-slate-100 text-lg leading-none">Ascend</div>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-bold">
                  {getSeasonLabel()}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Self Growth</div>
            </div>
          </div>
        </div>

        {/* User Account / Login Card in Sidebar */}
        <div className="px-3 mb-4">
          {currentUser ? (
            <div className="card p-3 bg-bg-800/80 border border-white/10 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-lg shrink-0">
                  {userAvatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">{username}</p>
                  <p className={`text-[10px] font-medium truncate ${currentUser.isAnonymous ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {currentUser.isAnonymous ? 'Guest Account' : 'Account Active'}
                  </p>
                </div>
                <NotificationCenter store={store} compact align="sidebar" />
                <button
                  onClick={() => onViewChange('settings')}
                  title="Settings & Preferences"
                  className={`p-1.5 rounded-lg transition-all ${
                    currentView === 'settings'
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Settings size={15} />
                </button>
                <button
                  onClick={handleLogoutClick}
                  title="Log Out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                >
                  <LogOut size={15} />
                </button>
              </div>

              {currentUser.isAnonymous && (
                <button
                  onClick={onOpenAuthModal}
                  className="w-full py-1.5 px-2 bg-gradient-to-r from-primary-500/20 to-primary-600/20 hover:from-primary-500/30 hover:to-primary-600/30 border border-primary-500/30 text-primary-300 font-semibold text-[11px] rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Save Progress — Create Account</span>
                </button>
              )}

              {/* Privacy Toggle */}
              <div className="pt-2 border-t border-white/5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 font-medium text-slate-300">
                    Public Stats & Habits
                  </span>
                  <button
                    onClick={store.toggleProfilePrivacy}
                    title="Toggle profile privacy for public leaderboards"
                    className={`w-8 h-4 rounded-full transition-colors relative p-0.5 border ${
                      (currentUser.isProfilePublic ?? true)
                        ? 'bg-primary-500 border-primary-400'
                        : 'bg-bg-600 border-white/10'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        (currentUser.isProfilePublic ?? true) ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Hiding your stats also hides others' stats from you.
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="w-full card p-3 bg-gradient-to-r from-primary-500/20 to-primary-600/20 hover:from-primary-500/30 hover:to-primary-600/30 border border-primary-500/30 flex items-center justify-center gap-2 text-primary-300 font-medium text-xs rounded-xl transition-all"
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
                    ? 'bg-primary-500/15 text-primary-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={20} className={active ? 'text-primary-400' : ''} />
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

        <div className="p-4 border-t border-white/5">
          <div className="card p-4">
            <div className="stat-label mb-2">Your Rank</div>
            <TierBadge totalPoints={totalPoints} size="md" showName />
            <div className="mt-2 text-xs text-slate-500">
              {totalPoints.toLocaleString()} total points
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile view wrapper */}
      <div className="flex-1 flex flex-col min-w-0 md:h-full md:overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden glass border-b border-white/5 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img
              src="/favicon.svg"
              alt="Ascend Logo"
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
            <span className="font-display font-bold text-slate-100">Ascend</span>
          </div>

          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-1.5 bg-bg-800 px-2.5 py-1 rounded-lg border border-white/10 text-xs">
                <span>{userAvatar}</span>
                <span className="font-bold text-slate-200 truncate max-w-[80px]">{username}</span>
                <NotificationCenter store={store} compact />
                <button
                  onClick={() => onViewChange('settings')}
                  title="Settings"
                  className="text-slate-400 hover:text-slate-200 ml-0.5"
                >
                  <Settings size={13} />
                </button>
                <button onClick={handleLogoutClick} title="Log Out" className="text-slate-400 hover:text-rose-400 ml-0.5">
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
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
                <TierBadge totalPoints={totalPoints} size="md" showName />
                <div className="mt-1 text-xs text-slate-500">
                  {totalPoints.toLocaleString()} total points
                </div>
              </div>

              {/* User Account / Sign In Widget */}
              <div className="pb-2">
                {currentUser ? (
                  <div className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{userAvatar}</span>
                      <div>
                        <div className="text-xs font-bold text-slate-200">{username}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {currentUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLogoutClick}
                      className="btn-ghost text-xs text-rose-400 hover:bg-rose-500/10 py-1 px-2"
                    >
                      Log Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMobileMenuOpen(false); onOpenAuthModal(); }}
                    className="w-full py-2 bg-primary-500/20 text-primary-300 border border-primary-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-2"
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
                        active ? 'bg-primary-500/15 text-primary-400' : 'text-slate-400 hover:bg-white/5'
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/5 px-1 py-1.5 z-30 overflow-x-auto">
          <div className="flex items-center justify-around min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all relative ${
                    active ? 'text-primary-400' : 'text-slate-500'
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
