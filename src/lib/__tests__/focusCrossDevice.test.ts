// Deep Focus across devices (Zakria 2026-11-05): the server row mapping, reconcile rules, the
// queued-action replay against a fake server that follows the SQL rules
// (supabase/migrations/20261105170000_focus_active_sessions.sql, PGlite-tested in
// work/fcx/pglite-test.mjs), and the skill log a session with a skill adds (focusSkillLog.ts).
import type { FocusSessionLog, Skill, SkillSessionLog } from '@/types';

// Node has no localStorage: a small in-memory one, shared by both "devices" (each uses its own user key prefix copy below).
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
} as Storage;

const S = await import('../focusSession');
const X = await import('../focusServerSession');
const K = await import('../focusSkillLog');
type Row = import('../focusServerSession').FocusServerRow;
type Reply = import('../focusServerSession').FocusServerReply;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const MIN = 60_000;
const T0 = Date.parse('2026-11-05T09:00:00.000Z');
const iso = (t: number) => new Date(t).toISOString();

// --- Fake server: one row, the SQL rules (settle, revision, clamps, claim) ---
class FakeServer {
  now = T0;
  row: Row | null = null;
  private settled(r: Row, at: number): Row {
    const x = { ...r };
    const stretch = Date.parse(x.stretch_started_at);
    if (x.status === 'running') {
      const end = stretch + Number(x.stretch_planned_seconds) * 1000;
      if (end <= at) {
        x.marks_at = this.marks(x, end);
        x.focus_ended_at = iso(end);
        x.end_reason = 'finished';
        x.log_claimed = false;
        x.status = x.break_minutes > 0 && end + x.break_minutes * MIN > at ? 'break' : 'ended';
      }
    } else if (x.status === 'paused' && at > Date.parse(x.paused_at!) + 30 * MIN) {
      x.focus_ended_at = x.paused_at;
      x.end_reason = 'expired';
      x.log_claimed = false;
      x.status = 'ended';
    } else if (x.status === 'break' && Date.parse(x.focus_ended_at!) + x.break_minutes * MIN <= at) {
      x.status = 'ended';
    }
    return x;
  }
  private marks(r: Row, until: number): string[] {
    const out = [...(r.marks_at || [])];
    const stretch = Date.parse(r.stretch_started_at);
    const activeAt = r.focus_minutes * 60 - Number(r.stretch_planned_seconds);
    const stretchEnd = Math.min(until, stretch + Number(r.stretch_planned_seconds) * 1000);
    for (const m of [25, 35, 45, 55, 65, 75, 85]) {
      if (m > r.focus_minutes) break;
      const need = m * 60 - activeAt;
      if (need > 0 && stretch + need * 1000 <= stretchEnd) out.push(iso(stretch + need * 1000));
    }
    return out;
  }
  private lock(): Row | null {
    if (!this.row) return null;
    const s = this.settled(this.row, this.now);
    if (JSON.stringify(s) !== JSON.stringify(this.row)) this.row = { ...s, revision: this.row.revision + 1 };
    return this.row;
  }
  private reply(applied: boolean, claimed = false, previous: Row | null = null): Reply {
    return { row: this.row ? { ...this.row } : null, applied, claimed, previous };
  }
  private bump(patch: Partial<Row>) {
    this.row = { ...this.row!, ...patch, revision: this.row!.revision + 1 };
  }
  call(fn: string, a: Record<string, unknown>): Reply {
    const r0 = this.row;
    switch (fn) {
      case 'ascend_focus_session_get':
        this.lock();
        return this.reply(true);
      case 'ascend_focus_session_claim': {
        const r = this.lock();
        if (!r || r.session_id !== a.p_session_id || r.log_claimed || !['finished', 'expired'].includes(r.end_reason || '') || !['break', 'ended'].includes(r.status)) return this.reply(false);
        this.bump({ log_claimed: true });
        return this.reply(true, true);
      }
      case 'ascend_focus_session_start': {
        const s = a.p_session as Record<string, number | string | boolean | number[] | null>;
        const r = this.lock();
        if (r && r.session_id === s.id) return this.reply(r.status === 'running' || r.status === 'paused');
        if (r && (r.status === 'running' || r.status === 'paused')) return this.reply(false);
        const prev = r && !r.log_claimed && ['finished', 'expired'].includes(r.end_reason || '') ? { ...r } : null;
        let started = Number(s.startedAt);
        let stretch = Number(s.startTime);
        let planned = Number(s.plannedDurationSeconds);
        const fm = Number(s.focusMinutes);
        if (Math.abs(started - this.now) <= 2 * MIN && !s.isPaused && planned >= fm * 60 - 1) {
          started = this.now;
          stretch = this.now;
          planned = fm * 60;
        }
        if (started < this.now - 24 * 60 * MIN) return this.reply(false);
        this.row = {
          session_id: String(s.id),
          status: s.isPaused ? 'paused' : 'running',
          task_name: String(s.taskName),
          skill_id: (s.skillId as string) || null,
          focus_minutes: fm,
          break_minutes: Number(s.breakMinutes),
          is_custom: Boolean(s.isCustom),
          started_at: iso(started),
          stretch_started_at: iso(stretch),
          stretch_planned_seconds: planned,
          paused_at: s.isPaused ? iso(Number(s.pausedAt)) : null,
          paused_remaining_seconds: s.isPaused ? Number(s.pausedRemainingSeconds) : planned,
          marks_at: ((s.marksAt as number[]) || []).map(iso),
          focus_ended_at: null,
          end_reason: null,
          log_claimed: false,
          revision: (r0?.revision ?? 0) + 1,
        };
        this.lock();
        return this.reply(true, false, prev);
      }
      case 'ascend_focus_session_pause':
      case 'ascend_focus_session_resume': {
        const r = this.row;
        const at = a.p_at ? Date.parse(String(a.p_at)) : this.now;
        const isPause = fn.endsWith('pause');
        if (!r || r.session_id !== a.p_session_id || r.status !== (isPause ? 'running' : 'paused') || (a.p_at && a.p_revision !== r.revision)) {
          this.lock();
          return this.reply(false);
        }
        if (isPause) {
          const stretch = Date.parse(r.stretch_started_at);
          const end = stretch + Number(r.stretch_planned_seconds) * 1000;
          const t = Math.min(Math.max(at, stretch), this.now);
          if (t >= end) {
            this.lock();
            return this.reply(false);
          }
          this.bump({ status: 'paused', marks_at: this.marks(r, t), paused_at: iso(t), paused_remaining_seconds: Number(r.stretch_planned_seconds) - (t - stretch) / 1000 });
        } else {
          const t = Math.min(Math.max(at, Date.parse(r.paused_at!)), this.now);
          if (t > Date.parse(r.paused_at!) + 30 * MIN) {
            this.lock();
            return this.reply(false);
          }
          this.bump({ status: 'running', stretch_started_at: iso(t), stretch_planned_seconds: r.paused_remaining_seconds, paused_at: null });
        }
        this.lock();
        return this.reply(true);
      }
      case 'ascend_focus_session_end': {
        const r = this.row;
        if (!r || r.session_id !== a.p_session_id) return (this.lock(), this.reply(false));
        if (a.p_reason === 'break_skipped') {
          const x = this.lock()!;
          if (x.status !== 'break') return this.reply(false);
          this.bump({ status: 'ended' });
          return this.reply(true);
        }
        if (!['running', 'paused'].includes(r.status) || (a.p_at && a.p_reason !== 'completed' && a.p_revision !== r.revision)) return (this.lock(), this.reply(false));
        const stretch = Date.parse(r.stretch_started_at);
        const end = stretch + Number(r.stretch_planned_seconds) * 1000;
        let t: number;
        let remain: number;
        if (r.status === 'paused') {
          t = Date.parse(r.paused_at!);
          if (this.now > t + 30 * MIN) return (this.lock(), this.reply(false));
          remain = Number(r.paused_remaining_seconds);
        } else {
          t = Math.min(Math.max(a.p_at ? Date.parse(String(a.p_at)) : this.now, stretch), this.now, end);
          if (t >= end) return (this.lock(), this.reply(false));
          remain = Number(r.stretch_planned_seconds) - (t - stretch) / 1000;
        }
        const active = r.focus_minutes * 60 - remain;
        if ((a.p_reason === 'completed' && active < 1500) || (a.p_reason === 'discarded' && active >= 1500)) return (this.lock(), this.reply(false));
        this.bump({
          status: 'ended',
          marks_at: r.status === 'running' ? this.marks(r, t) : r.marks_at,
          paused_remaining_seconds: remain,
          focus_ended_at: iso(t),
          end_reason: a.p_reason as 'completed' | 'discarded',
          log_claimed: true,
        });
        return this.reply(true, true);
      }
    }
    throw new Error(`unknown fn ${fn}`);
  }
}

