// In-memory fake Supabase database for the hook tests (*.hook.test.ts). Ported from the browser
// e2e harness (/workspace/work/sync-e2e/fake-server.mjs, 2026-11-05), which mirrors the live SQL:
//   *_keep_newer (sync_keep_newer_row / _revivable_row / weekly_goals_merge_row / habits_merge_row
//   20261105140000) fire BEFORE sync_stamp_row; sync_stamp_row sets server_updated_at and caps a
//   future updated_at (20261105120000); guard_day_future (habits/workouts/bad_habit_logs, 23514);
//   reading/skill_logs_guard_today (RETURN NULL); server-owned point_entries / league_archives
//   (20261015250000, 20261017060000) drop every app write; soft deletes are never revived.
// It is a model, not the database: a migration after 2026-11-05 is not in here unless added.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Clock = real wall clock (the browsers use real clocks too) + optional skew.
const REVIVABLE = new Set(['point_entries', 'time_tracker_activities', 'time_tracker_templates', 'league_archives']);
const SERVER_OWNED_TABLES = new Set(['point_entries', 'league_archives']);
export const SYNCED_TABLES = new Set([
  'decision_logs', 'emotion_logs', 'craving_logs', 'journal_entries', 'focus_logs', 'goals', 'projects', 'tasks',
  'addiction_trackers', 'lesson_reads', 'weekly_goals', 'habits', 'workouts', 'reading_books', 'reading_logs', 'skills',
  'skill_logs', 'bad_habits', 'bad_habit_logs', 'point_entries', 'league_archives', 'time_tracker_activities',
  'time_tracker_templates', 'time_tracker_days',
]);
const ts = (v: any) => Date.parse(v);
// The test account's timezone (profiles.timezone and device_timezone in fakeSupabase.ts): the zone
// the test runs in (TZ), as for a member who lives there. The server's "today" for the guards is
// this zone's date, so it matches the app's local today in every CI zone (a fixed Asia/Karachi
// here made the reading/skill log guards drop today's logs under TZ=America/New_York whenever the
// two dates differ, i.e. from 14:00 to midnight New York time).
export const ACCOUNT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';

