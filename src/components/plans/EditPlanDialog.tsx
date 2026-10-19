import { useState } from 'react';
import { Dialog, Form } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import { isNewPastDate, todayKey } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { type AnyPlan, PLAN_NAME_TAKEN, PLAN_TYPE_META, ownPlans, planTypeOf } from './planMeta';
import { nameTaken } from '@/lib/uniqueNames';
import { PlanFields, type PlanFormValues } from './PlanFields';

function valuesFrom(plan: AnyPlan): PlanFormValues {
  const isVision = planTypeOf(plan) === 'vision';
  return {
    title: plan.title,
    description: plan.description,
    category: ('category' in plan && plan.category) || 'Personal Growth',
    isPublic: 'isPublic' in plan ? plan.isPublic : false,
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
 * `owner` 'copy' edits the user's own copy of someone else's plan: only that copy changes.
 */
export function EditPlanDialog({
  store,
  plan,
  owner,
  onClose,
}: {
  store: AppStore;
  plan: AnyPlan;
  owner: 'own' | 'copy';
  onClose: () => void;
}) {
  const isCopy = owner === 'copy';
  const type = planTypeOf(plan);
  const [values, setValues] = useState<PlanFormValues>(() => valuesFrom(plan));
  const guard = useUnsavedChanges(plan.id, values, { key: 'plan-edit', restore: setValues });

  const update = (patch: Partial<PlanFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const close = () => guard.confirmDiscard(onClose);

  const submit = () => {
    const steps = type === 'milestone' ? values.steps : undefined;
    const structure = {
      targetValue: values.targetValue,
      targetUnit: values.targetUnit.trim(),
      targetDate: values.targetDate,
      cadence: values.cadence,
      duration: values.duration,
      targetReviewDate: values.targetReviewDate,
      reviewCadence: type === 'vision' ? values.reviewCadence || 'weekly' : values.reviewCadence,
    };
    if (isCopy) {
      store.updateFollowedPlan(plan.id, values.title, values.description, steps, structure);
    } else {
      store.updateImprovementPlan(plan.id, values.title, values.description, values.category, values.isPublic, steps, structure);
    }
    onClose();
  };

  return (
    <Dialog
      open
      onClose={close}
      dirty={guard.dirty}
      title={isCopy ? 'Edit your copy' : `Edit ${PLAN_TYPE_META[type].label.toLowerCase()} plan`}
      description={isCopy ? 'Only your copy changes. The original plan and other copies stay as they are.' : undefined}
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
          !isCopy &&
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
          isCopy={isCopy}
        />
      </Form>
    </Dialog>
  );
}