const server = new FakeServer();
let online = true;
const transport: import('../focusServerSession').FocusTransport = {
  call: async (fn, args) => (online ? { ok: true, reply: JSON.parse(JSON.stringify(server.call(fn, args))) } : { ok: false, missing: false }),
};

/** Last item (the app targets ES2020, so no Array.prototype.at). */
const last = <T,>(xs: readonly T[]): T | undefined => xs[xs.length - 1];

/** Read through a call so TS does not keep the `= null` narrowing after sync(). */
const localOf = (d: Device) => d.local;

/** A device: its own stored copy + queue under its own user key (the real app has one per browser). */
class Device {
  constructor(public uid: string) {}
  local: import('../focusSession').FocusSession | null = null;
  logs: import('../focusSession').FocusClose[] = [];
  notices: unknown[] = [];
  queue(op: import('../focusSession').FocusOp) {
    const waiting = S.readFocusOps(this.uid).some((o) => o.sessionId === op.sessionId);
    if (op.kind !== 'start' && !waiting && this.local?.revision !== undefined) op = { ...op, baseRevision: this.local.revision };
    S.enqueueFocusOp(this.uid, op);
  }
  async sync(): Promise<boolean> {
    for (let round = 0; round < 3; round++) {
      const flush = await X.flushOps(transport, this.uid, this.local?.revision);
      if (!flush.ok) return false;
      for (const prev of flush.previous) this.logRow(prev);
      const got = await X.fetchRow(transport);
      if (!got.ok) return false;
      const rec = X.reconcile(this.local, got.reply.row, this.uid);
      if (rec.adopt && this.local) {
        S.enqueueFocusOp(this.uid, { kind: 'start', sessionId: this.local.id, session: this.local });
        continue;
      }
      this.local = rec.session;
      if (rec.notice) this.notices.push(rec.notice);
      if (rec.claim && got.reply.row) {
        const c = await X.claimLog(transport, rec.claim);
        if (c.ok && c.reply.claimed) this.logRow(got.reply.row);
      }
      return true;
    }
    return true;
  }
  logRow(row: Row) {
    const close = X.rowClose(row, this.uid);
    if (close && X.closeIsLogged(row, close) && !this.logs.some((l) => l.sessionId === close.sessionId)) this.logs.push(close);
  }
  start(id: string, focusMinutes: number, breakMinutes = 0) {
    const now = server.now;
    this.local = {
      id, mode: 'focus', taskName: 'Write', skillId: 'sk', focusMinutes, breakMinutes, isCustom: false,
      startTime: now, plannedDurationSeconds: focusMinutes * 60, isPaused: false, pausedRemainingSeconds: focusMinutes * 60,
      userId: this.uid, startedAt: now, pausedAt: null, marksAt: [],
    };
    this.queue({ kind: 'start', sessionId: id, session: this.local });
  }
  pause() {
    const cur = this.local!;
    this.local = S.pauseAt(cur, server.now);
    this.queue({ kind: 'pause', sessionId: cur.id, atMs: server.now });
  }
  resume() {
    const cur = this.local!;
    this.local = S.resumeAt(cur, server.now);
    this.queue({ kind: 'resume', sessionId: cur.id, atMs: server.now });
  }
  complete(): boolean {
    const cur = this.local!;
    const close = S.closeAt(cur, server.now);
    if (!close.save) return false;
    this.logs.push(close);
    this.local = null;
    this.queue({ kind: 'end', sessionId: cur.id, reason: 'completed', atMs: server.now });
    return true;
  }
}

