import { useState } from 'react';
import { Dialog, Form } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import type { ImprovementPlan } from '@/types';
import { isNewPastDate, todayKey } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { PLAN_NAME_TAKEN, PLAN_TYPE_META, ownPlans, planTypeOf } from './planMeta';
import { nameTaken } from '@/lib/uniqueNames';
import { PlanFields, type PlanFormValues } from './PlanFields';

function valuesFrom(plan: ImprovementPlan): PlanFormValues {
  const isVision = planTypeOf(plan) === 'vision';
  return {
    title: plan.title,
    description: plan.description,
    category: plan.category || 'Personal Growth',
    isPublic: plan.isPublic,
    reviewCadence: isVision ? plan.reviewCadence || 'weekly' : plan.reviewCadence || null,
    steps: (plan.steps || []).map((s) => ({ id: s.id, title: s.title })),
    targetValue: plan.targetValue || 10,
    targetUnit: plan.targetUnit || '',
    currentProgress: plan.currentProgress || 0,
    targetDate: plan.targetDate || '',
    cadence: plan.cadence || 'daily',
    duration: plan.duration || 30,
    startDate: plan.startDate || todayKey(),
    targetReviewDate: plan.targetReviewDate || '',
    firstNote: '',
  };
}

/**
 * Edits a plan's structure (title, steps, target, cadence, dates, sharing). Progress, streaks and
 * check-ins are never touched here. Mounted per plan, so it opens with that plan's saved values.
 */
export function EditPlanDialog({ store, plan, onClose }: { store: AppStore; plan: ImprovementPlan; onClose: () => void }) {
  const type = planTypeOf(plan);
  const [values, setValues] = useState<PlanFormValues>(() => valuesFrom(plan));
  const guard = useUnsavedChanges(plan.id, values, { key: 'plan-edit', restore: setValues });

  const update = (patch: Partial<PlanFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const close = () => guard.confirmDiscard(onClose);

  const submit = () => {
    store.updateImprovementPlan(
      plan.id,
      values.title,
      values.description,
      values.category,
      values.isPublic,
      type === 'milestone' ? values.steps : undefined,
      {
        targetValue: values.targetValue,
        targetUnit: values.targetUnit.trim(),
        targetDate: values.targetDate,
        cadence: values.cadence,
        duration: values.duration,
        targetReviewDate: values.targetReviewDate,
        reviewCadence: type === 'vision' ? values.reviewCadence || 'weekly' : values.reviewCadence,
      }
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={close}
      dirty={guard.dirty}
      title={`Edit ${PLAN_TYPE_META[type].label.toLowerCase()} plan`}
      maxWidth="max-w-lg"
      footer={
        <>
          <button type="button" onClick={close} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pip-edit-form" className="btn-primary">
            Save changes
          </button>
        </>
      }
    >
      <Form
        id="pip-edit-form"
        onSubmit={submit}
        validate={() =>
          nameTaken(values.title, ownPlans(store.state.improvementPlans, store.state.currentUser?.id), { editing: plan })
            ? { message: PLAN_NAME_TAKEN, field: 'pip-edit-title' }
            : type === 'target_goal' && isNewPastDate(values.targetDate, plan.targetDate)
            ? { message: 'Pick a later date.', field: 'pip-edit-target-date' }
            : type === 'vision' && isNewPastDate(values.targetReviewDate, plan.targetReviewDate)
            ? { message: 'Pick a later date.', field: 'pip-edit-review-date' }
            : null
        }
      >
        <PlanFields
          idPrefix="pip-edit"
          type={type}
          values={values}
          onChange={update}
          mode="edit"
          savedTargetDate={plan.targetDate}
          savedReviewDate={plan.targetReviewDate}
        />
      </Form>
    </Dialog>
  );
}
