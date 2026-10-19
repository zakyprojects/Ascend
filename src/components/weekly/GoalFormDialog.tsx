import { useMemo, useState } from 'react';
import type { AppState, WeeklyGoalItem, WeeklyGoalLinkedModule, WeeklyGoalPriority } from '@/types';
import { Dialog, FieldRow, Form, Input, NumberField, Select, Textarea, useFormController } from '@/components/ui/primitives';
import {
  EXERCISE_METRIC_BY_MEASURE,
  LINKED_GOAL_METRICS,
  linkedBook,
  linkedItemExists,
  readingMetricFor,
  type LinkedGoalMetricDefinition,
  type LinkedModule,
  type MetricKey,
} from '@/lib/linkedGoalMetrics';
import { isChapterBook } from '@/lib/readingAwards';
import { workoutMeasureOf, workoutTypeKey, workoutTypeNames, type WorkoutMeasure } from '@/lib/workoutTypes';
import { pageLinkProps } from '@/lib/pageLink';
import type { View } from '@/lib/views';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { nameTaken } from '@/lib/uniqueNames';

export type GoalPayload = Pick<
  WeeklyGoalItem,
  'title' | 'targetDescription' | 'priority' | 'linkedModule' | 'linkedItemId' | 'linkedMetricKey' | 'targetValue' | 'unit'
>;

/** The item select's value for "Any workout / book / skill" (saved as no linked item: progress counts them all). */
const ANY_ITEM = '__any__';

/** Where a new target starts when the Count changes, so "5 workouts" never becomes "5 minutes". */
const DEFAULT_TARGET: Record<MetricKey, number> = {
  days_completed: 5,
  workouts_logged: 3,
  minutes_exercised: 150,
  reps_logged: 200,
  sets_logged: 15,
  distance_km: 10,
  pages_read: 100,
  chapters_read: 5,
  minutes_practiced: 150,
  sessions_logged: 3,
};

const MAX_TARGET = 100000;
/** A week has 7 days. */
const MAX_HABIT_DAYS = 7;

const MEASURE_LABEL: Record<WorkoutMeasure, string> = { mins: 'minutes', reps: 'reps', sets: 'sets', km: 'km' };

/** Where to add the first habit, book or skill when the list is empty. */
const EMPTY_LIST: Partial<Record<LinkedModule, { text: string; link: string; view: View }>> = {
  habit: { text: 'No habits yet.', link: 'Add a habit', view: 'habits' },
  reading: { text: 'No books in your library yet.', link: 'Add a book', view: 'reading' },
  skill: { text: 'No skills yet.', link: 'Add a skill', view: 'skills' },
};

/**
 * Add or edit one weekly goal. Mounted fresh for every open (the parent keys it), so the form
 * always starts from the goal being edited or from empty.
 */
