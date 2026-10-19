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
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      script.onerror = () => {
        script.remove();
        reject(new Error('turnstile'));
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
      const timer = window.setTimeout(() => reject(new Error('turnstile_timeout')), SOLVE_TIMEOUT_MS);
      const fail = () => {
        window.clearTimeout(timer);
        reject(new Error('turnstile'));
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
        'error-callback': () => {
          fail();
          return true;
        },
        'expired-callback': fail,
        'timeout-callback': fail,
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

/** A fresh token, or undefined when the check is off. Tries twice before giving up. */
export async function getCaptchaToken(action: CaptchaAction): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(NETWORK_MESSAGE);
  try {
    return await solveOnce(action);
  } catch {
    try {
      return await solveOnce(action);
    } catch (error) {
      console.warn('Turnstile check failed:', error);
      throw new Error(CAPTCHA_FAILED_MESSAGE);
    }
  }
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
