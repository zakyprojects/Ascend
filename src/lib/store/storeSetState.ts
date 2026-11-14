import type { AppState } from '@/types';

/** useAppState's setState: an update, plus `immediate` to save at once (resolves when that save settles). */
export type StoreSetState = (
  updater: AppState | ((prev: AppState) => AppState),
  options?: { immediate?: boolean; actionLabel?: string; entityId?: string }
) => Promise<void> | undefined;
