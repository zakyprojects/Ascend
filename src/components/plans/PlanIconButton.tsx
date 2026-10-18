import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx, FOCUS_RING, PRESS, TAP_TARGET_Y, TRANSITION } from '@/components/ui/primitives/shared';

/**
 * A plan card's corner control (share, edit, delete). A real 32px button (40px on touch screens)
 * with a hover fill, so neighbours never touch; the tap area grows only in height to stay off them.
 * `danger` turns rose on hover, `active` keeps the icon in brand colour (a plan that is public).
 */
export function PlanIconButton({
  label,
  title,
  tone = 'default',
  active = false,
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> & {
  /** Screen-reader name, naming the plan ("Delete \"Run a 10k\""). */
  label: string;
  /** Short hover tooltip ("Delete"). */
  title: string;
  tone?: 'default' | 'danger';
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50 disabled:pointer-events-none',
        '[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
        TAP_TARGET_Y,
        FOCUS_RING,
        TRANSITION,
        PRESS,
        active ? 'text-brand-text' : 'text-content-muted',
        tone === 'danger'
          ? 'hover:bg-rose-500/10 hover:text-rose-theme'
          : 'hover:bg-overlay-subtle hover:text-content-primary',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
