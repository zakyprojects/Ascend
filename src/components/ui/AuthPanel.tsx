import { useState, useEffect, useRef } from 'react';
import { Mail, User, Check, LogIn, UserPlus, ArrowLeft, ArrowRight } from 'lucide-react';
import { isUsernameAvailable, signUpUser, loginUser, signInAsGuest, upgradeAnonymousUser, requestPasswordReset, signInWithGoogle, takeGoogleSignInError } from '@/lib/auth';
import { AppState, EMOJI_AVATARS } from '@/types';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { PasswordInput } from './PasswordInput';
import { FieldErrorBubble, FieldMessage, Form, FormAlert, focusField, isFinePointer, useFormController } from './primitives';
import { PasswordStaircase } from './PasswordStaircase';
import { newPasswordProblem } from '@/lib/passwordRules';
import { toUserMessage } from '@/lib/userMessage';
import { looksLikeUsername } from '@/lib/usernameRules';
import { preloadCaptcha, withCaptcha } from '@/lib/captcha';
import { CaptchaSlot } from '@/components/ui/CaptchaSlot';
import { LEGAL_CONTACT_EMAIL, MIN_AGE } from '@/lib/legal';
import { pathForLegalRoute } from '@/lib/routes';

/** How long the sign-in/sign-up success screen shows before `onDone` runs. */
const AUTH_SUCCESS_MS = 900;
/** How long the submit button shows its check before the success screen replaces the form. */
const SUBMIT_CHECK_MS = 280;

/** The plain status line under the submit button, per form screen and state. */
const STATUS_LINES: Record<'login' | 'signup-form' | 'upgrade', Record<'empty' | 'ready' | 'submitting' | 'success', string>> = {
  login: {
    empty: 'Enter your email or username and password.',
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

/** After this long a request still running shows the slow-connection line instead of its usual one. */
const SLOW_HINT_MS = 6000;
const SLOW_STATUS_LINE = 'Slow connection, still trying…';

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
 * - focus: the form field that has focus (null for none, or for a control that is not a text field).
 * - caret: where the caret sits in the focused email/username field, 0 (start) to 1 (end of the
 *   field's visible width), in steps of 1/40 so small moves do not report.
 * - passwordVisible: the focused password field shows its text (show/hide toggle).
 * - errorTick: goes up by one each time the form shows an error message.
 * - upset: an error was shown and the user has not changed any field since (or left the screen).
 */
export type AuthFocus = 'email' | 'password' | 'confirm' | 'username' | null;

export interface AuthClimbState {
  screen: AuthScreen;
  progress: number;
  steps: number;
  phase: 'idle' | 'submitting' | 'success';
  hoverTrail: 'account' | 'guest' | null;
  preview: { username: string; avatar: string };
  focus: AuthFocus;
  caret: number;
  passwordVisible: boolean;
  errorTick: number;
  upset: boolean;
}

/**
 * Guest: a profile with no account behind it. Lucide's circle-user-round with the outer ring dashed
 * (lucide has no guest icon), drawn in lucide's grid and stroke so it sits with the other icons.
 */
function GuestIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* pathLength 60 with 3/2 dashes: twelve even dashes, no seam where the ring closes. */}
      <circle cx="12" cy="12" r="10" pathLength={60} strokeDasharray="3 2" />
      <circle cx="12" cy="10" r="4" />
      <path d="M18 20a6 6 0 0 0-12 0" />
    </svg>
  );
}

/** Google's "G" mark in its own colours, as its sign-in branding asks. */
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The form's fields by element id, as the page's mascot knows them. */
const FIELD_FOCUS: Record<string, Exclude<AuthFocus, null>> = {
  'auth-email': 'email',
  'auth-password': 'password',
  'auth-confirm-password': 'confirm',
  'auth-username': 'username',
};

let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * The caret's position across a text field's visible width, 0..1: the width of the text before
 * the caret (email fields have no selection API, so their caret counts as the end), measured in
 * the field's own font.
 */
