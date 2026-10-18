import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { WeeklyGoalItem } from '@/types';
import { Dialog } from '@/components/ui/primitives';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { formatAmount, isLinkedGoal } from './weekMeta';

export interface UnfinishedGoal {
  weekKey: string;
  goal: WeeklyGoalItem;
}

/**
 * Goals left unfinished in the last few weeks, shown on the current week only: carry each one
 * into this week or dismiss it. A manual goal with progress asks whether to resume it.
 */
export function CarryOverCard({
  items,
  labelFor,
  onCarry,
  onDismiss,
}: {
  items: UnfinishedGoal[];
  /** "last week" or the week's dates. */
  labelFor: (weekKey: string) => string;
  onCarry: (item: UnfinishedGoal, resumeProgress?: boolean) => void;
  /** Throws with a user-facing message when the store refuses. */
  onDismiss: (item: UnfinishedGoal) => void;
}) {
  const [resumePrompt, setResumePrompt] = useState<UnfinishedGoal | null>(null);
  const [dismissing, setDismissing] = useState<UnfinishedGoal | null>(null);

  if (items.length === 0 && !resumePrompt && !dismissing) return null;

  const carry = (item: UnfinishedGoal) => {
    const g = item.goal;
    const hasManualProgress = !isLinkedGoal(g) && (g.targetValue || 1) > 1 && (g.manualProgress || 0) > 0;
    if (hasManualProgress) setResumePrompt(item);
    else onCarry(item);
  };

  const prompt = resumePrompt?.goal;
  const promptUnit = prompt?.unit || 'times';

  return (
    <>
      {items.length > 0 && (
        <section className="card space-y-3 p-5" aria-label="Unfinished goals">
          <div>
            <h2 className="section-title">Unfinished goals</h2>
            <p className="mt-0.5 text-xs text-content-muted">
              {items.length === 1 ? 'One goal' : `${items.length} goals`} from recent weeks. Carry into this week or let go.
            </p>
          </div>
          <div className="divide-y divide-overlay-subtle">
            {items.map((item) => (
              <div key={`${item.weekKey}-${item.goal.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="item-name text-sm break-words">{item.goal.title}</p>
                  <p className="text-xs text-content-muted">
                    From {labelFor(item.weekKey)} · <span className="capitalize">{item.goal.priority}</span> priority
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setDismissing(item)} className="btn-secondary px-3 py-1.5 text-xs">
                    Dismiss
                  </button>
                  <button type="button" onClick={() => carry(item)} className="btn-primary gap-1 px-3 py-1.5 text-xs">
                    Carry over <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog
        open={Boolean(resumePrompt)}
        onClose={() => setResumePrompt(null)}
        title="Carry over goal"
        description={prompt ? `"${prompt.title}" reached ${prompt.manualProgress || 0} of ${formatAmount(prompt.targetValue || 1, promptUnit)}.` : undefined}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (resumePrompt) onCarry(resumePrompt, false);
                setResumePrompt(null);
              }}
              className="btn-secondary"
            >
              Start from 0
            </button>
            <button
              type="button"
              onClick={() => {
                if (resumePrompt) onCarry(resumePrompt, true);
                setResumePrompt(null);
              }}
              className="btn-primary"
            >
              Keep progress
            </button>
          </>
        }
      >
        {null}
      </Dialog>

      <ConfirmDeleteModal
        open={Boolean(dismissing)}
        onClose={() => setDismissing(null)}
        onConfirm={() => {
          if (!dismissing) return;
          onDismiss(dismissing);
          setDismissing(null);
        }}
        title="Dismiss goal?"
        itemName={dismissing?.goal.title}
        description={dismissing ? `It stays in ${labelFor(dismissing.weekKey)} as it was, and won't be suggested again.` : ''}
        confirmText="Dismiss"
      />
    </>
  );
}
