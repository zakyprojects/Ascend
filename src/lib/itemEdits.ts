/**
 * Edits of things a user already made (Zakria 2026-11-07): skill name and category, today's
 * workout, the recovery tracker's title, a subtask's title, and the name of a custom habit or
 * custom bad habit. Pure helpers; the store applies them. None of them changes points: names are
 * never read by the server's point rules for custom items or skills, and a workout edit is only
 * allowed on today (the server drops an edit of any other day and recomputes today's award).
 */
import type { AddictionTracker, BadHabit, Habit, Skill, Task, WorkoutLog } from '@/types';
import { PRESET_BAD_HABITS, PRESET_CATEGORIES } from './presets';
import { nameTaken, sameName } from './uniqueNames';

export const SKILL_NAME_MAX = 80;
export const SKILL_CATEGORY_MAX = 40;
export const HABIT_NAME_MAX = 80;
export const TRACKER_TITLE_MAX = 60;
export const SUBTASK_TITLE_MAX = 120;

const tidy = (text: string) => text.trim().replace(/\s+/g, ' ');

// ── Skills ────────────────────────────────────────────────────────────────────────────────────

/** Why this skill can't take this name, or null. Keeping its own name is always fine. */
export function skillNameProblem(name: string, skill: Skill, skills: readonly Skill[]): string | null {
  if (!name.trim()) return 'Fill in this field.';
  if (nameTaken(name, skills, { editing: skill })) return 'You already have a skill with this name.';
  return null;
}

/** The skills with this one renamed (same id, so logs, focus sessions and goals follow it). */
export function renameSkillIn(
  skills: readonly Skill[],
  skillId: string,
  changes: { name: string; category: string },
  nowIso: string
): Skill[] {
  const skill = skills.find((s) => s && s.id === skillId);
  if (!skill) throw new Error('This skill was deleted.');
  const problem = skillNameProblem(changes.name, skill, skills);
  if (problem) throw new Error(problem);
  const name = changes.name.trim().slice(0, SKILL_NAME_MAX);
  const category = changes.category.trim().slice(0, SKILL_CATEGORY_MAX) || undefined;
  if (name === skill.name && category === (skill.category?.trim() || undefined)) return skills as Skill[];
  return skills.map((s) => (s.id === skillId ? { ...s, name, category, updatedAt: nowIso } : s));
}

// ── Workouts ──────────────────────────────────────────────────────────────────────────────────

/** A workout's saved fields from what the Log workout form gives (the one rule for log and edit). */
export function workoutFields(
  type: string,
  durationMinutes: number,
  amount?: number,
  unit?: string
): Pick<WorkoutLog, 'type' | 'durationMinutes' | 'amount' | 'unit'> {
  const normalizedUnit = (unit || 'mins').trim().toLowerCase();
  const safeDurationMinutes = Math.max(0, Number(durationMinutes) || 0);
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? Math.max(0, Number(amount)) : undefined;
  const savedDuration = normalizedUnit === 'mins' ? (safeAmount !== undefined && safeAmount > 0 ? safeAmount : safeDurationMinutes) : 0;
  return {
    type: type.trim() || 'General Workout',
    durationMinutes: savedDuration,
    amount: safeAmount !== undefined ? safeAmount : normalizedUnit === 'mins' ? safeDurationMinutes : undefined,
    unit: normalizedUnit,
  };
}

export const WORKOUT_PAST_DAY_MESSAGE = "Only today's workouts can change.";

/**
 * The workouts with today's workout `workoutId` changed (id, date and createdAt stay). Throws on
 * any other day: the server refuses those edits without a word, so the devices would differ.
 */
export function editWorkoutIn(
  workouts: readonly WorkoutLog[],
  workoutId: string,
  fields: Pick<WorkoutLog, 'type' | 'durationMinutes' | 'amount' | 'unit'>,
  today: string
): WorkoutLog[] {
  const target = workouts.find((w) => w && w.id === workoutId);
  if (!target) throw new Error('This workout was deleted.');
  if (target.date !== today) throw new Error(WORKOUT_PAST_DAY_MESSAGE);
  return workouts.map((w) => (w.id === workoutId ? { ...w, ...fields } : w));
}

// ── Recovery tracker ──────────────────────────────────────────────────────────────────────────

/** The tracker with a new title; start date, milestones and awards stay exactly as they are. */
export function renameTracker(tracker: AddictionTracker, title: string): AddictionTracker {
  const next = tidy(title).slice(0, TRACKER_TITLE_MAX);
  if (!next) throw new Error('Fill in this field.');
  return next === tracker.title ? tracker : { ...tracker, title: next };
}

// ── Subtasks ──────────────────────────────────────────────────────────────────────────────────

/** Why this subtask can't take this title, or null. Keeping its own title is always fine. */
export function subtaskTitleProblem(title: string, task: Task, subtaskId: string): string | null {
  if (!title.trim()) return 'Fill in this field.';
  const subtasks = task.subtasks || [];
  const editing = subtasks.find((st) => st.id === subtaskId) ?? null;
  if (nameTaken(title, subtasks, { editing, nameOf: (st) => st.title })) return 'This task already has a subtask with this name.';
  return null;
}

