import { useState, useEffect, useRef } from 'react';
import { toggleThemeWithReveal } from '@/lib/themeTransition';
import {
  User,
  Lock,
  Bell,
  BellOff,
  Eye,
  Sun,
  Moon,
  Shield,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Clock,
  Mail,
  LogOut,
  Trash2,
  Info,
} from 'lucide-react';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { NAV_HELP } from '@/components/nav/navConfig';
import { EMOJI_AVATARS, NotificationPreferenceKey } from '@/types';
import {
  isUsernameAvailable,
  updateUsernameWithCooldown,
  updateUserAvatar,
  changeUserPassword,
  deleteOwnAccount,
} from '@/lib/auth';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStaircase } from '@/components/ui/PasswordStaircase';
import { newPasswordProblem } from '@/lib/passwordRules';
import { GuestLogoutWarningModal } from '@/components/ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from '@/components/ui/LogoutConfirmModal';
import { Dialog, Switch, Tabs } from '@/components/ui/primitives';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import { toUserMessage } from '@/lib/userMessage';
import { AscendLoadingIndicator, AscendLoadingOverlay } from '@/components/ui/AscendLoadingIndicator';
import { trustedNowMs } from '@/lib/clock';
import { useToast } from '@/components/ui/Toast';
import { disablePush, enablePush, getPushStatus, type PushStatus } from '@/lib/push';

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
  onOpenAuth?: () => void;
  /** Opens another page (the Help links under About). */
  onNavigate: (view: View) => void;
}

/** Server-sent notification types the user can switch off; off means the server never creates them. */
const NOTIFICATION_PREFERENCES: { key: NotificationPreferenceKey; title: string; description: string }[] = [
  {
    key: 'notifDailyReminder',
    title: 'Daily reminder',
    description: '8 PM: a reminder when something for today is still unchecked.',
  },
  {
    key: 'notifPartnerActivity',
    title: 'Partner activity',
    description: 'Nudges, finished pacts and missed habits from your partners.',
  },
  {
    key: 'notifSundayPlanning',
    title: 'Sunday planning reminder',
    description: "Sundays at 7 PM: review last week's goals and plan the next.",
  },
];

