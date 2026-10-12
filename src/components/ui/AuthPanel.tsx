import { useState, useEffect, useRef } from 'react';
import { Mail, User, Check, AlertCircle, LogIn, UserPlus, UserCheck, Shield, Zap, ArrowLeft, ArrowRight } from 'lucide-react';
import { isUsernameAvailable, signUpUser, loginUser, signInAsGuest, upgradeAnonymousUser } from '@/lib/auth';
import { AppState, EMOJI_AVATARS } from '@/types';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { PasswordInput } from './PasswordInput';

/** How long the sign-in/sign-up success screen shows before `onDone` runs. */
const AUTH_SUCCESS_MS = 900;
/** How long the submit button shows its check before the success screen replaces the form. */
const SUBMIT_CHECK_MS = 280;

/** The plain status line under the submit button, per form screen and state. */
const STATUS_LINES: Record<'login' | 'signup-form' | 'upgrade', Record<'empty' | 'ready' | 'submitting' | 'success', string>> = {
  login: {
    empty: 'Enter your email and password.',
    ready: 'Ready.',
    submitting: 'Signing you in…',
    success: 'Signed in.',
  },
  'signup-form': {
    empty: 'Fill in each field to create your account.',
    ready: 'Ready.',
    submitting: 'Creating your account…',
    success: 'Account created.',
  },
  upgrade: {
    empty: 'Fill in each field to save your progress.',
    ready: 'Ready.',
    submitting: 'Saving your progress…',
    success: 'Progress saved.',
  },
};

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

/** /signup opens on a choice (create an account or continue as a guest); the form is its second step. */
export type AuthScreen = 'login' | 'signup-choice' | 'signup-form' | 'upgrade';

/**
 * What the form reports upward so the page can drive its brand panel ("The Climb").
 * - progress: how many required fields on this screen are currently valid (0..steps).
 * - steps: how many required fields this screen has (login 2, signup form / upgrade 5, choice 0).
 * - phase: 'submitting' while a request runs (guest start included), 'success' from the moment
 *   sign-in / sign-up / upgrade succeeds until onDone.
 * - hoverTrail: which choice-screen route is hovered or focused (null elsewhere).
 * - preview: the username and avatar being entered (signup form / upgrade; empty elsewhere).
 */
export interface AuthClimbState {
  screen: AuthScreen;
  progress: number;
  steps: number;
  phase: 'idle' | 'submitting' | 'success';
  hoverTrail: 'account' | 'guest' | null;
  preview: { username: string; avatar: string };
}

/** The browser's own `type="email"` rule (HTML spec), so "valid" here matches what the form accepts. */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** The app's existing minimum for a new password (lib/auth changeUserPassword). Used for the check mark, not to block submit. */
const NEW_PASSWORD_MIN = 6;

// Screen order for the slide direction: moving forward slides in from the right, back from the left.
const SCREEN_ORDER: Record<AuthScreen, number> = { login: 0, 'signup-choice': 1, 'signup-form': 2, upgrade: 1 };

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
  /** Called whenever the climb state changes (screen, valid-field count, phase, hovered route, preview). */
  onClimbChange?: (state: AuthClimbState) => void;
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

const INPUT_CLASS =
  'w-full py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all';