/** The tasks with one subtask renamed; its done state and the task's stay. */
export function renameSubtaskIn(tasks: readonly Task[], taskId: string, subtaskId: string, title: string): Task[] {
  const task = tasks.find((t) => t && t.id === taskId);
  const subtask = task?.subtasks?.find((st) => st.id === subtaskId);
  if (!task || !subtask) throw new Error('This subtask was deleted.');
  const problem = subtaskTitleProblem(title, task, subtaskId);
  if (problem) throw new Error(problem);
  const next = title.trim().slice(0, SUBTASK_TITLE_MAX);
  if (next === subtask.title) return tasks as Task[];
  return tasks.map((t) =>
    t.id === taskId ? { ...t, subtasks: (t.subtasks || []).map((st) => (st.id === subtaskId ? { ...st, title: next } : st)) } : t
  );
}

// ── Habits and bad habits (custom only) ───────────────────────────────────────────────────────

const PRESET_HABIT_NAMES = PRESET_CATEGORIES.flatMap((c) => c.habits.map((h) => h.name));

/**
 * Whether this habit can be renamed at all: custom habits only (a Library habit's points are
 * keyed by its exact name on the server), never the Reading habit.
 */
export function canRenameHabit(habit: Habit): boolean {
  return !habit.isPreset && !habit.isSystemLinked && habit.linkedModule !== 'reading';
}

/** Running partner challenges link to a habit by its name, so a linked habit keeps its name. */
export const HABIT_PACT_RENAME_MESSAGE = 'A running partner challenge uses this name. Rename it after the challenge ends.';

/**
 * Why this habit can't take this name, or null. `runningPacts` = running challenges this habit
 * ticks now. Keeping its own name is always fine (an old duplicate can still be opened and saved).
 */
export function habitNameProblem(name: string, habit: Habit, habits: readonly Habit[], runningPacts: number): string | null {
  if (!canRenameHabit(habit)) return "Library habits can't be renamed.";
  if (!name.trim()) return 'Fill in this field.';
  if (sameName(name, habit.name)) return null;
  if (runningPacts > 0) return HABIT_PACT_RENAME_MESSAGE;
  if (nameTaken(name, habits, { editing: habit })) return 'You already have a habit with this name.';
  if (PRESET_HABIT_NAMES.some((preset) => sameName(preset, name))) return 'That habit is in the Library. Add it from there to earn its points.';
  return null;
}

/** The habits with this custom habit renamed (frequency, completions and points stay). */
export function renameHabitIn(habits: readonly Habit[], habitId: string, name: string, runningPacts: number, nowIso: string): Habit[] {
  const habit = habits.find((h) => h && h.id === habitId);
  if (!habit) throw new Error('This habit was deleted.');
  const problem = habitNameProblem(name, habit, habits, runningPacts);
  if (problem) throw new Error(problem);
  const next = name.trim().slice(0, HABIT_NAME_MAX);
  if (next === habit.name) return habits as Habit[];
  return habits.map((h) => (h.id === habitId ? { ...h, name: next, updatedAt: nowIso } : h));
}

/** Whether this bad habit can be renamed: custom only (Library resist points are keyed by name). */
export function canRenameBadHabit(badHabit: BadHabit): boolean {
  return badHabit.isPreset !== true;
}

/** Why this bad habit can't take this name, or null. `active` = the bad habits shown on the page. */
export function badHabitNameProblem(name: string, badHabit: BadHabit, active: readonly BadHabit[], runningPacts: number): string | null {
  if (!canRenameBadHabit(badHabit)) return "Library bad habits can't be renamed.";
  if (!name.trim()) return 'Fill in this field.';
  if (sameName(name, badHabit.name)) return null;
  if (runningPacts > 0) return HABIT_PACT_RENAME_MESSAGE;
  if (nameTaken(name, active, { editing: badHabit })) return 'You already have a bad habit with this name.';
  if (PRESET_BAD_HABITS.some((preset) => sameName(preset.name, name))) return 'That bad habit is in the Library. Add it from there to earn its points.';
  return null;
}

/** The bad habits with this custom one renamed (logs follow it by id). */
export function renameBadHabitIn(
  badHabits: readonly BadHabit[],
  badHabitId: string,
  name: string,
  active: readonly BadHabit[],
  runningPacts: number
): BadHabit[] {
  const badHabit = badHabits.find((b) => b && b.id === badHabitId);
  if (!badHabit) throw new Error('This bad habit was deleted.');
  const problem = badHabitNameProblem(name, badHabit, active, runningPacts);
  if (problem) throw new Error(problem);
  const next = name.trim().slice(0, HABIT_NAME_MAX);
  if (next === badHabit.name) return badHabits as BadHabit[];
  return badHabits.map((b) => (b.id === badHabitId ? { ...b, name: next } : b));
}
