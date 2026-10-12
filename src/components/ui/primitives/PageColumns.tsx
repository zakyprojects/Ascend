import type { ReactNode } from 'react';
import { cx } from './shared';

export interface PageColumnsProps {
  /** Main-column content that comes before the aside on narrow screens. */
  lead?: ReactNode;
  /** Side column from 1440px up (secondary cards, meters, rules). On narrow screens it sits between
   *  `lead` and `children`, so the phone order is lead, aside, children. */
  aside?: ReactNode;
  /** Main-column content that comes after the aside on narrow screens. */
  children?: ReactNode;
  /** Keep the aside in view while the main column scrolls. Only for asides shorter than the
   *  viewport; a taller sticky aside would hide its own bottom. */
  stickyAside?: boolean;
  className?: string;
}

/**
 * Page body that fills wide screens with the page's own content: one column (in source order)
 * below 1440px, a main column plus a fixed-width side column from 1440px up. The split waits for
 * 1440px because below it (sidebar included) the main column would drop under ~700px, narrower
 * than the single column it replaces; between 1024px and 1440px the single column already fills. Spacing matches the
 * pages' `space-y-6` rhythm, so a page reads the same on phones as before.
 */
export function PageColumns({ lead, aside, children, stickyAside = false, className }: PageColumnsProps) {
  const hasLead = lead != null && lead !== false;
  const hasAside = aside != null && aside !== false;
  const hasChildren = children != null && children !== false;
  const split = hasLead && hasChildren;

  return (
    <div
      className={cx(
        'grid gap-6',
        hasAside && 'min-[1440px]:grid-cols-[minmax(0,1fr)_21rem]',
        hasAside && split && 'min-[1440px]:grid-rows-[auto_1fr]',
        className
      )}
    >
      {hasLead && <div className="min-w-0 space-y-6 min-[1440px]:col-start-1 min-[1440px]:row-start-1">{lead}</div>}
      {hasAside && (
        <aside
          className={cx(
            'min-w-0 space-y-6 min-[1440px]:col-start-2 min-[1440px]:row-start-1 min-[1440px]:self-start',
            split && 'min-[1440px]:row-span-2',
            stickyAside && 'min-[1440px]:sticky min-[1440px]:top-8'
          )}
        >
          {aside}
        </aside>
      )}
      {hasChildren && (
        <div className={cx('min-w-0 space-y-6 min-[1440px]:col-start-1', hasLead ? 'min-[1440px]:row-start-2' : 'min-[1440px]:row-start-1')}>
          {children}
        </div>
      )}
    </div>
  );
}