/** A small check that fades and scales in when its field is valid. */
function FieldCheck({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-success-text transition-[opacity,transform] duration-base ease-emphasized ${
        show ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
      }`}
    >
      <Check size={11} strokeWidth={3} />
    </span>
  );
}

/** A field label with the field's check mark at the end of the row. */
function FieldLabel({
  htmlFor,
  required,
  valid,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  valid: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-content-tertiary">
        {children} {required && <span className="text-error-text">*</span>}
      </label>
      <FieldCheck show={valid} />
    </div>
  );
}

/** The focus line: grows from the left along the field's bottom edge. Sits inside a `relative group` wrapper. */
function FocusLine() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary-500 origin-left scale-x-0 transition-transform duration-enter ease-emphasized group-focus-within:scale-x-100"
    />
  );
}

/** 0 (empty) to 4: under the minimum length is always 1; then length and character variety add steps. */
function passwordScore(password: string): number {
  if (!password) return 0;
  if (password.length < NEW_PASSWORD_MIN) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  return Math.min(4, 1 + Number(password.length >= 10) + Number(classes >= 2) + Number(classes >= 3));
}

const STRENGTH_LABELS = ['', 'Weak password', 'Fair password', 'Good password', 'Strong password'];
const STAIR_HEIGHTS = ['h-1', 'h-1.5', 'h-2', 'h-2.5'];

/** Password strength for a new password: four ascending steps that fill as it gets stronger. */
function PasswordStaircase({ password }: { password: string }) {
  const score = passwordScore(password);
  const label = password.length < NEW_PASSWORD_MIN ? `Use ${NEW_PASSWORD_MIN} characters or more` : STRENGTH_LABELS[score];
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div aria-hidden="true" className="flex items-end gap-1">
        {STAIR_HEIGHTS.map((height, i) => (
          <span
            key={height}
            className={`w-5 rounded-sm transition-colors duration-base ${height} ${i < score ? 'bg-emerald-500' : 'bg-bg-600'}`}
          />
        ))}
      </div>
      <p className="text-micro text-content-muted">{label}</p>
    </div>
  );
}

/**
 * The sign-in / sign-up / guest-upgrade form with its success screen. Screen changes slide in;
 * the first screen shown does not.
 */
export function AuthPanel({ mode, onAuthSuccess, onDone, guestState, pageLinks, onClimbChange }: AuthPanelProps) {
  const isAnonymousUser = Boolean(guestState.currentUser?.isAnonymous);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [keepGuestProgress, setKeepGuestProgress] = useState(true);

  // `checkedFor` is the trimmed username the result belongs to, so a result for an older value never counts as valid.
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string; checkedFor?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTitle, setSuccessTitle] = useState('');
  // Set when the request succeeded: the submit button turns into a check just before the success screen.
  const [submitDone, setSubmitDone] = useState(false);
  // Which route option on the choice screen is hovered or focused.
  const [hoverTrail, setHoverTrail] = useState<'account' | 'guest' | null>(null);

  // Screen switches slide in (direction from MODE_ORDER); the first screen does not. Derived
  // during render so a new screen's first frame animates.
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const [signupStep, setSignupStep] = useState<'choice' | 'form'>('choice');
  const [shownMode, setShownMode] = useState(mode);
  if (mode !== shownMode) {
    // Arriving at /signup always starts on the choice.
    setShownMode(mode);
    setSignupStep('choice');
  }
  const screen: AuthScreen = mode === 'signup' ? `signup-${signupStep}` : mode;
  const [shownScreen, setShownScreen] = useState(screen);
  if (screen !== shownScreen) {
    setShownScreen(screen);
    setSlide(SCREEN_ORDER[screen] > SCREEN_ORDER[shownScreen] ? 'right' : 'left');
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
    setSubmitDone(false);
  }, [mode]);

  // Live username availability check
  useEffect(() => {
    if ((mode !== 'signup' && mode !== 'upgrade') || !username.trim()) {
      setUsernameStatus(null);
      return;
    }
    // If upgrading and username hasn't changed from current guest name, don't show taken error
    if (mode === 'upgrade' && username.trim() === guestState.currentUser?.username) {
      setUsernameStatus({ available: true, checkedFor: username.trim() });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await isUsernameAvailable(username, guestState.currentUser?.id);
        setUsernameStatus({ ...result, checkedFor: username.trim() });
      } catch {
        setUsernameStatus({ available: true, checkedFor: username.trim() });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username, mode, guestState.currentUser]);


  // Field validity, using the form's own rules (required fields, type="email", matching confirm).
  const isNewAccount = mode === 'signup' || mode === 'upgrade';
  const trimmedUsername = username.trim();
  const usernameChecked = Boolean(
    trimmedUsername && usernameStatus?.available && usernameStatus.checkedFor === trimmedUsername
  );
  // The username is optional when saving guest progress (only signup marks it required).
  const usernameValid = usernameChecked || (mode === 'upgrade' && !trimmedUsername);
  const avatarValid = Boolean(avatar);
  const emailValid = EMAIL_PATTERN.test(email.trim());
  const passwordValid = isNewAccount ? password.length >= NEW_PASSWORD_MIN : password.length > 0;
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  const steps = screen === 'login' ? 2 : screen === 'signup-choice' ? 0 : 5;
  const progress =
    screen === 'login'
      ? Number(emailValid) + Number(passwordValid)
      : screen === 'signup-choice'
      ? 0
      : Number(usernameValid) + Number(avatarValid) + Number(emailValid) + Number(passwordValid) + Number(confirmValid);
  const formReady = steps > 0 && progress === steps;
  const phase: AuthClimbState['phase'] = submitDone || successTitle ? 'success' : loading ? 'submitting' : 'idle';
  const shownTrail = screen === 'signup-choice' ? hoverTrail : null;
  const showsPreview = screen === 'signup-form' || screen === 'upgrade';
  const previewUsername = showsPreview ? trimmedUsername : '';
  const previewAvatar = showsPreview ? avatar : '';

  // Report the climb state upward. The callback lives in a ref so a new function from the parent
  // on every render never re-fires this (no render loops); only real changes do.
  const onClimbChangeRef = useRef(onClimbChange);
  useEffect(() => {
    onClimbChangeRef.current = onClimbChange;
  }, [onClimbChange]);
  useEffect(() => {
    onClimbChangeRef.current?.({
      screen,
      progress,
      steps,
      phase,
      hoverTrail: shownTrail,
      preview: { username: previewUsername, avatar: previewAvatar },
    });
  }, [screen, progress, steps, phase, shownTrail, previewUsername, previewAvatar]);

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
    setSubmitDone(true);
    await new Promise((resolve) => setTimeout(resolve, SUBMIT_CHECK_MS));
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

  /** Hover/focus handlers that tell the page which route on the choice screen is being considered. */
  const trailHandlers = (trail: 'account' | 'guest') => {
    const clear = () => setHoverTrail((current) => (current === trail ? null : current));
    return {
      onMouseEnter: () => setHoverTrail(trail),
      onMouseLeave: clear,
      onFocus: () => setHoverTrail(trail),
      onBlur: clear,
    };
  };

  const formScreen = screen === 'signup-choice' ? null : screen;
  const statusLine = formScreen
    ? STATUS_LINES[formScreen][phase === 'idle' ? (formReady ? 'ready' : 'empty') : phase]
    : '';

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
        <div key={screen} className={`space-y-4 ${slideClass}`}>
          {/* The page's own h1 names the screen; this line says what it is for. */}
          <p className="text-sm text-content-muted">
            {mode === 'upgrade'
              ? 'Turn your guest session into a full account. Your habits, points, and league rank stay.'
              : mode === 'signup'
              ? 'Create an account to compete in weekly, monthly, and 90-day leagues.'
              : 'Sign in to see your habits, rank, and league points.'}
          </p>

          {screen === 'signup-choice' ? (
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={() => setSignupStep('form')}
                disabled={loading}
                {...trailHandlers('account')}
                className="group w-full p-4 bg-primary-600 hover:bg-primary-700 text-on-brand rounded-xl shadow-sm transition-colors duration-base flex items-center gap-3 text-left disabled:opacity-50"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-white/15 flex items-center justify-center">
                  <UserPlus size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Create account</span>
                  <span className="block text-micro opacity-90 mt-0.5">Compete in weekly, monthly, and 90-day leagues.</span>
                </span>
                <ArrowRight size={18} className="shrink-0 transition-transform duration-base group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={handleGuestSignIn}
                disabled={loading}
                {...trailHandlers('guest')}
                className="group w-full p-4 bg-bg-700 hover:bg-bg-600 border border-overlay-default text-content-primary rounded-xl transition-colors duration-base flex items-center gap-3 text-left disabled:opacity-50"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-bg-800 border border-overlay-subtle text-brand-text flex items-center justify-center">
                  <Zap size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Continue as guest</span>
                  <span className="block text-micro text-content-muted mt-0.5">Start now. No email or password needed.</span>
                </span>
                {loading ? (
                  <AscendLoadingIndicator size="sm" />
                ) : (
                  <ArrowRight size={18} className="shrink-0 text-content-muted transition-transform duration-base group-hover:translate-x-0.5" />
                )}
              </button>
              <p className="text-xs text-content-muted text-center">
                Already have an account?{' '}
                <a href={pageLinks.login} onClick={inAppClick(pageLinks.login, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                  Sign in
                </a>
              </p>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {(mode === 'signup' || mode === 'upgrade') && (
              <>
                <div>
                  <FieldLabel required valid={avatarValid}>
                    Leaderboard avatar
                  </FieldLabel>
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
                  <FieldLabel htmlFor="auth-username" required={mode === 'signup'} valid={usernameChecked}>
                    Leaderboard username
                  </FieldLabel>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                      <User size={16} />
                    </div>
                    <input
                      id="auth-username"
                      type="text"
                      required={mode === 'signup'}
                      placeholder="e.g. Alex_Mastery"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`${INPUT_CLASS} input-has-icon pr-24`}
                    />
                    <FocusLine />
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
              <FieldLabel htmlFor="auth-email" required valid={emailValid}>
                Email
              </FieldLabel>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                  <Mail size={16} />
                </div>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${INPUT_CLASS} input-has-icon pr-3`}
                />
                <FocusLine />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="auth-password" required valid={passwordValid}>
                Password
              </FieldLabel>
              <div className="relative group">
                <PasswordInput
                  key={`auth-password-${mode}`}
                  id="auth-password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <FocusLine />
              </div>
              {isNewAccount && <PasswordStaircase password={password} />}
            </div>

            {isNewAccount && (
              <div>
                <FieldLabel htmlFor="auth-confirm-password" required valid={confirmValid}>
                  Confirm password
                </FieldLabel>
                <div className="relative group">
                  <PasswordInput
                    key={`auth-confirm-password-${mode}`}
                    id="auth-confirm-password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <FocusLine />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-micro text-error-text mt-1 flex items-center gap-1 font-medium">
                    Passwords do not match
                  </p>
                )}
              </div>
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

            {/* Muted until every required field is valid, then primary. Always clickable, so the
                form's own messages still show for a missing field. */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full h-11 border font-medium text-sm rounded-xl shadow-sm transition-colors duration-base flex items-center justify-center gap-2 disabled:cursor-default ${
                formReady || loading || submitDone
                  ? 'bg-primary-600 hover:bg-primary-700 border-transparent text-on-brand'
                  : 'bg-bg-600 hover:bg-bg-500 border-overlay-default text-content-secondary'
              }`}
            >
              {submitDone ? (
                <Check key="done" size={20} strokeWidth={2.5} className="animate-pop" aria-hidden="true" />
              ) : loading ? (
                <span key="loading" className="inline-flex animate-enter-fade">
                  <AscendLoadingIndicator size="sm" />
                  <span className="sr-only">Please wait…</span>
                </span>
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
            <p
              aria-live="polite"
              className={`text-xs text-center transition-colors duration-base ${
                phase === 'success' || (phase === 'idle' && formReady) ? 'text-brand-text' : 'text-content-muted'
              }`}
            >
              {statusLine}
            </p>
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
            <div className="flex items-center justify-between gap-3 pt-1 text-xs text-content-muted">
              <button
                type="button"
                onClick={() => setSignupStep('choice')}
                disabled={loading}
                className="inline-flex items-center gap-1 font-medium hover:text-content-primary transition-colors disabled:opacity-50"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <p>
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
          </>
          )}
        </div>
      )}
    </div>
  );
}
