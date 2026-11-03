import { Children, type ReactElement, type ReactNode, isValidElement, useLayoutEffect, useRef, useState } from 'react';

/** Matches the gap-4 between columns and between cards. */
const GAP_REM = 1;

/**
 * Cards of different heights in columns that each stack on their own, so a tall or expanded card
 * only pushes down its own column instead of stretching a whole row and leaving holes beside it.
 * Native masonry (display: grid-lanes) is Safari-only as of 2026, hence the measured columns.
 *
 * Columns follow the width like .grid-cards (as many as fit at the minimum width). Each card, in
 * list order, goes to the column that is shortest at that point. Placement is worked out again
 * only when the cards or the column count change, never when a card grows, so expanding a card
 * never makes the others jump columns. Children need keys.
 */
export function MasonryGrid({ children, minColumnRem }: { children: ReactNode; minColumnRem: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const items = Children.toArray(children).filter(isValidElement) as ReactElement[];
  const keys = items.map((item) => String(item.key));
  const keySignature = keys.join('|');
  const [placement, setPlacement] = useState<{ signature: string; columnOf: Record<string, number> } | null>(null);

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

  const signature = `${columnCount}#${keySignature}`;

  // After the first paint of a new set (round-robin), measure each card and place it in the
  // shortest column. Runs before the browser paints, so the round-robin pass is never seen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || placement?.signature === signature) return;
    const gap = GAP_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const heights = new Map<string, number>();
    el.querySelectorAll<HTMLElement>('[data-masonry-key]').forEach((node) => {
      heights.set(node.dataset.masonryKey as string, node.offsetHeight);
    });
    const columnHeights = new Array<number>(columnCount).fill(0);
    const columnOf: Record<string, number> = {};
    keySignature.split('|').forEach((key) => {
      if (!key) return;
      const shortest = columnHeights.indexOf(Math.min(...columnHeights));
      columnOf[key] = shortest;
      columnHeights[shortest] += (heights.get(key) ?? 0) + gap;
    });
    setPlacement({ signature, columnOf });
  }, [signature, columnCount, keySignature, placement]);

  const columns: ReactNode[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => {
    const key = keys[i];
    const placed = placement?.signature === signature ? placement.columnOf[key] : undefined;
    columns[placed ?? i % columnCount].push(
      <div key={key} data-masonry-key={key}>
        {item}
      </div>,
    );
  });

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
