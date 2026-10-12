import { useState, useEffect } from 'react';
import { Mail, User, Check, AlertCircle, LogIn, UserPlus, UserCheck, Shield, Zap } from 'lucide-react';
import { isUsernameAvailable, signUpUser, loginUser, signInAsGuest, upgradeAnonymousUser } from '@/lib/auth';
import { AppState, EMOJI_AVATARS } from '@/types';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { PasswordInput } from './PasswordInput';

/** How long the sign-in/sign-up success screen shows before `onDone` runs. */
const AUTH_SUCCESS_MS = 900;

/** Wraps a promise with an 8-second hard timeout. */
function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('This is taking too long. Check your connection and try again.')), ms)
    ),
  ]);
}

export type AuthPanelMode = 'login' | 'signup' | 'upgrade';

/** The heading for each screen (the page heading). */
export function authPanelTitle(mode: AuthPanelMode): string {
  return mode === 'upgrade' ? 'Save your progress' : mode === 'signup' ? 'Create an account' : 'Sign in';
}

// Screen order for the slide direction: moving forward slides in from the right, back from the left.
const MODE_ORDER: Record<AuthPanelMode, number> = { login: 0, signup: 1, upgrade: 1 };

interface AuthPanelProps {
  /** The screen to show (from the address: /login, /signup, or /signup for a guest). */
  mode: AuthPanelMode;
  /** Called as the success screen starts; the parent keeps the panel shown until onDone. */
  onAuthSuccess?: () => void;
  /** Sign-in, sign-up or guest start finished (after the success screen). */
  onDone: () => void;
  guestState: AppState;
  /**
   * The addresses of the other screens, shown as real links under the form (sign in <-> create
   * account; "Not now" for a guest's upgrade), and how to follow one in-app.
   */
  pageLinks: { login: string; signup: string; dismiss: string; navigate: (href: string) => void };
}

/** A plain left click follows the link in-app; modified/middle clicks keep the browser's own behaviour. */
function inAppClick(href: string, navigate: (href: string) => void) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
}

const PAGE_LINK_CLASS = 'font-medium text-brand-text hover:underline underline-offset-2';

/**
 * The sign-in / sign-up / guest-upgrade form with its success screen. Screen changes slide in;
 * the first screen shown does not.
 */
