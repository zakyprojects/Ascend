import { useState, useEffect, useRef } from 'react';
import {
  Settings,
  User,
  Lock,
  Bell,
  BellOff,
  Eye,
  Sun,
  Moon,
  Shield,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Mail,
  LogOut,
  Trash2,
  HelpCircle,
  MessageSquare,
  UserCheck,
  UserX,
  Info,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { EMOJI_AVATARS } from '@/types';
import {
  isUsernameAvailable,
  updateUsernameWithCooldown,
  updateUserAvatar,
  changeUserPassword,
  deleteUserProfileAndData,
} from '@/lib/auth';
import { Modal } from '@/components/ui/Modal';
import { GuestLogoutWarningModal } from '@/components/ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from '@/components/ui/LogoutConfirmModal';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator, AscendLoadingOverlay } from '@/components/ui/AscendLoadingIndicator';

type SettingsSection =
  | 'profile'
  | 'account'
  | 'notifications'
  | 'privacy'
  | 'appearance'
  | 'danger'
  | 'about';

interface SettingsViewProps {
  store: AppStore;
  onOpenAuthModal?: () => void;
}

export function SettingsView({ store, onOpenAuthModal }: SettingsViewProps) {
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);
  const userId = currentUser?.id || '';

  // Active Section Navigation
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const contentAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to top when changing section
  const handleSelectSection = (section: SettingsSection) => {
    setActiveSection(section);
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  };

  // Username form state
  const [usernameInput, setUsernameInput] = useState(currentUser?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string } | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Avatar form state
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser?.avatar || '🧑');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notifications state
  const [notifDailyReminder, setNotifDailyReminder] = useState(true);
  const [notifPartnerActivity, setNotifPartnerActivity] = useState(true);
  const [notifLeagueUpdates, setNotifLeagueUpdates] = useState(true);
  const [notifSundayPlanning, setNotifSundayPlanning] = useState(true);
  const [focusNotifsEnabled, setFocusNotifsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('ascend_focus_notifs_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [notifBrowserPerm, setNotifBrowserPerm] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifBrowserPerm(Notification.permission);
    }
  }, []);

  // Theme state synced with store
  const isDarkMode = store.state.themePreference !== 'light';

  // Account action modals
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [showGuestLogoutWarning, setShowGuestLogoutWarning] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [copiedUid, setCopiedUid] = useState(false);

  // Sync inputs with currentUser changes
  useEffect(() => {
    if (currentUser) {
      setUsernameInput(currentUser.username);
      setSelectedAvatar(currentUser.avatar || '🧑');
      setNotifDailyReminder(currentUser.notifDailyReminder ?? true);
      setNotifPartnerActivity(currentUser.notifPartnerActivity ?? true);
      setNotifLeagueUpdates(currentUser.notifLeagueUpdates ?? true);
      setNotifSundayPlanning(currentUser.notifSundayPlanning ?? true);
    }
  }, [currentUser]);

  // Live username availability check
  useEffect(() => {
    if (!usernameInput.trim() || usernameInput.trim() === currentUser?.username) {
      setUsernameStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await isUsernameAvailable(usernameInput, userId);
        setUsernameStatus(result);
      } catch {
        setUsernameStatus({ available: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [usernameInput, currentUser?.username, userId]);

  // 24-hour username cooldown calculation
  const lastChangedTs = currentUser?.lastUsernameChangeAt ? new Date(currentUser.lastUsernameChangeAt).getTime() : 0;
  const cooldownMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const msElapsed = lastChangedTs > 0 ? nowMs - lastChangedTs : cooldownMs;
  const isCooldownActive = lastChangedTs > 0 && msElapsed < cooldownMs;

  const msLeft = cooldownMs - msElapsed;
  const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
  const minsLeft = Math.ceil((msLeft % (1000 * 60 * 60)) / (1000 * 60));

  const { isLoading: isDeletingAccount, executeFn: executeDeleteAccount } = useAsyncAction();
  const { isLoading: isLoggingOut, executeFn: executeLogout } = useAsyncAction();
  const { isLoading: isUsernameSaving, executeFn: executeUsernameSave } = useAsyncAction();
  const { isLoading: isPasswordSaving, executeFn: executePasswordSave } = useAsyncAction();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  // Save username handler
  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameMsg(null);

    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setUsernameMsg({ type: 'error', text: 'Username cannot be empty.' });
      return;
    }
    if (trimmed === currentUser?.username) {
      return;
    }

    if (isCooldownActive) {
      setUsernameMsg({
        type: 'error',
        text: `Username can only be changed once per 24 hours. Next change available in ${hoursLeft}h ${minsLeft}m.`,
      });
      return;
    }

    await executeUsernameSave(async () => {
      try {
        const nowIso = await updateUsernameWithCooldown(userId, trimmed);
        store.updateProfileUsername(trimmed, nowIso);
        setUsernameMsg({ type: 'success', text: 'Username updated successfully!' });
        setUsernameStatus(null);
      } catch (err: unknown) {
        const error = err as { message?: string };
        setUsernameMsg({ type: 'error', text: error.message || 'Failed to update username.' });
      }
    });
  };

  // Avatar change handler
  const handleSelectAvatar = async (emoji: string) => {
    if (emoji === currentUser?.avatar) return;
    setSelectedAvatar(emoji);
    setAvatarMsg(null);

    await executeWithKey(`avatar-${emoji}`, async () => {
      try {
        await updateUserAvatar(userId, emoji);
        store.updateProfileAvatar(emoji);
        setAvatarMsg(`Avatar updated to ${emoji}!`);
        setTimeout(() => setAvatarMsg(null), 3000);
      } catch (err: unknown) {
        console.error('Failed to update avatar:', err);
      }
    });
  };

  // Change password handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Please fill in both password fields.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    await executePasswordSave(async () => {
      try {
        await changeUserPassword(newPassword);
        setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      } catch (err: unknown) {
        const error = err as { message?: string };
        setPasswordMsg({ type: 'error', text: error.message || 'Failed to change password.' });
      }
    });
  };

  // Logout click handler
  const handleLogout = () => {
    if (isGuest) {
      setShowGuestLogoutWarning(true);
    } else {
      setShowLogoutConfirm(true);
    }
  };

  const handleConfirmLogout = async () => {
    await executeLogout(async () => {
      await store.logout();
      setShowLogoutConfirm(false);
    });
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    await executeDeleteAccount(async () => {
      await deleteUserProfileAndData(userId);
      setShowDeleteConfirm(false);
      await store.logout();
    });
  };

  // Sidebar section definitions
  const sectionsList: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    danger?: boolean;
  }> = [
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'account', label: 'Account & Security', icon: <Lock size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'privacy', label: 'Privacy', icon: <Eye size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Sun size={18} /> },
    { id: 'danger', label: 'Account Management', icon: <Shield size={18} />, danger: true },
    { id: 'about', label: 'About', icon: <Info size={18} /> },
  ];

  const acceptsInvites = currentUser?.acceptPartnerInvites ?? true;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 shrink-0">
          <Settings size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary">Settings & Preferences</h1>
          <p className="text-xs text-content-muted">Manage your profile, identity, privacy, and account options</p>
        </div>
      </div>

      {/* Guest Mode Banner */}
      {isGuest && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-primary-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 text-warning-text">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-secondary">
                Temporary Guest Account ({currentUser?.username})
              </p>
              <p className="text-[11px] text-content-muted">
                Save your progress to convert to a permanent account so you never lose habits or points.
              </p>
            </div>
          </div>
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all shrink-0 w-full sm:w-auto"
            >
              Save Progress (Create Account)
            </button>
          )}
        </div>
      )}

      {/* Sectioned Main Layout (Sidebar Navigation + Independent Content Area) */}
      <div className="flex gap-5 min-h-[520px] items-start">
        {/* Persistent Narrow Sidebar */}
        <aside className="w-16 sm:w-56 shrink-0 bg-bg-800/80 border border-overlay-default rounded-2xl p-2 sm:p-3 space-y-1 self-stretch flex flex-col justify-between">
          <div className="space-y-1">
            <p className="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-content-disabled px-3 py-1.5">
              Sections
            </p>
            {sectionsList.map((sec) => {
              const active = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => handleSelectSection(sec.id)}
                  className={`w-full flex items-center gap-3 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? sec.danger
                        ? 'bg-rose-500/20 text-rose-theme border border-rose-500/30 shadow-md'
                        : 'bg-primary-500/20 text-brand-text border border-primary-500/30 shadow-md'
                      : sec.danger
                      ? 'text-rose-theme-muted hover:bg-rose-500/10 hover:text-rose-theme border border-transparent'
                      : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle border border-transparent'
                  }`}
                  title={sec.label}
                >
                  <span className={`shrink-0 ${active ? (sec.danger ? 'text-rose-theme' : 'text-brand-text') : ''}`}>
                    {sec.icon}
                  </span>
                  <span className="hidden sm:inline truncate text-left">{sec.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block pt-4 border-t border-overlay-subtle px-3">
            <p className="text-[10px] text-content-disabled font-mono">Ascend v{__APP_VERSION__}</p>
          </div>
        </aside>

        {/* Independent Section Content Area */}
        <main
          ref={contentAreaRef}
          key={activeSection}
          className="flex-1 min-w-0 max-h-[680px] overflow-y-auto pr-1 space-y-5 animate-fade-in scroll-smooth"
        >
          {/* SECTION 1: PROFILE */}
          {activeSection === 'profile' && (
            <div className="card p-5 space-y-5">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <User size={18} className="text-brand-text" />
                Profile Identity
              </h2>

              {/* Permanent 6-Digit User UID */}
              <div className="p-3 bg-bg-800/80 rounded-xl border border-overlay-default flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-tertiary">
                    Your Unique User ID (UID)
                  </label>
                  <p className="text-[11px] text-content-muted">
                    Share this permanent 6-digit ID with friends to connect as Accountability Partners.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold text-sm tracking-widest text-brand-text bg-primary-500/10 px-3 py-1 rounded-lg border border-primary-500/20">
                    {currentUser?.uid || '100001'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentUser?.uid) {
                        navigator.clipboard.writeText(currentUser.uid);
                        setCopiedUid(true);
                        setTimeout(() => setCopiedUid(false), 2000);
                      }
                    }}
                    className="px-2.5 py-1 bg-bg-700 hover:bg-bg-600 border border-overlay-default text-content-secondary text-xs font-semibold rounded-lg transition-all flex items-center gap-1"
                  >
                    {copiedUid ? <Check size={13} className="text-success-text" /> : <Copy size={13} />}
                    <span>{copiedUid ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Username Change Form */}
              <form onSubmit={handleSaveUsername} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-content-tertiary">
                    Leaderboard Username
                  </label>
                  {isCooldownActive && (
                    <span className="badge-amber text-[11px] font-medium flex items-center gap-1 px-2 py-0.5 rounded-md">
                      <Clock size={12} />
                      Cooldown: {hoursLeft}h {minsLeft}m left
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    disabled={isCooldownActive || usernameSaving}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full input-has-icon pr-28 py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all disabled:opacity-60"
                  />
                  {usernameInput.trim() && usernameInput.trim() !== currentUser?.username && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {usernameStatus?.available ? (
                        <span className="badge-emerald text-[11px] font-medium flex items-center gap-1 px-2 py-0.5 rounded-md">
                          <Check size={12} /> Available
                        </span>
                      ) : usernameStatus?.reason ? (
                        <span className="text-[11px] font-medium text-rose-theme flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 truncate max-w-[110px]">
                          Taken / Invalid
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {usernameMsg && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                      usernameMsg.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-success-text'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-theme'
                    }`}
                  >
                    {usernameMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                    <span>{usernameMsg.text}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-content-disabled">
                    Username changes are limited to 1 per rolling 24-hour period.
                  </p>
                  <button
                    type="submit"
                    disabled={
                      isCooldownActive ||
                      usernameSaving ||
                      usernameInput.trim() === currentUser?.username ||
                      (usernameStatus !== null && !usernameStatus.available)
                    }
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-on-brand font-semibold text-xs rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {usernameSaving ? 'Saving...' : 'Update Username'}
                  </button>
                </div>
              </form>

              {/* Avatar Picker (32 Emojis) */}
              <div className="space-y-2 pt-2 border-t border-overlay-subtle">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-content-tertiary">
                    Leaderboard Avatar Emoji (32 Choices)
                  </label>
                  {avatarMsg && (
                    <span className="text-[11px] text-success-text font-semibold flex items-center gap-1 animate-fade-in">
                      <Check size={12} /> {avatarMsg}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-8 gap-2 p-3 bg-bg-800 rounded-2xl border border-overlay-subtle">
                  {EMOJI_AVATARS.map((emoji) => {
                    const selected = selectedAvatar === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        disabled={avatarSaving}
                        onClick={() => handleSelectAvatar(emoji)}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                          selected
                            ? 'bg-primary-500/25 border-2 border-emerald-400 shadow-lg scale-110'
                            : 'hover:bg-overlay-subtle border border-transparent'
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-content-disabled">
                  Click any avatar to update immediately. Changes propagate instantly to leaderboards and cards.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: ACCOUNT & SECURITY */}
          {activeSection === 'account' && (
            <div className="card p-5 space-y-4">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Lock size={18} className="text-brand-text" />
                Account & Security
              </h2>

              {/* Read-only Email display */}
              <div>
                <label className="block text-xs font-semibold text-content-tertiary mb-1">
                  Registered Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    disabled
                    value={currentUser?.email || (isGuest ? 'Guest User (No Email)' : '')}
                    className="w-full input-has-icon pr-3 py-2.5 bg-bg-800/60 border border-overlay-subtle rounded-xl text-sm text-content-muted font-mono disabled:opacity-80"
                  />
                </div>
              </div>

              {/* Password Change Expandable Form */}
              {!isGuest && (
                <div className="pt-2 border-t border-overlay-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-content-secondary">Account Password</p>
                      <p className="text-[11px] text-content-disabled">Update your login password securely</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(!showPasswordForm)}
                      className="px-3 py-1.5 bg-bg-800 hover:bg-bg-700 border border-overlay-default text-content-secondary font-semibold text-xs rounded-xl transition-all"
                    >
                      {showPasswordForm ? 'Cancel' : 'Change Password'}
                    </button>
                  </div>

                  {showPasswordForm && (
                    <form onSubmit={handleChangePassword} className="space-y-3 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                      <div>
                        <label className="block text-[11px] font-semibold text-content-tertiary mb-1">New Password</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-bg-800 border border-overlay-default rounded-lg text-xs text-content-primary focus:outline-none focus:border-primary-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-content-tertiary mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-bg-800 border border-overlay-default rounded-lg text-xs text-content-primary focus:outline-none focus:border-primary-400"
                        />
                      </div>

                      {passwordMsg && (
                        <div
                          className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                            passwordMsg.type === 'success' ? 'text-success-text' : 'text-error-text'
                          }`}
                        >
                          {passwordMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                          <span>{passwordMsg.text}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={passwordSaving}
                        className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-on-brand font-semibold text-xs rounded-lg shadow-md transition-all disabled:opacity-50"
                      >
                        {passwordSaving ? 'Updating Password...' : 'Save New Password'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: NOTIFICATIONS (Preferences only) */}
          {activeSection === 'notifications' && (
            <div className="card p-5 space-y-4">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Bell size={18} className="text-brand-text" />
                Notification Preferences
              </h2>

              <p className="text-xs text-content-muted">
                Choose which notifications and alerts you wish to receive across Ascend features.
              </p>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center justify-between p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle cursor-pointer hover:border-overlay-default transition-all">
                  <div>
                    <span className="text-xs font-semibold text-content-secondary block">Daily Habit Reminders</span>
                    <span className="text-[11px] text-content-muted">Receive daily reminders to check off active habits</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifDailyReminder}
                    onChange={() => {
                      setNotifDailyReminder(!notifDailyReminder);
                      store.toggleNotifDailyReminder();
                    }}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle cursor-pointer hover:border-overlay-default transition-all">
                  <div>
                    <span className="text-xs font-semibold text-content-secondary block">Accountability Partner Activity Alerts</span>
                    <span className="text-[11px] text-content-muted">Get notified when partners complete habits or challenges</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPartnerActivity}
                    onChange={() => {
                      setNotifPartnerActivity(!notifPartnerActivity);
                      store.toggleNotifPartnerActivity();
                    }}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle cursor-pointer hover:border-overlay-default transition-all">
                  <div>
                    <span className="text-xs font-semibold text-content-secondary block">Weekly League Reset & Rank Updates</span>
                    <span className="text-[11px] text-content-muted">Receive weekly summaries of league placement and division promotions</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifLeagueUpdates}
                    onChange={() => {
                      setNotifLeagueUpdates(!notifLeagueUpdates);
                      store.toggleNotifLeagueUpdates();
                    }}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle cursor-pointer hover:border-overlay-default transition-all">
                  <div>
                    <span className="text-xs font-semibold text-content-secondary block">Sunday Evening Goal Planning Reminders</span>
                    <span className="text-[11px] text-content-muted">Receive a Sunday 7 PM notification to review past weekly goals and plan high-leverage priorities</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifSundayPlanning}
                    onChange={() => {
                      setNotifSundayPlanning(!notifSundayPlanning);
                      store.toggleNotifSundayPlanning();
                    }}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle cursor-pointer hover:border-overlay-default transition-all">
                  <div>
                    <span className="text-xs font-semibold text-content-secondary block">Focus Session Completion Alerts</span>
                    <span className="text-[11px] text-content-muted">App-level preference to attempt system alerts when focus sessions finish</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={focusNotifsEnabled}
                    onChange={async () => {
                      const next = !focusNotifsEnabled;
                      setFocusNotifsEnabled(next);
                      localStorage.setItem('ascend_focus_notifs_enabled', String(next));

                      if (next && typeof window !== 'undefined' && 'Notification' in window && notifBrowserPerm === 'default') {
                        try {
                          const perm = await Notification.requestPermission();
                          setNotifBrowserPerm(perm);
                        } catch (e) {
                          console.warn('Error requesting notification permission:', e);
                        }
                      }
                    }}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {notifBrowserPerm === 'denied' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-theme">
                    <BellOff size={16} className="text-rose-theme shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-rose-theme">Browser Notification Permission Denied</p>
                      <p className="text-[11px] text-rose-theme-muted leading-relaxed">
                        Notifications are blocked by your browser settings. Even with this preference enabled, alerts cannot fire until you allow notification permissions for this website in your browser's site settings.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: PRIVACY */}
          {activeSection === 'privacy' && (
            <div className="card p-5 space-y-4">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Eye size={18} className="text-brand-text" />
                Privacy & Visibility
              </h2>

              {/* Public Stats & Habits Privacy Toggle */}
              <div className="flex items-start justify-between gap-4 p-3.5 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-content-secondary">Public Leaderboard Profile & Stats</span>
                    {(currentUser?.isProfilePublic ?? true) ? (
                      <span className="badge-emerald text-[10px] font-bold px-2 py-0.5 rounded-md">
                        Public
                      </span>
                    ) : (
                      <span className="badge-amber text-[10px] font-bold px-2 py-0.5 rounded-md">
                        Private
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-content-muted leading-relaxed">
                    Show your habit streak and detailed statistics to competitors on public leaderboards.
                    <br />
                    <em className="text-content-disabled">
                      (Reciprocal Rule: Hiding your statistics also hides other members' detailed stats from your view).
                    </em>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={store.toggleProfilePrivacy}
                  className={`w-10 h-5 rounded-full transition-colors relative p-0.5 border shrink-0 mt-1 ${
                    (currentUser?.isProfilePublic ?? true) ? 'bg-primary-500 border-primary-400' : 'bg-bg-600 border-overlay-default'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      (currentUser?.isProfilePublic ?? true) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Accept Partnership Invites Toggle (TASK 2) */}
              <div className="flex items-start justify-between gap-4 p-3.5 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-content-secondary">Accept Partnership Invites</span>
                    {acceptsInvites ? (
                      <span className="badge-emerald text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md">
                        <UserCheck size={11} /> Accepting Invites
                      </span>
                    ) : (
                      <span className="text-[10px] bg-rose-500/10 text-rose-theme border border-rose-500/20 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        <UserX size={11} /> Blocking Invites
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-content-muted leading-relaxed">
                    Allow other users to search your User ID (UID) and send you accountability partner invites.
                    <br />
                    <em className="text-content-disabled">
                      When turned off, incoming invites are blocked. Existing active partnerships remain unaffected.
                    </em>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={store.toggleAcceptPartnerInvites}
                  className={`w-10 h-5 rounded-full transition-colors relative p-0.5 border shrink-0 mt-1 ${
                    acceptsInvites ? 'bg-primary-500 border-primary-400' : 'bg-bg-600 border-overlay-default'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      acceptsInvites ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* SECTION 5: APPEARANCE */}
          {activeSection === 'appearance' && (
            <div className="card p-5 space-y-4">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Sun size={18} className="text-brand-text" />
                Appearance Theme
              </h2>

              <div className="flex items-center justify-between p-3.5 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Moon size={20} className="text-brand-text" /> : <Sun size={20} className="text-warning-text" />}
                  <div>
                    <p className="text-xs font-bold text-content-secondary">Visual Theme Mode</p>
                    <p className="text-[11px] text-content-muted">
                      {isDarkMode ? 'Dark Glassmorphism Theme (Default)' : 'Light Clean Mode'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => store.toggleThemePreference()}
                  className="px-3.5 py-1.5 bg-bg-800 hover:bg-bg-700 border border-overlay-default text-content-secondary font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                  <span>Switch to {isDarkMode ? 'Light' : 'Dark'}</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 6: ACCOUNT MANAGEMENT */}
          {activeSection === 'danger' && (
            <div className="card p-5 space-y-4 border border-rose-500/20">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Shield size={18} className="text-rose-theme" />
                Account Management
              </h2>

              <p className="text-xs text-content-muted">
                Manage your session or permanently delete your account data.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2.5 bg-bg-800 hover:bg-bg-700 text-content-secondary font-semibold text-xs rounded-xl border border-overlay-default transition-all flex items-center justify-center gap-2"
                >
                  <LogOut size={16} className="text-content-muted" />
                  <span>Log Out of Account</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-theme font-semibold text-xs rounded-xl border border-rose-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  <span>Delete Account & Purge Data</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 7: ABOUT */}
          {activeSection === 'about' && (
            <div className="card p-5 space-y-4">
              <h2 className="text-base font-display font-bold text-content-primary flex items-center gap-2 border-b border-overlay-subtle pb-3">
                <Info size={18} className="text-brand-text" />
                About Ascend
              </h2>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-bold text-content-secondary">Ascend Self-Growth Platform</p>
                  <p className="text-xs text-content-muted mt-0.5">Version {__APP_VERSION__} • Build {__APP_BUILD__}</p>
                  <p className="text-xs text-content-disabled mt-2 leading-relaxed">
                    Ascend empowers habit tracking, accountability partnerships, leagues, and self-improvement goals across exercise, reading, and skill mastery.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-overlay-subtle">
                  <button
                    type="button"
                    onClick={() => alert('Ascend Feedback & Support: Contact support@ascendgrowth.app')}
                    className="px-3.5 py-2 bg-bg-800 hover:bg-bg-700 text-content-tertiary text-xs font-medium rounded-xl border border-overlay-subtle flex items-center gap-1.5 transition-all"
                  >
                    <MessageSquare size={14} />
                    <span>Feedback & Support</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => alert('Ascend Documentation & Guide: See Help section in sidebar.')}
                    className="px-3.5 py-2 bg-bg-800 hover:bg-bg-700 text-content-tertiary text-xs font-medium rounded-xl border border-overlay-subtle flex items-center gap-1.5 transition-all"
                  >
                    <HelpCircle size={14} />
                    <span>User Documentation</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Guest Logout Interception Modal */}
      <GuestLogoutWarningModal
        open={showGuestLogoutWarning}
        onClose={() => setShowGuestLogoutWarning(false)}
        onSaveProgressFirst={() => {
          if (onOpenAuthModal) onOpenAuthModal();
        }}
        onLogoutAnyway={store.logout}
      />

      {/* Account Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        isLoggingOut={isLoggingOut}
      />

      {/* Delete Account Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Account Permanently" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-theme flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-content-primary">Permanent Action</h3>
              <p className="text-xs text-content-tertiary leading-relaxed">
                This will permanently remove your profile, habits, journal entries, points, league rank, and partner links from Supabase. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 bg-bg-800 hover:bg-bg-700 text-content-tertiary font-semibold text-xs rounded-xl border border-overlay-default transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeletingAccount}
              onClick={handleDeleteAccount}
              className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeletingAccount ? (
                <>
                  <AscendLoadingIndicator size="sm" />
                  <span>Purging Data...</span>
                </>
              ) : (
                'Confirm Delete'
              )}
            </button>
          </div>
        </div>
      </Modal>
      {/* Loading Overlays for Major Actions */}
      {isDeletingAccount && (
        <AscendLoadingOverlay
          message="Purging account & data..."
          submessage="Permanently removing all profile records"
        />
      )}
      {isLoggingOut && (
        <AscendLoadingOverlay
          message="Logging out..."
          submessage="Securing your account session"
        />
      )}
    </div>
  );
}
