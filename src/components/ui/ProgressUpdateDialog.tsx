import React, { useState } from 'react';
import { ArrowRight, Minus, Plus, TrendingUp } from 'lucide-react';
import { Dialog, Form, NumberField, ProgressBar, SlidingPill, cx, useFormController } from './primitives';
import type { ProgressTone } from './primitives';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

type Mode = 'add' | 'set';

export interface ProgressUpdateDialogProps {
  open: boolean;
  onClose: () => void;
  /** e.g. "Update progress" or the item's name. */
  title: string;
  description?: React.ReactNode;
  /** The amount saved now, and the goal (the bar's 100%). */
  current: number;
  target: number;
  /** How an amount reads, e.g. (n) => `${n} pages` or (n) => `${n}%`. */
  format: (n: number) => string;
  /** Field labels for the two ways to update. */
  addLabel: string;
  setLabel: string;
  /** What the − / + buttons move by (5 for a percentage). */
  step?: number;
  tone?: ProgressTone;
  /** Gets the new total. Throw to keep the dialog open with the reason shown. */
  onSave: (next: number) => void | Promise<void>;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Ascend's one way to update a progress amount by hand (reading, plan targets, project and goal
 * percentages, weekly goals). Two modes: Add (log what was done since last time, the default)
 * and Set total (jump to a number, also to go back down). A live preview shows from → to on the
 * bar before saving. The caller saves the new total with its existing store call.
 */
export function ProgressUpdateDialog({
  open,
  onClose,
  title,
  description,
  current,
  target,
  format,
  addLabel,
  setLabel,
  step = 1,
  tone = 'brand',
  onSave,
}: ProgressUpdateDialogProps) {
  const remaining = Math.max(0, target - current);
  const startMode: Mode = remaining > 0 ? 'add' : 'set';
  const startAmount = Math.min(step, remaining) || step;

  const [mode, setMode] = useState<Mode>(startMode);
  const [amount, setAmount] = useState(startAmount);
  const [total, setTotal] = useState(current);
  const [saving, setSaving] = useState(false);
  const issues = useFormController();

  // Each open starts from what is saved now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(startMode);
      setAmount(startAmount);
      setTotal(current);
    }
  }

  const form = useUnsavedChanges(open, [mode, amount, total]);

  const next = mode === 'add' ? clamp(current + amount, 0, target) : clamp(total, 0, target);
  const delta = next - current;

  const handleSubmit = async () => {
    if (delta === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      console.error('Progress update failed:', err);
      issues.showError(toUserMessage(err, "Couldn't save your progress. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const fieldId = mode === 'add' ? 'progress-update-amount' : 'progress-update-total';
  const value = mode === 'add' ? amount : total;
  const min = mode === 'add' ? 1 : 0;
  const max = mode === 'add' ? remaining : target;
  const change = (n: number) => (mode === 'add' ? setAmount(n) : setTotal(n));

  const modeButton = (id: Mode, label: string, disabled = false) => (
    <button
      type="button"
      data-pill-id={id}
      disabled={disabled}
      aria-pressed={mode === id}
      onClick={() => setMode(id)}
      className={cx(
        'min-h-11 sm:min-h-9 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        mode === id ? 'text-brand-text' : 'text-content-muted hover:text-content-primary'
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      preventClose={saving}
      dirty={form.dirty}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            disabled={saving}
            onClick={() => form.confirmDiscard(onClose)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" form="progress-update-form" disabled={saving} className="btn-primary">
            {saving ? <AscendLoadingIndicator size="sm" /> : null}
            <span>Save progress</span>
          </button>
        </>
      }
    >
      <Form id="progress-update-form" onSubmit={handleSubmit} controller={issues} className="space-y-5">
        {/* Live preview: from → to, the change, and the bar at the new amount. */}
        <div className="rounded-xl border border-overlay-subtle bg-bg-800 p-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 text-sm text-content-muted">
              <span className="figure">{format(current)}</span>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="figure text-lg font-semibold text-content-primary">{format(next)}</span>
            </p>
            <span
              className={cx(
                'figure rounded-lg px-2 py-0.5 text-xs font-medium',
                delta > 0 ? 'badge-emerald' : delta < 0 ? 'badge-rose' : 'bg-overlay-subtle text-content-muted'
              )}
            >
              {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : 'No change'}
            </span>
          </div>
          <ProgressBar value={next} max={target} label="Progress after saving" tone={next >= target ? 'success' : tone} size="lg" />
          <p className="text-xs text-content-muted">Goal: {format(target)}</p>
        </div>

        <div className="relative isolate grid grid-cols-2 gap-1 rounded-xl border border-overlay-default bg-bg-700 p-1">
          <SlidingPill active={mode} className="rounded-lg bg-primary-500/15 border border-primary-500/40" />
          {modeButton('add', 'Add', remaining === 0)}
          {modeButton('set', 'Set total')}
        </div>

        <div data-field={fieldId}>
          <label htmlFor={fieldId} className="label block mb-1.5">
            {mode === 'add' ? addLabel : setLabel}
          </label>
          <div className="flex items-start gap-2">
            <button
              type="button"
              aria-label="Decrease"
              disabled={value <= min}
              onClick={() => change(clamp(value - step, min, max))}
              className="btn-secondary h-11 w-11 shrink-0 p-0 disabled:opacity-40"
            >
              <Minus size={18} />
            </button>
            <NumberField
              key={fieldId}
              id={fieldId}
              required
              min={min}
              max={max}
              value={value}
              onValueChange={change}
              enterKeyHint="done"
              className="text-center figure"
              hint={
                mode === 'add'
                  ? `Up to ${format(remaining)} left.`
                  : `${format(0)} to ${format(target)}. Use this to correct or lower it.`
              }
            />
            <button
              type="button"
              aria-label="Increase"
              disabled={value >= max}
              onClick={() => change(clamp(value + step, min, max))}
              className="btn-secondary h-11 w-11 shrink-0 p-0 disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </Form>
    </Dialog>
  );
}

/** The card button that opens ProgressUpdateDialog; the same look wherever progress is updated. */
export function UpdateProgressButton({
  onClick,
  disabled,
  label = 'Update progress',
  variant = 'secondary',
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  /** Primary where updating is the card's main action (a book being read). */
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        variant === 'primary' ? 'btn-primary' : 'btn-secondary',
        'text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <TrendingUp size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
