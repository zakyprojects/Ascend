import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Circle, Flame, RotateCcw } from 'lucide-react';
import { Badge, ProgressBar } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';
import { formatDateShort } from '@/lib/dates';
import { ReflectionNotes } from './ReflectionNotes';
import {
  type AnyPlan,
  PLAN_TYPE_META,
  effectiveReviewCadence,
  isReviewDue,
  journeyState,
  milestoneProgress,
  planTypeOf,
  targetProgress,
} from './planMeta';

/** What the user can do on their own plan or copy. Discover cards pass none and stay read-only. */
export interface PlanActions {
  toggleStep: (stepId: string) => void;
  openProgress: () => void;
  openNewTarget: () => void;
  markJourney: () => void;
  undoJourney: () => void;
  addNote: (text: string) => void;
  editNote: (noteKey: string, text: string) => void;
  requestDeleteNote: (noteKey: string) => void;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function PlanBody({ plan, actions }: { plan: AnyPlan; actions?: PlanActions }) {
  const type = planTypeOf(plan);
  const meta = PLAN_TYPE_META[type];
  const readOnly = !actions;
  const cadence = effectiveReviewCadence(plan);
  const reviewDue = !readOnly && isReviewDue(plan);
  const notes = plan.reflectionNotes || [];
  const showNotes = type === 'vision' || cadence !== null;

  let body: ReactNode = null;

  if (type === 'milestone') {
    const { done, total } = milestoneProgress(plan);
    body = (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-content-tertiary">
            <span className="figure text-content-primary">{done}</span> of <span className="figure">{total}</span> steps
          </span>
          {total > 0 && done === total && <span className="font-medium text-success-text">All done</span>}
        </div>
        <ProgressBar value={done} max={Math.max(total, 1)} label="Steps done" tone={meta.bar} size="sm" />
        <ul className="space-y-0.5">
          {(plan.steps || []).map((step) => {
            const icon = step.completed ? (
              <CheckCircle2 size={16} className="text-success-text shrink-0" />
            ) : (
              <Circle size={16} className="text-content-subtle shrink-0" />
            );
            const label = (
              <span className={step.completed ? 'line-through text-content-muted' : 'text-content-secondary'}>
                {step.title}
              </span>
            );
            return (
              <li key={step.id}>
                {readOnly ? (
                  <div className="flex items-start gap-2.5 py-1 text-sm">
                    {icon}
                    {label}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => actions.toggleStep(step.id)}
                    className="flex w-full items-start gap-2.5 rounded-lg py-1.5 text-left text-sm hover:bg-overlay-subtle"
                    aria-label={step.completed ? `Mark "${step.title}" not done` : `Mark "${step.title}" done`}
                  >
                    {icon}
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  } else if (type === 'target_goal') {
    const { current, target, reached } = targetProgress(plan);
    const pct = Math.min(100, Math.round((current / target) * 100));
    body = (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-content-tertiary">
            <span className="figure text-xl font-medium text-content-primary">{formatNumber(current)}</span>
            <span className="figure"> / {formatNumber(target)}</span> {plan.targetUnit || 'units'}
          </span>
          <span className={`figure text-sm ${reached ? 'text-success-text' : 'text-content-secondary'}`}>{pct}%</span>
        </div>
        <ProgressBar value={current} max={target} label="Target progress" tone={reached ? 'success' : meta.bar} size="sm" />
        {plan.targetDate && (
          <p className="text-xs text-content-muted">Target date {formatDateShort(plan.targetDate)}</p>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {reached ? (
              <>
                <Badge tone="emerald">
                  <CheckCircle2 size={12} /> Target reached
                </Badge>
                <button type="button" onClick={actions.openNewTarget} className="btn-secondary text-xs ml-auto">
                  Set new target
                </button>
              </>
            ) : (
              <UpdateProgressButton onClick={actions.openProgress} />
            )}
          </div>
        )}
      </div>
    );
  } else if (type === 'habit_journey') {
    const journey = journeyState(plan);
    const unit = journey.cadence === 'weekly' ? 'Week' : 'Day';
    const streakUnit = journey.cadence === 'weekly' ? 'week' : 'day';
    body = (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-content-tertiary">
            {journey.phase === 'upcoming' ? (
              <>Starts {formatDateShort(journey.startKey)}</>
            ) : (
              <>
                {unit} <span className="figure text-content-primary">{journey.period}</span> of{' '}
                <span className="figure">{journey.length}</span>
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-content-secondary">
            <Flame size={14} className={journey.streak > 0 ? 'text-brand-text' : 'text-content-subtle'} />
            <span className="figure">{journey.streak}</span>-{streakUnit} streak
          </span>
        </div>
        <ProgressBar
          value={journey.phase === 'upcoming' ? 0 : journey.period}
          max={journey.length}
          label="Journey progress"
          tone={meta.bar}
          size="sm"
        />
        {!readOnly && journey.phase === 'active' && (
          <div className="flex flex-wrap items-center gap-2">
            {journey.doneThisPeriod ? (
              <>
                <Badge tone="emerald">
                  <CheckCircle2 size={12} /> Done {journey.cadence === 'weekly' ? 'this week' : 'today'}
                </Badge>
                <button
                  type="button"
                  onClick={actions.undoJourney}
                  className={`btn-ghost text-xs inline-flex items-center gap-1.5 ml-auto ${TAP_TARGET}`}
                >
                  <RotateCcw size={13} /> Undo
                </button>
              </>
            ) : (
              <button type="button" onClick={actions.markJourney} className="btn-primary text-xs inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Mark {journey.cadence === 'weekly' ? 'this week' : 'today'} done
              </button>
            )}
          </div>
        )}
        {journey.phase === 'complete' && (
          <Badge tone="emerald">
            <CheckCircle2 size={12} /> Journey complete
          </Badge>
        )}
      </div>
    );
  } else if (plan.targetReviewDate) {
    body = <p className="text-xs text-content-muted">Look back on {formatDateShort(plan.targetReviewDate)}</p>;
  }

  return (
    <div className="space-y-4">
      {reviewDue && (
        <Badge tone="purple">
          <CalendarClock size={12} /> {cadence === 'monthly' ? 'Monthly' : 'Weekly'} check-in due
        </Badge>
      )}
      {body}
      {showNotes && (!readOnly || notes.length > 0) && (
        <div className="space-y-2 border-t border-overlay-subtle pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-content-tertiary">Check-ins</span>
            {cadence && (
              <span className="text-2xs text-content-muted">
                {cadence === 'monthly' ? 'Monthly' : 'Weekly'}
                {!readOnly && plan.nextReviewDueAt && !reviewDue && <>, next {formatDateShort(plan.nextReviewDueAt)}</>}
              </span>
            )}
          </div>
          <ReflectionNotes
            planId={plan.id}
            notes={notes}
            readOnly={readOnly}
            onAdd={actions?.addNote}
            onEdit={actions?.editNote}
            onRequestDelete={actions?.requestDeleteNote}
          />
        </div>
      )}
    </div>
  );
}
