import { useLayoutEffect, useRef, useState } from 'react';

/** The plan cards' one "Show more" / "Show less" link, for clamped text and long lists alike. */
export function ShowMoreToggle({
  expanded,
  onToggle,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
}: {
  expanded: boolean;
  onToggle: () => void;
  moreLabel?: string;
  lessLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-1 text-xs font-medium text-content-tertiary hover:text-content-primary"
    >
      {expanded ? lessLabel : moreLabel}
    </button>
  );
}

const CLAMP = { 2: 'line-clamp-2', 4: 'line-clamp-4' } as const;

/**
 * Text clamped to a few lines with a Show more link that only appears when it actually overflows,
 * so a long description or check-in never stretches its card. Expands inline.
 */
export function ShowMoreText({
  text,
  lines = 2,
  className = 'text-sm text-content-muted',
}: {
  text: string;
  lines?: keyof typeof CLAMP;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded, lines]);

  if (!text) return null;
  return (
    <div>
      <p ref={ref} className={`${className} whitespace-pre-wrap break-words ${expanded ? '' : CLAMP[lines]}`}>
        {text}
      </p>
      {(overflowing || expanded) && <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />}
    </div>
  );
}
