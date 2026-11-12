// In-process fake Supabase for the hook tests (*.hook.test.ts): globalThis.fetch and
// globalThis.WebSocket are replaced, so the real supabase-js client in src/lib/supabase.ts talks
// to this file. PostgREST / auth / realtime routing is ported from the browser e2e harness
// (/workspace/work/sync-e2e/harness.mjs); rows live in FakeServer (fakeServer.ts).
// Nothing leaves the process: any URL that is not the fake project throws.
// scripts/run-tests.mjs starts *.hook.test.ts files with VITE_SUPABASE_URL = SB (import.meta.env
// is fixed when vite-node starts, so the test file cannot set it itself).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ACCOUNT_TZ, FakeServer, SYNCED_TABLES } from './fakeServer';

export const REF = 'fakeproj';
export const SB = `https://${REF}.supabase.co`;
export const UID = '11111111-1111-4111-8111-111111111111';
export const EMAIL = 'hook@test.local';
export const AUTH_KEY = `sb-${REF}-auth-token`;

if (import.meta.env.VITE_SUPABASE_URL !== SB) {
  throw new Error(
    `hook test not in fake mode: VITE_SUPABASE_URL is ${JSON.stringify(import.meta.env.VITE_SUPABASE_URL)}, want ${SB}. ` +
      'Run it through scripts/run-tests.mjs (it sets the env for *.hook.test.ts files).'
  );
}

