import React from 'react';
import { AscendLoadingIndicator } from '../AscendLoadingIndicator';
import { cx, FOCUS_RING, TRANSITION, PRESS, TAP_TARGET } from './shared';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';

interface BaseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export type RegularButtonProps = BaseButtonProps & {
  size?: 'sm' | 'md';
  'aria-label'?: string;
};

export type IconButtonProps = BaseButtonProps & {
  size: 'icon';
  'aria-label': string;
};

export type ButtonProps = RegularButtonProps | IconButtonProps;

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 hover:bg-primary-700 hover:shadow-brand-glow text-on-brand',
  secondary:
    'bg-bg-600 text-content-secondary border border-overlay-default hover:bg-bg-500 hover:text-content-primary',
  ghost: 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle',
  // Matches the solid rose confirm buttons already in the app; no semantic token for solid danger exists
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

const baseClasses =
  'inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:pointer-events-none';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      type = 'button',
      disabled = false,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const isIconOnly = size === 'icon';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        className={cx(
          baseClasses,
          TAP_TARGET,
          FOCUS_RING,
          TRANSITION,
          PRESS,
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...rest}
      >
        {loading && <AscendLoadingIndicator size="sm" />}
        {(!isIconOnly || !loading) && children}
      </button>
    );
  }
);

Button.displayName = 'Button';
