import type { AppState } from '@/types';

/**
 * State that describes one device, not the account, kept in the local cache only.
 * unsyncedEntityIds lists this device's edits awaiting a save: in the blob, every
 * merge re-added the server's copy, so it never emptied. deletedEntityIds and
 * restoredEntityIds tell this device's sync which rows to delete or revive; other
 * devices learn a delete from the row itself (deleted_at in the synced tables, the
 * row gone from the social tables), so the blob no longer carries them (batch H).
 */
const DEVICE_LOCAL_KEYS = ['unsyncedEntityIds', 'deletedEntityIds', 'restoredEntityIds'] as const;

/** The state without device-local keys: what the blob stores and what is read back from it. */
export function withoutDeviceLocalKeys(state: AppState): AppState {
  if (!DEVICE_LOCAL_KEYS.some((key) => key in state)) return state;
  const copy: Record<string, unknown> = { ...state };
  for (const key of DEVICE_LOCAL_KEYS) delete copy[key];
  return copy as unknown as AppState;
}

/** This device's device-local keys from its last saved state; the blob does not carry them. */
export function cachedDeviceLocalState(userId: string): Partial<AppState> {
  try {
    const raw = localStorage.getItem(`ascend_user_cache_${userId}`);
    const cached = raw ? (JSON.parse(raw) as Partial<AppState>) : null;
    if (!cached || typeof cached !== 'object') return {};
    const picked: Partial<AppState> = {};
    for (const key of DEVICE_LOCAL_KEYS) {
      if (Array.isArray(cached[key])) Object.assign(picked, { [key]: cached[key] });
    }
    return picked;
  } catch {
    return {};
  }
}
