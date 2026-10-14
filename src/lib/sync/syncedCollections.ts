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
  /** Timestamp used as updated_at when an item is uploaded without a local edit. */
  ownTimestamp: (item: SyncedItem<K>) => string;
}

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
  ownTimestamp: (e) => e.createdAt || e.date,
};

export const SYNCED_COLLECTIONS: SyncedCollection[] = [
  decisionLogs as unknown as SyncedCollection,
  emotionLogs as unknown as SyncedCollection,
];
