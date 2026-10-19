import { useMemo, useState } from 'react';
import type { AppState, WeeklyGoalItem, WeeklyGoalLinkedModule, WeeklyGoalPriority } from '@/types';
import { Dialog, FieldRow, Form, Input, NumberField, Select, Textarea, useFormController } from '@/components/ui/primitives';
import { LINKED_GOAL_METRICS, type LinkedModule } from '@/lib/linkedGoalMetrics';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { nameTaken } from '@/lib/uniqueNames';

const DEFAULT_WORKOUT_TYPES = ['Running', 'Cycling', 'Weightlifting', 'HIIT', 'Yoga', 'Swimming', 'Walking', 'Boxing', 'Pilates'];

export type GoalPayload = Pick<
  WeeklyGoalItem,
  'title' | 'targetDescription' | 'priority' | 'linkedModule' | 'linkedItemId' | 'linkedMetricKey' | 'targetValue' | 'unit'
>;

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
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [targetDescription, setTargetDescription] = useState(editing?.targetDescription ?? '');
  const [priority, setPriority] = useState<WeeklyGoalPriority>(editing?.priority ?? 'medium');
  const [linkedModule, setLinkedModule] = useState<WeeklyGoalLinkedModule>(editing?.linkedModule || 'none');
  const [linkedItemId, setLinkedItemId] = useState(editing?.linkedItemId ?? '');
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

  const workoutTypes = useMemo(() => {
    const fromHistory = (state.workouts || []).map((w) => (w.type || '').trim()).filter((t) => Boolean(t) && t !== 'Other');
    return Array.from(new Set([...fromHistory, ...DEFAULT_WORKOUT_TYPES]));
  }, [state.workouts]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    // The required selects explain a missing item or metric inline.
    if (linkedModule !== 'none' && (!linkedItemId || !linkedMetricKey)) return;
    try {
      onSave({
        title: title.trim(),
        targetDescription: targetDescription.trim(),
        priority,
        linkedModule,
        linkedItemId: linkedModule !== 'none' ? linkedItemId : undefined,
        linkedMetricKey: linkedModule !== 'none' ? linkedMetricKey : undefined,
        targetValue: targetValue > 0 ? targetValue : 1,
        unit: linkedModule === 'none' ? unit.trim() || 'times' : undefined,
      });
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, editing ? "Couldn't save the goal. Try again." : "Couldn't add the goal. Try again."));
    }
  };

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
        validate={() =>
          nameTaken(title, weekGoals, { editing })
            ? {
                message: `You already have a goal with this name ${weekText.endsWith('week') ? weekText : `for ${weekText}`}.`,
                field: 'goal-title',
              }
            : null
        }
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
            onChange={(e) => {
              setLinkedModule(e.target.value as WeeklyGoalLinkedModule);
              setLinkedItemId('');
              setLinkedMetricKey('');
            }}
          >
            <option value="none">I update it myself</option>
            <option value="habit">A habit</option>
            <option value="exercise">Exercise</option>
            <option value="reading">A book</option>
            <option value="skill">A skill</option>
          </Select>
        </FieldRow>

        {linkedModule === 'exercise' && (
          <Select id="goal-workout-item" label="Workout" value={linkedItemId} onChange={(e) => setLinkedItemId(e.target.value)} required>
            <option value="" disabled>Choose a workout…</option>
            {workoutTypes.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        )}

        {linkedModule === 'habit' && (
          <Select id="goal-habit-item" label="Habit" value={linkedItemId} onChange={(e) => setLinkedItemId(e.target.value)} required>
            <option value="" disabled>Choose a habit…</option>
            {state.habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}{h.frequency === 'weekly' ? ' (weekly: counts once)' : ''}
              </option>
            ))}
          </Select>
        )}

        {linkedModule === 'reading' && (
          <Select id="goal-book-item" label="Book" value={linkedItemId} onChange={(e) => setLinkedItemId(e.target.value)} required>
            <option value="" disabled>Choose a book…</option>
            {state.libraryBooks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}{b.status === 'completed' ? ' (finished)' : b.status === 'reading' ? ' (reading)' : ''}
              </option>
            ))}
          </Select>
        )}

        {linkedModule === 'skill' && (
          <Select id="goal-skill-item" label="Skill" value={linkedItemId} onChange={(e) => setLinkedItemId(e.target.value)} required>
            <option value="" disabled>Choose a skill…</option>
            {state.skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}

        <FieldRow>
          <NumberField id="goal-target-amount" label="Target" min={1} max={100000} value={targetValue} onValueChange={setTargetValue} required />

          {linkedModule !== 'none' ? (
            <Select id="goal-metric-key" label="Count" value={linkedMetricKey} onChange={(e) => setLinkedMetricKey(e.target.value)} required>
              <option value="" disabled>Choose what to count…</option>
              {(LINKED_GOAL_METRICS[linkedModule as LinkedModule] || []).map((m) => (
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
      </Form>
    </Dialog>
  );
}
