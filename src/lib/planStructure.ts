import type { ImprovementPlan, PlanStep, UserPlanFollow } from '@/types';
import { uid } from './dates';
import { trustedNowMs } from './clock';

/** The structure fields an edit can change (type-specific ones; absent = keep). */
export interface PlanStructureEdits {
  targetValue?: number;
  targetUnit?: string;
  targetDate?: string;
  cadence?: 'daily' | 'weekly';
  duration?: number;
  targetReviewDate?: string;
  reviewCadence?: 'weekly' | 'monthly' | null;
}

type PlanStructure = Pick<
  ImprovementPlan,
  | 'title'
  | 'description'
  | 'steps'
  | 'targetValue'
  | 'targetUnit'
  | 'targetDate'
  | 'cadence'
  | 'duration'
  | 'targetReviewDate'
  | 'reviewCadence'
  | 'nextReviewDueAt'
>;

/**
 * The edited structure of a plan or of the user's own copy. Progress, streaks and check-ins are not
 * part of it, so an edit never touches them; the caller spreads the result over the saved plan.
 */
export function editedPlanStructure(
  target: ImprovementPlan | UserPlanFollow,
  title: string,
  description: string,
  stepEdits?: { id?: string; title: string }[],
  typeParams?: PlanStructureEdits
): PlanStructure {
  // Steps match by id, so removing or reordering a step never moves another step's completion.
  const existingSteps = new Map((target.steps || []).map((st) => [st.id, st]));
  const steps: PlanStep[] = (stepEdits || [])
    .filter((st) => st.title.trim().length > 0)
    .map((st, i) => {
      const existing = st.id ? existingSteps.get(st.id) : undefined;
      return {
        id: existing?.id || uid(),
        title: st.title.trim(),
        orderIndex: i,
        completed: existing?.completed || false,
      };
    });

  const isVision = target.planType === 'vision';
  const newReviewCadence = isVision
    ? (typeParams?.reviewCadence || target.reviewCadence || 'weekly')
    : (typeParams?.reviewCadence !== undefined ? typeParams.reviewCadence : target.reviewCadence);

  let newNextReviewDueAt = target.nextReviewDueAt;
  if (newReviewCadence !== target.reviewCadence || (newReviewCadence && !newNextReviewDueAt)) {
    if (newReviewCadence === 'weekly') {
      newNextReviewDueAt = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (newReviewCadence === 'monthly') {
      newNextReviewDueAt = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      newNextReviewDueAt = null;
    }
  }

  return {
    title: title.trim(),
    description: description.trim(),
    steps: steps.length > 0 ? steps : target.steps,
    targetValue: typeParams?.targetValue !== undefined ? typeParams.targetValue : target.targetValue,
    targetUnit: typeParams?.targetUnit !== undefined ? typeParams.targetUnit : target.targetUnit,
    targetDate: typeParams?.targetDate !== undefined ? typeParams.targetDate : target.targetDate,
    cadence: typeParams?.cadence !== undefined ? typeParams.cadence : target.cadence,
    duration: typeParams?.duration !== undefined ? typeParams.duration : target.duration,
    targetReviewDate: typeParams?.targetReviewDate !== undefined ? typeParams.targetReviewDate : target.targetReviewDate,
    reviewCadence: newReviewCadence,
    nextReviewDueAt: newNextReviewDueAt,
  };
}
