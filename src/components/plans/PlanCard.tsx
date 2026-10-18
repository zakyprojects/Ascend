import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/primitives';
import { PLAN_TYPE_META, type AnyPlan, planTypeOf } from './planMeta';
import { PlanBody, type PlanActions } from './PlanBody';

function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  if (!text) return null;
  return (
    <div>
      <p ref={ref} className={`text-sm text-content-muted whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-2'}`}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-content-tertiary hover:text-content-primary"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/**
 * One card for every plan on the page: the user's own plans, their copies and Discover. Only the
 * source line, the corner controls and the footer change, so the three lists read the same.
 */
export function PlanCard({
  plan,
  category,
  source,
  tags,
  controls,
  footer,
  actions,
}: {
  plan: AnyPlan;
  category?: string;
  /** Who it comes from: "Copied from @user" on a copy, the creator on Discover. */
  source?: ReactNode;
  /** Extra badges after the type (visibility). */
  tags?: ReactNode;
  /** Corner icon buttons. */
  controls?: ReactNode;
  footer?: ReactNode;
  actions?: PlanActions;
}) {
  const meta = PLAN_TYPE_META[planTypeOf(plan)];
  const TypeIcon = meta.icon;

  return (
    <article className="card enter-item flex flex-col gap-4 p-4 sm:p-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={meta.badge} size="xs">
              <TypeIcon size={12} /> {meta.label}
            </Badge>
            {tags}
            {category && <span className="text-2xs text-content-muted">{category}</span>}
          </div>
          {controls && <div className="-mr-2 -mt-2 flex shrink-0 items-center">{controls}</div>}
        </div>
        <h3 className="item-name text-base leading-snug break-words">{plan.title}</h3>
        {source && <p className="text-xs text-content-muted">{source}</p>}
        <ExpandableDescription text={plan.description} />
      </header>

      <PlanBody plan={plan} actions={actions} />

      {footer && <footer className="mt-auto flex items-center justify-between gap-3 border-t border-overlay-subtle pt-3">{footer}</footer>}
    </article>
  );
}
