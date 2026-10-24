// Node has no window/localStorage; the browser pieces push.ts reads are stubbed per case.
import { disablePush, markPushPromptDone, shouldOfferHomeScreenHint } from '../push';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const store = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

function browser(ua: string, opts: { touch?: number; standalone?: boolean } = {}) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: ua, maxTouchPoints: opts.touch ?? 0, standalone: opts.standalone },
  });
  // No PushManager / service worker: what iOS Safari exposes outside a Home Screen app.
  g.window = { isSecureContext: true, matchMedia: () => ({ matches: Boolean(opts.standalone) }) };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; LM-G850) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

async function main() {
  // iPhone / iPad Safari outside the Home Screen app: the hint, until answered.
  store.clear();
  browser(IPHONE);
  assert(shouldOfferHomeScreenHint(), 'iPhone in Safari gets the hint');
  browser(IPAD_DESKTOP, { touch: 5 });
  assert(shouldOfferHomeScreenHint(), 'iPad (desktop-class UA with touch) gets the hint');
  browser(IPAD_DESKTOP, { touch: 0 });
  assert(!shouldOfferHomeScreenHint(), 'a real Mac does not');
  browser(IPHONE, { standalone: true });
  assert(!shouldOfferHomeScreenHint(), 'already on the Home Screen: no hint');
  browser(ANDROID);
  assert(!shouldOfferHomeScreenHint(), 'Android does not get the iPhone hint');

  browser(IPHONE);
  markPushPromptDone();
  assert(!shouldOfferHomeScreenHint(), '"Not now" hides the hint on this device');

  // Logout (disablePush) clears "Not now" even where push was never on or is unsupported, so the
  // next account on this phone is offered it again.
  await disablePush();
  assert(shouldOfferHomeScreenHint(), 'after logout the next account sees the hint again');

  console.log('pushPrompt fixtures: all passed');
}

// An assertion that throws rejects this promise; Node then exits non-zero (unhandled rejection).
void main();
