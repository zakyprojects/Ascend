import React from 'react';
import { cx } from './shared';

export type BadgeTone =
  | 'neutral'
  | 'emerald'
  | 'warning'
  | 'amber'
  | 'purple'
  | 'cyan'
  | 'rose'
  | 'blue'
  | 'sky'
  | 'teal'
  | 'orange'
  | 'indigo'
  | 'violet'
  | 'season'
  | 'beta';

export type BadgeSize = 'xs' | 'sm';
export type BadgeShape = 'pill' | 'tag';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  shape?: BadgeShape;
  children?: React.ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  emerald: 'badge-emerald',
  warning: 'badge-warning',
  amber: 'badge-amber',
  purple: 'badge-purple',
  cyan: 'badge-cyan',
  rose: 'badge-rose',
  blue: 'badge-blue',
  sky: 'badge-sky',
  teal: 'badge-teal',
  orange: 'badge-orange',
  indigo: 'badge-indigo',
  violet: 'badge-violet',
  season: 'badge-season',
  beta: 'badge-beta',
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'text-micro px-2 py-0.5',
  sm: 'text-xs px-2.5 py-1',
};

const shapeClasses: Record<BadgeShape, string> = {
  pill: 'rounded-full',
  tag: 'rounded-lg',
};

const baseClasses = 'inline-flex items-center gap-1 font-semibold';

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      tone = 'neutral',
      size = 'sm',
      shape = 'pill',
      className,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cx(
          baseClasses,
          toneClasses[tone],
          sizeClasses[size],
          shapeClasses[shape],
          className
        )}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
