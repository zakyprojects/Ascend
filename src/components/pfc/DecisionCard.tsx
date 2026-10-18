import { useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import type { DecisionLog } from '@/types';
import { formatWeekdayDate } from '@/lib/dates';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';

const WRAP = 'break-words [overflow-wrap:anywhere] whitespace-pre-wrap';

function revisitBadge(d: DecisionLog, today: string): { text: string; className: string } {
  if (d.isReflected) return { text: 'Reflected', className: 'badge-purple' };
  if (d.revisitDate < today) return { text: `Overdue since ${formatWeekdayDate(d.revisitDate)}`, className: 'badge-rose' };
  if (d.revisitDate === today) return { text: 'Due today', className: 'badge-purple' };
  return { text: `Revisit ${formatWeekdayDate(d.revisitDate)}`, className: 'bg-overlay-subtle text-content-tertiary' };
}

export function DecisionCard({
  decision: d,
  today,
  onReflect,
  onDelete,
}: {
  decision: DecisionLog;
  today: string;
  onReflect: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = revisitBadge(d, today);
  const long = d.rationale.length > 140 || (d.expectedOutcome || '').length > 140;
  const clamp = long && !expanded ? 'line-clamp-2' : '';

  return (
    <article className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h4 className={cx('item-name text-sm text-content-secondary', WRAP)}>{d.title}</h4>
          <span className={cx('badge text-2xs px-2 py-0.5', badge.className)}>{badge.text}</span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete decision ${d.title}`}
          title="Delete decision"
          className={`p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-colors shrink-0 ${TAP_TARGET}`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-content-tertiary">
        <div className="min-w-0">
          <span className="label block">Why</span>
          <p className={cx(WRAP, clamp)}>{d.rationale}</p>
        </div>
        <div className="min-w-0">
          <span className="label block">Expected outcome</span>
          <p className={cx(WRAP, clamp)}>{d.expectedOutcome || 'Not written'}</p>
        </div>
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="btn-ghost min-h-10 text-xs -ml-2">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {d.reflection ? (
        <div className={cx('p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-xs text-content-secondary', WRAP)}>
          <span className="label block mb-1 text-purple-hierarchy">What you learned</span>
          {d.reflection}
        </div>
      ) : (
        <button type="button" onClick={onReflect} className="btn-secondary w-full min-h-11 text-xs">
          <Edit3 size={14} className="text-purple-hierarchy" aria-hidden="true" />
          <span>Reflect</span>
        </button>
      )}
    </article>
  );
}