const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, role: 'authenticated', aud: 'authenticated', email: EMAIL, exp: 4102444800, iat: 1700000000, session_id: 's1' })}.c2ln`;
const CREATED = '2026-10-01T00:00:00.000Z';
export const USER = {
  id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, email_confirmed_at: CREATED, phone: '',
  confirmed_at: CREATED, last_sign_in_at: CREATED, app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { username: 'hooktester' }, identities: [], created_at: CREATED, updated_at: CREATED, is_anonymous: false,
};
export function session() {
  // eslint-disable-next-line no-restricted-syntax -- token expiry for the fake session
  const now = Math.floor(Date.now() / 1000);
  return { access_token: JWT, token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: now + 3600 * 24 * 365, refresh_token: 'rt-hook', user: USER };
}

export const server = new FakeServer();
server.g('profiles').push({
  id: UID, uid: '424242', username: 'hooktester', avatar: '🧑', created_at: CREATED, is_profile_public: true,
  accept_partner_invites: true, device_timezone: ACCOUNT_TZ, onboarding_completed: true,
});

export type Req = { method: string; table: string; path: string; search: string; body: any };
type Hold = { match: (r: Req) => boolean; gate: Promise<void>; open: () => void; hits: number };

/** Test controls. Tables are PostgREST names ('user_data', 'habits'); auth calls are 'auth/<name>'. */
export const fake = {
  /** Every request fails as a network error (not logged; counted in offlineAttempts). */
  offline: false,
  offlineAttempts: 0,
  /** Tables routed through FakeServer's synced-table rules (bootHook adds the app's list). */
  syncedTables: new Set<string>(SYNCED_TABLES),
  log: [] as Req[],
  holds: [] as Hold[],
  fails: new Map<string, { status: number; methods: string[] }>(),
  inFlight: new Map<string, number>(),
  peak: new Map<string, number>(),
  /** Holds every request that matches until release(); the request counts as in flight meanwhile. */
  hold(match: (r: Req) => boolean) {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const h: Hold = { match, gate, open, hits: 0 };
    this.holds.push(h);
    return {
      get hits() {
        return h.hits;
      },
      release: () => {
        this.holds = this.holds.filter((x) => x !== h);
        open();
      },
    };
  },
  /** Answers `status` to requests on `table` (default: every method). */
  fail(table: string, status: number, methods: string[] = ['GET', 'POST', 'PATCH', 'DELETE']) {
    this.fails.set(table, { status, methods });
  },
  unfail(table: string) {
    this.fails.delete(table);
  },
  requests(filter: { method?: string; table?: string } = {}) {
    return this.log.filter((r) => (!filter.method || r.method === filter.method) && (!filter.table || r.table === filter.table));
  },
  /** Starts a fresh count of requests and of the in-flight peak. */
  resetCounts() {
    this.log.length = 0;
    this.peak.clear();
  },
  maxInFlight(table: string) {
    return this.peak.get(table) ?? 0;
  },
};

function parseVal(v: string) {
  return v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v;
}
function filtersOf(url: URL) {
  const out: any[] & { ids?: string[] } = [];
  for (const [k, raw] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns', 'or', 'and'].includes(k)) continue;
    const i = raw.indexOf('.');
    const op = raw.slice(0, i);
    const val = raw.slice(i + 1);
    let f: (r: any) => boolean = () => true;
    if (op === 'eq') f = (r) => String(r[k]) === val;
    else if (op === 'neq') f = (r) => String(r[k]) !== val;
    else if (op === 'is') f = (r) => (r[k] ?? null) === parseVal(val);
    else if (op === 'in') {
      const vals = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      f = (r) => vals.includes(String(r[k]));
      out.ids = vals;
    } else if (op === 'gt') f = (r) => r[k] != null && String(r[k]) > val;
    else if (op === 'gte') f = (r) => r[k] != null && String(r[k]) >= val;
    else if (op === 'lt') f = (r) => r[k] != null && String(r[k]) < val;
    else if (op === 'lte') f = (r) => r[k] != null && String(r[k]) <= val;
    out.push({ k, op, val, f });
  }
  return out;
}
const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json', ...headers } });

async function route(req: Request, url: URL, r: Req): Promise<Response> {
  const { method, path, table } = r;
  if (path.startsWith('/auth/v1/')) {
    if (path === '/auth/v1/user') return json(200, USER);
    if (path === '/auth/v1/token') return json(200, session());
    if (path === '/auth/v1/logout') return json(204);
    return json(200, {});
  }
  if (path.startsWith('/functions/v1/')) return json(200, {});
  if (!path.startsWith('/rest/v1/')) return json(404, { message: 'not mocked' });
  if (table.startsWith('rpc/')) {
    const fn = table.slice(4);
    // eslint-disable-next-line no-restricted-syntax -- the fake server's clock
    if (fn === 'server_now') return json(200, new Date(Date.now()).toISOString());
    if (fn === 'ascend_my_profile') return json(200, { email: EMAIL, device_timezone: ACCOUNT_TZ, timezone: ACCOUNT_TZ });
    return json(200, null);
  }
  const body = r.body;
  const filters = filtersOf(url);
  const single = /vnd\.pgrst\.object/.test(req.headers.get('accept') || '');
  if (table === 'user_data') {
    if (method === 'GET') {
      const uid = filters.find((f: any) => f.k === 'user_id')?.val || UID;
      const bl = server.blob.get(uid);
      const rows = bl ? [{ user_id: uid, state: structuredClone(bl.state), updated_at: bl.updated_at }] : [];
      return single ? (rows[0] ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' })) : json(200, rows);
    }
    if (method === 'POST') {
      for (const row of ([] as any[]).concat(body)) server.blob.set(row.user_id, { state: row.state, updated_at: row.updated_at });
      return json(201);
    }
    return json(204);
  }
  if (fake.syncedTables.has(table)) {
    if (method === 'GET') {
      let rows = server.select(table).filter((row: any) => filters.every((f: any) => f.f(row)));
      const off = Number(url.searchParams.get('offset') || 0);
      const lim = url.searchParams.get('limit');
      rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return json(200, rows, { 'content-range': `0-${rows.length}/${rows.length}` });
    }
    if (method === 'POST') {
      const res = server.upsert(table, ([] as any[]).concat(body), 'hook');
      return json(res.status, res.body);
    }
    if (method === 'PATCH') {
      const ids = filters.ids || filters.filter((f: any) => f.k === 'id').map((f: any) => f.val);
      const res = server.update(table, UID, ids, body, 'hook');
      return json(res.status, res.body);
    }
    return json(204);
  }
  const g = server.g(table);
  if (method === 'GET' || method === 'HEAD') {
    const rows = url.searchParams.has('or') ? [] : g.filter((row: any) => filters.every((f: any) => f.f(row)));
    if (single) return rows[0] ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    return json(200, rows, { 'content-range': `0-${rows.length}/${rows.length}` });
  }
  if (method === 'POST') {
    // An upsert (supabase-js .upsert) replaces the row with the same key; a plain insert appends.
    const isUpsert = /resolution=merge-duplicates/.test(req.headers.get('prefer') || '');
    const keys = (url.searchParams.get('on_conflict') || 'id').split(',');
    for (const row of ([] as any[]).concat(body)) {
      const existing = isUpsert ? g.find((old: any) => keys.every((k) => old[k] !== undefined && old[k] === row[k])) : undefined;
      if (existing) Object.assign(existing, row);
      else g.push(row);
    }
    return json(201, /return=representation/.test(req.headers.get('prefer') || '') ? ([] as any[]).concat(body) : null);
  }
  if (method === 'PATCH') {
    for (const row of g) if (filters.every((f: any) => f.f(row))) Object.assign(row, body);
    return json(204);
  }
  if (method === 'DELETE') {
    server.generic.set(table, g.filter((row: any) => !filters.every((f: any) => f.f(row))));
    return json(204);
  }
  return json(204);
}

async function handle(input: any, init?: any): Promise<Response> {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = new URL(req.url);
  if (url.origin !== SB) throw new Error(`hook test tried to reach ${url.origin}: only ${SB} is faked`);
  if (fake.offline) {
    fake.offlineAttempts++;
    throw new TypeError('fetch failed (fake offline)');
  }
  const path = url.pathname;
  const table = path.startsWith('/rest/v1/') ? path.slice('/rest/v1/'.length) : path.startsWith('/auth/v1/') ? `auth/${path.slice(9)}` : path;
  const method = req.method;
  const text = method === 'GET' || method === 'HEAD' ? '' : await req.text();
  const r: Req = { method, table, path, search: url.search, body: text ? JSON.parse(text) : undefined };
  fake.log.push(r);
  const now = (fake.inFlight.get(table) ?? 0) + 1;
  fake.inFlight.set(table, now);
  fake.peak.set(table, Math.max(fake.peak.get(table) ?? 0, now));
  try {
    for (const h of [...fake.holds]) {
      if (h.match(r)) {
        h.hits++;
        await h.gate;
      }
    }
    if (fake.offline) throw new TypeError('fetch failed (fake offline)');
    const failure = fake.fails.get(table);
    if (failure && failure.methods.includes(method)) return json(failure.status, { code: 'XX000', message: `fake ${failure.status}` });
    return await route(req, url, r);
  } finally {
    fake.inFlight.set(table, (fake.inFlight.get(table) ?? 1) - 1);
  }
}
(globalThis as any).fetch = handle;

/** Phoenix-protocol socket: answers joins, forwards FakeServer row events as postgres_changes. */
export const sockets = new Set<FakeSocket>();
export class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = 'arraybuffer';
  url: string;
  protocol = '';
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  topics = new Map<string, any[]>();
  private idSeq = 1000;
  private sub: { send: (table: string, row: any, type: string) => void };
  constructor(url: string) {
    if (!String(url).startsWith(`wss://${REF}.supabase.co/`)) throw new Error(`hook test tried to open a socket to ${url}`);
    this.url = url;
    sockets.add(this);
    this.sub = { send: (table: string, row: any, type: string) => this.push(table, row, type) };
    setTimeout(() => {
      if (fake.offline) {
        this.close(1006);
        return;
      }
      this.readyState = 1;
      server.subscribers.add(this.sub);
      this.onopen?.({});
    }, 0);
  }
  private emit(msg: unknown) {
    if (this.readyState === 1) setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), 0);
  }
  push(table: string, row: any, type: string) {
    for (const [topic, binds] of this.topics)
      for (const b of binds) {
        if (b.table !== table) continue;
        if (b.filter && b.filter.startsWith('user_id=eq.') && row.user_id !== b.filter.slice(11)) continue;
        this.emit([null, null, topic, 'postgres_changes', { ids: [b.id], data: { schema: 'public', table, commit_timestamp: row.server_updated_at, type, record: row, old_record: { id: row.id }, columns: [], errors: null } }]);
      }
  }
  send(raw: string) {
    let m: any;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    const [joinRef, ref, topic, event, payload] = Array.isArray(m) ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
    const reply = (response = {}) => this.emit([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]);
    if (event === 'heartbeat') return reply();
    if (event === 'phx_join') {
      const binds = (payload?.config?.postgres_changes || []).map((b: any) => ({ ...b, id: this.idSeq++ }));
      this.topics.set(topic, binds);
      return reply({ postgres_changes: binds.map(({ id, event: e, schema, table, filter }: any) => ({ id, event: e, schema, table, filter })) });
    }
    if (event === 'phx_leave') {
      this.topics.delete(topic);
      return reply();
    }
    if (event === 'access_token') return;
    return reply();
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    server.subscribers.delete(this.sub);
    sockets.delete(this);
    setTimeout(() => this.onclose?.({ code, reason: '' }), 0);
  }
  addEventListener() {}
  removeEventListener() {}
}
(globalThis as any).WebSocket = FakeSocket;

/** Realtime topics joined on any open socket (e.g. 'realtime:synced_tables_<uid>'). */
export function joinedTopics(): string[] {
  return [...sockets].flatMap((s) => [...s.topics.keys()]);
}
