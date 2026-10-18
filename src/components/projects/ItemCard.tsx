import type { ReactNode } from 'react';
import { Edit3, Lock, Trash2 } from 'lucide-react';
import { cx, ProgressBar } from '@/components/ui/primitives';
import type { ProgressTone } from '@/components/ui/primitives/ProgressBar';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';

/** A small fact on a card's top line (status, date, category). */
export function Chip({ children, tone = 'neutral', icon, title, onClick }: {
  children: ReactNode;
  tone?: 'neutral' | 'purple' | 'cyan' | 'success' | 'danger' | 'warning';
  icon?: ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: 'bg-overlay-subtle text-content-tertiary border-overlay-default',
    purple: 'badge-purple',
    cyan: 'badge-cyan',
    success: 'bg-emerald-500/15 text-success-text border-emerald-500/30',
    danger: 'bg-rose-500/15 text-rose-theme border-rose-500/30',
    warning: 'bg-amber-500/15 text-warning-text border-amber-500/30',
  }[tone];
  const className = cx('badge inline-flex max-w-full items-center gap-1 border text-2xs', toneClass, onClick && 'transition-opacity hover:opacity-80');
  const content = (
    <>
      {icon}
      <span className="truncate">{children}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className} title={title}>
      {content}
    </button>
  ) : (
    <span className={className} title={title}>
      {content}
    </span>
  );
}

/** The coaching line on a card that still needs its next level (a goal with no projects, a project with no tasks). */
export function Nudge({ text, actionLabel, onAction, tone }: { text: string; actionLabel: string; onAction: () => void; tone: 'purple' | 'cyan' }) {
  return (
    <div
      className={cx(
        'flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between',
        tone === 'purple' ? 'border-purple-500/20 bg-purple-500/[0.06]' : 'border-cyan-500/20 bg-cyan-500/[0.06]'
      )}
    >
      <p className="leading-relaxed text-content-secondary">{text}</p>
      <button
        type="button"
        onClick={onAction}
        className={cx(
          'shrink-0 self-start font-semibold sm:self-auto',
          tone === 'purple' ? 'text-purple-hierarchy hover:underline' : 'text-cyan-hierarchy hover:underline'
        )}
      >
        {actionLabel}
      </button>
    </div>
  );
}

/**
 * One goal or project, in one shape: chips and corner actions, title and notes, an optional
 * lock line and nudge, the progress row, then the card's own controls.
 */
export function ItemCard({
  kindLabel,
  title,
  description,
  chips,
  lockedText,
  nudge,
  progress,
  footer,
  onEdit,
  onDelete,
  muted = false,
}: {
  kindLabel: 'goal' | 'project';
  title: string;
  description?: string;
  chips: ReactNode;
  lockedText?: string;
  nudge?: ReactNode;
  progress: {
    percent: number;
    /** "2 of 3 projects done", "Updated by hand". */
    detail: string;
    tone: ProgressTone;
    onUpdate?: () => void;
    updateDisabled?: boolean;
  };
  footer: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  /** Locked or finished cards step back a little. */
  muted?: boolean;
}) {
  const done = progress.percent >= 100;
  return (
    <article className="card enter-item flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">{chips}</div>
        <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
          <button
            type="button"
            onClick={onEdit}
            className={`p-1.5 text-content-muted transition-colors hover:text-content-secondary ${TAP_TARGET_Y}`}
            aria-label={`Edit ${kindLabel} "${title}"`}
            title="Edit"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`p-1.5 text-content-muted transition-colors hover:text-rose-theme ${TAP_TARGET_Y}`}
            aria-label={`Delete ${kindLabel} "${title}"`}
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="min-w-0 space-y-1">
        <h3 className={cx('item-name text-base leading-snug break-words sm:text-lg', muted ? 'text-content-tertiary' : 'text-content-primary')}>
          {title}
        </h3>
        {description && <p className="line-clamp-2 text-xs leading-relaxed text-content-muted">{description}</p>}
      </div>

      {lockedText && (
        <p className="flex items-start gap-2 text-xs text-content-muted">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{lockedText}</span>
        </p>
      )}

      {nudge}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-content-muted">{progress.detail}</span>
          <span className={cx('figure text-sm font-medium', done ? 'text-success-text' : 'text-content-primary')}>{progress.percent}%</span>
        </div>
        <div className="flex items-center gap-2.5">
          <ProgressBar
            value={progress.percent}
            label={`${kindLabel === 'goal' ? 'Goal' : 'Project'} progress`}
            tone={done ? 'success' : progress.tone}
            size="lg"
            className="min-w-0 flex-1"
          />
          {progress.onUpdate && (
            <UpdateProgressButton label="Update" onClick={progress.onUpdate} disabled={progress.updateDisabled} />
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-overlay-subtle pt-3">{footer}</div>
    </article>
  );
}

/** The compact status menu in a card's footer. */
export function StatusSelect({ value, onChange, label, disabled, children }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-9 rounded-xl border border-overlay-default bg-bg-900 px-2.5 py-1.5 text-base text-content-secondary focus:border-primary-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
    >
      {children}
    </select>
  );
}