// --- 1. Zakria's case: start on the PC, the phone shows it and completes it ---
const pc = new Device('pc');
const phone = new Device('phone');
pc.start('a1', 50, 10);
await pc.sync();
assert(pc.local?.revision === 1 && server.row?.status === 'running', '1: PC session confirmed by the server');
server.now += 2 * MIN;
await phone.sync();
eq(phone.local?.id, 'a1', '1: phone shows the PC session');
eq(phone.local?.taskName, 'Write', '1: same task');
eq(phone.local?.skillId, 'sk', '1: same skill');
eq(S.remainingSeconds(phone.local!, server.now), S.remainingSeconds(pc.local!, server.now), '1: same countdown');
server.now += 28 * MIN; // 30 active min
assert(phone.complete(), '1: phone completes at 30 min');
await phone.sync();
eq(server.row?.end_reason, 'completed', '1: server ended (completed)');
eq(phone.logs.length, 1, '1: phone wrote the one log');
eq(phone.logs[0].activeMinutes, 30, '1: 30 active minutes');
await pc.sync();
eq(pc.local, null, '1: PC cleared');
eq((pc.notices[0] as { kind: string })?.kind, 'elsewhere', '1: PC notice: completed on another device');
eq(pc.logs.length, 0, '1: PC never writes a second log');

