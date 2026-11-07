import type { ListOrder, Project } from '../types';

export type { ListOrder };

/**
 * Display order of the user's lists (knowledge/mode-a-reorder-items-2026-11-07.md).
 *
 * Array order in the state is not an order: it depends on the device (items made here are
 * appended or prepended, items pulled from another device are prepended). Every list therefore
 * renders through an explicit sort: the user's own order when one is saved, a fixed fallback for
 * everything else.
 */

type Dated = { id: string; createdAt?: string | number };

const createdKey = (item: Dated): string => (item.createdAt === undefined ? '' : String(item.createdAt));

/** Oldest first (createdAt, then id): lists whose new items join the end. */
export const byCreatedAsc = (a: Dated, b: Dated): number =>
  createdKey(a).localeCompare(createdKey(b)) || a.id.localeCompare(b.id);

/** Newest first (createdAt, then id): lists whose new items join the top. */
export const byCreatedDesc = (a: Dated, b: Dated): number =>
  createdKey(b).localeCompare(createdKey(a)) || b.id.localeCompare(a.id);

/** A goal's projects in sequence order (order, then oldest first, then id). */
export function sortBySequence<T extends Pick<Project, 'id' | 'order' | 'createdAt'>>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/** Projects without a goal: their own order, then newest first (new ones get the lowest order). */
export function sortStandalone<T extends Pick<Project, 'id' | 'order' | 'createdAt'>>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

/**
 * Every project in one order: goal by goal in the goals' display order, each goal's projects in
 * sequence, then projects without a goal (or whose goal is gone).
 */
export function projectsInDisplayOrder<T extends Pick<Project, 'id' | 'order' | 'createdAt' | 'goalId'>>(
  projects: readonly T[],
  orderedGoalIds: readonly string[]
): T[] {
  const byGoal = new Map<string, T[]>();
  for (const p of projects) {
    if (!p.goalId) continue;
    const list = byGoal.get(p.goalId);
    if (list) list.push(p);
    else byGoal.set(p.goalId, [p]);
  }
  const placed = new Set<string>();
  const out: T[] = [];
  for (const goalId of orderedGoalIds) {
    for (const p of sortBySequence(byGoal.get(goalId) ?? [])) {
      out.push(p);
      placed.add(p.id);
    }
  }
  out.push(...sortStandalone(projects.filter((p) => !placed.has(p.id))));
  return out;
}

/** Next order for a project joining the end of a goal's sequence (or of the standalone list). */
export function nextSequenceOrder(projects: readonly Pick<Project, 'id' | 'goalId' | 'order'>[], goalId: string | undefined, exceptId?: string): number {
  return projects.reduce(
    (max, p) => ((p.goalId || undefined) === (goalId || undefined) && p.id !== exceptId ? Math.max(max, (p.order ?? 0) + 1) : max),
    0
  );
}

/** Order for a new standalone project: above every other one. */
export function topStandaloneOrder(projects: readonly Pick<Project, 'goalId' | 'order'>[]): number {
  return projects.reduce((min, p) => (p.goalId ? min : Math.min(min, (p.order ?? 0) - 1)), 0);
}

// ---------------------------------------------------------------------------
// Saved orders (list_orders table, one row per list)
// ---------------------------------------------------------------------------

/** Keys of the lists with a saved order. Projects keep their own `order` column instead. */
export const LIST_ORDER_KEYS = {
  habits: 'habits',
  goals: 'goals',
  tasks: 'tasks',
  skills: 'skills',
  badHabits: 'badHabits',
  toRead: 'books:toRead',
  plans: 'plans',
  ttActivities: 'tt:activities',
  ttTemplates: 'tt:templates',
  weeklyGoals: (weekKey: string) => `weeklyGoals:${weekKey}`,
  drills: (skillId: string) => `drills:${skillId}`,
} as const;

/** The saved id order of a list, if any. */
export function savedOrderIds(orders: readonly ListOrder[] | undefined, key: string): readonly string[] | undefined {
  return orders?.find((o) => o.id === key)?.ids;
}

/**
 * `items` in the saved order. Items the saved order does not name (made before any reorder, on
 * another device, or by an older app) are placed by `fallback`: before the saved ones for lists
 * whose new items join the top, after them otherwise. Ids of items that no longer exist are ignored.
 */
export function applyListOrder<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[] | undefined,
  fallback: (a: T, b: T) => number,
  newAt: 'start' | 'end'
): T[] {
  const sorted = [...items].sort(fallback);
  if (!ids || ids.length === 0) return sorted;
  const rank = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const known = sorted.filter((item) => rank.has(item.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const unknown = sorted.filter((item) => !rank.has(item.id));
  return newAt === 'start' ? [...unknown, ...known] : [...known, ...unknown];
}

/**
 * The full order after the user reordered a visible part of it: the visible items take the
 * slots they held in the full order, in their new order, and every other item keeps its slot.
 * Ids in `visibleOrder` that are not in `fullOrder` are ignored.
 */
export function reorderInSlots(fullOrder: readonly string[], visibleOrder: readonly string[]): string[] {
  const full = new Set(fullOrder);
  const visible = visibleOrder.filter((id) => full.has(id));
  const visibleSet = new Set(visible);
  let next = 0;
  return fullOrder.map((id) => (visibleSet.has(id) ? visible[next++] : id));
}

/** `ids` with `id` moved by `delta` places (clamped to the list). */
export function moveId(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const to = Math.max(0, Math.min(ids.length - 1, from + delta));
  if (to === from) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** The two orders name the same ids in the same order. */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
