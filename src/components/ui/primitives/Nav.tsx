import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cx, FOCUS_RING, TRANSITION, TAP_TARGET } from './shared';

export interface NavItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick?: () => void;
  badgeCount?: number;
  layout?: 'row' | 'stack';
  density?: 'default' | 'compact';
}

export const NavItem = React.forwardRef<HTMLButtonElement, NavItemProps>(
  (
    {
      icon: Icon,
      label,
      active,
      onClick,
      badgeCount,
      layout = 'row',
      density = 'default',
      className,
      ...props
    },
    ref
  ) => {
    const isRow = layout === 'row';

    if (isRow) {
      return (
        <button
          ref={ref}
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={onClick}
          className={cx(
            'w-full flex items-center justify-between gap-3 px-3 rounded-xl text-sm font-medium',
            density === 'compact' ? 'py-1.5' : 'py-2.5',
            active
              ? 'bg-primary-500/15 text-brand-text'
              : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle',
            TAP_TARGET,
            FOCUS_RING,
            TRANSITION,
            className
          )}
          {...props}
        >
          {/* Active accent: grows in on the item that becomes current. */}
          <span
            aria-hidden="true"
            className={cx(
              'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-text transition-transform duration-base ease-emphasized motion-reduce:transition-none',
              active ? 'scale-y-100' : 'scale-y-0'
            )}
          />
          <span className="flex items-center gap-3">
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </span>
          {Boolean(badgeCount && badgeCount > 0) && (
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-micro font-bold flex items-center justify-center">
              {badgeCount}
            </span>
          )}
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={cx(
          'relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg',
          active ? 'text-brand-text' : 'text-content-disabled',
          TAP_TARGET,
          FOCUS_RING,
          TRANSITION,
          className
        )}
        {...props}
      >
        {/* Active pill behind the icon (bottom bar). */}
        <span
          className={cx(
            'flex items-center justify-center w-12 h-7 rounded-full transition-colors duration-base ease-standard',
            active ? 'bg-primary-500/15' : 'bg-transparent'
          )}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="text-micro font-medium">{label}</span>
        {Boolean(badgeCount && badgeCount > 0) && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-rose-500"
          />
        )}
      </button>
    );
  }
);

NavItem.displayName = 'NavItem';

export interface NavSectionProps {
  label: string;
  className?: string;
  expanded?: boolean;
  onToggle?: () => void;
  badgeCount?: number;
  controlsId?: string;
}

export const NavSection: React.FC<NavSectionProps> = ({
  label,
  className,
  expanded = false,
  onToggle,
  badgeCount,
  controlsId,
}) => {
  if (onToggle === undefined) {
    return (
      <div
        className={cx(
          'px-3 pt-2 text-micro font-semibold uppercase tracking-wider text-content-muted',
          className
        )}
      >
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      className={cx(
        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-micro font-semibold uppercase tracking-wider text-content-muted hover:text-content-secondary hover:bg-overlay-subtle',
        TAP_TARGET,
        FOCUS_RING,
        TRANSITION,
        className
      )}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {!expanded && Boolean(badgeCount && badgeCount > 0) && (
          <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-micro font-bold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={expanded ? 'rotate-90' : undefined}
        />
      </span>
    </button>
  );
};
