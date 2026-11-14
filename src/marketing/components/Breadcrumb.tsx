import { ChevronRight } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';

/** Visible trail, mirrored by the page's BreadcrumbList (head.ts structuredData). */
export function Breadcrumb({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-content-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" className="text-content-subtle" />}
            {item.href ? (
              <a href={item.href} className={cx('rounded hover:text-content-primary', FOCUS_RING)}>
                {item.name}
              </a>
            ) : (
              <span aria-current="page" className="text-content-tertiary">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
