import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { cx } from './shared';

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Colour classes for the full-size icon tile (a module's own tone); emerald when left out. */
  iconClassName?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: 'sm' | 'md';
  surface?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  size = 'md',
  surface = true,
  className,
}) => {
  const isSm = size === 'sm';

  const innerContent = (
    <div
      className={cx(
        'text-center',
        // Full-size empty states settle in; small inline ones stay still beside list rows.
        isSm ? 'space-y-1.5' : 'space-y-3 animate-enter-up',
        !surface && className
      )}
    >
      {Icon &&
        (isSm ? (
          <Icon size={16} aria-hidden="true" className="mx-auto text-content-muted" />
        ) : (
          <span
            className={cx(
              'mx-auto flex h-12 w-12 items-center justify-center rounded-2xl',
              iconClassName ?? 'bg-primary-500/10 text-brand-text ring-1 ring-inset ring-primary-500/20'
            )}
          >
            <Icon size={20} aria-hidden="true" />
          </span>
        ))}
      <p
        className={
          isSm
            ? 'text-xs font-semibold text-content-secondary'
            : 'text-base font-semibold text-content-primary'
        }
      >
        {title}
      </p>
      {description && (
        <div
          className={
            isSm
              ? 'text-xs text-content-muted'
              : 'mx-auto max-w-sm text-sm leading-relaxed text-content-muted'
          }
        >
          {description}
        </div>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );

  if (surface) {
    return (
      <Card padding="none" className={cx(isSm ? 'p-4' : 'p-8', className)}>
        {innerContent}
      </Card>
    );
  }

  return innerContent;
};
