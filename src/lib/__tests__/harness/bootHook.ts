// Renders the real useAppState against the fake Supabase (fakeSupabase.ts) and hands the test
// the live store. One boot per test file: the store's module state (supabase session, outbox,
// watermarks, tab versions) lives as long as the process, and run-tests.mjs gives each file its own.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { doc, win, installOnline, installBroadcastChannel, captureToasts, deferLongIntervals, net, setOnline } from './dom';
import { fake, server, sockets, joinedTopics, UID, AUTH_KEY, session } from './fakeSupabase';

export { fake, server, sockets, joinedTopics, UID, AUTH_KEY, net, setOnline };

export type BootOptions = {
  /** 'signedIn' puts a saved session on the device (INITIAL_SESSION at boot); 'guest' does not. */
  as: 'guest' | 'signedIn';
  /** localStorage entries written before the app's modules load (guest state, device cache, …). */
  storage?: Record<string, unknown>;
  /** Called after the seeds, before render (e.g. to hold the hydration reads). */
  beforeRender?: () => void | Promise<void>;
  strict?: boolean;
  /** Another hook to run in the same component after the store (e.g. App's own hooks); its latest
   *  return value is `h.used()`. */
  use?: (store: any) => unknown;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
export const eq = (a: unknown, b: unknown, msg: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

/** Waits until pred() is true (polls every 25 ms); throws with `what` after `ms`. */
export async function until(pred: () => unknown, what: string, ms = 8000) {
  // eslint-disable-next-line no-restricted-syntax -- test timeout bookkeeping
  const t0 = Date.now();
  while (!pred()) {
    // eslint-disable-next-line no-restricted-syntax -- test timeout bookkeeping
    if (Date.now() - t0 > ms) throw new Error(`Timed out after ${ms} ms waiting for: ${what}`);
    await wait(25);
  }
}

/**
 * The only fixed wait: for checks that something did NOT happen. Kept at 3x the 500 ms save
 * debounce or more by the callers.
 */
export const quiet = (ms: number) => wait(ms);

export async function bootHook(opts: BootOptions) {
  installOnline();
  installBroadcastChannel();
  const toasts = captureToasts();
  const intervals = deferLongIntervals();
  const ls = win.localStorage as Storage;
  if (opts.as === 'signedIn') ls.setItem(AUTH_KEY, JSON.stringify(session()));
  for (const [k, v] of Object.entries(opts.storage ?? {})) ls.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));

  // Every table the app syncs is routed through FakeServer's row rules; a table the fake does not
  // know would silently act as a plain list, so a new synced table must be added here.
  const { SYNCED_COLLECTIONS } = await import('../../sync/syncedCollections');
  for (const c of SYNCED_COLLECTIONS) fake.syncedTables.add(c.table);

  await opts.beforeRender?.();
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useAppState } = await import('../../store/store');
  const supabaseModule = await import('../../auth/supabase');
  type Store = ReturnType<typeof useAppState>;
  let store: Store | null = null;
  // Every account id the screen showed, in render order (null = guest), so a test can tell that a
  // state never appeared even if something later replaced it.
  const shownUsers: (string | null)[] = [];
  let used: unknown;
  function App() {
    store = useAppState();
    used = opts.use?.(store);
    const id = store.state.currentUser?.id ?? null;
    if (shownUsers[shownUsers.length - 1] !== id) shownUsers.push(id);
    return null;
  }
  const root = createRoot((doc.createElement as () => Element)());
  const app = React.createElement(App);
  root.render(opts.strict ? React.createElement(React.StrictMode, null, app) : app);
  await until(() => store, 'first render');
  const s = () => store!;

  return {
    s,
    shownUsers,
    used: () => used,
    toasts,
    intervals,
    supabase: supabaseModule.supabase,
    supabaseModule,
    storage: ls,
    /** Signed in, account data loaded from the (fake) server, nothing loading. */
    loaded: () => s().state.currentUser?.id === UID && !s().isAuthChecking && !s().isSessionLoading && s().isServerDataApplied,
    /** Real email sign-in: the fake /auth/v1/token answers a session and supabase fires SIGNED_IN. */
    signIn: () => supabaseModule.supabase.auth.signInWithPassword({ email: 'hook@test.local', password: 'x' }),
    unmount: () => root.unmount(),
  };
}

const exit = (code: number) => (globalThis as unknown as { process: { exit: (c: number) => never } }).process.exit(code);

/**
 * Runs a file's story and ends the process (the hook keeps timers, sockets and channels open):
 * exit 0 after `fn` resolves, exit 1 on the first failed assertion or after `timeoutMs`.
 */
export async function story(name: string, fn: () => Promise<void>, timeoutMs = 60_000) {
  const timer = setTimeout(() => {
    console.error(`FAIL ${name}: whole story timed out after ${timeoutMs} ms`);
    exit(1);
  }, timeoutMs);
  try {
    await fn();
    clearTimeout(timer);
    console.log(`${name}: OK`);
    exit(0);
  } catch (err) {
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
    exit(1);
  }
}

/** Prints one passed check (the run log names every test that passed). */
export const pass = (test: string) => console.log(`  ok  ${test}`);

/** Rows FakeServer holds for the test user (not deleted). */
export const rows = (table: string) => server.select(table, UID).filter((r: any) => !r.deleted_at);

/** A habit as the app stores it (state item and the row's `data`). */
export function habit(id: string, name: string, extra: Record<string, unknown> = {}) {
  const at = '2026-11-01T00:00:00.000Z';
  return { id, name, frequency: 'daily', points: 10, isPreset: false, createdAt: at, updatedAt: at, completions: {}, missedPeriods: [], consecutiveMisses: 0, ...extra };
}

/** Puts habits in the fake server's habits table for the test user (an earlier device's saves). */
export function seedServerHabits(...items: ReturnType<typeof habit>[]) {
  server.upsert(
    'habits',
    items.map((h) => ({ id: h.id, user_id: UID, data: h, updated_at: h.updatedAt })),
    'seed'
  );
}

/** Writes that reached "the server": any non-GET to user_data or a synced table. */
export const accountWrites = () =>
  fake.log.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' && (r.table === 'user_data' || fake.syncedTables.has(r.table)));
