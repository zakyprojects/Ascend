import { Skeleton } from '@/components/ui/primitives';

/**
 * Stand-in while a page's code loads: only on a cold deep link (pages are preloaded otherwise).
 * Shaped like a page (title, hero card, two cards) so the real page replaces it without a jump.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="page-header">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  );
}
