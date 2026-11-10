// Browser stand-ins for tests that render the real store hook in Node (no jsdom): a document,
// a window, localStorage / sessionStorage and the few calls react-dom and the hook make.
// Importing this file installs them. Extras the hook tests need are opt-in (functions below), so
// store.afterCommit.test.ts runs with exactly the stand-ins it had before (2026-11-10).
type Listener = (event: unknown) => void;
class Target {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatchEvent(event: { type: string }) {
    for (const fn of this.listeners.get(event.type) ?? []) fn(event);
    return true;
  }
}

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    key: (i: number) => [...mem.keys()][i] ?? null,
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  } as Storage;
}

export const doc = new Target() as unknown as Record<string, unknown>;
function element(): Record<string, unknown> {
  const el = new Target() as unknown as Record<string, unknown>;
  const attrs = new Map<string, string>();
  Object.assign(el, {
    nodeType: 1,
    ownerDocument: doc,
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    removeAttribute: (k: string) => void attrs.delete(k),
    appendChild: (child: unknown) => child,
    removeChild: (child: unknown) => child,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  return el;
}

Object.assign(doc, {
  nodeType: 9,
  visibilityState: 'visible',
  hidden: false,
  documentElement: element(),
  head: element(),
  body: element(),
  createElement: () => element(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
});
export const win = new Target() as unknown as Record<string, unknown>;
Object.assign(win, {
  document: doc,
  location: new URL('http://localhost/'),
  history: { replaceState() {}, pushState() {} },
  localStorage: memoryStorage(),
  sessionStorage: memoryStorage(),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  HTMLIFrameElement: class {},
});
const g = globalThis as unknown as Record<string, unknown>;
for (const key of ['localStorage', 'sessionStorage', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'location', 'history']) {
  g[key] = win[key];
}
g.document = doc;
g.window = win;
g.IS_REACT_ACT_ENVIRONMENT = false;
// Unknown window properties fall back to Node's globals (setTimeout, fetch, BroadcastChannel, …).
Object.setPrototypeOf(win, new Proxy(Object.getPrototypeOf(win), {
  get: (target, prop, receiver) => (prop in target ? Reflect.get(target, prop, receiver) : (g as Record<string | symbol, unknown>)[prop]),
}));

/** Node 22's navigator has no onLine (the hook reads !navigator.onLine as offline): drive it here. */
export const net = { online: true };
export function installOnline(): typeof net {
  Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => net.online });
  return net;
}
/** Goes offline or back online the way a browser does (navigator.onLine, then the window event). */
export function setOnline(online: boolean) {
  net.online = online;
  (win as unknown as Target).dispatchEvent({ type: online ? 'online' : 'offline' } as { type: string });
}

/**
 * The window proxy has no `has` trap, so `'BroadcastChannel' in window` is false and the hook's
 * cross-tab code stays off. This exposes Node's real BroadcastChannel (same process = same "browser").
 */
export function installBroadcastChannel() {
  win.BroadcastChannel = (globalThis as unknown as Record<string, unknown>).BroadcastChannel;
}

export type Toast = { kind: 'error' | 'success'; title?: string; message?: string };
/** Records the app's toasts (app-toast-error / app-toast-success window events). */
export function captureToasts(): Toast[] {
  const toasts: Toast[] = [];
  const t = win as unknown as Target;
  t.addEventListener('app-toast-error', (e) => toasts.push({ kind: 'error', ...((e as CustomEvent).detail || {}) }));
  t.addEventListener('app-toast-success', (e) => toasts.push({ kind: 'success', ...((e as CustomEvent).detail || {}) }));
  return toasts;
}

/**
 * Intervals of 10 s or more (minute tick, pact repair, social poll, clock resync, supabase's token
 * ticker, realtime heartbeat) are recorded instead of scheduled, so a test run never depends on
 * one landing by chance. fire(delay) runs the recorded callbacks of that delay by hand.
 */
export function deferLongIntervals() {
  const g = globalThis as unknown as Record<string, unknown>;
  const realSet = g.setInterval as (fn: () => void, ms?: number) => unknown;
  const realClear = g.clearInterval as (id: unknown) => void;
  const registry = new Map<number, { fn: () => void; ms: number }>();
  let seq = 0;
  const set = (fn: () => void, ms = 0, ...args: unknown[]) => {
    if (ms < 10_000) return realSet(() => fn(...(args as [])), ms);
    const id = { deferred: ++seq };
    registry.set(id.deferred, { fn: () => fn(...(args as [])), ms });
    return id;
  };
  const clear = (id: unknown) => {
    if (id && typeof id === 'object' && 'deferred' in (id as object)) registry.delete((id as { deferred: number }).deferred);
    else realClear(id);
  };
  g.setInterval = set;
  g.clearInterval = clear;
  win.setInterval = set;
  win.clearInterval = clear;
  return {
    registered: (ms?: number) => [...registry.values()].filter((r) => ms === undefined || r.ms === ms).length,
    fire: (ms: number) => {
      for (const r of [...registry.values()]) if (r.ms === ms) r.fn();
    },
  };
}
