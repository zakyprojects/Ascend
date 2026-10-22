/**
 * Bot check for the Auth calls Supabase can guard with a CAPTCHA: sign-up, sign-in (email, and the
 * username sign-in, which passes the token on), guest start, the password-reset email and the
 * current-password check. Cloudflare Turnstile, free; the widget is created in the Cloudflare
 * dashboard as Invisible (or Managed), so people normally see nothing.
 *
 * - Off unless VITE_TURNSTILE_SITE_KEY is set: then no script loads and no token is sent, exactly
 *   as before. Supabase checks the token only once CAPTCHA is turned on in its dashboard.
 * - A token works once and expires after 5 minutes, so every attempt solves a fresh one.
 * - The script loads on first use (preloadCaptcha warms it on the sign-in screen).
 * - If Cloudflare ever needs a click, its own small box appears at the bottom of the screen
 *   (appearance "interaction-only"); otherwise the host element stays empty and invisible.
 */
import { NETWORK_MESSAGE } from './userMessage';

const SITE_KEY = ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '').trim();
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Longest wait for an invisible solve; a click challenge runs on Turnstile's own timeout. */
const SOLVE_TIMEOUT_MS = 15_000;

export const CAPTCHA_FAILED_MESSAGE = 'Couldn’t confirm this browser. Check your connection and try again.';
export const CAPTCHA_SLOW_MESSAGE =
  'Your internet is too slow or dropped, so the security check couldn’t finish. Try again on a better connection.';
export const CAPTCHA_BLOCKED_MESSAGE =
  'Your browser couldn’t pass the security check. Turn off any VPN or ad blocker, or try another browser.';
export const CAPTCHA_CONFIG_MESSAGE = 'Sign-in is having a problem on our side. Try again in a little while.';

/**
 * Why one solve failed: `network` (script or iframe never loaded, or the check ran out of time),
 * `blocked` (Turnstile judged the browser bot-like, or its clock is wrong), `config` (our site key
 * or domain setup), `other` (anything else, such as a click challenge left unanswered).
 * Codes: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
 */
export type CaptchaFailure = 'network' | 'blocked' | 'config' | 'other';

export class CaptchaSolveError extends Error {
  constructor(readonly failure: CaptchaFailure, readonly code = '') {
    super(`turnstile_${failure}${code ? `_${code}` : ''}`);
    this.name = 'CaptchaSolveError';
  }
}

/** Maps a Turnstile error-callback code to a failure kind. */
export function classifyTurnstileCode(code: string): CaptchaFailure {
  if (code === '200500' || code.startsWith('110600')) return 'network';
  if (/^(300|600)/.test(code) || code === '200100') return 'blocked';
  if (/^(1101[01]0|110200|4000(20|21|70))$/.test(code)) return 'config';
  return 'other';
}

/** The text people see for a failed check. */
export function captchaFailureMessage(failure: CaptchaFailure): string {
  switch (failure) {
    case 'network':
      return CAPTCHA_SLOW_MESSAGE;
    case 'blocked':
      return CAPTCHA_BLOCKED_MESSAGE;
    case 'config':
      return CAPTCHA_CONFIG_MESSAGE;
    default:
      return CAPTCHA_FAILED_MESSAGE;
  }
}

/** Turnstile action names (shown in Cloudflare analytics). */
export type CaptchaAction = 'sign_in' | 'sign_up' | 'guest' | 'password_reset' | 'password_check';

/** Auth refused the token (expired, used, or missing while CAPTCHA is on). */
export class CaptchaRejectedError extends Error {
  constructor() {
    super(CAPTCHA_FAILED_MESSAGE);
    this.name = 'CaptchaRejectedError';
  }
}

/** Supabase Auth's answer when the CAPTCHA token is not accepted. */
export function isCaptchaRejection(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'captcha_failed';
}

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    const loading = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new CaptchaSolveError('other')));
      script.onerror = () => {
        script.remove();
        reject(new CaptchaSolveError('network'));
      };
      document.head.appendChild(script);
    });
    // A failed load (offline) is tried again on the next attempt.
    loading.catch(() => {
      if (scriptPromise === loading) scriptPromise = null;
    });
    scriptPromise = loading;
  }
  return scriptPromise;
}