// --- 2. Pause on the PC, resume on the phone (paused time not counted) ---
server.now += MIN;
pc.start('a2', 50);
await pc.sync();
server.now += 10 * MIN;
pc.pause();
await pc.sync();
server.now += 5 * MIN;
await phone.sync();
assert(phone.local?.isPaused === true, '2: phone shows paused');
phone.resume();
await phone.sync();
await pc.sync();
assert(pc.local?.isPaused === false, '2: PC shows running again');
eq(Math.round(S.remainingSeconds(pc.local!, server.now)), 40 * 60, '2: 40 min left after 10 active, paused 5 not counted');

// --- 3. A second device cannot start a parallel session ---
phone.start('b1', 25);
await phone.sync();
eq(phone.local?.id, 'a2', '3: phone start refused, shows the running session');
eq((last(phone.notices) as { kind: string })?.kind, 'replaced', '3: notice: not saved');
eq(server.row?.session_id, 'a2', '3: server keeps the first session');

// --- 4. Logout pauses everywhere (queued pause of the signing-out device) ---
mem.set(S.focusStorageKey('pc'), JSON.stringify(pc.local));
S.pauseStoredSessionsForSignOut(server.now);
pc.local = S.parseSession(mem.get(S.focusStorageKey('pc'))!);
assert(pc.local?.isPaused === true, '4: PC paused locally at sign-out');
eq(last(S.readFocusOps('pc'))?.kind, 'pause', '4: sign-out pause queued for the server');
await X.flushOps(transport, 'pc', pc.local?.revision);
await phone.sync();
assert(phone.local?.isPaused === true, '4: phone shows Paused after the PC logout');
server.now += 30 * MIN;
await phone.sync();
assert(phone.local?.isPaused === true, '4: still resumable at 30:00');
server.now += 1000;
await phone.sync();
eq(phone.local, null, '4: 30:01: closed at the pause');
eq(phone.logs.some((l) => l.sessionId === 'a2'), false, '4: under 25 min: not logged');
eq(server.row?.log_claimed, true, '4: claimed');

// --- 5. Every device closed past the planned end: the first one to open logs it once ---
server.now += MIN;
pc.local = null;
phone.local = null;
pc.start('c1', 50, 10);
await pc.sync();
server.now += 75 * MIN;
await phone.sync();
eq(last(phone.logs)?.sessionId, 'c1', '5: phone (opened first) logs the finished session');
eq(last(phone.logs)?.activeMinutes, 50, '5: full plan');
eq(last(phone.logs)?.points, 5, '5: finish bonus (50 = 5 pts)');
eq(last(phone.logs)?.milestonesAt.length, 3, '5: milestones 25/35/45');
eq(phone.local, null, '5: break already over');
const before = pc.logs.length;
await pc.sync();
eq(pc.logs.length, before, '5: PC does not log it again');

// --- 6. Offline: phone completes offline; PC was paused offline on the same session ---
server.now += MIN;
pc.local = null;
phone.local = null;
pc.start('d1', 50);
await pc.sync();
await phone.sync();
server.now += 30 * MIN;
online = false;
assert(phone.complete(), '6: phone completes offline (log written locally)');
pc.pause();
online = true;
await phone.sync();
eq(server.row?.end_reason, 'completed', '6: phone replay ends it');
await pc.sync();
eq(pc.local, null, '6: PC queued pause dropped, cleared');
eq(S.readFocusOps('pc').length, 0, '6: PC queue empty');

