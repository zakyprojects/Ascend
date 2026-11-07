import type { Project } from '../types';

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

