import { cx, FOCUS_RING, TAP_TARGET } from './shared';

export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible name; the visible label usually sits beside the switch. */
  label: string;
  /** Greys the switch out and ignores taps (the setting can't change here). */
  disabled?: boolean;
  /** Saving: the knob shows the Ascend spinner ring and taps are ignored until it settles. */
  loading?: boolean;
  className?: string;
}

/**
 * On/off toggle. Track 48x28 with a 2px inset, so the 24px knob fills the track and travels
 * exactly 20px. The track is recessed (inner shadow), the knob raised (two-layer neutral
 * shadow); the knob glides with the emphasized ease, stretches while pressed, and the
 * track colour crossfades a touch slower so the motion reads as one movement.
 */
export function Switch({ checked, onChange, label, disabled, loading, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={loading ? undefined : onChange}
      className={cx(
        'group inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ring-1 ring-inset',
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]',
        'transition-[background-color,box-shadow] duration-300 ease-standard motion-reduce:transition-none',
        checked
          ? 'bg-primary-500 ring-primary-600/40 enabled:hover:bg-primary-400'
          : 'bg-bg-600 ring-overlay-default enabled:hover:bg-bg-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        loading && 'cursor-wait',
        FOCUS_RING,
        TAP_TARGET,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'relative block h-6 w-6 rounded-full bg-white',
          'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_3px_8px_rgba(0,0,0,0.18)]',
          'transition-[transform,width] duration-[350ms] ease-emphasized motion-reduce:transition-none',
          !loading && 'group-enabled:group-active:w-7',
          checked ? 'translate-x-5' : 'translate-x-0',
          checked && !loading && 'group-enabled:group-active:translate-x-4'
        )}
      >
        {loading && (
          <span className="absolute inset-[5px] rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-primary-500 border-l-transparent animate-spin motion-reduce:animate-none" />
        )}
      </span>
    </button>
  );
}
