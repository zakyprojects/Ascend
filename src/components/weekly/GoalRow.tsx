import { useState } from 'react';
import { Check, Circle, Edit3, Trash2, Zap } from 'lucide-react';
import type { AppState, WeeklyGoalItem, WeeklyGoalPriority } from '@/types';
import type { GoalProgressResult } from '@/lib/linkedGoalMetrics';
import { ProgressBar } from '@/components/ui/primitives';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { ProgressUpdateDialog, UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';
import { useCompletionPop } from '@/lib/useCompletionPop';
import { linkedItemExists } from '@/lib/linkedGoalMetrics';
import { formatAmount, formatNumber, isGoalAchieved, isLinkedGoal } from './weekMeta';

const PRIORITY_DOT: Record<WeeklyGoalPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-warning-text',
  low: 'bg-content-disabled',
};

const MODULE_LABEL: Record<string, string> = {
  habit: 'Habit',
  exercise: 'Exercise',
  reading: 'Reading',
  skill: 'Skill',
};

const ANY_LABEL: Record<string, string> = {
  exercise: 'Any workout',
  reading: 'Any book',
  skill: 'Any skill',
};

/** "Reading · Atomic Habits": what a linked goal follows, by name ("Skill · Any skill" for all of them). */
function linkedLabel(item: WeeklyGoalItem, state: AppState): string {
  const module = MODULE_LABEL[item.linkedModule || ''] ?? 'Linked';
  const id = item.linkedItemId;
  if (!id) return ANY_LABEL[item.linkedModule || ''] ? `${module} · ${ANY_LABEL[item.linkedModule || '']}` : module;
  const name =
    item.linkedModule === 'habit'
      ? state.habits.find((h) => h.id === id)?.name
      : item.linkedModule === 'reading'
        ? state.libraryBooks.find((b) => b.id === id || b.linkedBookId === id)?.title
        : item.linkedModule === 'skill'
          ? state.skills.find((s) => s.id === id)?.name
          : id; // exercise goals store the workout type itself
  return name ? `${module} · ${name}` : module;
}

/** "habit", "book", "skill": the deleted thing a goal was linked to. */
const DELETED_ITEM: Record<string, string> = { habit: 'habit', reading: 'book', skill: 'skill' };

export function GoalRow({
  item,
  prog,
  state,
  isPastWeek,
  isFutureWeek,
  carriedFromLabel,
  onToggle,
  onSetProgress,
  onEdit,
  onDelete,
}: {
  item: WeeklyGoalItem;
  prog: GoalProgressResult;
  state: AppState;
  isPastWeek: boolean;
  isFutureWeek: boolean;
  /** "last week" or the source week's dates, for a carried-over goal. */
  carriedFromLabel?: string;
  onToggle: (nextAchieved: boolean) => void;
  onSetProgress: (next: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const linked = isLinkedGoal(item);
  const deadLink = linked && !linkedItemExists(item, state);
  const achieved = isGoalAchieved(item, prog, isPastWeek);
  const readOnly = isPastWeek || isFutureWeek;
  // Linked goals complete from other modules' activity, so only the tick and Update arm the pop.
  const { arm: armCompletionPop, popClass } = useCompletionPop(achieved);
  const [progressOpen, setProgressOpen] = useState(false);

  const mark = (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
        achieved ? 'border-emerald-400 bg-emerald-500 text-bg-900' : 'border-overlay-strong bg-bg-800 text-content-disabled'
      }`}
    >
      {achieved ? <Check size={14} className={popClass} /> : <Circle size={14} />}
    </span>
  );

  return (
    <div className="enter-item space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {linked ? (
          <span className="mt-0.5 shrink-0" title="Ticks itself from linked activity">
            {mark}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!achieved) armCompletionPop();
              onToggle(!achieved);
            }}
            disabled={readOnly}
            aria-label={achieved ? `Mark "${item.title}" not achieved` : `Mark "${item.title}" achieved`}
            className={`mt-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${TAP_TARGET}`}
          >
            {mark}
          </button>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`item-name text-sm leading-snug break-words ${achieved ? 'text-content-muted line-through' : ''}`}>
              {item.title}
            </h3>
            {!isPastWeek && (
              <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={onEdit}
                  className={`p-1.5 text-content-muted transition-colors hover:text-content-secondary ${TAP_TARGET_Y}`}
                  aria-label={`Edit goal "${item.title}"`}
                  title="Edit"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className={`p-1.5 text-content-muted transition-colors hover:text-rose-theme ${TAP_TARGET_Y}`}
                  aria-label={`Delete goal "${item.title}"`}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[item.priority]}`} />
              {item.priority} priority
            </span>
            {linked && !deadLink && (
              <span className="inline-flex min-w-0 items-center gap-1 text-brand-text">
                <Zap size={11} aria-hidden="true" />
                <span className="truncate">{linkedLabel(item, state)}</span>
              </span>
            )}
            {deadLink && <span className="text-rose-theme">Linked {DELETED_ITEM[item.linkedModule || ''] ?? 'item'} was deleted</span>}
            {carriedFromLabel && <span>From {carriedFromLabel}</span>}
          </div>

          {item.targetDescription && (
            <p className="text-xs text-content-tertiary whitespace-pre-wrap break-words">{item.targetDescription}</p>
          )}
        </div>
      </div>

      <div className="pl-9">
        {prog.needsMetricSelection ? (
          isPastWeek ? (
            <p className="text-xs text-content-muted">Not tracked</p>
          ) : (
            <p className="text-xs text-content-muted">
              Choose what this goal tracks.{' '}
              <button type="button" onClick={onEdit} className="font-medium text-brand-text hover:underline">
                Choose
              </button>
            </p>
          )
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="figure text-content-secondary">
                {formatNumber(prog.current)} / {formatAmount(prog.target, prog.unit)}
              </span>
              <span className="figure text-content-muted">{prog.percent}%</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ProgressBar
                value={prog.percent}
                label={`${item.title} progress`}
                tone={achieved ? 'success' : 'brand'}
                className="min-w-[8rem] flex-1"
              />
              {!linked && prog.target > 1 && !readOnly && (
                <UpdateProgressButton label="Update" onClick={() => setProgressOpen(true)} />
              )}
            </div>
          </div>
        )}
      </div>

      {!linked && !prog.needsMetricSelection && (
        <ProgressUpdateDialog
          open={progressOpen}
          onClose={() => setProgressOpen(false)}
          title={`Update progress: ${item.title}`}
          current={prog.current}
          target={prog.target}
          format={(n) => formatAmount(n, prog.unit)}
          addLabel="Amount to add"
          setLabel="New total"
          onSave={(next) => {
            if (next >= prog.target) armCompletionPop();
            onSetProgress(next);
          }}
        />
      )}
    </div>
  );
}
