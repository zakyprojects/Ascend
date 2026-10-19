import { Plus, Trash2 } from 'lucide-react';
import { FieldRow, Input, NumberField, Select, Textarea } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { PLAN_CATEGORIES, type PlanType } from '@/types';
import { earliestTargetDate } from '@/lib/dates';

export interface PlanFormValues {
  title: string;
  description: string;
  category: string;
  isPublic: boolean;
  reviewCadence: 'weekly' | 'monthly' | null;
  /** A step keeps its id while edited, so its completion stays with it. */
  steps: { id?: string; title: string }[];
  targetValue: number;
  targetUnit: string;
  currentProgress: number;
  targetDate: string;
  cadence: 'daily' | 'weekly';
  duration: number;
  startDate: string;
  targetReviewDate: string;
  firstNote: string;
}

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;
const STEP_MAX = 200;
const UNIT_MAX = 30;

/**
 * The fields of a plan form, only those its type uses. `mode` 'edit' leaves out what belongs to
 * progress (starting amount, start date, first note): editing changes structure, never progress.
 * `isCopy` leaves out category and sharing: a copy has neither of its own (it is always only yours).
 */
export function PlanFields({
  idPrefix,
  type,
  values,
  onChange,
  mode,
  savedTargetDate,
  savedReviewDate,
  isCopy = false,
}: {
  idPrefix: string;
  type: PlanType;
  values: PlanFormValues;
  onChange: (patch: Partial<PlanFormValues>) => void;
  mode: 'create' | 'edit';
  savedTargetDate?: string;
  savedReviewDate?: string;
  isCopy?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const setStep = (index: number, title: string) =>
    onChange({ steps: values.steps.map((s, i) => (i === index ? { ...s, title } : s)) });

  return (
    <div className="space-y-4">
      <Input
        id={id('title')}
        label="Title"
        value={values.title}
        onChange={(e) => onChange({ title: e.target.value })}
        maxLength={TITLE_MAX}
        autoComplete="off"
        required
      />
      <Textarea
        id={id('description')}
        label="What it's for"
        value={values.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="The result you want and why it matters."
        rows={3}
        maxLength={DESCRIPTION_MAX}
        required
      />

      {type === 'milestone' && (
        <fieldset className="space-y-2">
          <legend className="label mb-1">Steps</legend>
          {values.steps.map((step, idx) => (
            <div key={step.id || `new-${idx}`} className="flex items-start gap-1">
              <Input
                id={id(`step-${idx}`)}
                aria-label={`Step ${idx + 1}`}
                value={step.title}
                onChange={(e) => setStep(idx, e.target.value)}
                placeholder={`Step ${idx + 1}`}
                maxLength={STEP_MAX}
                autoComplete="off"
                required
              />
              {values.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange({ steps: values.steps.filter((_, i) => i !== idx) })}
                  className={`mt-1 text-content-muted hover:text-rose-theme ${TAP_TARGET}`}
                  aria-label={`Remove step ${idx + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ steps: [...values.steps, { title: '' }] })}
            className="btn-ghost text-xs inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Add step
          </button>
        </fieldset>
      )}

      {type === 'target_goal' && (
        <>
          <FieldRow>
            <NumberField
              id={id('target-value')}
              label="Target"
              decimal
              min={1}
              value={values.targetValue}
              onValueChange={(targetValue) => onChange({ targetValue })}
              required
            />
            <Input
              id={id('target-unit')}
              label="Unit"
              value={values.targetUnit}
              onChange={(e) => onChange({ targetUnit: e.target.value })}
              placeholder="books, km, sessions"
              maxLength={UNIT_MAX}
              autoComplete="off"
              required
            />
          </FieldRow>
          <FieldRow>
            {mode === 'create' && (
              <NumberField
                id={id('start-progress')}
                label="Already done"
                decimal
                min={0}
                max={values.targetValue}
                value={values.currentProgress}
                onValueChange={(currentProgress) => onChange({ currentProgress })}
              />
            )}
            <Input
              id={id('target-date')}
              label="Target date"
              optional
              type="date"
              min={earliestTargetDate(savedTargetDate)}
              value={values.targetDate}
              onChange={(e) => onChange({ targetDate: e.target.value })}
            />
          </FieldRow>
        </>
      )}

      {type === 'habit_journey' && (
        <FieldRow className={mode === 'create' ? 'sm:grid-cols-3' : undefined}>
          <Select
            id={id('cadence')}
            label="How often"
            value={values.cadence}
            onChange={(e) => onChange({ cadence: e.target.value as 'daily' | 'weekly' })}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </Select>
          <NumberField
            id={id('duration')}
            label={values.cadence === 'weekly' ? 'Length in weeks' : 'Length in days'}
            min={1}
            max={365}
            value={values.duration}
            onValueChange={(duration) => onChange({ duration })}
            required
          />
          {mode === 'create' && (
            <Input
              id={id('start-date')}
              label="Start"
              type="date"
              value={values.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              required
            />
          )}
        </FieldRow>
      )}

      {type === 'vision' && (
        <FieldRow>
          <Select
            id={id('review-cadence')}
            label="Check in"
            value={values.reviewCadence || 'weekly'}
            onChange={(e) => onChange({ reviewCadence: e.target.value as 'weekly' | 'monthly' })}
          >
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </Select>
          <Input
            id={id('review-date')}
            label="Look back on"
            optional
            type="date"
            min={earliestTargetDate(savedReviewDate)}
            value={values.targetReviewDate}
            onChange={(e) => onChange({ targetReviewDate: e.target.value })}
          />
        </FieldRow>
      )}

      {type === 'vision' && mode === 'create' && (
        <Textarea
          id={id('first-note')}
          label="First check-in"
          optional
          value={values.firstNote}
          onChange={(e) => onChange({ firstNote: e.target.value })}
          placeholder="Where you stand today."
          rows={2}
          maxLength={1000}
        />
      )}

      {!isCopy && (
        <FieldRow>
          <Select id={id('category')} label="Category" value={values.category} onChange={(e) => onChange({ category: e.target.value })}>
            {PLAN_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
          <Select
            id={id('visibility')}
            label="Who can see it"
            value={values.isPublic ? 'public' : 'private'}
            onChange={(e) => onChange({ isPublic: e.target.value === 'public' })}
          >
            <option value="private">Only me</option>
            <option value="public">Everyone, in Discover</option>
          </Select>
        </FieldRow>
      )}

      {type !== 'vision' && (
        <Select
          id={id('review-cadence')}
          label="Check-in notes"
          value={values.reviewCadence || ''}
          onChange={(e) => onChange({ reviewCadence: e.target.value ? (e.target.value as 'weekly' | 'monthly') : null })}
        >
          <option value="">None</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </Select>
      )}
    </div>
  );
}
