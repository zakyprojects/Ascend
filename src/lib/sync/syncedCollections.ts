import type {
  AppState,
  CravingLog,
  DecisionLog,
  EmotionLog,
  FocusSessionLog,
  Goal,
  JournalEntry,
  Project,
  Task,
} from '../../types';

/**
 * Blob collections that also live in a relational table (DB normalization,
 * knowledge/db-normalization-plan.md). Adding a module = one entry here plus its
 * table migration. `toRow` must not include user_id, updated_at or deleted_at:
 * the outbox owns those columns.
 */
export interface SyncedCollection<K extends keyof AppState = keyof AppState> {
  stateKey: K;
  table: string;
  toRow: (item: SyncedItem<K>) => Record<string, unknown>;
  /** Server row back to the state item; toRow(fromRow(row)) must hash like the original item. */
  fromRow: (row: Record<string, unknown>) => SyncedItem<K>;
  /** Timestamp used as updated_at when an item is uploaded without a local edit. */
  ownTimestamp: (item: SyncedItem<K>) => string;
  /** Row id for an item when it is not item.id (weekly goals are one row per week). */
  rowId?: (item: SyncedItem<K>) => string;
  /**
   * An item removed from the state is deleted on the server even without a
   * tombstone. Only for collections that local reducers alone rewrite (the points
   * ledger, which consolidates and excises entries); the outbox still refuses a
   * mass removal.
   */
  mirrorRemovals?: boolean;
}

/** The table row id of a state item. */
export const rowIdOf = (collection: SyncedCollection, item: { id?: string }): string =>
  collection.rowId ? collection.rowId(item as never) : item.id || '';

/** Postgres timestamptz text back to the client's ISO form (2026-10-14T08:51:38.705Z). */
const isoTime = (value: unknown): string => new Date(String(value)).toISOString();

type SyncedItem<K extends keyof AppState> = NonNullable<AppState[K]> extends Array<infer T> ? T : never;

/**
 * Key-sorted copy without undefined values. jsonb does not keep key order, so
 * document rows hash on this form to stay equal after a server round trip.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== undefined) sorted[key] = canonical(field);
  }
  return sorted;
}

/**
 * A collection stored as one jsonb document per item (batch C): modules with
 * nested or legacy-heavy items, kept whole so nothing is lost in a mapping.
 */
function documentCollection<K extends keyof AppState>(
  stateKey: K,
  table: string,
  createdAt: (item: SyncedItem<K>) => string,
  rowId?: (item: SyncedItem<K>) => string,
  mirrorRemovals = false
): SyncedCollection<K> {
  return {
    stateKey,
    table,
    toRow: (item) => ({
      id: rowId ? rowId(item) : (item as { id: string }).id,
      data: canonical(item),
      created_at: createdAt(item),
    }),
    fromRow: (row) => canonical(row.data) as SyncedItem<K>,
    ownTimestamp: (item) => (item as { updatedAt?: string }).updatedAt || createdAt(item),
    ...(rowId ? { rowId } : {}),
    ...(mirrorRemovals ? { mirrorRemovals } : {}),
  };
}

type Created = { createdAt: string };
const byCreatedAt = (item: Created) => item.createdAt;

