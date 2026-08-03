import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Mail, Lock, User, Check, AlertCircle, Sparkles, LogIn, UserPlus, UserCheck, Shield, Zap, ArrowLeft } from 'lucide-react';
import { isUsernameAvailable, signUpUser, loginUser, signInAsGuest, upgradeAnonymousUser } from '@/lib/auth';
import { AppState, EMOJI_AVATARS } from '@/types';

/** Wraps a promise with an 8-second hard timeout. */
function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), ms)
    ),
  ]);
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  guestState: AppState;
}

export function AuthModal({ open, onClose, guestState }: AuthModalProps) {
  const isAnonymousUser = Boolean(guestState.currentUser?.isAnonymous);
  const isAuthenticated = Boolean(guestState.currentUser);

  // 'choice' is the mandatory landing screen for unauthenticated visitors
  const [mode, setMode] = useState<'choice' | 'login' | 'signup' | 'upgrade'>('choice');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('🧑');
  const [keepGuestProgress, setKeepGuestProgress] = useState(true);

  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Set default mode when modal opens
  useEffect(() => {
    if (open) {
      if (isAnonymousUser) {
        setMode('upgrade');
        setUsername(guestState.currentUser?.username || '');
        setAvatar(guestState.currentUser?.avatar || '🧑');
      } else if (!isAuthenticated) {
        setMode('choice');
      }
    } else {
      setLoading(false);
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [open, isAnonymousUser, isAuthenticated, guestState.currentUser]);

  useEffect(() => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(false);
  }, [mode]);

  // Live username availability check
  useEffect(() => {
    if ((mode !== 'signup' && mode !== 'upgrade') || !username.trim()) {
      setUsernameStatus(null);
      return;
    }
    // If upgrading and username hasn't changed from current guest name, don't show taken error
    if (mode === 'upgrade' && username.trim() === guestState.currentUser?.username) {
      setUsernameStatus({ available: true });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await isUsernameAvailable(username, guestState.currentUser?.id);
        setUsernameStatus(result);
      } catch {
        setUsernameStatus({ available: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username, mode, guestState.currentUser]);

  const guestPoints = guestState.totalPoints;
  const guestHabitsCount = guestState.habits.length;
  const hasGuestData = guestPoints > 0 || guestHabitsCount > 0;

  const handleGuestSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      await withTimeout(signInAsGuest());
      onClose();
    } catch (err: unknown) {
      const authErr = err as { message?: string };
      setErrorMsg(authErr.message || 'Failed to sign in as guest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password || (mode !== 'login' && !confirmPassword)) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (mode !== 'login' && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'upgrade') {
        if (username.trim()) {
          const check = await isUsernameAvailable(username, guestState.currentUser?.id);
          if (!check.available && username.trim() !== guestState.currentUser?.username) {
            setErrorMsg(check.reason || 'Please choose a valid available username.');
            return;
          }
        }

        await withTimeout(upgradeAnonymousUser(email, password, username, avatar));
        onClose();
      } else if (mode === 'signup') {
        const check = await isUsernameAvailable(username);
        if (!check.available) {
          setErrorMsg(check.reason || 'Please choose a valid available username.');
          return;
        }

        const result = await withTimeout(
          signUpUser(
            email,
            password,
            username,
            avatar,
            keepGuestProgress && hasGuestData ? guestState : undefined
          )
        );

        if (result.type === 'email_confirmation') {
          setSuccessMsg(
            `Account created! Please check ${result.email} for a confirmation link before signing in.`
          );
          return;
        }

        onClose();
      } else {
        await withTimeout(loginUser(email, password));
        onClose();
      }
    } catch (err: unknown) {
      const authErr = err as { code?: string; status?: number; message?: string };
      if (
        authErr.code === 'over_email_send_rate_limit' ||
        authErr.status === 429 ||
        authErr.message?.includes('email rate limit')
      ) {
        setErrorMsg(
          'Too many sign-up attempts. Please wait a few minutes and try again, or disable "Confirm email" in Supabase Auth settings.'
        );
      } else {
        setErrorMsg(authErr.message || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername(isAnonymousUser ? (guestState.currentUser?.username || '') : '');
    setAvatar(guestState.currentUser?.avatar || '🧑');
    setErrorMsg('');
    setSuccessMsg('');
    setUsernameStatus(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      preventClose={!isAuthenticated}
      title={
        mode === 'choice'
          ? 'Welcome to Ascend'
          : mode === 'upgrade'
          ? 'Save Your Progress'
          : mode === 'signup'
          ? 'Create Account'
          : 'Sign In'
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Error / Success Notifications */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400 text-xs">
            <Check size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. MANDATORY LANDING CHOICE SCREEN (3 Stacked Buttons, NO Form Fields) */}
        {mode === 'choice' && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center mx-auto shadow-lg shadow-primary-500/20 mb-3">
                <Sparkles size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-display font-bold text-slate-100">
                Ascend Self-Growth
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Track habits, build neuroplasticity, and compete in live leagues. Choose how you'd like to get started:
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {/* Option 1: Sign Up */}
              <button
                type="button"
                onClick={() => { setMode('signup'); resetForm(); }}
                className="w-full p-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-2xl shadow-xl transition-all flex items-center justify-between group border border-primary-400/30"
              >
                <div className="text-left">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>Sign Up</span>
                  </div>
                  <div className="text-[11px] text-primary-100/90 mt-0.5">
                    Create a new account with email & password
                  </div>
                </div>
                <UserPlus size={20} className="group-hover:scale-110 transition-transform shrink-0" />
              </button>

              {/* Option 2: Login */}
              <button
                type="button"
                onClick={() => { setMode('login'); resetForm(); }}
                className="w-full p-4 bg-bg-800 hover:bg-bg-700 text-slate-100 rounded-2xl border border-white/10 transition-all flex items-center justify-between group hover:border-white/20"
              >
                <div className="text-left">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>Sign In</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Log in to your existing account
                  </div>
                </div>
                <LogIn size={20} className="text-slate-400 group-hover:text-slate-200 group-hover:scale-110 transition-all shrink-0" />
              </button>

              {/* Option 3: Continue as Guest */}
              <button
                type="button"
                onClick={handleGuestSignIn}
                disabled={loading}
                className="w-full p-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-500/30 transition-all flex items-center justify-between group disabled:opacity-50"
              >
                <div className="text-left">
                  <div className="font-bold text-sm flex items-center gap-2 text-emerald-400">
                    <Zap size={15} />
                    <span>Continue as Guest</span>
                  </div>
                  <div className="text-[11px] text-emerald-400/80 mt-0.5">
                    Instant access — no email or password required
                  </div>
                </div>
                <UserCheck size={20} className="text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* 2. SUB-VIEW FORMS (Sign Up / Login / Upgrade) */}
        {mode !== 'choice' && (
          <div className="space-y-4">
            {/* Header with Back to Options button for unauthenticated users */}
            {!isAuthenticated && (
              <button
                type="button"
                onClick={() => setMode('choice')}
                className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors py-1"
              >
                <ArrowLeft size={14} />
                <span>Back to entry options</span>
              </button>
            )}

            <div>
              <h2 className="text-xl font-display font-bold text-slate-100 text-center">
                {mode === 'upgrade'
                  ? 'Save Your Progress'
                  : mode === 'signup'
                  ? 'Join Ascend Leagues'
                  : 'Welcome Back'}
              </h2>
              <p className="text-xs text-slate-400 text-center mt-1">
                {mode === 'upgrade'
                  ? 'Convert your guest session to a permanent account while keeping all habits, points, and league rank'
                  : mode === 'signup'
                  ? 'Create your account to compete in Weekly, Monthly & 90-Day Leagues'
                  : 'Log in to access your habits, rank, and league points'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {(mode === 'signup' || mode === 'upgrade') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Choose Leaderboard Avatar
                    </label>
                    <div className="grid grid-cols-8 gap-1.5 p-2 bg-bg-800 rounded-xl border border-white/5">
                      {EMOJI_AVATARS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setAvatar(emoji)}
                          className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                            avatar === emoji
                              ? 'bg-primary-500/25 border-2 border-primary-400 scale-110'
                              : 'hover:bg-white/5'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Leaderboard Username {mode === 'signup' && <span className="text-rose-400">*</span>}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <User size={16} />
                      </div>
                      <input
                        type="text"
                        required={mode === 'signup'}
                        placeholder="e.g. Alex_Mastery"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-9 pr-24 py-2.5 bg-bg-800 border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-400 transition-all"
                      />
                      {username.trim() && (
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
                    {usernameStatus && !usernameStatus.available && (
                      <p className="text-[11px] text-rose-400 mt-1">{usernameStatus.reason}</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-bg-800 border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-400 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-bg-800 border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-400 transition-all"
                  />
                </div>
              </div>

              {(mode === 'signup' || mode === 'upgrade') && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Lock size={16} />
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-bg-800 border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary-400 transition-all"
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 font-medium">
                      Passwords do not match
                    </p>
                  )}
                </div>
              )}

              {mode === 'signup' && hasGuestData && (
                <div className="p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-primary-400 text-xs font-semibold">
                    <Sparkles size={14} />
                    <span>Guest Progress Detected</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    You have <strong>{guestPoints} points</strong> and <strong>{guestHabitsCount} habits</strong> created before signing up.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={keepGuestProgress}
                      onChange={(e) => setKeepGuestProgress(e.target.checked)}
                      className="rounded border-white/20 bg-bg-800 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-xs text-slate-200">Keep and attach this progress to my new account</span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Processing...</span>
                ) : mode === 'upgrade' ? (
                  <>
                    <Shield size={18} /> Convert to Permanent Account
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <UserPlus size={18} /> Create Account & Start Competing
                  </>
                ) : (
                  <>
                    <LogIn size={18} /> Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}
