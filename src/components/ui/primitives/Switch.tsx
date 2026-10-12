import { cx, FOCUS_RING, TAP_TARGET } from './shared';

export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible name; the visible label usually sits beside the switch. */
  label: string;
  className?: string;
}

/**
 * On/off toggle. Track 40x24 with 3px inset, so the 18px knob travels exactly 16px and never
 * touches the edge. The knob stretches while pressed and settles with the emphasized ease.
 */
export function Switch({ checked, onChange, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx(
        'group inline-flex h-6 w-10 shrink-0 items-center rounded-full p-[3px] ring-1 ring-inset',
        'transition-[background-color,box-shadow] duration-base ease-standard motion-reduce:transition-none',
        checked ? 'bg-primary-500 ring-primary-400' : 'bg-bg-600 ring-overlay-default',
        FOCUS_RING,
        TAP_TARGET,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'block h-[18px] w-[18px] rounded-full bg-white shadow-sm',
          'transition-[transform,width] duration-base ease-emphasized motion-reduce:transition-none',
          'group-active:w-[22px]',
          checked ? 'translate-x-4 group-active:translate-x-3' : 'translate-x-0'
        )}
      />
    </button>
  );
}
