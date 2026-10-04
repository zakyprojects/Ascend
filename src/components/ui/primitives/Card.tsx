import React from 'react';
import { cx, FOCUS_RING, TRANSITION, PRESS } from './shared';

export type CardVariant = 'default' | 'subtle' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardAs = 'div' | 'section' | 'button' | 'li';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: CardAs;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'card',
  subtle: 'bg-bg-700 rounded-xl border border-overlay-subtle',
  interactive: cx(
    'card cursor-pointer hover:border-overlay-strong hover:bg-bg-700 disabled:opacity-60 disabled:pointer-events-none',
    PRESS,
    FOCUS_RING,
    TRANSITION
  ),
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = React.forwardRef<HTMLElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      as: asProp,
      className,
      children,
      type,
      disabled,
      ...rest
    },
    ref
  ) => {
    const as = asProp ?? (variant === 'interactive' ? 'button' : 'div');
    const Component: React.ElementType = as;
    const isButton = as === 'button';

    return (
      <Component
        ref={ref as any}
        type={isButton ? type || 'button' : undefined}
        disabled={isButton ? disabled : undefined}
        className={cx(
          variantClasses[variant],
          paddingClasses[padding],
          isButton && 'block w-full text-left',
          className
        )}
        {...rest}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';
