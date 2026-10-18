import type { TimeTrackerActivity } from '@/types';
import { trustedNow } from '@/lib/clock';

/** Category names compare trimmed and case-insensitive ("Reading" = " reading "). */
export const categoryNameKey = (name: string): string => name.trim().toLocaleLowerCase();

/**
 * True when another category (built-in included) already has this name. A category keeping its
 * own current name is fine, so old duplicates can still be edited without renaming.
 */
export function categoryNameTaken(
  name: string,
  activities: TimeTrackerActivity[],
  editing?: TimeTrackerActivity | null
): boolean {
  const key = categoryNameKey(name);
  if (!key) return false;
  if (editing && categoryNameKey(editing.name) === key) return false;
  return activities.some((a) => a.id !== editing?.id && categoryNameKey(a.name) === key);
}

function madeLabel(createdAt?: string): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === trustedNow().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Names to show where categories sit side by side: two with the same name get "· made <date>"
 * (from createdAt) so they can be told apart. Keyed by category id.
 */
export function categoryDisplayNames(activities: TimeTrackerActivity[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const a of activities) counts.set(categoryNameKey(a.name), (counts.get(categoryNameKey(a.name)) || 0) + 1);
  const out = new Map<string, string>();
  for (const a of activities) {
    const dup = (counts.get(categoryNameKey(a.name)) || 0) > 1;
    const made = dup ? madeLabel(a.createdAt) : '';
    out.set(a.id, made ? `${a.name} · made ${made}` : a.name);
  }
  return out;
}