const decisionLogs: SyncedCollection<'decisionLogs'> = {
  stateKey: 'decisionLogs',
  table: 'decision_logs',
  toRow: (d: DecisionLog) => ({
    id: d.id,
    title: d.title,
    rationale: d.rationale ?? '',
    expected_outcome: d.expectedOutcome ?? '',
    revisit_date: d.revisitDate,
    reflection: d.reflection ?? null,
    is_reflected: d.isReflected ?? false,
    created_at: d.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title),
    rationale: String(r.rationale ?? ''),
    expectedOutcome: String(r.expected_outcome ?? ''),
    revisitDate: String(r.revisit_date),
    ...(r.reflection != null ? { reflection: String(r.reflection) } : {}),
    isReflected: Boolean(r.is_reflected),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (d) => d.createdAt,
};

const emotionLogs: SyncedCollection<'emotionLogs'> = {
  stateKey: 'emotionLogs',
  table: 'emotion_logs',
  toRow: (e: EmotionLog) => ({
    id: e.id,
    logged_at: e.date || e.createdAt,
    emotion: e.emotion,
    intensity: e.intensity,
    context: e.context ?? '',
    points_awarded: e.pointsAwarded ?? 0,
    created_at: e.createdAt || e.date,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: isoTime(r.logged_at),
    emotion: String(r.emotion),
    intensity: Number(r.intensity),
    context: String(r.context ?? ''),
    pointsAwarded: Number(r.points_awarded ?? 0),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (e) => e.createdAt || e.date,
};

/** Nullable column back to an optional field: absent when null, so the row hashes like the original item. */
const optional = <K extends string, V>(key: K, value: unknown, cast: (v: unknown) => V): { [P in K]?: V } =>
  (value == null ? {} : { [key]: cast(value) }) as { [P in K]?: V };

const cravingLogs: SyncedCollection<'cravingLogs'> = {
  stateKey: 'cravingLogs',
  table: 'craving_logs',
  toRow: (c: CravingLog) => ({
    id: c.id,
    logged_at: c.date || c.createdAt,
    intensity: c.intensity,
    trigger_text: c.trigger ?? '',
    coping_strategy: c.copingStrategy ?? '',
    created_at: c.createdAt || c.date,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: isoTime(r.logged_at),
    intensity: Number(r.intensity),
    trigger: String(r.trigger_text ?? ''),
    copingStrategy: String(r.coping_strategy ?? ''),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (c) => c.createdAt || c.date,
};

const journalEntries: SyncedCollection<'journalEntries'> = {
  stateKey: 'journalEntries',
  table: 'journal_entries',
  toRow: (j: JournalEntry) => ({
    id: j.id,
    entry_date: j.date,
    mood: j.mood,
    content: j.content ?? '',
    points_awarded: j.pointsAwarded ?? false,
    created_at: j.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: String(r.entry_date),
    mood: String(r.mood) as JournalEntry['mood'],
    content: String(r.content ?? ''),
    pointsAwarded: Boolean(r.points_awarded),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (j) => j.createdAt,
};

const focusLogs: SyncedCollection<'focusLogs'> = {
  stateKey: 'focusLogs',
  table: 'focus_logs',
  toRow: (f: FocusSessionLog) => ({
    id: f.id,
    log_date: f.date,
    task_name: f.taskName ?? '',
    skill_id: f.skillId || null,
    duration_minutes: f.durationMinutes ?? 0,
    points_awarded: f.pointsAwarded ?? 0,
    reflection: f.reflection ?? null,
    created_at: f.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: String(r.log_date),
    taskName: String(r.task_name ?? ''),
    ...optional('skillId', r.skill_id, String),
    durationMinutes: Number(r.duration_minutes ?? 0),
    pointsAwarded: Number(r.points_awarded ?? 0),
    ...optional('reflection', r.reflection, String),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (f) => f.createdAt,
};

const goals: SyncedCollection<'goals'> = {
  stateKey: 'goals',
  table: 'goals',
  toRow: (g: Goal) => ({
    id: g.id,
    title: g.title ?? '',
    description: g.description ?? null,
    category: g.category ?? null,
    target_date: g.targetDate || null,
    status: g.status,
    manual_progress: g.manualProgress ?? null,
    sequential_mode: g.sequentialMode ?? null,
    created_at: g.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    ...optional('description', r.description, String),
    ...optional('category', r.category, String),
    ...optional('targetDate', r.target_date, String),
    status: String(r.status) as Goal['status'],
    ...optional('manualProgress', r.manual_progress, Number),
    ...optional('sequentialMode', r.sequential_mode, Boolean),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (g) => g.createdAt,
};

const projects: SyncedCollection<'projects'> = {
  stateKey: 'projects',
  table: 'projects',
  toRow: (p: Project) => ({
    id: p.id,
    title: p.title ?? '',
    description: p.description ?? null,
    goal_id: p.goalId || null,
    start_date: p.startDate || null,
    due_date: p.dueDate || null,
    status: p.status,
    completed_at: p.completedAt || null,
    manual_progress: p.manualProgress ?? null,
    sort_order: p.order ?? null,
    created_at: p.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    ...optional('description', r.description, String),
    ...optional('goalId', r.goal_id, String),
    ...optional('startDate', r.start_date, String),
    ...optional('dueDate', r.due_date, String),
    status: String(r.status) as Project['status'],
    ...optional('completedAt', r.completed_at, isoTime),
    ...optional('manualProgress', r.manual_progress, Number),
    ...optional('order', r.sort_order, Number),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (p) => p.createdAt,
};

const tasks: SyncedCollection<'tasks'> = {
  stateKey: 'tasks',
  table: 'tasks',
  toRow: (t: Task) => ({
    id: t.id,
    title: t.title ?? '',
    description: t.description ?? null,
    project_id: t.projectId || null,
    due_date: t.dueDate || null,
    priority: t.priority,
    completed: t.completed ?? false,
    subtasks: (t.subtasks ?? []).map((st) => ({ id: st.id, title: st.title, completed: st.completed })),
    created_at: t.createdAt,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    ...optional('description', r.description, String),
    ...optional('projectId', r.project_id, String),
    ...optional('dueDate', r.due_date, String),
    priority: String(r.priority) as Task['priority'],
    completed: Boolean(r.completed),
    subtasks: (Array.isArray(r.subtasks) ? r.subtasks : []).map((st: Record<string, unknown>) => ({
      id: String(st.id),
      title: String(st.title ?? ''),
      completed: Boolean(st.completed),
    })),
    createdAt: isoTime(r.created_at),
  }),
  ownTimestamp: (t) => t.createdAt,
};

export const SYNCED_COLLECTIONS = [
  decisionLogs as unknown as SyncedCollection,
  emotionLogs as unknown as SyncedCollection,
  cravingLogs as unknown as SyncedCollection,
  journalEntries as unknown as SyncedCollection,
  focusLogs as unknown as SyncedCollection,
  goals as unknown as SyncedCollection,
  projects as unknown as SyncedCollection,
  tasks as unknown as SyncedCollection,
  documentCollection('habits', 'habits', byCreatedAt),
  documentCollection('workouts', 'workouts', byCreatedAt),
  documentCollection('libraryBooks', 'reading_books', (b) => b.addedAt),
  documentCollection('readingLogs', 'reading_logs', byCreatedAt),
  documentCollection('skills', 'skills', byCreatedAt),
  documentCollection('skillLogs', 'skill_logs', byCreatedAt),
  documentCollection('badHabits', 'bad_habits', byCreatedAt),
  documentCollection('badHabitLogs', 'bad_habit_logs', byCreatedAt),
  // Weekly goals merge by week, not by document id, so the week is the row id.
  documentCollection('weeklyGoals', 'weekly_goals', byCreatedAt, (w) => w.weekKey),
  // Points ledger (batch D): complete history; deterministic ids can be excised and re-awarded.
  documentCollection('pointsHistory', 'point_entries', (e) => e.timestamp, undefined, true),
] as unknown as SyncedCollection[];

/**
 * Keys that boot hydration always reloads from their own tables (authSession:
 * invites, partnerships, challenges, notifications, plans). The blob copy was
 * only a mirror, so it is no longer stored (batches B1, B2).
 */
const TABLE_OWNED_KEYS = [
  'partnerInvites',
  'partnership',
  'partnerships',
  'sharedChallenges',
  'notifications',
  // Plans keep their own direct table writes; hydration merges this device's
  // copies (pending/failed plans, higher streaks) into the rows (batch B2).
  'improvementPlans',
  'followedPlans',
] as const satisfies readonly (keyof AppState)[];

/** Every state key whose source of truth is a table rather than the blob. */
const TABLE_BACKED_KEYS: (keyof AppState)[] = [
  ...SYNCED_COLLECTIONS.map((c) => c.stateKey),
  ...TABLE_OWNED_KEYS,
];

/**
 * The state as stored in the user_data blob (DB normalization S4): keys
 * backed by tables are left out of it. Local caches keep the full state for
 * offline cold boot.
 */
export function withoutSyncedCollections(state: AppState): AppState {
  const blob: Partial<AppState> = { ...state };
  for (const key of TABLE_BACKED_KEYS) delete blob[key];
  return blob as AppState;
}

/**
 * Table-backed keys from this device's last saved state. The blob no longer
 * carries them, so a boot starts from these instead of empty values until the
 * table reads land; those reads then reconcile them.
 */
export function cachedSyncedCollections(userId: string): Partial<AppState> {
  try {
    const raw = localStorage.getItem(`ascend_user_cache_${userId}`);
    const cached = raw ? (JSON.parse(raw) as Partial<AppState>) : null;
    if (!cached || typeof cached !== 'object') return {};
    const picked: Partial<AppState> = {};
    for (const key of TABLE_BACKED_KEYS) {
      if (key in cached) Object.assign(picked, { [key]: cached[key] });
    }
    return picked;
  } catch {
    return {};
  }
}
