import type { AppState, DecisionLog, EmotionLog } from '../../types';

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
}

/** Postgres timestamptz text back to the client's ISO form (2026-10-14T08:51:38.705Z). */
const isoTime = (value: unknown): string => new Date(String(value)).toISOString();

type SyncedItem<K extends keyof AppState> = NonNullable<AppState[K]> extends Array<infer T> ? T : never;

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

export const SYNCED_COLLECTIONS: SyncedCollection[] = [
  decisionLogs as unknown as SyncedCollection,
  emotionLogs as unknown as SyncedCollection,
];
