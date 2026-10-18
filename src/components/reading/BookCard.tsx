import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { getCategoryMeta } from '@/lib/books';
import type { BookCategory } from '@/types';

export function ClampedText({ text, lines = 2 }: { text?: string; lines?: 2 | 3 }) {
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
      <p
        ref={ref}
        className={`text-sm text-content-muted whitespace-pre-wrap break-words leading-relaxed ${
          expanded ? '' : lines === 3 ? 'line-clamp-3' : 'line-clamp-2'
        }`}
      >
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

export function CategoryBadge({ category }: { category?: BookCategory | string }) {
  if (!category) return null;
  const meta = getCategoryMeta(category as BookCategory);
  return <span className={`badge ${meta.badgeClass} text-2xs px-2 py-0.5`}>{category}</span>;
}

/**
 * One card shape for every book on the page (reading, library, finished, Discover): the same
 * header, then the part that tab needs, then its actions.
 */
export function BookCard({
  title,
  author,
  category,
  tags,
  controls,
  children,
  footer,
}: {
  title: string;
  author: string;
  category?: BookCategory | string;
  /** Badges after the category (status, bonus). */
  tags?: ReactNode;
  /** Corner icon buttons. */
  controls?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="card enter-item flex flex-col gap-4 p-4 sm:p-5">
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <CategoryBadge category={category} />
            {tags}
          </div>
          {controls && <div className="-mr-2 -mt-2 flex shrink-0 items-center">{controls}</div>}
        </div>
        <h3 className="item-name text-base leading-snug break-words">{title}</h3>
        <p className="text-xs text-content-muted">by {author}</p>
      </header>

      {children}

      {footer && (
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-overlay-subtle pt-3">
          {footer}
        </footer>
      )}
    </article>
  );
}