export class FakeServer {
  legacyNoCap: boolean;
  lastStamp: number;
  tables: Map<string, Map<string, any>>;
  generic: Map<string, any[]>;
  blob: Map<string, { state: any; updated_at: string }>;
  log: any[];
  subscribers: Set<{ send: (table: string, row: any, type: string) => void }>;
  constructor({ legacyNoCap = false }: { legacyNoCap?: boolean } = {}) {
    this.legacyNoCap = legacyNoCap;
    this.lastStamp = 0;
    this.tables = new Map(); // synced tables: key uid:id
    this.generic = new Map(); // other tables: array of rows
    this.blob = new Map(); // user_data
    this.log = [];
    this.subscribers = new Set(); // {send(table,row), uid}
  }
  nowMs() { return Date.now(); }
  nowIso() { return new Date(this.nowMs()).toISOString(); }
  stamp() { const s = Math.max(this.nowMs(), this.lastStamp + 1); this.lastStamp = s; return new Date(s).toISOString(); }
  accountToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: ACCOUNT_TZ }).format(new Date(this.nowMs())); }
  t(table: string): Map<string, any> { if (!this.tables.has(table)) this.tables.set(table, new Map()); return this.tables.get(table)!; }
  row(table: string, uid: string, id: string): any { return this.t(table).get(`${uid}:${id}`); }
  note(kind: string, table: string, id: string, why: string, who: string) { this.log.push({ at: this.nowIso(), kind, table, id, why, who }); }

  guardFuture(table: string, NEW: any, OLD: any): string | null {
    if (NEW.deleted_at) return null;
    const latest = this.accountToday();
    if (table === 'habits') {
      const c = NEW.data?.completions;
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        for (const k of Object.keys(c)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k > latest && !(OLD && OLD.data?.completions && k in OLD.data.completions)) {
            return `habit ${NEW.id} completion ${k} is in the future`;
          }
        }
      }
    }
    if (['workouts', 'bad_habit_logs'].includes(table)) {
      const k = NEW.data?.date;
      if (typeof k === 'string' && k.slice(0, 10) > latest) return `${table} row ${NEW.id} is dated in the future`;
    }
    return null;
  }
  guardToday(table: string, NEW: any, OLD: any): boolean {
    if (!['reading_logs', 'skill_logs'].includes(table) || NEW.deleted_at) return true;
    const today = this.accountToday();
    if (NEW.data?.date !== today) return false;
    if (OLD && OLD.data?.date !== today) return false;
    return true;
  }
  keepNewer(table: string, NEW: any, OLD: any): any {
    if (REVIVABLE.has(table)) return ts(NEW.updated_at) < ts(OLD.updated_at) ? null : NEW;
    if (table === 'weekly_goals') return this.weeklyGoalsMerge(NEW, OLD);
    if (table === 'habits' && !false) return this.habitsMerge(NEW, OLD);
    if (OLD.deleted_at) return null;
    if (!NEW.deleted_at && ts(NEW.updated_at) < ts(OLD.updated_at)) return null;
    return NEW;
  }
  // Port of habits_merge_row (20261105140000, applied 2026-11-05).
  habitsMerge(NEW: any, OLD: any): any {
    if (OLD.deleted_at) return null;
    const isObj = (c: any) => c && typeof c === 'object' && !Array.isArray(c);
    if (NEW.deleted_at || !isObj(NEW.data?.completions) || !isObj(OLD.data?.completions)) {
      if (!NEW.deleted_at && ts(NEW.updated_at) < ts(OLD.updated_at)) return null;
      return NEW;
    }
    const newWins = ts(NEW.updated_at) >= ts(OLD.updated_at);
    const newer = newWins ? NEW.data : OLD.data, older = newWins ? OLD.data : NEW.data;
    const t = (e: any) => { const v = Date.parse(e?.updatedAt || ''); return Number.isNaN(v) ? -Infinity : v; };
    const comp: Record<string, any> = {};
    for (const k of new Set([...Object.keys(newer.completions), ...Object.keys(older.completions)])) {
      const n = newer.completions[k], o = older.completions[k];
      comp[k] = n === undefined ? o : o === undefined ? n : t(o) > t(n) ? o : n;
    }
    const data: any = { ...newer, completions: Object.fromEntries(Object.keys(comp).sort().map((k) => [k, comp[k]])) };
    if (Array.isArray(newer.missedPeriods) || Array.isArray(older.missedPeriods)) {
      const nm = Array.isArray(newer.missedPeriods) ? newer.missedPeriods : [];
      const om = Array.isArray(older.missedPeriods) ? older.missedPeriods : [];
      data.missedPeriods = [...nm, ...om.filter((x: any) => !nm.includes(x))];
    }
    const out = { ...NEW, data };
    if (!newWins) {
      if (JSON.stringify(data) === JSON.stringify(OLD.data)) return null;
      out.updated_at = OLD.updated_at;
    }
    return out;
  }
  weeklyGoalsMerge(NEW: any, OLD: any): any {
    if (OLD.deleted_at) return null;
    if (NEW.deleted_at || !Array.isArray(NEW.data?.deletedGoalIds)) {
      if (!NEW.deleted_at && ts(NEW.updated_at) < ts(OLD.updated_at)) return null;
      return NEW;
    }
    const newWins = ts(NEW.updated_at) >= ts(OLD.updated_at);
    const newer = newWins ? NEW.data : OLD.data;
    const older = newWins ? OLD.data : NEW.data;
    const deleted = [...new Set([...(NEW.data.deletedGoalIds || []), ...(Array.isArray(OLD.data?.deletedGoalIds) ? OLD.data.deletedGoalIds : [])])].sort();
    const ch = (g: any) => { const v = g?.updatedAt || g?.createdAt; const t = Date.parse(v || ''); return Number.isNaN(t) ? -Infinity : t; };
    const n = (newer.goals || []).filter((g: any) => !(g.id && deleted.includes(g.id)));
    const o = (older.goals || []).filter((g: any) => g.id && !deleted.includes(g.id));
    const merged = n.map((g: any) => {
      const og = o.find((x: any) => x.id === g.id);
      if (!og) return g;
      if (ch(og) > ch(g)) return og;
      if (ch(g) > ch(og)) return g;
      return { ...og, ...g };
    });
    for (const og of o) if (!n.find((g: any) => g.id === og.id)) merged.push(og);
    const data = { ...newer, goals: merged, deletedGoalIds: deleted };
    const out = { ...NEW, data };
    if (!newWins) {
      if (JSON.stringify(data) === JSON.stringify(OLD.data)) return null;
      out.updated_at = OLD.updated_at;
    }
    return out;
  }
  capFuture(row: any): any {
    if (!this.legacyNoCap && row.updated_at && ts(row.updated_at) > ts(row.server_updated_at)) row.updated_at = row.server_updated_at;
    return row;
  }
  upsert(table: string, rows: any[], who: string): { status: number; body: any } {
    const staged: [any, any][] = [];
    const stored: any[] = [];
    for (const r of rows) {
      const OLD = this.row(table, r.user_id, r.id);
      const err = this.guardFuture(table, r, OLD);
      if (err) { this.note('refused-23514', table, r.id, err, who); return { status: 400, body: { code: '23514', message: err } }; }
      staged.push([r, OLD]);
    }
    for (const [r, OLD] of staged) {
      if (SERVER_OWNED_TABLES.has(table)) { this.note('dropped', table, r.id, 'server-owned table refuses app writes', who); continue; }
      if (!this.guardToday(table, r, OLD)) { this.note('dropped', table, r.id, `guard_today ${r.data?.date}`, who); continue; }
      if (!OLD) {
        const row = this.capFuture({ created_at: this.nowIso(), deleted_at: null, ...r, server_updated_at: this.stamp() });
        this.t(table).set(`${r.user_id}:${r.id}`, row);
        this.note('insert', table, r.id, `updated_at ${r.updated_at}`, who);
        this.emit(table, row, 'INSERT');
        stored.push(structuredClone(row));
        continue;
      }
      const NEW = this.keepNewer(table, { ...OLD, ...r, created_at: OLD.created_at }, OLD);
      if (!NEW) {
        this.note('dropped', table, r.id, OLD.deleted_at && !REVIVABLE.has(table) ? 'row is soft-deleted (never revived)' : `stale: updated_at ${r.updated_at} < stored ${OLD.updated_at}`, who);
        continue;
      }
      const row = this.capFuture({ ...NEW, server_updated_at: this.stamp() });
      this.t(table).set(`${r.user_id}:${r.id}`, row);
      this.note('update', table, r.id, `updated_at ${row.updated_at}${row.deleted_at ? ' (delete)' : ''}`, who);
      this.emit(table, row, 'UPDATE');
      stored.push(structuredClone(row));
    }
    // PostgREST return=representation: only the rows actually written (a trigger's RETURN NULL row is absent).
    return { status: 201, body: stored };
  }
  update(table: string, uid: string, ids: string[], patch: any, who: string): { status: number; body: any } {
    for (const id of ids) {
      const OLD = this.row(table, uid, id);
      if (!OLD) continue;
      const NEW = this.keepNewer(table, { ...OLD, ...patch }, OLD);
      if (!NEW) { this.note('dropped', table, id, `update refused by keep_newer ${JSON.stringify(patch)}`, who); continue; }
      const row = this.capFuture({ ...NEW, server_updated_at: this.stamp() });
      this.t(table).set(`${uid}:${id}`, row);
      this.note('update', table, id, `patch ${JSON.stringify(patch)}`, who);
      this.emit(table, row, 'UPDATE');
    }
    return { status: 204, body: null };
  }
  emit(table: string, row: any, type: string) {
    for (const s of this.subscribers) { try { s.send(table, structuredClone(row), type); } catch { /* closed */ } }
  }
  select(table: string, uid?: string): any[] { return [...this.t(table).values()].filter((r) => !uid || r.user_id === uid).map((r) => structuredClone(r)); }
  // helpers for assertions
  find(table: string, pred: (row: any) => boolean): any[] { return [...this.t(table).values()].filter(pred).map((r) => structuredClone(r)); }
  g(table: string): any[] { if (!this.generic.has(table)) this.generic.set(table, []); return this.generic.get(table)!; }
}
