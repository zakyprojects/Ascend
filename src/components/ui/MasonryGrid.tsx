import { Children, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/** Matches the gap-4 between columns and between cards. */
const GAP_REM = 1;

/**
 * Cards of different heights in columns that each stack on their own, so a tall or expanded card
 * only pushes down its own column instead of stretching a whole row and leaving holes beside it.
 * Native masonry (display: grid-lanes) is Safari-only as of 2026, hence the measured columns.
 *
 * Columns follow the width like .grid-cards (as many as fit at the minimum width), and cards go
 * round-robin so the first row reads left to right in list order and no card moves to another
 * column when one is expanded.
 */
export function MasonryGrid({ children, minColumnRem }: { children: ReactNode; minColumnRem: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = GAP_REM * rem;
      setColumnCount(Math.max(1, Math.floor((el.clientWidth + gap) / (minColumnRem * rem + gap))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minColumnRem]);

  const columns: ReactNode[][] = Array.from({ length: columnCount }, () => []);
  Children.toArray(children).forEach((child, i) => columns[i % columnCount].push(child));

  return (
    <div ref={ref} className="flex items-start gap-4">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
          {column}
        </div>
      ))}
    </div>
  );
}