export function GoalFormDialog({
  open,
  editing,
  state,
  weekGoals,
  weekText,
  onClose,
  onSave,
  onNavigate,
}: {
  open: boolean;
  editing: WeeklyGoalItem | null;
  state: AppState;
  /** The goals already in this week, so a new or renamed one can't repeat a name. */
  weekGoals: WeeklyGoalItem[];
  /** "this week", "next week": where a new goal goes. */
  weekText: string;
  onClose: () => void;
  /** Throws with a user-facing message when the store refuses the change. */
  onSave: (payload: GoalPayload) => void;
  /** Opens another page (the empty item list links to Habits, Reading or Skills). */
  onNavigate: (view: View) => void;
}) {
  const editingLinked = Boolean(editing?.linkedModule && editing.linkedModule !== 'none');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [targetDescription, setTargetDescription] = useState(editing?.targetDescription ?? '');
  const [priority, setPriority] = useState<WeeklyGoalPriority>(editing?.priority ?? 'medium');
  const [linkedModule, setLinkedModule] = useState<WeeklyGoalLinkedModule>(editing?.linkedModule || 'none');
  // A goal whose habit, book or skill was deleted starts with no item, so a live one is chosen.
  const [linkedItemId, setLinkedItemId] = useState(() => {
    if (!editing || !editingLinked) return '';
    if (!editing.linkedItemId) return ANY_ITEM;
    return linkedItemExists(editing, state) ? editing.linkedItemId : '';
  });
  const [linkedMetricKey, setLinkedMetricKey] = useState(editing?.linkedMetricKey ?? '');
  const [targetValue, setTargetValue] = useState<number>(editing?.targetValue || 1);
  const [unit, setUnit] = useState(editing?.unit || 'times');
  const issues = useFormController();
  const form = useUnsavedChanges(
    open,
    [title, targetDescription, priority, linkedModule, linkedItemId, linkedMetricKey, targetValue, unit] as const,
    {
      key: `weekly-goal:${editing?.id ?? 'new'}`,
      restore: ([t, td, p, lm, li, lk, tv, u]) => {
        setTitle(t);
        setTargetDescription(td);
        setPriority(p);
        setLinkedModule(lm);
        setLinkedItemId(li);
        setLinkedMetricKey(lk);
        setTargetValue(tv);
        setUnit(u);
      },
    }
  );

  const module = linkedModule === 'none' ? null : (linkedModule as LinkedModule);
  const isAny = linkedItemId === ANY_ITEM;
  const itemId = isAny ? '' : linkedItemId;

  // The Exercise page's workouts (history first, then its defaults); an edited goal keeps its own.
  const workoutTypes = useMemo(() => {
    const names = workoutTypeNames(state.workouts || []);
    const own = editing?.linkedModule === 'exercise' ? editing.linkedItemId?.trim() : '';
    return own && !names.some((n) => workoutTypeKey(n) === workoutTypeKey(own)) ? [...names, own] : names;
  }, [state.workouts, editing]);

  /** How a workout has been logged so far, most used measure first. */
  const workoutMeasures = (name: string): { measure: WorkoutMeasure; count: number }[] => {
    const key = workoutTypeKey(name);
    const counts = new Map<WorkoutMeasure, number>();
    for (const w of state.workouts || []) {
      if (workoutTypeKey(w.type) !== key) continue;
      const m = workoutMeasureOf(w);
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return Array.from(counts, ([measure, count]) => ({ measure, count })).sort((a, b) => b.count - a.count);
  };

  const habit = module === 'habit' ? state.habits.find((h) => h.id === itemId) : undefined;
  const weeklyHabit = habit?.frequency === 'weekly';
  const book = module === 'reading' ? linkedBook(state, itemId) : undefined;
  const itemCount = module === 'habit' ? state.habits.length : module === 'reading' ? state.libraryBooks.length : module === 'skill' ? state.skills.length : 1;
  const emptyList = module && itemCount === 0 ? EMPTY_LIST[module] : undefined;

  // A goal on one book counts in that book's unit, so it has just that one Count.
  const metricOptions: LinkedGoalMetricDefinition[] = !module
    ? []
    : module === 'reading' && book
      ? LINKED_GOAL_METRICS.reading
          .filter((m) => m.key === (linkedMetricKey === 'pages_read' || linkedMetricKey === 'chapters_read' ? linkedMetricKey : readingMetricFor(book)))
          .map((m) => ({ ...m, label: isChapterBook(book) ? 'chapters' : 'pages' }))
      : LINKED_GOAL_METRICS[module];

  /** The target a new Count starts at (a weekly habit is done once; a week has 7 days). */
  const defaultTarget = (key: string, weekly = weeklyHabit): number =>
    key === 'days_completed' && weekly ? 1 : DEFAULT_TARGET[key as MetricKey] ?? 1;

  const chooseMetric = (key: string, weekly?: boolean) => {
    setLinkedMetricKey(key);
    setTargetValue(defaultTarget(key, weekly));
  };

  const chooseModule = (next: WeeklyGoalLinkedModule) => {
    setLinkedModule(next);
    setLinkedItemId('');
    if (next === 'none') {
      setLinkedMetricKey('');
      setTargetValue(1);
      return;
    }
    // A habit has one Count (days); the others wait for the item or a choice.
    const only = LINKED_GOAL_METRICS[next as LinkedModule];
    if (only.length === 1) chooseMetric(only[0].key, false);
    else setLinkedMetricKey('');
  };

  const chooseItem = (value: string) => {
    setLinkedItemId(value);
    const id = value === ANY_ITEM ? '' : value;
    if (module === 'habit') {
      chooseMetric('days_completed', state.habits.find((h) => h.id === id)?.frequency === 'weekly');
    } else if (module === 'reading') {
      const picked = linkedBook(state, id);
      if (picked) chooseMetric(readingMetricFor(picked));
      else if (linkedMetricKey !== 'pages_read' && linkedMetricKey !== 'chapters_read') setLinkedMetricKey('');
    } else if (module === 'exercise' && id) {
      // Count starts at how this workout is usually logged.
      const usual = workoutMeasures(id)[0];
      if (usual) chooseMetric(EXERCISE_METRIC_BY_MEASURE[usual.measure]);
    }
  };

  const itemName =
    module === 'exercise' ? itemId : module === 'habit' ? habit?.name : module === 'reading' ? book?.title : module === 'skill' ? state.skills.find((s) => s.id === itemId)?.name : undefined;

  /** One line under Count saying what it adds up. */
  const countHint = (): string | undefined => {
    if (!module || !linkedMetricKey || (!itemId && !isAny)) return undefined;
    const workouts = isAny ? 'all workouts' : `${itemName} logs`;
    switch (linkedMetricKey as MetricKey) {
      case 'days_completed':
        return weeklyHabit ? `Done once you tick ${itemName} this week.` : `Counts the days you tick ${itemName} this week.`;
      case 'workouts_logged':
        return isAny ? "Counts every workout you log this week, however it's measured." : `Counts each ${itemName} log this week, however it's measured.`;
      case 'minutes_exercised':
        return `Adds minutes from ${workouts} counted in minutes.`;
      case 'reps_logged':
      case 'sets_logged':
      case 'distance_km': {
        const label = linkedMetricKey === 'reps_logged' ? 'reps' : linkedMetricKey === 'sets_logged' ? 'sets' : 'km';
        return `Adds ${label} from ${workouts} counted in ${label}.`;
      }
      case 'pages_read':
      case 'chapters_read': {
        const label = book ? (isChapterBook(book) ? 'chapters' : 'pages') : linkedMetricKey === 'chapters_read' ? 'chapters' : 'pages';
        return book ? `Adds the ${label} you log for ${book.title} this week.` : `Adds ${label} from every book you count in ${label}.`;
      }
      case 'minutes_practiced':
        return isAny ? 'Adds practice minutes from all your skills this week.' : `Adds practice minutes from ${itemName} logs this week.`;
      case 'sessions_logged':
        return isAny ? 'Counts each practice you log this week, any skill.' : `Counts each practice of ${itemName} you log this week.`;
      default:
        return undefined;
    }
  };

  /** "You log Push-ups in reps (8×), sets (2×).", once a workout with history is picked. */
  const workoutHint = (() => {
    if (module !== 'exercise' || !itemId) return undefined;
    const measures = workoutMeasures(itemId);
    if (measures.length === 0) return undefined;
    return `You log ${itemId} in ${measures.map((m) => `${MEASURE_LABEL[m.measure]} (${m.count}×)`).join(', ')}.`;
  })();

  const handleSubmit = () => {
    if (!title.trim()) return;
    // The required selects (and validate, for an empty list) explain a missing item or metric inline.
    if (module && ((!itemId && !isAny) || !linkedMetricKey)) return;
    try {
      onSave({
        title: title.trim(),
        targetDescription: targetDescription.trim(),
        priority,
        linkedModule,
        // '' = any item: progress counts all of them.
        linkedItemId: module ? itemId : undefined,
        linkedMetricKey: module ? linkedMetricKey : undefined,
        targetValue: weeklyHabit ? 1 : targetValue > 0 ? targetValue : 1,
        unit: module ? undefined : unit.trim() || 'times',
      });
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, editing ? "Couldn't save the goal. Try again." : "Couldn't add the goal. Try again."));
    }
  };

  const itemSelect = (id: string, label: string, placeholder: string, anyLabel: string | null, options: { value: string; label: string; disabled?: boolean }[], hint?: string) => (
    <Select id={id} label={label} value={linkedItemId} onChange={(e) => chooseItem(e.target.value)} hint={hint} required>
      <option value="" disabled>{placeholder}</option>
      {anyLabel && <option value={ANY_ITEM}>{anyLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </Select>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editing ? 'Edit goal' : 'Add a goal'}
      description={editing ? undefined : `For ${weekText}.`}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="weekly-goal-form" className="btn-primary">
            {editing ? 'Save goal' : 'Add goal'}
          </button>
        </>
      }
    >
      <Form
        id="weekly-goal-form"
        onSubmit={handleSubmit}
        controller={issues}
        validate={() => {
          if (emptyList) return { message: `${emptyList.text} Add one first, or pick another option.`, field: 'goal-linked-module' };
          return nameTaken(title, weekGoals, { editing })
            ? {
                message: `You already have a goal with this name ${weekText.endsWith('week') ? weekText : `for ${weekText}`}.`,
                field: 'goal-title',
              }
            : null;
        }}
        className="space-y-4"
      >
        <Input
          id="goal-title"
          label="Goal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 3 workouts, read 50 pages"
          maxLength={120}
          autoComplete="off"
          required
        />

        <Textarea
          id="goal-description"
          label="Notes"
          optional
          value={targetDescription}
          onChange={(e) => setTargetDescription(e.target.value)}
          placeholder="Why it matters, when you'll do it"
          maxLength={500}
        />

        <FieldRow>
          <Select id="goal-priority" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as WeeklyGoalPriority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>

          <Select
            id="goal-linked-module"
            label="Progress from"
            value={linkedModule}
            onChange={(e) => chooseModule(e.target.value as WeeklyGoalLinkedModule)}
          >
            <option value="none">I update it myself</option>
            <option value="habit">A habit</option>
            <option value="exercise">Exercise</option>
            <option value="reading">A book</option>
            <option value="skill">A skill</option>
          </Select>
        </FieldRow>

        {emptyList && (
          <p className="text-xs text-content-muted">
            {emptyList.text}{' '}
            <a
              {...pageLinkProps(emptyList.view, (view) => {
                onClose();
                onNavigate(view);
              })}
              className="font-medium text-brand-text hover:underline"
            >
              {emptyList.link}
            </a>
          </p>
        )}

        {module === 'exercise' &&
          itemSelect('goal-workout-item', 'Workout', 'Choose a workout…', 'Any workout', workoutTypes.map((name) => ({ value: name, label: name })), workoutHint)}

        {module === 'habit' && !emptyList &&
          itemSelect(
            'goal-habit-item',
            'Habit',
            'Choose a habit…',
            null,
            state.habits.map((h) => ({ value: h.id, label: `${h.name}${h.frequency === 'weekly' ? ' (weekly: counts once)' : ''}` }))
          )}

        {module === 'reading' && !emptyList &&
          itemSelect(
            'goal-book-item',
            'Book',
            'Choose a book…',
            'Any book',
            // A finished book has nothing left to log (an edited goal keeps its own book).
            state.libraryBooks.map((b) => ({
              value: b.id,
              label: `${b.title}${b.status === 'completed' ? ' (finished)' : b.status === 'reading' ? ' (reading)' : ''}`,
              disabled: b.status === 'completed' && b.id !== editing?.linkedItemId && b.linkedBookId !== editing?.linkedItemId,
            }))
          )}

        {module === 'skill' && !emptyList &&
          itemSelect('goal-skill-item', 'Skill', 'Choose a skill…', 'Any skill', state.skills.map((s) => ({ value: s.id, label: s.name })))}

        {!emptyList && (
          <FieldRow>
            <NumberField
              id="goal-target-amount"
              label="Target"
              min={1}
              max={linkedMetricKey === 'days_completed' && module === 'habit' ? MAX_HABIT_DAYS : MAX_TARGET}
              value={weeklyHabit ? 1 : targetValue}
              onValueChange={setTargetValue}
              disabled={weeklyHabit}
              hint={weeklyHabit ? 'A weekly habit is done once a week.' : undefined}
              required
            />

            {module ? (
              <Select
                id="goal-metric-key"
                label="Count"
                value={linkedMetricKey}
                onChange={(e) => chooseMetric(e.target.value)}
                hint={countHint()}
                required
              >
                <option value="" disabled>Choose what to count…</option>
                {metricOptions.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </Select>
            ) : (
              <Input
                id="goal-unit-label"
                label="Unit"
                optional
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. sessions, pages"
                maxLength={20}
                autoComplete="off"
              />
            )}
          </FieldRow>
        )}
      </Form>
    </Dialog>
  );
}
