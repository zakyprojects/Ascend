import { CheckSquare, Compass, Flame, Target, type LucideIcon } from 'lucide-react';
import type { BadgeTone } from '@/components/ui/primitives';
import type { ProgressTone } from '@/components/ui/primitives';
import type { ImprovementPlan, PlanType, UserPlanFollow } from '@/types';
import { calculateActivePlanStreak, calculateElapsedDays, isPlanJourneyDoneThisPeriod, parseDate, todayKey } from '@/lib/dates';
import { trustedNowMs } from '@/lib/clock';

/** A plan the user made, or their own copy of someone else's: both render with the same card. */
export type AnyPlan = ImprovementPlan | UserPlanFollow;

/** The user's own plans ("Created by me"); the id check keeps it right after a rename. */
export function ownPlans(plans: ImprovementPlan[], currentUserId: string | undefined): ImprovementPlan[] {
  return plans.filter((p) => !currentUserId || !p.creatorId || p.creatorId === currentUserId);
}

/** A new or renamed plan of yours can't take the name of another plan you made (copies live apart). */
export const PLAN_NAME_TAKEN = 'You already have a plan with this name.';

export interface PlanTypeMeta {
  label: string;
  /** One line for the type picker. */
  description: string;
  icon: LucideIcon;
  badge: BadgeTone;
  bar: ProgressTone;
}

export const PLAN_TYPE_META: Record<PlanType, PlanTypeMeta> = {
  milestone: {
    label: 'Milestones',
    description: 'A list of steps you tick off in order.',
    icon: CheckSquare,
    badge: 'blue',
    bar: 'brand',
  },
  target_goal: {
    label: 'Target',
    description: 'One number to reach, like 12 books or 100 km.',
    icon: Target,
    badge: 'cyan',
    bar: 'cyan',
  },
  habit_journey: {
    label: 'Habit journey',
    description: 'Do one thing every day or week and keep the streak.',
    icon: Flame,
    badge: 'emerald',
    bar: 'success',
  },
  vision: {
    label: 'Vision',
    description: 'A long-term direction with regular check-in notes.',
    icon: Compass,
    badge: 'purple',
    bar: 'purple',
  },
};

export const PLAN_TYPES: PlanType[] = ['milestone', 'target_goal', 'habit_journey', 'vision'];

/** Legacy plans saved before plan types existed are milestone plans. */
export function planTypeOf(plan: { planType?: PlanType }): PlanType {
  return plan.planType || 'milestone';
}

/** The review cadence that applies: a vision plan always has one (weekly when never set). */
export function effectiveReviewCadence(plan: AnyPlan): 'weekly' | 'monthly' | null {
  if (plan.reviewCadence === 'weekly' || plan.reviewCadence === 'monthly') return plan.reviewCadence;
  return planTypeOf(plan) === 'vision' ? 'weekly' : null;
}

export function isReviewDue(plan: AnyPlan): boolean {
  if (!effectiveReviewCadence(plan) || !plan.nextReviewDueAt) return false;
  const due = parseDate(plan.nextReviewDueAt);
  return Boolean(due) && due!.getTime() <= trustedNowMs();
}

export function milestoneProgress(plan: AnyPlan) {
  const total = (plan.steps || []).length;
  const done = (plan.steps || []).filter((s) => s.completed).length;
  return { done, total };
}

export function targetProgress(plan: AnyPlan) {
  const target = plan.targetValue && plan.targetValue > 0 ? plan.targetValue : 1;
  const current = Math.max(0, plan.currentProgress || 0);
  return { current, target, reached: current >= target };
}

export type JourneyPhase = 'upcoming' | 'active' | 'complete';

/**
 * Where a habit journey stands: its period number (day or week) out of its length, the live streak,
 * and whether this period is already marked. A journey is complete once its last period has passed.
 */
export function journeyState(plan: AnyPlan) {
  const cadence = plan.cadence === 'weekly' ? 'weekly' : 'daily';
  const length = Math.max(1, plan.duration || 30);
  const start = parseDate(plan.startDate);
  const startKey = start ? todayKey(start) : todayKey();
  const elapsedDays = calculateElapsedDays(startKey);
  const period = cadence === 'weekly' ? Math.ceil(elapsedDays / 7) : elapsedDays;
  const phase: JourneyPhase = startKey > todayKey() ? 'upcoming' : period > length ? 'complete' : 'active';
  return {
    cadence,
    length,
    startKey,
    phase,
    period: Math.min(period, length),
    streak: calculateActivePlanStreak(plan.streakCount || 0, plan.lastCompletedDate, cadence),
    doneThisPeriod: isPlanJourneyDoneThisPeriod(plan.lastCompletedDate, cadence),
  };
}

/** Share of a plan done, 0..1, for plans that have a finish line (milestones and targets). */
export function finishLineShare(plan: AnyPlan): number | null {
  const type = planTypeOf(plan);
  if (type === 'milestone') {
    const { done, total } = milestoneProgress(plan);
    return total > 0 ? done / total : null;
  }
  if (type === 'target_goal') {
    const { current, target } = targetProgress(plan);
    return Math.min(1, current / target);
  }
  return null;
}
