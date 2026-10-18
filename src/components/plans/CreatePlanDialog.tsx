import { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Badge, Dialog, Form } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import type { PlanType } from '@/types';
import { addDays, isNewPastDate, todayKey } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { STARTER_TEMPLATES, type PlanTemplate } from '@/data/planTemplates';
import { PLAN_NAME_TAKEN, PLAN_TYPES, PLAN_TYPE_META, ownPlans } from './planMeta';
import { nameTaken } from '@/lib/uniqueNames';
import { PlanFields, type PlanFormValues } from './PlanFields';

function blankValues(type: PlanType): PlanFormValues {
  return {
    title: '',
    description: '',
    category: 'Personal Growth',
    isPublic: false,
    reviewCadence: type === 'vision' ? 'weekly' : null,
    steps: [{ title: '' }, { title: '' }, { title: '' }],
    targetValue: 10,
    targetUnit: '',
    currentProgress: 0,
    targetDate: '',
    cadence: 'daily',
    duration: 30,
    startDate: todayKey(),
    targetReviewDate: '',
    firstNote: '',
  };
}

function templateValues(tpl: PlanTemplate): PlanFormValues {
  const base = blankValues(tpl.planType);
  const today = todayKey();
  return {
    ...base,
    title: tpl.title,
    description: tpl.description,
    category: tpl.category,
    reviewCadence: tpl.reviewCadence ?? base.reviewCadence,
    steps: tpl.steps ? tpl.steps.map((title) => ({ title })) : base.steps,
    targetValue: tpl.targetValue ?? base.targetValue,
    targetUnit: tpl.targetUnit ?? base.targetUnit,
    targetDate: tpl.targetInDays ? addDays(today, tpl.targetInDays) : '',
    cadence: tpl.cadence ?? base.cadence,
    duration: tpl.duration ?? base.duration,
    targetReviewDate: tpl.lookBackInDays ? addDays(today, tpl.lookBackInDays) : '',
  };
}

/** What the form is filled from: a blank type or a template. */
type Choice = { key: string; type: PlanType; values: PlanFormValues };

/**
 * Two steps: pick a plan type or a template, then fill in only the fields that type uses.
 * The dialog is remounted on every open (keyed by the page), so it always starts fresh.
 */
export function CreatePlanDialog({ store, open, onClose }: { store: AppStore; open: boolean; onClose: () => void }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const values = choice?.values;
  const guard = useUnsavedChanges(open && choice ? choice.key : null, values ?? null);

  const update = (patch: Partial<PlanFormValues>) =>
    setChoice((c) => (c ? { ...c, values: { ...c.values, ...patch } } : c));

  const close = () => guard.confirmDiscard(onClose);
  const back = () => guard.confirmDiscard(() => setChoice(null));

  const submit = () => {
    if (!choice) return;
    const v = choice.values;
    const type = choice.type;
    store.createImprovementPlan(
      v.title,
      v.description,
      v.isPublic,
      type === 'milestone' ? v.steps.map((s) => s.title) : [],
      v.category,
      type,
      {
        targetValue: v.targetValue,
        targetUnit: v.targetUnit.trim(),
        currentProgress: Math.min(v.currentProgress, v.targetValue),
        targetDate: v.targetDate || undefined,
        cadence: v.cadence,
        duration: v.duration,
        startDate: v.startDate,
        targetReviewDate: v.targetReviewDate || undefined,
        initialReflectionNote: v.firstNote.trim() || undefined,
        reviewCadence: type === 'vision' ? v.reviewCadence || 'weekly' : v.reviewCadence,
      }
    );
    onClose();
  };

  const title = choice ? `New ${PLAN_TYPE_META[choice.type].label.toLowerCase()} plan` : 'New plan';

  return (
    <Dialog
      open={open}
      onClose={close}
      dirty={guard.dirty}
      title={title}
      maxWidth="max-w-lg"
      contentKey={choice?.key ?? 'choose'}
      footer={
        choice ? (
          <>
            <button type="button" onClick={back} className="btn-secondary inline-flex items-center gap-1.5 mr-auto">
              <ArrowLeft size={15} /> Back
            </button>
            <button type="submit" form="pip-create-form" className="btn-primary">
              Create plan
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        )
      }
    >
      {choice && values ? (
        <Form
          id="pip-create-form"
          onSubmit={submit}
          validate={() =>
            nameTaken(values.title, ownPlans(store.state.improvementPlans, store.state.currentUser?.id))
              ? { message: PLAN_NAME_TAKEN, field: 'pip-create-title' }
              : choice.type === 'target_goal' && isNewPastDate(values.targetDate)
              ? { message: 'Pick today or a later date.', field: 'pip-create-target-date' }
              : choice.type === 'vision' && isNewPastDate(values.targetReviewDate)
              ? { message: 'Pick today or a later date.', field: 'pip-create-review-date' }
              : null
          }
        >
          <PlanFields idPrefix="pip-create" type={choice.type} values={values} onChange={update} mode="create" />
        </Form>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="label">Start blank</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLAN_TYPES.map((type) => {
                const meta = PLAN_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setChoice({ key: `blank:${type}`, type, values: blankValues(type) })}
                    className="flex items-start gap-3 rounded-xl border border-overlay-default p-3 text-left transition-colors hover:border-overlay-strong hover:bg-overlay-subtle"
                  >
                    <Icon size={18} className="mt-0.5 shrink-0 text-content-secondary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-content-primary">{meta.label}</span>
                      <span className="block text-xs text-content-muted">{meta.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="label">Or start from a template</h3>
            <ul className="divide-y divide-overlay-subtle rounded-xl border border-overlay-default">
              {STARTER_TEMPLATES.map((tpl) => {
                const meta = PLAN_TYPE_META[tpl.planType];
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => setChoice({ key: tpl.id, type: tpl.planType, values: templateValues(tpl) })}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-overlay-subtle first:rounded-t-xl last:rounded-b-xl"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-content-primary">{tpl.title}</span>
                          <Badge tone={meta.badge} size="xs">
                            {meta.label}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-content-muted line-clamp-2">{tpl.description}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-content-subtle" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  );
}
