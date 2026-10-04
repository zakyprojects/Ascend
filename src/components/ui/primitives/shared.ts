export function cx(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900';

export const TRANSITION =
  'transition-[background-color,border-color,color,opacity,transform] duration-fast ease-standard motion-reduce:transition-none';

export const PRESS = 'active:scale-[0.97] motion-reduce:active:scale-100';

export const TAP_TARGET =
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-[max(100%,44px)] after:w-[max(100%,44px)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";
