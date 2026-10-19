import type { PointsEntry } from '@/types';
import { entryDay } from './weeklyActivity';

/**
 * Points the ledger holds per local day for one module: the sum of its rows (`source`) by the day
 * each row is for (`entryDay`: its stored date, else its timestamp), skipping rows the server
 * retired (`isRetired`). Day labels and charts of earlier days read this, never the logs: deleting
 * or clearing an earlier day's log never changes that day's points (Zakria 2026-10-17/18), so the
 * page must not show a drop either.
 */
export function ledgerPointsByDay(
  history: PointsEntry[] | undefined,
  source: string,
  isRetired: (entry: PointsEntry) => boolean
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const e of history || []) {
    if (!e || e.source !== source || isRetired(e)) continue;
    const day = entryDay(e);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) || 0) + (Number(e.amount) || 0));
  }
  return byDay;
}
