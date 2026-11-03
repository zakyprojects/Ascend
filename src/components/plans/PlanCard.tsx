import { type ReactNode, useRef, useState } from 'react';
import { Badge } from '@/components/ui/primitives';
import { PLAN_TYPE_META, type AnyPlan, planTypeOf } from './planMeta';
import { PlanBody, type PlanActions, planHasFoldedContent } from './PlanBody';
import { ShowMoreToggle, useClampOverflow } from './ShowMore';

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
  /** Owner icon buttons (PlanIconButton), shown at the end of the badge row. */
  controls?: ReactNode;
  footer?: ReactNode;
  actions?: PlanActions;
}) {
  const meta = PLAN_TYPE_META[planTypeOf(plan)];
  const TypeIcon = meta.icon;
  // One fold for the whole card: collapsed shows the essentials, Show more opens the full
  // description, every step and the check-ins together.
  const [expanded, setExpanded] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionClipped = useClampOverflow(descriptionRef, !expanded, plan.description || '');
  const foldable = expanded || descriptionClipped || planHasFoldedContent(plan, !actions);

  return (
    // self-start: a card is as tall as its own (clamped) content, so one expanded card never
    // stretches the rest of its grid row.
    <article className="card enter-item flex flex-col gap-4 self-start p-4 sm:p-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={meta.badge} size="xs">
              <TypeIcon size={12} /> {meta.label}
            </Badge>
            {tags}
            {category && <span className="text-2xs text-content-muted">{category}</span>}
          </div>
          {controls && (
            // Sits in the badge row without making it taller on desktop; on touch the buttons are
            // bigger and the row grows to fit them instead of pushing into the card's corner.
            <div className="-my-1.5 -mr-1 flex shrink-0 items-center gap-1 [@media(pointer:coarse)]:my-0 [@media(pointer:coarse)]:gap-1.5">
              {controls}
            </div>
          )}
        </div>
        <h3 className="item-name text-base leading-snug break-words">{plan.title}</h3>
        {source && <p className="text-xs text-content-muted">{source}</p>}
        {plan.description && (
          <p
            ref={descriptionRef}
            className={`text-sm text-content-muted whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-2'}`}
          >
            {plan.description}
          </p>
        )}
      </header>

      <PlanBody plan={plan} actions={actions} expanded={expanded} />

      {foldable && (
        <div className="-mt-2">
          <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </div>
      )}

      {footer && <footer className="mt-auto flex items-center justify-between gap-3 border-t border-overlay-subtle pt-3">{footer}</footer>}
    </article>
  );
}