export function SettingsView({ store, onOpenAuth, onNavigate }: SettingsViewProps) {
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
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // The Available / Not available badge sits inside the input; the input reserves room for it
  // only while it shows, so long usernames never run under it.
  const usernameBadgeShown = Boolean(
    usernameInput.trim() &&
      usernameInput.trim() !== currentUser?.username &&
      (usernameStatus?.available || usernameStatus?.reason)
  );

  // Avatar form state
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser?.avatar || '🧑');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notifications state
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
  const [pushStatus, setPushStatus] = useState<PushStatus>('off');
  const { isLoading: isPushSaving, executeFn: executePushToggle } = useAsyncAction();
  const { showErrorToast } = useToast();

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => setPushStatus('off'));
  }, []);

  const handlePushToggle = () =>
    executePushToggle(async () => {
      try {
        if (pushStatus === 'on') {
          await disablePush();
          setPushStatus('off');
        } else {
          const next = await enablePush();
          setPushStatus(next);
          if (typeof window !== 'undefined' && 'Notification' in window) setNotifBrowserPerm(Notification.permission);
        }
      } catch (err) {
        showErrorToast("Couldn't change push notifications", toUserMessage(err, 'Please try again.'));
        setPushStatus(await getPushStatus().catch((): PushStatus => 'off'));
      }
    });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifBrowserPerm(Notification.permission);
    }
  }, []);

  // Theme state synced with store
  const isDarkMode = store.state.themePreference !== 'light';

  const handleThemeToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    toggleThemeWithReveal(event.currentTarget, store.toggleThemePreference);
  };

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
  const nowMs = trustedNowMs();
  const msElapsed = lastChangedTs > 0 ? nowMs - lastChangedTs : cooldownMs;
  const isCooldownActive = lastChangedTs > 0 && msElapsed < cooldownMs;

  const totalMinsLeft = Math.ceil((cooldownMs - msElapsed) / (1000 * 60));
  const hoursLeft = Math.floor(totalMinsLeft / 60);
  const minsLeft = totalMinsLeft % 60;

  const {
    isLoading: isDeletingAccount,
    error: deleteAccountError,
    executeFn: executeDeleteAccount,
    resetError: resetDeleteAccountError,
  } = useAsyncAction();
  const { isLoading: isLoggingOut, executeFn: executeLogout } = useAsyncAction();
  const { isLoading: isUsernameSaving, executeFn: executeUsernameSave } = useAsyncAction();
  const { isLoading: isPasswordSaving, executeFn: executePasswordSave } = useAsyncAction();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  // Save username handler
  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUsernameSaving) return;
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
        setUsernameMsg({ type: 'success', text: 'Username updated.' });
        setUsernameStatus(null);
      } catch (err: unknown) {
        setUsernameMsg({ type: 'error', text: toUserMessage(err, "Couldn't change your username. Try again.") });
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
    if (isPasswordSaving) return;
    setPasswordMsg(null);

    if (!newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Please fill in both password fields.' });
      return;
    }
    const passwordProblem = newPasswordProblem(newPassword);
    if (passwordProblem) {
      setPasswordMsg({ type: 'error', text: `Password: ${passwordProblem.toLowerCase()}.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    await executePasswordSave(async () => {
      try {
        await changeUserPassword(newPassword);
        setPasswordMsg({ type: 'success', text: 'Password changed.' });
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      } catch (err: unknown) {
        setPasswordMsg({ type: 'error', text: toUserMessage(err, "Couldn't change your password. Try again.") });
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
      try {
        await store.logout();
      } catch (err) {
        console.error('Logout error in SettingsView:', err);
      } finally {
        setShowLogoutConfirm(false);
      }
    });
  };

  const handleGuestLogoutAnyway = async () => {
    await executeLogout(async () => {
      try {
        if (await store.logoutGuest()) setShowGuestLogoutWarning(false);
      } catch (err) {
        console.error('Guest logout error in SettingsView:', err);
      }
    });
  };

  // Delete account handler. On failure the account still exists, so the user stays signed in
  // and the dialog stays open with the error; on success the session is cleared locally.
  const handleDeleteAccount = async () => {
    try {
      await executeDeleteAccount(() => deleteOwnAccount(userId));
    } catch (err) {
      console.error('Account deletion failed in SettingsView:', err);
      return;
    }
    setShowDeleteConfirm(false);
    await store.logout({ accountDeleted: true });
  };

  // Sidebar section definitions
  const sectionsList: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    danger?: boolean;
  }> = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'account', label: 'Account & Security', icon: <Lock size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'privacy', label: 'Privacy', icon: <Eye size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Sun size={16} /> },
    { id: 'danger', label: 'Account Management', icon: <Shield size={16} />, danger: true },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ];

  const acceptsInvites = currentUser?.acceptPartnerInvites ?? true;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Profile, privacy and account.</p>
        </div>
      </div>

      {/* Guest Mode Banner */}
      {isGuest && (
        <GuestSaveBanner
          title={`Guest account (${currentUser?.username})`}
          description="Create an account to keep your habits and points."
          onCreateAccount={onOpenAuth}
        />
      )}

      {/* Sectioned Main Layout (Sidebar Navigation + Independent Content Area) */}
      <div className="flex flex-col sm:flex-row gap-5 min-h-[520px] sm:items-start">
        {/* Mobile: section strip (same pattern as the mobile sibling switcher) */}
        <Tabs
          className="sm:hidden"
          items={sectionsList.map(({ id, label }) => ({ id, label }))}
          value={activeSection}
          onChange={(id) => handleSelectSection(id as SettingsSection)}
          variant="underline"
          size="sm"
          scrollable
          ariaLabel="Settings sections"
        />

        {/* Desktop/tablet: persistent sidebar */}
        <aside className="hidden sm:flex w-56 shrink-0 border border-overlay-default rounded-2xl p-3 space-y-1 self-stretch flex-col justify-between">
          <div className="space-y-1">
            <p className="stat-label text-content-disabled px-3 py-1.5">
              Sections
            </p>
            {sectionsList.map((sec) => {
              const active = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => handleSelectSection(sec.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? sec.danger
                        ? 'bg-rose-500/15 text-rose-theme'
                        : 'bg-primary-500/15 text-brand-text'
                      : sec.danger
                      ? 'text-rose-theme-muted hover:bg-rose-500/10 hover:text-rose-theme'
                      : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
                  }`}
                >
                  <span className={`shrink-0 ${active ? (sec.danger ? 'text-rose-theme' : 'text-brand-text') : ''}`}>
                    {sec.icon}
                  </span>
                  <span className="truncate text-left">{sec.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-overlay-subtle px-3">
            <p className="text-2xs text-content-disabled tabular-nums">Ascend v{__APP_VERSION__}</p>
          </div>
        </aside>

        {/* Independent Section Content Area */}
        <main
          ref={contentAreaRef}
          key={activeSection}
          className="flex-1 min-w-0 lg:max-h-[680px] lg:overflow-y-auto lg:pr-1 space-y-5 animate-fade-in scroll-smooth"
        >
          {/* SECTION 1: PROFILE */}
          {activeSection === 'profile' && (
            <div className="card p-5 space-y-5">
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Profile
              </h2>

              {/* Permanent 6-Digit User UID */}
              <div className="p-3 rounded-xl border border-overlay-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <label className="block label">
                    Your ID
                  </label>
                  <p className="text-micro text-content-muted">
                    Share this 6-digit ID with friends to add them as accountability partners.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="figure text-sm tracking-widest text-brand-text bg-primary-500/10 px-3 py-1 rounded-lg border border-primary-500/20">
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
                    className="px-2.5 py-1 hover:bg-overlay-subtle border border-overlay-default text-content-secondary text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                  >
                    {copiedUid ? <Check size={13} className="text-success-text" /> : <Copy size={13} />}
                    <span>{copiedUid ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Username Change Form */}
              <form onSubmit={handleSaveUsername} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="settings-username" className="block label">
                    Leaderboard username
                  </label>
                  {isCooldownActive && (
                    <span className="badge-amber text-micro font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg">
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
                    id="settings-username"
                    type="text"
                    required
                    disabled={isCooldownActive || isUsernameSaving}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className={`w-full input-has-icon ${usernameBadgeShown ? 'pr-32' : 'pr-3'} py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all disabled:opacity-60`}
                  />
                  {usernameBadgeShown && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {usernameStatus?.available ? (
                        <span className="badge-emerald text-micro font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg">
                          <Check size={12} /> Available
                        </span>
                      ) : usernameStatus?.reason ? (
                        <span className="text-micro font-medium text-rose-theme flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20 truncate max-w-[110px]">
                          Not available
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
                  <p className="text-micro text-content-disabled">
                    You can change your username once every 24 hours.
                  </p>
                  <button
                    type="submit"
                    disabled={
                      isCooldownActive ||
                      isUsernameSaving ||
                      usernameInput.trim() === currentUser?.username ||
                      (usernameStatus !== null && !usernameStatus.available)
                    }
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-on-brand font-semibold text-xs rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                  >
                    {isUsernameSaving ? (
                      <>
                        <AscendLoadingIndicator size="sm" />
                        <span>Updating…</span>
                      </>
                    ) : (
                      'Update Username'
                    )}
                  </button>
                </div>
              </form>

              {/* Avatar Picker (32 Emojis) */}
              <div className="space-y-2 pt-2 border-t border-overlay-subtle">
                <div className="flex items-center justify-between">
                  <label className="block label">
                    Leaderboard avatar
                  </label>
                  {avatarMsg && (
                    <span className="text-micro text-success-text font-medium flex items-center gap-1 animate-fade-in">
                      <Check size={12} /> {avatarMsg}
                    </span>
                  )}
                </div>

                <div role="group" aria-label="Avatar" className="grid grid-cols-8 gap-2">
                  {EMOJI_AVATARS.map((emoji) => {
                    const selected = selectedAvatar === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        disabled={avatarSaving}
                        onClick={() => handleSelectAvatar(emoji)}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xl flex items-center justify-center transition-colors ${
                          selected
                            ? 'bg-primary-500/15 ring-1 ring-primary-500/40'
                            : 'hover:bg-overlay-subtle'
                        }`}
                        aria-label={`Select avatar ${emoji}`}
                        aria-pressed={selected}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
                <p className="text-micro text-content-disabled">
                  Tap an avatar to use it. It updates everywhere right away.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: ACCOUNT & SECURITY */}
          {activeSection === 'account' && (
            <div className="card p-5 space-y-4">
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Account & Security
              </h2>

              {/* Read-only Email display */}
              <div>
                <label htmlFor="settings-email" className="block label mb-1">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                    <Mail size={16} />
                  </div>
                  <input
                    id="settings-email"
                    type="email"
                    disabled
                    value={currentUser?.email || (isGuest ? 'Guest (no email)' : '')}
                    className="w-full input-has-icon pr-3 py-2.5 bg-bg-800/60 border border-overlay-subtle rounded-xl text-sm text-content-muted disabled:opacity-80"
                  />
                </div>
              </div>

              {/* Password Change Expandable Form */}
              {!isGuest && (
                <div className="pt-2 border-t border-overlay-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="item-name text-xs text-content-secondary">Password</p>
                      <p className="text-micro text-content-disabled">Change the password you log in with.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(!showPasswordForm)}
                      className="px-3 py-1.5 hover:bg-overlay-subtle border border-overlay-default text-content-secondary font-semibold text-xs rounded-xl transition-all"
                    >
                      {showPasswordForm ? 'Cancel' : 'Change Password'}
                    </button>
                  </div>

                  {showPasswordForm && (
                    <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
                      <PasswordInput
                        label="New password"
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <PasswordStaircase password={newPassword} />
                      <PasswordInput
                        label="Confirm new password"
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />

                      {passwordMsg && (
                        <div
                          className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                            passwordMsg.type === 'success' ? 'bg-emerald-500/10 text-success-text' : 'bg-rose-500/10 text-error-text'
                          }`}
                        >
                          {passwordMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                          <span>{passwordMsg.text}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isPasswordSaving}
                        className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-on-brand font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isPasswordSaving ? (
                          <>
                            <AscendLoadingIndicator size="sm" />
                            <span>Updating password…</span>
                          </>
                        ) : (
                          'Save New Password'
                        )}
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
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Notifications
              </h2>

              <p className="text-xs text-content-muted">
                Choose which notifications you get.
              </p>

              <div className="space-y-4">
              <div className="divide-y divide-overlay-subtle">
                <div className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <span className="item-name text-xs text-content-secondary block">Push notifications on this device</span>
                    <span className="text-micro text-content-muted">
                      {pushStatus === 'unsupported'
                        ? "This browser can't get push notifications. On iPhone, add Ascend to your Home Screen first."
                        : 'Get your notifications even when Ascend is closed.'}
                    </span>
                  </div>
                  <Switch
                    checked={pushStatus === 'on'}
                    disabled={pushStatus === 'unsupported' || pushStatus === 'denied'}
                    loading={isPushSaving}
                    onChange={handlePushToggle}
                    label="Push notifications on this device"
                  />
                </div>

                {NOTIFICATION_PREFERENCES.map((pref) => (
                  <div key={pref.key} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <span className="item-name text-xs text-content-secondary block">{pref.title}</span>
                      <span className="text-micro text-content-muted">{pref.description}</span>
                    </div>
                    <Switch
                      checked={currentUser?.[pref.key] ?? true}
                      loading={isKeyLoading(`switch:${pref.key}`)}
                      onChange={() => executeWithKey(`switch:${pref.key}`, () => store.toggleNotificationPreference(pref.key))}
                      label={pref.title}
                    />
                  </div>
                ))}

                <div className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <span className="item-name text-xs text-content-secondary block">Focus session alerts</span>
                    <span className="text-micro text-content-muted">A system alert on this device when a focus session ends.</span>
                  </div>
                  <Switch
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
                    label="Focus session alerts"
                  />
                </div>
              </div>

                {notifBrowserPerm === 'denied' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-theme flex items-start gap-2.5 text-xs">
                    <BellOff size={16} className="text-rose-theme shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-rose-theme">Notifications are blocked by your browser</p>
                      <p className="text-micro text-rose-theme-muted leading-relaxed">
                        Allow notifications for this site in your browser settings, or these alerts won't show.
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
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Privacy
              </h2>

              <div className="divide-y divide-overlay-subtle -mt-1">

              {/* Public Stats & Habits Privacy Toggle */}
              <div className="flex items-start justify-between gap-4 py-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="item-name text-xs text-content-secondary">Public profile</span>
                    {(currentUser?.isProfilePublic ?? true) ? (
                      <span className="badge-emerald text-2xs font-medium px-2 py-0.5 rounded-lg">
                        Public
                      </span>
                    ) : (
                      <span className="badge-amber text-2xs font-medium px-2 py-0.5 rounded-lg">
                        Private
                      </span>
                    )}
                  </div>
                  <p className="text-micro text-content-muted leading-relaxed">
                    Show your streak and stats to others on the leaderboards.
                    <br />
                    <em className="text-content-disabled">
                      Hiding your stats also hides other members' stats from you.
                    </em>
                  </p>
                </div>

                <Switch
                  checked={currentUser?.isProfilePublic ?? true}
                  loading={isKeyLoading('switch:privacy')}
                  onChange={() => executeWithKey('switch:privacy', store.toggleProfilePrivacy)}
                  label="Public leaderboard profile and stats"
                  className="mt-1"
                />
              </div>

              {/* Accept Partnership Invites Toggle (TASK 2) */}
              <div className="flex items-start justify-between gap-4 py-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="item-name text-xs text-content-secondary">Partner invites</span>
                    {acceptsInvites ? (
                      <span className="badge-emerald text-2xs font-medium px-2 py-0.5 rounded-lg">
                        Accepting
                      </span>
                    ) : (
                      <span className="text-2xs bg-rose-500/10 text-rose-theme border border-rose-500/20 px-2 py-0.5 rounded-lg font-medium">
                        Blocked
                      </span>
                    )}
                  </div>
                  <p className="text-micro text-content-muted leading-relaxed">
                    Let others find you by your ID and send you partner invites.
                    <br />
                    <em className="text-content-disabled">
                      Turning this off blocks new invites. Current partners stay connected.
                    </em>
                  </p>
                </div>

                <Switch
                  checked={acceptsInvites}
                  loading={isKeyLoading('switch:invites')}
                  onChange={() => executeWithKey('switch:invites', store.toggleAcceptPartnerInvites)}
                  label="Accept partnership invites"
                  className="mt-1"
                />
              </div>
              </div>
            </div>
          )}

          {/* SECTION 5: APPEARANCE */}
          {activeSection === 'appearance' && (
            <div className="card p-5 space-y-4">
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Appearance
              </h2>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Moon size={18} className="text-brand-text" /> : <Sun size={18} className="text-warning-text" />}
                  <div>
                    <p className="item-name text-xs text-content-secondary">Theme</p>
                    <p className="text-micro text-content-muted">
                      {isDarkMode ? 'Dark (default)' : 'Light'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="px-3.5 py-1.5 hover:bg-overlay-subtle border border-overlay-default text-content-secondary font-medium text-xs rounded-xl transition-colors flex items-center gap-1.5"
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
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                Account Management
              </h2>

              <p className="text-xs text-content-muted">
                Log out, or delete your account and all its data.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2.5 hover:bg-overlay-subtle text-content-secondary font-semibold text-xs rounded-xl border border-overlay-default transition-all flex items-center justify-center gap-2"
                >
                  <LogOut size={16} className="text-content-muted" />
                  <span>Log Out</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetDeleteAccountError();
                    setShowDeleteConfirm(true);
                  }}
                  className="bg-rose-500/10 px-4 py-2.5 hover:bg-rose-500/20 text-rose-theme font-medium text-xs rounded-xl border border-rose-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  <span>Delete Account</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 7: ABOUT */}
          {activeSection === 'about' && (
            <div className="card p-5 space-y-4">
              <h2 className="section-title border-b border-overlay-subtle pb-3">
                About Ascend
              </h2>

              <div className="space-y-3">
                <div>
                  <p className="item-name text-sm text-content-secondary">Ascend</p>
                  <p className="text-xs text-content-muted mt-0.5">Version {__APP_VERSION__} • Build {__APP_BUILD__}</p>
                  <p className="text-xs text-content-disabled mt-2 leading-relaxed">
                    Track habits, exercise, reading, and skills, compete in leagues, and keep each other on track with partners.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-overlay-subtle">
                  {NAV_HELP.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onNavigate(id)}
                      className="px-3.5 py-2 hover:bg-overlay-subtle text-content-tertiary text-xs font-medium rounded-xl border border-overlay-default flex items-center gap-1.5 transition-colors"
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  ))}
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
          if (onOpenAuth) onOpenAuth();
        }}
        onLogoutAnyway={handleGuestLogoutAnyway}
        isLoggingOut={isLoggingOut}
      />

      {/* Account Logout Confirmation Modal */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        isLoggingOut={isLoggingOut}
      />

      {/* Delete Account Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete account" maxWidth="max-w-md" preventClose={isDeletingAccount}>
        <div className="space-y-4">
          <div className="p-4 border border-rose-500/30 bg-rose-500/5 rounded-xl flex gap-3">
            <AlertTriangle size={18} className="text-rose-theme shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold leading-tight text-rose-theme">This can't be undone</h3>
              <p className="text-xs text-content-tertiary leading-relaxed">
                This permanently deletes your profile, habits, journal entries, points, league rank, and partner links.
              </p>
            </div>
          </div>

          {deleteAccountError && (
            <p role="alert" className="text-xs text-rose-theme">
              {toUserMessage(deleteAccountError, "Couldn't delete your account. Try again.")}
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 hover:bg-overlay-subtle text-content-tertiary font-semibold text-xs rounded-xl border border-overlay-default transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeletingAccount}
              onClick={handleDeleteAccount}
              className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeletingAccount ? (
                <>
                  <AscendLoadingIndicator size="sm" />
                  <span>Deleting...</span>
                </>
              ) : (
                'Confirm Delete'
              )}
            </button>
          </div>
        </div>
      </Dialog>
      {/* Loading Overlays for Major Actions */}
      {isDeletingAccount && (
        <AscendLoadingOverlay
          message="Deleting your account..."
          submessage="Removing all your data"
        />
      )}
      {isLoggingOut && (
        <AscendLoadingOverlay
          message="Logging out..."
          submessage="Just a moment"
        />
      )}
    </div>
  );
}