/** Starts loading the script early so the first attempt does not wait for it. */
export function preloadCaptcha(): void {
  if (SITE_KEY) loadTurnstile().catch(() => undefined);
}

/**
 * Places in the open form where a click challenge may show (CaptchaSlot, just above the submit
 * button). The newest one still on the page wins; with none, the challenge shows at the bottom of
 * the screen.
 */
const slots: HTMLElement[] = [];

export function registerCaptchaSlot(slot: HTMLElement): () => void {
  slots.push(slot);
  return () => {
    const index = slots.lastIndexOf(slot);
    if (index !== -1) slots.splice(index, 1);
  };
}

function activeSlot(): HTMLElement | null {
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].isConnected) return slots[i];
  }
  return null;
}

async function solveOnce(action: CaptchaAction): Promise<string> {
  const turnstile = await loadTurnstile();
  const slot = activeSlot();
  const host = document.createElement('div');
  if (slot) {
    slot.appendChild(host);
  } else {
    host.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:var(--z-blocking)';
    document.body.appendChild(host);
  }
  let widgetId: string | null | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new CaptchaSolveError('network', 'timeout')), SOLVE_TIMEOUT_MS);
      const fail = (failure: CaptchaFailure = 'other', code = '') => {
        window.clearTimeout(timer);
        reject(new CaptchaSolveError(failure, code));
      };
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        action,
        appearance: 'interaction-only',
        // In a form the challenge matches the inputs' width (Turnstile's minimum is 300 px).
        ...(slot ? { size: 'flexible' } : {}),
        retry: 'never',
        'refresh-expired': 'never',
        'response-field': false,
        callback: (token: string) => {
          window.clearTimeout(timer);
          resolve(token);
        },
        // true = handled here (Turnstile then logs nothing).
        'error-callback': (errorCode?: unknown) => {
          const code = String(errorCode ?? '');
          fail(classifyTurnstileCode(code), code);
          return true;
        },
        'expired-callback': () => fail(),
        'timeout-callback': () => fail(),
        // Someone is asked to click: give them Turnstile's own time, not ours.
        'before-interactive-callback': () => {
          window.clearTimeout(timer);
          // Space from the field above, added only now so an invisible check never moves the form.
          if (slot) host.style.marginTop = '0.75rem';
        },
      });
      if (!widgetId) fail();
    });
  } finally {
    if (widgetId) {
      try {
        turnstile.remove(widgetId);
      } catch {
        /* already gone */
      }
    }
    host.remove();
  }
}

function failureOf(error: unknown): CaptchaFailure {
  return error instanceof CaptchaSolveError ? error.failure : 'other';
}

/**
 * A fresh token, or undefined when the check is off. Tries twice before giving up, except after
 * a slow-network or setup failure, where a second try would only double the wait. The error says
 * why it failed (slow internet, a blocked browser, or our setup).
 */
export async function getCaptchaToken(action: CaptchaAction): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NETWORK_MESSAGE);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await solveOnce(action);
    } catch (error) {
      lastError = error;
      const failure = failureOf(error);
      if (failure === 'network' || failure === 'config') break;
    }
  }
  console.warn('Turnstile check failed:', lastError);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NETWORK_MESSAGE);
  throw new Error(captchaFailureMessage(failureOf(lastError)));
}

/**
 * Runs one Auth attempt with a fresh token. When Auth refuses the token (CaptchaRejectedError),
 * solves a new one and tries once more without telling the user.
 */
export async function withCaptcha<T>(action: CaptchaAction, attempt: (captchaToken?: string) => Promise<T>): Promise<T> {
  try {
    return await attempt(await getCaptchaToken(action));
  } catch (error) {
    if (!(error instanceof CaptchaRejectedError) || !SITE_KEY) throw error;
  }
  return attempt(await getCaptchaToken(action));
}