export function AuthPanel({ mode, onAuthSuccess, onDone, guestState, pageLinks }: AuthPanelProps) {
  const isAnonymousUser = Boolean(guestState.currentUser?.isAnonymous);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [keepGuestProgress, setKeepGuestProgress] = useState(true);

  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTitle, setSuccessTitle] = useState('');

  // Screen switches slide in (direction from MODE_ORDER); the first screen does not. Derived
  // during render so a new screen's first frame animates.
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const [shownMode, setShownMode] = useState(mode);
  if (mode !== shownMode) {
    setShownMode(mode);
    setSlide(MODE_ORDER[mode] > MODE_ORDER[shownMode] ? 'right' : 'left');
  }
  const slideClass = slide === 'right' ? 'animate-slide-in-right' : slide === 'left' ? 'animate-slide-in-left' : '';

  // A guest's upgrade starts from their own username.
  useEffect(() => {
    if (isAnonymousUser) {
      setUsername(guestState.currentUser?.username || '');
      setAvatar('');
    }
  }, [isAnonymousUser, guestState.currentUser]);

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

  const guestPoints = guestState.seasonPoints ?? guestState.totalPoints ?? 0;
  const guestHabitsCount = guestState.habits.length;
  const hasGuestData = guestPoints > 0 || guestHabitsCount > 0;

  /** Shows the success screen, then runs `next`. Reduced motion skips straight to `next`. */
  const finishWithSuccess = async (title: string, next: () => void) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      next();
      return;
    }
    onAuthSuccess?.();
    setSuccessTitle(title);
    await new Promise((resolve) => setTimeout(resolve, AUTH_SUCCESS_MS));
    next();
  };

  const handleGuestSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      await withTimeout(signInAsGuest());
      onDone();
    } catch (err: unknown) {
      const authErr = err as { message?: string };
      setErrorMsg(authErr.message || 'Couldn’t sign in as a guest. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password || (mode !== 'login' && !confirmPassword)) {
      setErrorMsg('Fill in all required fields.');
      return;
    }

    if ((mode === 'signup' || mode === 'upgrade') && !avatar) {
      setErrorMsg('Pick an avatar.');
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
            setErrorMsg(check.reason || 'Pick a valid username that isn’t taken.');
            return;
          }
        }

        await withTimeout(upgradeAnonymousUser(email, password, username, avatar));
        await finishWithSuccess('Progress saved!', () => window.location.reload());
      } else if (mode === 'signup') {
        const check = await isUsernameAvailable(username);
        if (!check.available) {
          setErrorMsg(check.reason || 'Pick a valid username that isn’t taken.');
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
            `Account created. Check ${result.email} for a confirmation link, then sign in.`
          );
          return;
        }

        await finishWithSuccess('Welcome to Ascend!', onDone);
      } else {
        await withTimeout(loginUser(email, password));
        await finishWithSuccess('Welcome back!', onDone);
      }
    } catch (err: unknown) {
      const authErr = err as { code?: string; status?: number; message?: string };
      if (
        authErr.code === 'over_email_send_rate_limit' ||
        authErr.status === 429 ||
        authErr.message?.includes('email rate limit')
      ) {
        setErrorMsg(
          'Too many sign-up attempts. Wait a few minutes and try again.'
        );
      } else {
        setErrorMsg(authErr.message || 'Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const guestButton = (
    <button
      type="button"
      onClick={handleGuestSignIn}
      disabled={loading}
      className="w-full p-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-success-text rounded-2xl border border-emerald-500/30 transition-all flex items-center justify-between group disabled:opacity-50"
    >
      <div className="text-left">
        <div className="font-semibold text-sm flex items-center gap-2 text-success-text">
          <Zap size={15} />
          <span>Continue as Guest</span>
        </div>
        <div className="text-micro opacity-90 mt-0.5">
          Start now. No email or password needed.
        </div>
      </div>
      <UserCheck size={20} className="text-success-text shrink-0" />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Error / Success Notifications */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-error-text text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-success-text text-xs">
          <Check size={16} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Success screen after sign-in / sign-up / upgrade, shown until the modal closes */}
      {successTitle && (
        <div className="flex flex-col items-center text-center py-8" role="status">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center animate-pop">
            <Check size={30} className="text-success-text" />
          </div>
          <p className="mt-4 font-serif text-2xl leading-tight text-content-primary animate-enter-up">{successTitle}</p>
          <p className="mt-1 text-xs text-content-muted animate-enter-up">Opening Ascend…</p>
        </div>
      )}

      {/* Sign in / sign up / save progress */}
      {!successTitle && (
        <div key={mode} className={`space-y-4 ${slideClass}`}>
          <div>
            <h2 className="section-title text-center">
              {mode === 'upgrade'
                ? 'Save your progress'
                : mode === 'signup'
                ? 'Join the leagues'
                : 'Welcome back'}
            </h2>
            <p className="text-xs text-content-muted text-center mt-1">
              {mode === 'upgrade'
                ? 'Turn your guest session into a full account. Your habits, points, and league rank stay.'
                : mode === 'signup'
                ? 'Create an account to compete in weekly, monthly, and 90-day leagues.'
                : 'Sign in to see your habits, rank, and league points.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {(mode === 'signup' || mode === 'upgrade') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-content-tertiary mb-1.5">
                    Leaderboard avatar <span className="text-error-text">*</span>
                  </label>
                  <div className="grid grid-cols-8 gap-1.5 p-2 bg-bg-800 rounded-xl border border-overlay-subtle">
                    {EMOJI_AVATARS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setAvatar(emoji)}
                        className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                          avatar === emoji
                            ? 'bg-primary-500/25 border-2 border-primary-400 scale-110'
                            : 'hover:bg-overlay-subtle'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-tertiary mb-1">
                    Leaderboard username {mode === 'signup' && <span className="text-error-text">*</span>}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      required={mode === 'signup'}
                      placeholder="e.g. Alex_Mastery"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full input-has-icon pr-24 py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all"
                    />
                    {username.trim() && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        {usernameStatus?.available ? (
                          <span className="badge-emerald text-micro font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg">
                            <Check size={12} /> Available
                          </span>
                        ) : usernameStatus?.reason ? (
                          <span className="badge-rose text-micro font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg truncate max-w-[110px]">
                            Not available
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {usernameStatus && !usernameStatus.available && (
                    <p className="text-micro text-error-text mt-1">{usernameStatus.reason}</p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-content-tertiary mb-1">
                Email <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full input-has-icon pr-3 py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all"
                />
              </div>
            </div>

            <PasswordInput
              key={`auth-password-${mode}`}
              label="Password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {(mode === 'signup' || mode === 'upgrade') && (
              <PasswordInput
                key={`auth-confirm-password-${mode}`}
                label="Confirm password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={
                  confirmPassword && password !== confirmPassword
                    ? 'Passwords do not match'
                    : undefined
                }
              />
            )}

            {mode === 'signup' && hasGuestData && (
              <div className="p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-brand-text text-xs font-medium">
                  <UserCheck size={14} />
                  <span>You have guest progress</span>
                </div>
                <p className="text-xs text-content-tertiary">
                  You have <strong className="figure">{guestPoints} points</strong> and <strong className="figure">{guestHabitsCount} habits</strong> created before signing up.
                </p>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={keepGuestProgress}
                    onChange={(e) => setKeepGuestProgress(e.target.checked)}
                    className="rounded border-overlay-strong bg-bg-800 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-xs text-content-secondary">Move this progress to my new account</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-on-brand font-medium text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <AscendLoadingIndicator size="sm" />
                  <span>Please wait…</span>
                </>
              ) : mode === 'upgrade' ? (
                <>
                  <Shield size={18} /> Save to Full Account
                </>
              ) : mode === 'signup' ? (
                <>
                  <UserPlus size={18} /> Create Account
                </>
              ) : (
                <>
                  <LogIn size={18} /> Sign In
                </>
              )}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-xs text-content-muted text-center pt-1">
              Don’t have an account?{' '}
              <a href={pageLinks.signup} onClick={inAppClick(pageLinks.signup, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                Create one
              </a>
            </p>
          )}

          {mode === 'signup' && (
            <div className="space-y-4 pt-1">
              {guestButton}
              <p className="text-xs text-content-muted text-center">
                Already have an account?{' '}
                <a href={pageLinks.login} onClick={inAppClick(pageLinks.login, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                  Sign in
                </a>
              </p>
            </div>
          )}

          {mode === 'upgrade' && (
            <p className="text-xs text-content-muted text-center pt-1">
              <a href={pageLinks.dismiss} onClick={inAppClick(pageLinks.dismiss, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                Not now
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
