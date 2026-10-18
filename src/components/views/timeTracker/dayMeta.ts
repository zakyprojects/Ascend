import { useEffect, useState } from 'react';
import type { AppState, TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { trustedNow } from '@/lib/clock';
import { calculateTimeTrackerDailyPoints, TIME_TRACKER_POINTS } from '@/lib/pointsConfig';
import { timeTrackerAwardId } from '@/lib/timeTrackerAwards';
import { formatTime12h } from '@/lib/timeTracker';

/** The block's name: its label, else its category, else a deleted category. */
export function blockName(block: TimeTrackerBlock, activity: TimeTrackerActivity | undefined): string {
  return block.customTitle || activity?.name || 'Deleted category';
}

export function blockRange(block: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>): string {
  return `${formatTime12h(block.startTime)}–${formatTime12h(block.endTime)}`;
}

/** A day's points as the server recorded them (the ledger row), 0 when there is none. */
export function ledgerDayPoints(state: Pick<AppState, 'pointsHistory'>, dateKey: string): number {
  const entry = (state.pointsHistory || []).find((e) => e?.id === timeTrackerAwardId(dateKey));
  return Math.max(0, entry?.amount ?? 0);
}

/** What ticking more blocks would earn today ("2 more blocks for 5 pts"). */
export function nextTierHint(blocks: TimeTrackerBlock[]): string {
  if (blocks.length === 0) return 'Plan blocks to earn points.';
  const now = calculateTimeTrackerDailyPoints(blocks);
  if (now.pointsAwarded >= TIME_TRACKER_POINTS.dailyCap) return 'Top score for today.';
  const open = blocks.filter((b) => !b.completed && !b.skipped).length;
  for (let k = 1; k <= open; k++) {
    const ratio = ((now.completedCount + k) / Math.max(1, now.effectiveDenominator)) * 100;
    const tier =
      ratio >= TIME_TRACKER_POINTS.tiers.high.minPercent
        ? TIME_TRACKER_POINTS.tiers.high.points
        : ratio >= TIME_TRACKER_POINTS.tiers.medium.minPercent
          ? TIME_TRACKER_POINTS.tiers.medium.points
          : 0;
    if (tier > now.pointsAwarded) return `${k} more block${k === 1 ? '' : 's'} for ${tier} pts.`;
  }
  return 'No open blocks left today.';
}

/** The trusted time, refreshed every `intervalMs` and as soon as the tab is shown again. */
export function useNowTick(intervalMs = 15000): Date {
  const [now, setNow] = useState<Date>(() => trustedNow());
  useEffect(() => {
    const tick = () => setNow(trustedNow());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** Sections a block can open: its category's and its extra categories' linked sections. */
export function launchModules(
  block: TimeTrackerBlock,
  activityMap: Map<string, TimeTrackerActivity>
): { moduleId: string; activityId: string }[] {
  const out: { moduleId: string; activityId: string }[] = [];
  for (const id of [block.activityId, ...(block.secondaryActivityIds || [])]) {
    const act = activityMap.get(id);
    if (act?.ascendModule && !out.some((m) => m.moduleId === act.ascendModule)) {
      out.push({ moduleId: act.ascendModule, activityId: act.id });
    }
  }
  return out;
}

/** Section names as the app's navigation calls them. */
export const MODULE_LABELS: Record<string, string> = {
  'Deep Focus': 'Deep Focus',
  'Prefrontal Cortex': 'Deep Focus',
  Exercise: 'Exercise',
  Reading: 'Reading',
  Skills: 'Skills',
  'Skill Mastery': 'Skills',
  Habits: 'Habits',
  Recovery: 'Recovery',
  'Addiction Recovery': 'Recovery',
};