function caretFraction(input: HTMLInputElement): number {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d');
  const style = getComputedStyle(input);
  const inner = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (!measureContext || inner <= 0) return 0;
  let at = input.value.length;
  try {
    at = input.selectionStart ?? at;
  } catch {
    // type="email" in some browsers throws instead of returning null.
  }
  measureContext.font = style.font;
  const width = measureContext.measureText(input.value.slice(0, at)).width - input.scrollLeft;
  return Math.round(Math.min(1, Math.max(0, width / inner)) * 40) / 40;
}

/** The browser's own `type="email"` rule (HTML spec), so "valid" here matches what the form accepts. */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

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
  /** The page's heading; rendered here so the sign-up form's Back link can sit above it. */
  title: React.ReactNode;
  /** /login?forgot=1 (from an expired reset link) opens on the "Forgot password" step. */
  startForgot?: boolean;
}

/** Whether a screen shows the form (the signup choice does not). */
function formScreenFor(screen: AuthScreen): boolean {
  return screen !== 'signup-choice';
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

/** The Terms and Privacy Policy, in a new tab so the form here keeps what was typed. */
function LegalLinks() {
  return (
    <>
      the{' '}
      <a href={pathForLegalRoute('terms')} target="_blank" rel="noopener noreferrer" className={PAGE_LINK_CLASS}>
        Terms
      </a>{' '}
      and{' '}
      <a href={pathForLegalRoute('privacy')} target="_blank" rel="noopener noreferrer" className={PAGE_LINK_CLASS}>
        Privacy Policy
      </a>
    </>
  );
}
/** Seconds after a reset email before "Resend" is offered (matches Supabase's per-email resend window). */
const RESET_RESEND_SECONDS = 60;

const INPUT_CLASS =
  'w-full py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 aria-[invalid=true]:border-rose-500/70 transition-all';

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
      <label htmlFor={htmlFor} className="block label">
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

/**
 * The sign-in / sign-up / guest-upgrade form with its success screen. Screen changes slide in;
 * the first screen shown does not.
 */
export function AuthPanel({ mode, onAuthSuccess, onDone, guestState, pageLinks, onClimbChange, title, startForgot = false }: AuthPanelProps) {
  const isAnonymousUser = Boolean(guestState.currentUser?.isAnonymous);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  // Sign-up only: "I'm 13 or older and I agree to the Terms and Privacy Policy".
  const [termsAccepted, setTermsAccepted] = useState(false);

  // `checkedFor` is the trimmed username the result belongs to, so a result for an older value never counts as valid.
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason?: string; checkedFor?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // "Continue with Google": its own error (also when Google sent the page back with one) and busy state.
  const [googleError, setGoogleError] = useState(() => takeGoogleSignInError() ?? '');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  // True once the current request has run for SLOW_HINT_MS; reset when it ends.
  const [slow, setSlow] = useState(false);
  const [successTitle, setSuccessTitle] = useState('');
  // Set when the request succeeded: the submit button turns into a check just before the success screen.
  const [submitDone, setSubmitDone] = useState(false);
  // Which route option on the choice screen is hovered or focused.
  const [hoverTrail, setHoverTrail] = useState<'account' | 'guest' | null>(null);
  // For the page's mascot: which field has focus, where its caret is, whether a password is
  // shown, and a count of errors shown.
  const [focus, setFocus] = useState<AuthFocus>(null);
  const [caret, setCaret] = useState(0);
  const [shownPasswords, setShownPasswords] = useState({ password: false, confirm: false });
  const [errorTick, setErrorTick] = useState(0);
  // The field values when the last error was shown; the mascot stays upset until one changes.
  const [errorInputs, setErrorInputs] = useState<string | null>(null);
  const inputsKey = [email, password, confirmPassword, username, avatar, termsAccepted].join('\u0000');

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Sign-in, sign-up, guest and reset pass the bot check (saving a guest's progress does not).
  useEffect(() => {
    if (mode !== 'upgrade') preloadCaptcha();
  }, [mode]);

  // Screen switches slide in (direction from MODE_ORDER); the first screen does not. Derived
  // during render so a new screen's first frame animates.
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const [signupStep, setSignupStep] = useState<'choice' | 'form'>('choice');
  // Sign in's second step: ask for a password-reset email. `resetSentTo` = the email it went to.
  const [loginStep, setLoginStep] = useState<'form' | 'forgot'>(startForgot && mode === 'login' ? 'forgot' : 'form');
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  // Seconds left before the reset email can be resent; counts down while the "sent" screen shows.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (!resetSentTo || resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resetSentTo, resendIn]);
  const [shownMode, setShownMode] = useState(mode);
  if (mode !== shownMode) {
    // Arriving at /signup always starts on the choice; /login on the sign-in form.
    setShownMode(mode);
    setSignupStep('choice');
    setLoginStep('form');
    setResetSentTo(null);
    // Each screen starts with empty credentials: a login (or browser-autofilled) email and
    // password never carry into Create account, and back.
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setTermsAccepted(false);
  }
  const forgot = mode === 'login' && loginStep === 'forgot';
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
    // The password fields remount per mode (their key), so they start hidden again.
    setShownPasswords({ password: false, confirm: false });
  }, [mode]);

  // A new screen mounts new fields; nothing has focus until one of them takes it.
  useEffect(() => {
    setFocus(null);
    setErrorInputs(null);
  }, [screen]);

  // With a mouse/trackpad each form screen (first shown, or switched to: log in, sign up, forgot,
  // upgrade) puts focus in its first field; touch skips it (the keyboard would cover the page first).
  const screenKey = forgot ? 'login-forgot' : screen;
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isFinePointer()) return;
    const field = screenRef.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])');
    if (field) focusField(field, { preventScroll: true });
  }, [screenKey]);

  const form = useFormController();
  const forgotForm = useFormController();
  /** Counts each problem shown, so the page (mascot) can react to it. */
  const noteError = () => {
    setErrorTick((tick) => tick + 1);
    setErrorInputs(inputsKey);
  };
  /** Shows a problem in the form's bubble: on `field` when it names one, else above the submit button. */
  const showError = (message: string, field?: string) => form.showError(message, field);

  const trackCaret = (target: EventTarget) => {
    if (!(target instanceof HTMLInputElement)) return;
    const field = FIELD_FOCUS[target.id];
    if (field === 'email' || field === 'username') setCaret(caretFraction(target));
  };
  const formFocusHandlers = {
    onFocus: (event: React.FocusEvent<HTMLFormElement>) => {
      setFocus(FIELD_FOCUS[event.target.id] ?? null);
      trackCaret(event.target);
    },
    onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
      // Moving straight to another field: its own focus event sets the new value.
      const next = event.relatedTarget;
      if (next instanceof HTMLElement && FIELD_FOCUS[next.id]) return;
      setFocus(null);
    },
    onSelect: (event: React.SyntheticEvent<HTMLFormElement>) => trackCaret(event.target),
    onInput: (event: React.FormEvent<HTMLFormElement>) => trackCaret(event.target),
  };

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

    // A newer value cancels an older check, so a late answer never lands on a newer name.
    let cancelled = false;
    setUsernameStatus(null);
    const timer = setTimeout(async () => {
      try {
        const result = await isUsernameAvailable(username, guestState.currentUser?.id);
        if (cancelled) return;
        // Couldn't check (offline, server error): no badge; the server still refuses a taken name on save.
        setUsernameStatus(result.unknown ? null : { ...result, checkedFor: username.trim() });
      } catch {
        if (!cancelled) setUsernameStatus(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
  // Sign in takes an email or a username in the same field.
  const loginIdValid = emailValid || (!email.includes('@') && looksLikeUsername(email));
  const passwordValid = isNewAccount ? !newPasswordProblem(password) : password.length > 0;
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  const steps = forgot ? 1 : screen === 'login' ? 2 : screen === 'signup-choice' ? 0 : 5;
  const progress =
    forgot
      ? Number(emailValid)
      : screen === 'login'
      ? Number(loginIdValid) + Number(passwordValid)
      : screen === 'signup-choice'
      ? 0
      : Number(usernameValid) + Number(avatarValid) + Number(emailValid) + Number(passwordValid) + Number(confirmValid);
  // The agreement box is not a climb step; the form is only ready once it is ticked.
  const formReady = steps > 0 && progress === steps && (screen !== 'signup-form' || termsAccepted);
  const phase: AuthClimbState['phase'] = submitDone || successTitle ? 'success' : loading ? 'submitting' : 'idle';
  const shownTrail = screen === 'signup-choice' ? hoverTrail : null;
  const showsPreview = screen === 'signup-form' || screen === 'upgrade';
  const previewUsername = showsPreview ? trimmedUsername : '';
  const previewAvatar = showsPreview ? avatar : '';
  const shownFocus: AuthFocus = formScreenFor(screen) ? focus : null;
  const passwordVisible =
    shownFocus === 'password' ? shownPasswords.password : shownFocus === 'confirm' ? shownPasswords.confirm : false;
  const shownCaret = shownFocus === 'email' || shownFocus === 'username' ? caret : 0;
  const upset = phase === 'idle' && errorInputs !== null && errorInputs === inputsKey;

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
      focus: shownFocus,
      caret: shownCaret,
      passwordVisible,
      errorTick,
      upset,
    });
  }, [screen, progress, steps, phase, shownTrail, previewUsername, previewAvatar, shownFocus, shownCaret, passwordVisible, errorTick, upset]);

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

  // Leaves for Google; on success the page navigates away, so the busy state stays until then.
  const handleGoogleSignIn = async () => {
    setGoogleError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle(window.location.pathname + window.location.search);
    } catch (err: unknown) {
      setGoogleError(toUserMessage(err, 'Couldn’t open Google sign-in. Try again.'));
      setGoogleLoading(false);
    }
  };

  const googleButton = (
    <>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading || googleLoading}
        className="w-full h-11 bg-bg-700 hover:bg-bg-600 border border-overlay-default text-content-primary font-medium text-sm rounded-xl transition-colors duration-base flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-default"
      >
        {googleLoading ? (
          <>
            <AscendLoadingIndicator size="sm" />
            <span className="sr-only">Opening Google…</span>
          </>
        ) : (
          <>
            <GoogleIcon /> Continue with Google
          </>
        )}
      </button>
      {googleError && <FieldErrorBubble message={googleError} attached={false} />}
    </>
  );

  const handleGuestSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      // The timeout covers each Auth call, not the bot check before it.
      await withCaptcha('guest', (captchaToken) => withTimeout(signInAsGuest(captchaToken)));
      onDone();
    } catch (err: unknown) {
      console.error('Guest sign-in failed:', err);
      const authErr = err as { code?: string; status?: number };
      // Supabase caps guest sign-ins per network; its own text ("Request rate limit reached") is unclear.
      const rateLimited = authErr.status === 429 || authErr.code === 'over_request_rate_limit';
      setErrorMsg(
        rateLimited
          ? 'Too many guest sign-ins from this network. Wait an hour, or create a free account.'
          : toUserMessage(err, 'Couldn’t sign in as a guest. Try again.')
      );
      noteError();
    } finally {
      setLoading(false);
    }
  };

  // Rules the fields can't express; the fields' own rules (required, email) are checked first.
  const validateAuth = () => {
    if (mode === 'login' && !loginIdValid) return { message: 'Enter your email or username.', field: 'auth-email' };
    if ((mode === 'signup' || mode === 'upgrade') && !avatar) return { message: 'Pick an avatar.', field: 'auth-avatar' };
    const passwordProblem = isNewAccount ? newPasswordProblem(password) : null;
    if (passwordProblem) return { message: `${passwordProblem}.`, field: 'auth-password' };
    if (isNewAccount && password !== confirmPassword) return { message: 'Passwords don’t match.', field: 'auth-confirm-password' };
    if (mode === 'signup' && !termsAccepted) return { message: 'Tick this box to continue.', field: 'auth-terms' };
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    setLoading(true);

    try {
      if (mode === 'upgrade') {
        if (username.trim()) {
          const check = await isUsernameAvailable(username, guestState.currentUser?.id);
          if (!check.available && username.trim() !== guestState.currentUser?.username) {
            showError(check.reason || 'Pick a valid username that isn’t taken.', 'auth-username');
            return;
          }
        }

        await withTimeout(upgradeAnonymousUser(email, password, username, avatar));
        // USER_UPDATED re-loads the same account (store), so no page reload is needed.
        await finishWithSuccess('Progress saved!', onDone);
      } else if (mode === 'signup') {
        const check = await isUsernameAvailable(username);
        if (!check.available) {
          showError(check.reason || 'Pick a valid username that isn’t taken.', 'auth-username');
          return;
        }

        const result = await withCaptcha('sign_up', (captchaToken) =>
          withTimeout(
            signUpUser(
              email,
              password,
              username,
              avatar,
              captchaToken
            )
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
        await withCaptcha('sign_in', (captchaToken) => withTimeout(loginUser(email, password, captchaToken)));
        await finishWithSuccess('Welcome back!', onDone);
      }
    } catch (err: unknown) {
      const authErr = err as { code?: string; status?: number; message?: string };
      if (
        authErr.code === 'over_email_send_rate_limit' ||
        authErr.status === 429 ||
        authErr.message?.includes('email rate limit')
      ) {
        showError(
          mode === 'login'
            ? 'Too many sign-in attempts. Wait a few minutes and try again.'
            : 'Too many sign-up attempts. Wait a few minutes and try again.'
        );
      } else {
        showError(toUserMessage(err, 'Something went wrong. Try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * "Forgot password": sends the reset email. The answer never says whether the email has an account
   * (saying "no account" would let anyone check who uses Ascend), so the sent screen is the same for both.
   */
  const sendResetEmail = async (to: string, showError: (message: string) => void) => {
    setLoading(true);
    try {
      await withCaptcha('password_reset', (captchaToken) => withTimeout(requestPasswordReset(to, captchaToken)));
      setResetSentTo(to.trim());
      setResendIn(RESET_RESEND_SECONDS);
    } catch (err: unknown) {
      console.error('Password reset email failed:', err);
      const authErr = err as { code?: string; status?: number; message?: string };
      if (authErr.code === 'over_email_send_rate_limit' || authErr.status === 429 || authErr.message?.includes('rate limit')) {
        // Supabase's hourly cap for auth emails.
        showError('Too many reset emails right now. Try again in about an hour.');
      } else if (authErr.status === 500 || authErr.message?.toLowerCase().includes('error sending')) {
        // The mail service refused it (for example its daily cap); Supabase gives the same error for every
        // such cause, so the text names no exact time.
        showError(`We couldn’t send the email right now. Try again later, or use Continue with Google if your account uses the same email. If it keeps failing, write to ${LEGAL_CONTACT_EMAIL}.`);
      } else {
        showError(toUserMessage(err, 'Couldn’t send the email. Try again.'));
      }
    } finally {
      setLoading(false);
    }
  };
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendResetEmail(email, forgotForm.showError);
  };
  const [resendError, setResendError] = useState<string | null>(null);
  const handleResend = () => {
    if (!resetSentTo) return;
    setResendError(null);
    void sendResetEmail(resetSentTo, setResendError);
  };
  const useDifferentEmail = () => {
    setResendError(null);
    setResetSentTo(null);
  };

  const openForgot = () => {
    // The reset goes to an email; a username typed to sign in is not carried over.
    if (!email.includes('@')) setEmail('');
    setSlide('right');
    setResetSentTo(null);
    setResendError(null);
    setLoginStep('forgot');
    setFocus(null);
  };
  const closeForgot = () => {
    setSlide('left');
    setLoginStep('form');
    setFocus(null);
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
  const statusLine = !formScreen
    ? ''
    : phase === 'submitting' && slow
    ? SLOW_STATUS_LINE
    : STATUS_LINES[formScreen][phase === 'idle' ? (formReady ? 'ready' : 'empty') : phase];
  const forgotStatus = loading ? (slow ? SLOW_STATUS_LINE : 'Sending…') : emailValid ? 'Ready.' : 'Enter the email you sign in with.';

  return (
    <div>
      {screen === 'signup-form' && !successTitle && (
        <button
          type="button"
          onClick={() => setSignupStep('choice')}
          disabled={loading}
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-content-muted hover:text-content-primary transition-colors disabled:opacity-50"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back
        </button>
      )}
      {forgot && !successTitle ? (
        <h1 id="auth-page-title" className="text-2xl sm:text-3xl font-semibold tracking-tight text-content-primary">
          Reset your password
        </h1>
      ) : (
        title
      )}
      <div className="mt-2 space-y-4">
        {/* Error / Success Notifications */}
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
          <div key={screenKey} ref={screenRef} className={`space-y-4 ${slideClass}`}>
            {/* The page's own h1 names the screen; this line says what it is for. */}
            <p className="text-sm text-content-muted">
              {forgot
                ? 'Forgot your password? Enter your email and we’ll send you a link to set a new one.'
                : mode === 'upgrade'
                ? 'Turn your guest progress into a full account. Your habits, points, and league rank stay.'
                : mode === 'signup'
                ? 'Create an account to compete in weekly, monthly, and 90-day leagues.'
                : 'Sign in to see your habits, rank, and league points.'}
            </p>

            {forgot ? (
              resetSentTo ? (
                <div className="space-y-4">
                  <div role="status" className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-xs text-content-primary">
                    <Mail size={16} aria-hidden="true" className="shrink-0 mt-0.5 text-success-text" />
                    <span>
                      If <span className="font-medium break-all">{resetSentTo}</span> has an Ascend account, we’ve sent it a link
                      to set a new password. It can take a minute.
                    </span>
                  </div>
                  <div className="text-xs text-content-muted space-y-1.5">
                    <p className="font-medium text-content-secondary">No email?</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Check your spam or promotions folder.</li>
                      <li>Make sure it’s the email you signed up with. A typo or another address gets nothing.</li>
                      <li>
                        No account yet?{' '}
                        <a href={pageLinks.signup} onClick={inAppClick(pageLinks.signup, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                          Create one
                        </a>
                      </li>
                    </ul>
                  </div>
                  {resendError && (
                    <p role="alert" className="text-xs text-error-text">
                      {resendError}
                    </p>
                  )}
                  <CaptchaSlot />
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={closeForgot} disabled={loading} className="btn-primary w-full min-h-11">
                      <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading || resendIn > 0}
                      className="btn-ghost w-full min-h-11 text-xs disabled:opacity-60 disabled:cursor-default"
                    >
                      {loading ? 'Sending…' : resendIn > 0 ? `Resend email in ${resendIn}s` : 'Resend email'}
                    </button>
                    <button type="button" onClick={useDifferentEmail} disabled={loading} className="btn-ghost w-full min-h-11 text-xs">
                      Use a different email
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Form
                    onSubmit={handleForgotSubmit}
                    controller={forgotForm}
                    alert="manual"
                    onIssue={noteError}
                    className="space-y-3.5"
                    {...formFocusHandlers}
                  >
                    <div data-field="auth-email">
                      <FieldLabel htmlFor="auth-email" required valid={emailValid}>
                        Email
                      </FieldLabel>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                          <Mail size={16} aria-hidden="true" />
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
                      <FieldMessage htmlFor="auth-email" />
                    </div>
                    <FormAlert />
                    <CaptchaSlot />
                    <button
                      type="submit"
                      disabled={loading}
                      className={`w-full h-11 border font-medium text-sm rounded-xl shadow-sm transition-colors duration-base flex items-center justify-center gap-2 disabled:cursor-default ${
                        emailValid || loading
                          ? 'bg-primary-600 hover:bg-primary-700 border-transparent text-on-brand'
                          : 'bg-bg-600 hover:bg-bg-500 border-overlay-default text-content-secondary'
                      }`}
                    >
                      {loading ? (
                        <span className="inline-flex animate-enter-fade">
                          <AscendLoadingIndicator size="sm" />
                          <span className="sr-only">Sending…</span>
                        </span>
                      ) : (
                        'Send reset link'
                      )}
                    </button>
                    <p aria-live="polite" className="text-xs text-center text-content-muted">
                      {forgotStatus}
                    </p>
                  </Form>
                  <p className="text-xs text-content-muted text-center pt-1">
                    Remembered it?{' '}
                    <button type="button" onClick={closeForgot} disabled={loading} className={PAGE_LINK_CLASS}>
                      Back to sign in
                    </button>
                  </p>
                </>
              )
            ) : screen === 'signup-choice' ? (
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
                {googleButton}
                <button
                  type="button"
                  onClick={handleGuestSignIn}
                  disabled={loading}
                  {...trailHandlers('guest')}
                  className="group w-full p-4 bg-bg-700 hover:bg-bg-600 border border-overlay-default text-content-primary rounded-xl transition-colors duration-base flex items-center gap-3 text-left disabled:opacity-50"
                >
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-bg-800 border border-overlay-subtle text-brand-text flex items-center justify-center">
                    <GuestIcon size={18} />
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
                <CaptchaSlot />
                {errorMsg && <FieldErrorBubble message={errorMsg} attached={false} />}
                <p className="text-xs text-content-muted text-center">
                  By continuing, you confirm you’re {MIN_AGE} or older and agree to <LegalLinks />.
                </p>
                <p className="text-xs text-content-muted text-center">
                  Already have an account?{' '}
                  <a href={pageLinks.login} onClick={inAppClick(pageLinks.login, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                    Sign in
                  </a>
                </p>
              </div>
            ) : (
            <>
            <Form
              onSubmit={handleSubmit}
              validate={validateAuth}
              controller={form}
              alert="manual"
              onIssue={noteError}
              className="space-y-3.5"
              {...formFocusHandlers}
            >
              {(mode === 'signup' || mode === 'upgrade') && (
                <>
                  <div data-field="auth-avatar">
                    <FieldLabel required valid={avatarValid}>
                      Leaderboard avatar
                    </FieldLabel>
                    <div
                      id="auth-avatar"
                      role="group"
                      aria-label="Leaderboard avatar"
                      tabIndex={-1}
                      className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-2 bg-bg-800 rounded-xl border border-overlay-subtle outline-none aria-[invalid=true]:border-rose-500/70"
                    >
                      {EMOJI_AVATARS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Select avatar ${emoji}`}
                          aria-pressed={avatar === emoji}
                          onClick={() => setAvatar(emoji)}
                          className={`min-h-11 w-full rounded-lg text-lg flex items-center justify-center transition-all ${
                            avatar === emoji
                              ? 'bg-primary-500/25 border-2 border-primary-400 scale-110'
                              : 'hover:bg-overlay-subtle'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <FieldMessage htmlFor="auth-avatar" />
                  </div>

                  <div data-field="auth-username">
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
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={`${INPUT_CLASS} input-has-icon pr-24`}
                      />
                      <FocusLine />
                      {trimmedUsername && usernameStatus?.checkedFor === trimmedUsername && (
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
                    {usernameStatus && usernameStatus.checkedFor === trimmedUsername && !usernameStatus.available && usernameStatus.reason ? (
                      <FieldErrorBubble message={usernameStatus.reason} />
                    ) : (
                      <FieldMessage htmlFor="auth-username" />
                    )}
                  </div>
                </>
              )}

              <div data-field="auth-email">
                <FieldLabel htmlFor="auth-email" required valid={mode === 'login' ? loginIdValid : emailValid}>
                  {mode === 'login' ? 'Email or username' : 'Email'}
                </FieldLabel>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
                    {mode === 'login' ? <User size={16} /> : <Mail size={16} />}
                  </div>
                  {mode === 'login' ? (
                    <input
                      id="auth-email"
                      type="text"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      placeholder="you@example.com or your username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${INPUT_CLASS} input-has-icon pr-3`}
                    />
                  ) : (
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
                  )}
                  <FocusLine />
                </div>
                <FieldMessage htmlFor="auth-email" />
              </div>

              <div data-field="auth-password">
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
                    onVisibilityChange={(visible) => setShownPasswords((shown) => ({ ...shown, password: visible }))}
                    hideMessage
                  />
                  <FocusLine />
                </div>
                <FieldMessage htmlFor="auth-password" />
                {isNewAccount && <PasswordStaircase password={password} />}
                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={openForgot}
                      disabled={loading}
                      className="min-h-11 -mb-2 px-1 text-xs font-medium text-brand-text hover:underline underline-offset-2 disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              {isNewAccount && (
                <div data-field="auth-confirm-password">
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
                      onVisibilityChange={(visible) => setShownPasswords((shown) => ({ ...shown, confirm: visible }))}
                      hideMessage
                    />
                    <FocusLine />
                  </div>
                  <FieldMessage htmlFor="auth-confirm-password" />

                </div>
              )}

              {mode === 'signup' && (
                <div data-field="auth-terms">
                  <label htmlFor="auth-terms" className="flex items-start gap-2.5 py-1 text-xs leading-relaxed text-content-secondary cursor-pointer">
                    <input
                      id="auth-terms"
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-primary-600 aria-[invalid=true]:outline aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-rose-500/70"
                    />
                    <span>
                      I’m {MIN_AGE} or older and I agree to <LegalLinks />.
                    </span>
                  </label>
                  <FieldMessage htmlFor="auth-terms" />
                </div>
              )}

              <FormAlert />
              <CaptchaSlot />

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
                  'Save progress'
                ) : mode === 'signup' ? (
                  <>
                    <UserPlus size={18} aria-hidden="true" /> Create account
                  </>
                ) : (
                  <>
                    <LogIn size={18} aria-hidden="true" /> Sign in
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
            </Form>

            {mode === 'login' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3 text-micro text-content-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-overlay-subtle" />
                  or
                  <span className="h-px flex-1 bg-overlay-subtle" />
                </div>
                {googleButton}
                <p className="text-xs text-content-muted text-center">
                  New to Ascend? Continuing with Google confirms you’re {MIN_AGE} or older and agree to <LegalLinks />.
                </p>
              </div>
            )}

            {mode === 'login' && (
              <p className="text-xs text-content-muted text-center pt-1">
                Don’t have an account?{' '}
                <a href={pageLinks.signup} onClick={inAppClick(pageLinks.signup, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                  Create one
                </a>
              </p>
            )}

            {mode === 'signup' && (
              <p className="text-xs text-content-muted text-center pt-1">
                Already have an account?{' '}
                <a href={pageLinks.login} onClick={inAppClick(pageLinks.login, pageLinks.navigate)} className={PAGE_LINK_CLASS}>
                  Sign in
                </a>
              </p>
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
    </div>
  );
}
