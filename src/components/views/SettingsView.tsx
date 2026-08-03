import { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Check,
  AlertCircle,
  Clock,
  Lock,
  Mail,
  Bell,
  Eye,
  EyeOff,
  Sun,
  Moon,
  LogOut,
  Trash2,
  HelpCircle,
  MessageSquare,
  Sparkles,
  Shield,
  Copy,
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

interface SettingsViewProps {
  store: AppStore;
  onOpenAuthModal?: () => void;
}

export function SettingsView({ store, onOpenAuthModal }: SettingsViewProps) {
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);
  const userId = currentUser?.id || '';

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

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Account action modals
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [showGuestLogoutWarning, setShowGuestLogoutWarning] = useState(false);

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
  const nowMs = Date.now();
  const msElapsed = lastChangedTs > 0 ? nowMs - lastChangedTs : cooldownMs;
  const isCooldownActive = lastChangedTs > 0 && msElapsed < cooldownMs;

  const msLeft = cooldownMs - msElapsed;
  const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
  const minsLeft = Math.ceil((msLeft % (1000 * 60 * 60)) / (1000 * 60));

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

    setUsernameSaving(true);

    try {
      const nowIso = await updateUsernameWithCooldown(userId, trimmed);
      store.updateProfileUsername(trimmed, nowIso);
      setUsernameMsg({ type: 'success', text: 'Username updated successfully!' });
      setUsernameStatus(null);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setUsernameMsg({ type: 'error', text: error.message || 'Failed to update username.' });
    } finally {
      setUsernameSaving(false);
    }
  };

  // Avatar change handler
  const handleSelectAvatar = async (emoji: string) => {
    if (emoji === currentUser?.avatar) return;
    setSelectedAvatar(emoji);
    setAvatarSaving(true);
    setAvatarMsg(null);

    try {
      await updateUserAvatar(userId, emoji);
      store.updateProfileAvatar(emoji);
      setAvatarMsg(`Avatar updated to ${emoji}!`);
      setTimeout(() => setAvatarMsg(null), 3000);
    } catch (err: unknown) {
      console.error('Failed to update avatar:', err);
    } finally {
      setAvatarSaving(false);
    }
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

    setPasswordSaving(true);

    try {
      await changeUserPassword(newPassword);
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setPasswordMsg({ type: 'error', text: error.message || 'Failed to change password.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  // Logout click handler
  const handleLogout = () => {
    if (isGuest) {
      setShowGuestLogoutWarning(true);
    } else {
      store.logout();
    }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    setDeleteSaving(true);
    try {
      await deleteUserProfileAndData(userId);
      setShowDeleteConfirm(false);
      store.logout();
    } catch (err) {
      console.error('Failed to delete account:', err);
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 shrink-0">
          <Settings size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100">Settings & Preferences</h1>
          <p className="text-xs text-slate-400">Manage your profile, identity, privacy, and account options</p>
        </div>
      </div>

      {/* Guest Mode Banner in Settings */}
      {isGuest && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-primary-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                Temporary Guest Account ({currentUser?.username})
              </p>
              <p className="text-[11px] text-slate-400">
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

      {/* 1. PROFILE & IDENTITY SECTION */}
      <div className="card p-5 space-y-5">
        <h2 className="text-base font-display font-bold text-slate-100 flex items-center gap-2 border-b border-white/5 pb-3">
          <User size={18} className="text-primary-400" />
          Profile Identity
        </h2>

        {/* Permanent 6-Digit User UID */}
        <div className="p-3 bg-bg-800/80 rounded-xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Your Unique User ID (UID)
            </label>
            <p className="text-[11px] text-slate-400">
              Share this permanent 6-digit ID with friends to connect as Accountability Partners.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono font-bold text-sm tracking-widest text-primary-400 bg-primary-500/10 px-3 py-1 rounded-lg border border-primary-500/20">
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
              className="px-2.5 py-1 bg-bg-700 hover:bg-bg-600 border border-white/10 text-slate-200 text-xs font-semibold rounded-lg transition-all flex items-center gap-1"
            >
              {copiedUid ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiedUid ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Username Change Form */}
        <form onSubmit={handleSaveUsername} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-300">
              Leaderboard Username
            </label>
            {isCooldownActive && (
              <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                <Clock size={12} />
                Cooldown: {hoursLeft}h {minsLeft}m left
              </span>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <User size={16} />
            </div>
            <input
              type="text"
              required
              disabled={isCooldownActive || usernameSaving}
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full input-has-icon pr-28 py-2.5 bg-bg-800 border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-400 transition-all disabled:opacity-60"
            />
            {usernameInput.trim() && usernameInput.trim() !== currentUser?.username && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                {usernameStatus?.available ? (
                  <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    <Check size={12} /> Available
                  </span>
                ) : usernameStatus?.reason ? (
                  <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 truncate max-w-[110px]">
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
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              {usernameMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              <span>{usernameMsg.text}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-500">
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
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {usernameSaving ? 'Saving...' : 'Update Username'}
            </button>
          </div>
        </form>

        {/* Avatar Picker (32 Emojis across 4 rows) */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-300">
              Leaderboard Avatar Emoji (32 Choices)
            </label>
            {avatarMsg && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 animate-fade-in">
                <Check size={12} /> {avatarMsg}
              </span>
            )}
          </div>

          <div className="grid grid-cols-8 gap-2 p-3 bg-bg-800 rounded-2xl border border-white/5">
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
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Click any avatar to update immediately. Changes propagate instantly to leaderboards and cards.
          </p>
        </div>
      </div>

      {/* 2. ACCOUNT & SECURITY SECTION */}
      <div className="card p-5 space-y-4">
        <h2 className="text-base font-display font-bold text-slate-100 flex items-center gap-2 border-b border-white/5 pb-3">
          <Lock size={18} className="text-primary-400" />
          Account & Security
        </h2>

        {/* Read-only Email display */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Registered Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Mail size={16} />
            </div>
            <input
              type="email"
              disabled
              value={currentUser?.email || (isGuest ? 'Guest User (No Email)' : '')}
              className="w-full input-has-icon pr-3 py-2.5 bg-bg-800/60 border border-white/5 rounded-xl text-sm text-slate-400 font-mono disabled:opacity-80"
            />
          </div>
        </div>

        {/* Password Change Expandable Form */}
        {!isGuest && (
          <div className="pt-2 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-200">Account Password</p>
                <p className="text-[11px] text-slate-500">Update your login password securely</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="px-3 py-1.5 bg-bg-800 hover:bg-bg-700 border border-white/10 text-slate-200 font-semibold text-xs rounded-xl transition-all"
              >
                {showPasswordForm ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="space-y-3 p-3 bg-bg-800/50 rounded-xl border border-white/5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-800 border border-white/10 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-primary-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-800 border border-white/10 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-primary-400"
                  />
                </div>

                {passwordMsg && (
                  <div
                    className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                      passwordMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {passwordMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                    <span>{passwordMsg.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs rounded-lg shadow-md transition-all disabled:opacity-50"
                >
                  {passwordSaving ? 'Updating Password...' : 'Save New Password'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* 3. PREFERENCES & PRIVACY SECTION */}
      <div className="card p-5 space-y-4">
        <h2 className="text-base font-display font-bold text-slate-100 flex items-center gap-2 border-b border-white/5 pb-3">
          <Eye size={18} className="text-primary-400" />
          Preferences & Privacy
        </h2>

        {/* Public Stats & Habits Privacy Toggle */}
        <div className="flex items-start justify-between gap-4 p-3 bg-bg-800/50 rounded-xl border border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">Public Leaderboard Profile & Stats</span>
              {(currentUser?.isProfilePublic ?? true) ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">
                  Public
                </span>
              ) : (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold">
                  Private
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Show your habit streak and detailed statistics to competitors on public leaderboards.
              <br />
              <em className="text-slate-500">
                (Reciprocal Rule: Hiding your statistics also hides other members' detailed stats from your view).
              </em>
            </p>
          </div>

          <button
            type="button"
            onClick={store.toggleProfilePrivacy}
            className={`w-10 h-5 rounded-full transition-colors relative p-0.5 border shrink-0 mt-1 ${
              (currentUser?.isProfilePublic ?? true) ? 'bg-primary-500 border-primary-400' : 'bg-bg-600 border-white/10'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                (currentUser?.isProfilePublic ?? true) ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Notification Toggles */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Bell size={14} className="text-primary-400" />
            Notification Preferences
          </p>

          <div className="space-y-2">
            <label className="flex items-center justify-between p-2.5 bg-bg-800/40 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-xs text-slate-300">Daily Habit Reminders</span>
              <input
                type="checkbox"
                checked={notifDailyReminder}
                onChange={(e) => setNotifDailyReminder(e.target.checked)}
                className="rounded border-white/20 bg-bg-800 text-primary-500 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-bg-800/40 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-xs text-slate-300">Accountability Partner Activity Alerts</span>
              <input
                type="checkbox"
                checked={notifPartnerActivity}
                onChange={(e) => setNotifPartnerActivity(e.target.checked)}
                className="rounded border-white/20 bg-bg-800 text-primary-500 focus:ring-primary-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-bg-800/40 rounded-xl border border-white/5 cursor-pointer">
              <span className="text-xs text-slate-300">Weekly League Reset & Rank Updates</span>
              <input
                type="checkbox"
                checked={notifLeagueUpdates}
                onChange={(e) => setNotifLeagueUpdates(e.target.checked)}
                className="rounded border-white/20 bg-bg-800 text-primary-500 focus:ring-primary-500"
              />
            </label>
          </div>
        </div>

        {/* Theme Toggle */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isDarkMode ? <Moon size={16} className="text-primary-400" /> : <Sun size={16} className="text-amber-400" />}
            <div>
              <p className="text-xs font-bold text-slate-200">Appearance Theme</p>
              <p className="text-[11px] text-slate-400">{isDarkMode ? 'Dark Mode (Default Glassmorphism)' : 'Light Mode'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="px-3 py-1.5 bg-bg-800 hover:bg-bg-700 border border-white/10 text-slate-200 font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            <span>Switch to {isDarkMode ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>

      {/* 4. ACCOUNT ACTIONS & DANGER ZONE */}
      <div className="card p-5 space-y-4 border border-rose-500/20">
        <h2 className="text-base font-display font-bold text-slate-100 flex items-center gap-2 border-b border-white/5 pb-3">
          <Shield size={18} className="text-rose-400" />
          Account Management
        </h2>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2.5 bg-bg-800 hover:bg-bg-700 text-slate-200 font-semibold text-xs rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={16} className="text-slate-400" />
            <span>Log Out of Account</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs rounded-xl border border-rose-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            <span>Delete Account & Purge Data</span>
          </button>
        </div>
      </div>

      {/* 5. APP INFO & FEEDBACK */}
      <div className="card p-5 space-y-3 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-300">Ascend Self-Growth Platform</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Version 1.2.0 • Build 2026.08</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => alert('Ascend Feedback & Support: Contact support@ascendgrowth.app')}
              className="px-3 py-1.5 bg-bg-800 hover:bg-bg-700 text-slate-300 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5"
            >
              <MessageSquare size={14} />
              <span>Feedback</span>
            </button>
            <button
              type="button"
              onClick={() => alert('Ascend Documentation & Guide: See Help section in sidebar.')}
              className="px-3 py-1.5 bg-bg-800 hover:bg-bg-700 text-slate-300 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5"
            >
              <HelpCircle size={14} />
              <span>Help</span>
            </button>
          </div>
        </div>
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

      {/* Delete Account Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Account Permanently" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100">Permanent Action</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                This will permanently remove your profile, habits, journal entries, points, league rank, and partner links from Supabase. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 bg-bg-800 hover:bg-bg-700 text-slate-300 font-semibold text-xs rounded-xl border border-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteSaving}
              onClick={handleDeleteAccount}
              className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {deleteSaving ? 'Purging Data...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
