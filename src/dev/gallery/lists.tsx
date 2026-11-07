import { useState } from 'react';
import { Check, Trash2, Undo2, Flame } from 'lucide-react';
import { Button, cx } from '@/components/ui/primitives';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { useToast } from '@/components/ui/Toast';
import { HabitCheck } from '@/components/habits/HabitCheck';
import type { Habit } from '@/types';
import { Section } from './shared';

// ---------------------------------------------------------------------------
// Swipe rows (habit row look) and toasts
// ---------------------------------------------------------------------------

function fakeHabit(id: string, name: string, frequency: Habit['frequency'], extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    frequency,
    points: 5,
    isPreset: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    completions: {},
    createdAtPeriod: '2026-09-01',
    ...extra,
  };
}

const SWIPE_HABITS = [
  { habit: fakeHabit('h1', 'Drink 2 litres of water', 'daily'), streak: 12, points: '+5 pts' },
  { habit: fakeHabit('h2', 'Read 20 pages', 'daily', { isSystemLinked: true, linkedModule: 'reading' }), streak: 4, points: 'Tracked by Reading Hub, +5 pts' },
  { habit: fakeHabit('h4', 'Call my mom', 'daily', { isPreset: false, points: 1 }), streak: 3, points: '+1 pt' },
  { habit: fakeHabit('h3', 'Deep clean the room', 'weekly', { isPreset: false, points: 0 }), streak: 0, points: 'No points' },
];

/** SwipeRow around the Habits row look (HabitCheck + name + meta + delete). Drag on a touch screen. */
function SwipeRowDemo() {
  const { showSuccessToast, showInfoToast } = useToast();
  const [done, setDone] = useState<Record<string, boolean>>({ h2: true });
  const [deleted, setDeleted] = useState<string[]>([]);
  const toggle = (id: string, name: string) => {
    setDone((d) => ({ ...d, [id]: !d[id] }));
    showSuccessToast(done[id] ? 'Undone' : 'Done', name);
  };
  const remove = (id: string, name: string) => {
    setDeleted((list) => [...list, id]);
    showInfoToast('Habit deleted', name);
  };
  const rows = SWIPE_HABITS.filter((r) => !deleted.includes(r.habit.id));

  return (
    <div className="space-y-3">
      {rows.map(({ habit, streak, points }) => {
        const isDone = !!done[habit.id];
        const linked = !!habit.isSystemLinked;
        return (
          <SwipeRow
            key={habit.id}
            right={{
              label: isDone ? 'Undo' : 'Done',
              icon: isDone ? Undo2 : Check,
              tone: isDone ? 'bg-bg-600 text-content-secondary' : 'bg-primary-500 text-on-brand',
              onCommit: () => toggle(habit.id, habit.name),
              disabled: linked,
            }}
            left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: () => remove(habit.id, habit.name) }}
          >
            <div className="card card-hover p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <HabitCheck habit={habit} done={isDone} onToggle={() => toggle(habit.id, habit.name)} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3
                    className={cx(
                      'item-name break-words line-clamp-2',
                      isDone ? '!text-content-tertiary line-through decoration-overlay-strong' : '!text-content-primary'
                    )}
                  >
                    {habit.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                    {streak > 0 && (
                      <span className="flex items-center gap-1 text-brand-text">
                        <Flame size={13} aria-hidden="true" />
                        <span className="figure">{streak} days</span>
                      </span>
                    )}
                    <span className={cx('figure', habit.isPreset && !linked && 'text-brand-text')}>{points}</span>
                    {habit.frequency === 'weekly' && <span>{isDone ? 'Done this week' : 'Due this week'}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(habit.id, habit.name)}
                  aria-label={`Delete ${habit.name}`}
                  className="shrink-0 rounded-lg p-2 text-content-muted hover:bg-error/10 hover:text-error"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </SwipeRow>
        );
      })}
      {deleted.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => setDeleted([])}>
          Bring rows back
        </Button>
      )}
    </div>
  );
}

export function ListsGroup() {
  return (
    <>
      <Section id="swipe-rows">
        <SwipeRowDemo />
      </Section>
    </>
  );
}
