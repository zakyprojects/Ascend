import { cx } from './shared';

export interface SkeletonProps {
  /** Size and shape of the placeholder block (e.g. "h-4 w-24 rounded-full"). */
  className?: string;
}

/**
 * Placeholder block for a data region's first load only (plan §9). Action
 * loading keeps the branded AscendLoadingIndicator.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cx('skeleton rounded-lg', className)} />;
}
