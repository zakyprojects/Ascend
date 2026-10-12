import { BookOpen, Check } from 'lucide-react';
import { NAV_GROUPS } from './navConfig';
import { Dialog } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TAP_TARGET, TRANSITION } from '@/components/ui/primitives/shared';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';
import { pageLinkProps } from '@/lib/pageLink';

/** Pages Quick log jumps to: their logging needs the page's own form. */
const JUMPS: View[] = ['journal', 'exercise', 'reading', 'time-tracker'];

interface QuickLogProps {
  open: boolean;
  onClose: () => void;
  store: AppStore;
  statuses: NavStatuses;
  onNavigate: (view: View) => void;
}

/**
 * Quick log, reachable from every page: today's habits tick in one tap (the same toggle as the
 * Habits page and Dashboard, so the same points apply); the other daily logs are one tap away.
 */
export function QuickLog({ open, onClose, store, statuses, onNavigate }: QuickLogProps) {
  const habits = store.state.habits ?? [];
  const items = NAV_GROUPS.flatMap((g) => g.items);
  const go = (view: View) => {
    onClose();
    onNavigate(view);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Quick log">
      <div className="space-y-5">
        <section aria-label="Today's habits">
          <h3 className="mb-2 text-xs font-medium text-content-muted">Habits</h3>
          {habits.length === 0 ? (
            <a
              {...pageLinkProps('habits', go)}
              className={cx('block w-full rounded-xl border border-dashed border-overlay-default px-4 py-3 text-left text-sm text-content-muted hover:text-content-secondary', FOCUS_RING, TRANSITION)}
            >
              No habits yet. Add your first one.
            </a>
          ) : (
            <ul className="space-y-1.5">
              {habits.map((habit) => {
                const done = store.isHabitDone(habit);
                const isLinked = habit.isSystemLinked || habit.linkedModule === 'reading';
                return (
                  <li key={habit.id} className="flex items-center gap-3 rounded-xl px-1 py-0.5">
                    <button
                      type="button"
                      disabled={isLinked}
                      aria-pressed={isLinked ? undefined : done}
                      aria-label={isLinked ? `${habit.name} (log in Reading Hub)` : done ? `Undo ${habit.name}` : `Mark ${habit.name} done`}
                      title={isLinked ? 'Log reading progress in Reading Hub' : undefined}
                      onClick={() => store.toggleHabit(habit.id)}
                      className={cx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                        isLinked
                          ? 'cursor-default border-overlay-subtle bg-bg-600/60 text-content-subtle'
                          : done
                            ? 'border-primary-500/50 bg-primary-500 text-on-brand'
                            : 'border-overlay-subtle bg-bg-600 text-content-disabled hover:bg-bg-500 hover:text-content-tertiary active:scale-90',
                        TAP_TARGET,
                        FOCUS_RING,
                        TRANSITION
                      )}
                    >
                      {isLinked ? <BookOpen size={15} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                    </button>
                    <span className={cx('min-w-0 flex-1 truncate text-sm', done ? 'text-content-muted line-through decoration-overlay-strong' : 'text-content-secondary')}>
                      {habit.name}
                    </span>
                    {habit.isPreset && habit.points > 0 && !isLinked && (
                      <span className={cx('text-2xs font-medium tabular-nums', done ? 'text-content-subtle' : 'text-brand-text')}>+{habit.points}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Log elsewhere">
          <h3 className="mb-2 text-xs font-medium text-content-muted">Log</h3>
          <div className="grid grid-cols-2 gap-2">
            {JUMPS.map((view) => {
              const item = items.find((i) => i.id === view);
              if (!item) return null;
              const status = statuses[view];
              return (
                <a
                  key={view}
                  {...pageLinkProps(view, go)}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl border border-overlay-subtle bg-bg-900/40 px-3 py-2.5 text-left hover:border-overlay-default',
                    FOCUS_RING,
                    TRANSITION
                  )}
                >
                  <item.icon size={17} aria-hidden="true" className={status?.tone === 'done' ? 'text-brand-text' : 'text-content-muted'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-secondary">
                    {item.label}
                    {status && <span className="sr-only">, {status.label}</span>}
                  </span>
                  {status?.tone === 'done' && <Check size={14} aria-hidden="true" className="shrink-0 text-brand-text" />}
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
