import { BookOpen, Check } from 'lucide-react';
import type { Habit } from '@/types';
import { cx, FOCUS_RING, TAP_TARGET, TRANSITION } from '@/components/ui/primitives/shared';

/** The Reading (Books) habit is ticked by logging pages in Reading Hub, never by hand. */
export function isReadingLinked(habit: Habit): boolean {
  return !!habit.isSystemLinked || habit.linkedModule === 'reading';
}

interface HabitCheckProps {
  habit: Habit;
  done: boolean;
  onToggle: () => void;
  /** 'md' 44 px (Habits page rows), 'sm' 36 px with a 44 px tap area (Dashboard, Quick log). */
  size?: 'md' | 'sm';
  /** Extra classes for the check icon (the completion pop). */
  iconClassName?: string;
}

/**
 * The one habit tick used on the Habits page, the Dashboard and Quick log: a toggle button with
 * the habit's name, its pressed state, and the linked Reading habit shown as logged elsewhere.
 */
export function HabitCheck({ habit, done, onToggle, size = 'md', iconClassName }: HabitCheckProps) {
  const linked = isReadingLinked(habit);
  const md = size === 'md';
  const when = habit.frequency === 'weekly' ? ' this week' : '';
  const label = linked
    ? `${habit.name}: ${done ? 'done' : 'not done'}${when}, logged in Reading Hub`
    : `Mark ${habit.name} done${when}`;

  return (
    <button
      type="button"
      onClick={linked ? undefined : onToggle}
      aria-disabled={linked || undefined}
      aria-pressed={linked ? undefined : done}
      aria-label={label}
      title={linked ? 'Log pages in Reading Hub to tick this' : undefined}
      className={cx(
        'flex shrink-0 items-center justify-center border',
        md ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-lg',
        done
          ? 'border-primary-500/50 bg-primary-500 text-on-brand'
          : linked
            ? 'badge-amber cursor-default'
            : 'border-overlay-default bg-bg-600 text-content-muted hover:bg-bg-500 hover:text-content-secondary active:scale-90 motion-reduce:active:scale-100',
        !md && TAP_TARGET,
        FOCUS_RING,
        TRANSITION
      )}
    >
      {linked && !done ? (
        <BookOpen size={md ? 18 : 15} aria-hidden="true" />
      ) : (
        <Check size={md ? 22 : 18} aria-hidden="true" className={iconClassName} />
      )}
    </button>
  );
}