// --- 7. Both offline starts: the first to reach the server wins, the other is dropped ---
server.now += MIN;
pc.local = null;
phone.local = null;
online = false;
pc.start('e1', 25);
phone.start('e2', 25);
online = true;
await pc.sync();
await phone.sync();
eq(server.row?.session_id, 'e1', '7: first upload wins');
eq(localOf(phone)?.id, 'e1', '7: phone follows the PC session');
eq((last(phone.notices) as { kind: string })?.kind, 'replaced', '7: phone notice');

// --- 8. Adopting a session started before this build (no revision) ---
server.now += 30 * MIN; // e1 finished
await pc.sync();
const legacy = new Device('legacy');
legacy.local = {
  id: 'f1', mode: 'focus', taskName: 'Old', focusMinutes: 50, breakMinutes: 10, isCustom: false,
  startTime: server.now - 20 * MIN, plannedDurationSeconds: 3000, isPaused: false, pausedRemainingSeconds: 3000,
  userId: 'legacy', startedAt: server.now - 20 * MIN, pausedAt: null, marksAt: [],
};
await legacy.sync();
eq(server.row?.session_id, 'f1', '8: local session uploaded');
assert(legacy.local?.revision !== undefined, '8: now confirmed');
eq(Math.round(S.remainingSeconds(legacy.local!, server.now)), 30 * 60, '8: keeps its own start (30 min left)');

// --- 9. Mapping ---
const brk = X.rowToSession({ ...server.row!, status: 'break', focus_ended_at: iso(server.now), end_reason: 'finished' }, 'u');
eq(brk?.mode, 'break', '9: break row -> break session');
eq(brk?.id, 'f1-break', '9: break id');
eq(X.rowToSession({ ...server.row!, status: 'ended' }), null, '9: ended row -> nothing');
eq(X.parseRow({ nope: 1 }), null, '9: bad row ignored');
eq(X.parseReply(null), null, '9: bad reply ignored');

// --- 10. Skill log from a focus session (plain wire) ---
const skills = [{ id: 'sk', name: 'Guitar' } as Skill];
const focusLog: FocusSessionLog = {
  id: 'focus_a1', date: '2026-11-05', taskName: 'Scales', skillId: 'sk', durationMinutes: 50, pointsAwarded: 0,
  reflection: 'major scales', createdAt: '2026-11-05T10:00:00.000Z', plannedMinutes: 50,
  startedAt: '2026-11-05T09:10:00.000Z', milestonesAt: [],
};
const sl = K.focusSkillLogFor(focusLog, skills, [], []);
eq(sl?.id, 'skill_focus_a1', '10: deterministic id');
eq(sl?.durationMinutes, 50, '10: credited minutes');
eq(sl?.date, '2026-11-05', '10: session day');
eq(sl?.note, 'major scales', '10: reflection as note');
eq(sl?.skillId, 'sk', '10: same skill');
eq(sl?.pointsAwarded, 0, '10: points from the normal skill award');
eq(K.focusSkillLogFor(focusLog, skills, [sl!], []), null, '10: second write is the same row (not added twice)');
eq(K.focusSkillLogFor(focusLog, skills, [], ['skill_focus_a1']), null, '10: deleted skill log is not re-created');
eq(K.focusSkillLogFor({ ...focusLog, skillId: undefined }, skills, [], []), null, '10: no skill, no log');
eq(K.focusSkillLogFor({ ...focusLog, skillId: 'gone' }, skills, [], []), null, '10: deleted skill, no log');
eq(K.focusSkillLogFor({ ...focusLog, startedAt: '2026-11-05T09:30:00.000Z' }, skills, [], [])?.durationMinutes, 30, '10: never more than the wall time');
const logs: SkillSessionLog[] = [{ ...sl!, note: '' }];
eq(K.withReflectionNote(logs, 'focus_a1', undefined, 'later')[0].note, 'later', '10: reflection saved after Complete goes on the note');
eq(K.withReflectionNote([{ ...sl!, note: 'my edit' }], 'focus_a1', 'major scales', 'new')[0].note, 'my edit', '10: an edited note is kept');
eq(K.withReflectionNote([{ ...sl!, note: 'major scales' }], 'focus_a1', 'major scales', 'v2')[0].note, 'v2', '10: unchanged copy follows the reflection');
const same = [{ ...sl! }];
assert(K.withReflectionNote(same, 'focus_zz', undefined, 'x') === same, '10: no skill log: nothing changes');

console.log('focusCrossDevice: all checks passed');
