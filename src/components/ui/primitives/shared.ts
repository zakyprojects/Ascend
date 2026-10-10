export function cx(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2 focus-visible:ring-offset-bg-900';

export const TRANSITION =
  'transition-[background-color,border-color,color,opacity,transform] duration-fast ease-standard motion-reduce:transition-none';

export const PRESS = 'active:scale-[0.97] motion-reduce:active:scale-100';

// Invisible hit area of at least 44x44px centred on the control; the visual size is unchanged.
// Use alone only on controls that are already absolutely positioned (`relative` would override them).
export const TAP_AREA =
  "after:absolute after:left-1/2 after:top-1/2 after:h-[max(100%,44px)] after:w-[max(100%,44px)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

export const TAP_TARGET = `relative ${TAP_AREA}`;

// Height-only variant for icon buttons packed side by side (e.g. edit/delete pairs):
// a 44px-wide area would spill over the neighbouring button and take its taps.
export const TAP_TARGET_Y =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-[max(100%,44px)] after:-translate-y-1/2 after:content-['']";
