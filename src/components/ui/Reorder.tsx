import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { reloadOnceForStaleChunk } from '@/lib/chunkReload';
import { takeReturnFocus } from './reorderFocus';
import type { ReorderListProps } from './ReorderList';

export type { ReorderItem, ReorderListProps } from './ReorderList';

// The drag library loads only when a list enters Reorder mode.
const ReorderListLazy = lazy(() =>
  import('./ReorderList').catch((error) => {
    reloadOnceForStaleChunk();
    throw error;
  })
);

/** A list in Reorder mode (ui/ReorderList.tsx, loaded on demand). */
export function LazyReorderList(props: ReorderListProps) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <AscendLoadingIndicator size="sm" />
        </div>
      }
    >
      <ReorderListLazy {...props} />
    </Suspense>
  );
}

/** "Reorder" in a list's header: shown when the list has two or more items to order. */
export function ReorderButton({ onClick, label }: { onClick: () => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (takeReturnFocus(label)) ref.current?.focus();
  });
  return (
    <Button ref={ref} variant="ghost" size="sm" onClick={onClick} aria-label={`Reorder ${label}`}>
      <ArrowUpDown size={14} aria-hidden="true" />
      <span>Reorder</span>
    </Button>
  );
}
