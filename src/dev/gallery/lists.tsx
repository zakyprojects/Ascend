import { useState } from 'react';
import { Check, Trash2, Undo2, Flame } from 'lucide-react';
import { Button, cx } from '@/components/ui/primitives';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { useToast } from '@/components/ui/Toast';
import { HabitCheck } from '@/components/habits/HabitCheck';
import type { Habit } from '@/types';
import { Badge } from '@/components/ui/primitives';
import { LazyReorderList, ReorderButton, type ReorderItem } from '@/components/ui/Reorder';
import { Caption, Section } from './shared';

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

const REORDER_HABITS: ReorderItem[] = [
  { id: 'r1', title: 'Drink 2 litres of water' },
  { id: 'r2', title: 'Read 20 pages' },
  { id: 'r3', title: 'Morning walk' },
  { id: 'r4', title: 'Stretch for 10 minutes' },
  { id: 'r5', title: 'A very long habit name that wraps onto a second line on a phone to check the row' },
  { id: 'r6', title: 'Call my mom' },
];

const STEPS: ReorderItem[] = [
  { id: 's1', title: 'Learn the basics' },
  { id: 's2', title: 'Build a small project' },
  { id: 's3', title: 'Ship it to a friend' },
  { id: 's4', title: 'Write what you learned' },
];
const DONE_STEPS = new Set(['s1']);

/** One list with its Reorder entry, the way pages wire it: the order lives in this page's state only. */
function ReorderListDemo({ label, initial, sequential }: { label: string; initial: ReorderItem[]; sequential?: boolean }) {
  const [order, setOrder] = useState(() => initial.map((i) => i.id));
  const [reordering, setReordering] = useState(false);
  const byId = new Map(initial.map((i) => [i.id, i]));
  const items = order.map((id) => byId.get(id)!);
  // Sequential goal: a step is locked until the step before it is done (as the draft order would set it).
  const meta = sequential
    ? (id: string, draft: readonly string[]) => {
        const index = draft.indexOf(id);
        const locked = index > 0 && !DONE_STEPS.has(draft[index - 1]) && !DONE_STEPS.has(id);
        return (
          <>
            <Badge size="xs" tone="neutral">
              Step {index + 1} of {draft.length}
            </Badge>
            {DONE_STEPS.has(id) ? (
              <Badge size="xs" tone="emerald">
                Completed
              </Badge>
            ) : (
              locked && (
                <Badge size="xs" tone="warning">
                  Locked
                </Badge>
              )
            )}
          </>
        );
      }
    : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Caption>{label}</Caption>
        {!reordering && <ReorderButton label={label} onClick={() => setReordering(true)} />}
      </div>
      {reordering ? (
        <LazyReorderList
          label={label}
          items={items}
          renderMeta={meta}
          onCancel={() => setReordering(false)}
          onDone={(ids) => {
            setOrder(ids);
            setReordering(false);
          }}
        />
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.id} className="card flex items-center gap-3 p-3">
              <span className="figure w-5 text-center text-xs text-content-muted">{i + 1}</span>
              <span className="item-name min-w-0 flex-1 break-words text-sm">{item.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReorderDemo() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ReorderListDemo label="habits" initial={REORDER_HABITS} />
      <ReorderListDemo label="steps" initial={STEPS} sequential />
    </div>
  );
}

export function ListsGroup() {
  return (
    <>
      <Section id="swipe-rows">
        <SwipeRowDemo />
      </Section>

      <Section id="reorder">
        <ReorderDemo />
      </Section>
    </>
  );
}
