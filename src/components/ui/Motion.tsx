import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { useCountUp, useIntroMotion, useSeen } from '@/lib/motion';
import { cx } from './primitives/shared';

const STAGGER_MS = 60;
const MAX_STAGGER_STEPS = 6;
// Seen this soon after mounting = it was on screen when the view opened, so it joins the page's
// stagger. Anything seen later was scrolled to and reveals at once.
const ON_OPEN_WINDOW_MS = 400;
// Where the browser runs scroll-driven animations, cards rise with the scroll (index.css "Scroll
// rise"), so content scrolled to later shows plainly here instead of animating twice.
const SCROLL_RISE =
  typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');

interface RevealProps {
  children: ReactNode;
  /** Position in the page's stagger (0 = first). */
  index?: number;
  className?: string;
}

/**
 * Fades and rises its content the first time it comes into view, each time its view opens. Where
 * scroll rise is supported, only content on screen at open animates here (the page's stagger).
 * The animation keeps no transform after it ends (no `forwards` fill), so a position:fixed
 * descendant such as a modal is never trapped in a containing block.
 */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion();
  const [mountedAt] = useState(() => performance.now());
  const seen = useSeen(ref, intro);
  const [delay, setDelay] = useState<number | null>(null);
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (!intro || !SCROLL_RISE) return;
    const timer = window.setTimeout(() => setLate(true), ON_OPEN_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [intro]);

  if (intro && seen && delay === null && !late) {
    const onOpen = performance.now() - mountedAt < ON_OPEN_WINDOW_MS;
    setDelay(onOpen ? Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS : 0);
  }

  // Not on screen when the view opened: scroll rise animates its cards instead.
  if (!intro || (late && delay === null)) return <div ref={ref} className={className}>{children}</div>;

  const style: CSSProperties | undefined = delay ? { animationDelay: `${delay}ms` } : undefined;
  return (
    <div ref={ref} className={cx(className, seen ? 'animate-reveal' : 'opacity-0')} style={style}>
      {children}
    </div>
  );
}

interface AnimatedNumberProps {
  value: number;
  decimals: number;
  grouping: boolean;
}

/** Visual-only count-up; the wrappers below give screen readers the final text. */
function AnimatedNumber({ value, decimals, grouping }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const intro = useIntroMotion();
  const seen = useSeen(ref, intro);
  const shown = useCountUp(value, { intro, active: seen });
  return (
    <span ref={ref} className="tabular-nums">
      {formatNumber(shown, decimals, grouping)}
    </span>
  );
}

function formatNumber(value: number, decimals: number, grouping: boolean): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  });
}

interface CountUpProps {
  value: number;
  decimals?: number;
  className?: string;
}

/** A number that counts up on first view and tweens when it changes. */
export function CountUp({ value, decimals = 0, className }: CountUpProps) {
  return (
    <span className={className}>
      <span aria-hidden="true">
        <AnimatedNumber value={value} decimals={decimals} grouping />
      </span>
      <span className="sr-only">{formatNumber(value, decimals, true)}</span>
    </span>
  );
}

// A number inside formatted text: digits with optional thousands commas and decimals.
const NUMBER_PATTERN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
// Times and dates read wrong mid-count ("12:07" passing through "12:04"), so they stay static.
const TIME_OR_DATE_PATTERN = /\d:\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/;

interface AutoNumProps {
  text: string;
  className?: string;
}

/**
 * Formatted text whose numbers count ("3/5", "75%", "12.5", "1,240 pts"). Prefixes, suffixes,
 * decimals and commas are kept. Text with a time or date renders as is.
 */
export function AutoNum({ text, className }: AutoNumProps) {
  if (TIME_OR_DATE_PATTERN.test(text)) return <span className={className}>{text}</span>;

  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const raw = match[0];
    const fraction = raw.split('.')[1];
    parts.push(
      <AnimatedNumber
        key={parts.length}
        value={Number(raw.replace(/,/g, ''))}
        decimals={fraction ? fraction.length : 0}
        grouping={raw.includes(',')}
      />
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <span className={className}>
      <span aria-hidden="true">{parts}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
