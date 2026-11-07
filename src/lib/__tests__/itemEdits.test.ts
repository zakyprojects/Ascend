// Fixtures for edits of existing items (Zakria 2026-11-07): skill rename + category, today's
// workout, recovery tracker title (never a reset), subtask title, custom habit / bad habit rename
// (Library ones refused, a habit a running partner challenge links to keeps its name).
import { DEFAULT_STATE, type AppState, type AddictionTracker, type BadHabit, type Habit, type SharedChallenge, type Skill, type Task, type WorkoutLog } from '@/types';
import {
  HABIT_PACT_RENAME_MESSAGE,
  WORKOUT_PAST_DAY_MESSAGE,
  badHabitNameProblem,
  canRenameBadHabit,
  canRenameHabit,
  editWorkoutIn,
  habitNameProblem,
  renameBadHabitIn,
  renameHabitIn,
  renameSkillIn,
  renameSubtaskIn,
  renameTracker,
  skillNameProblem,
  subtaskTitleProblem,
  workoutFields,
} from '../itemEdits';
import { computeWorkoutAwards } from '../workoutAwards';
import { runningPactsLinkedTo, runningPactsLinkedToBadHabit } from '../store';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
function throwsWith(fn: () => unknown, message: string, msg: string) {
  try {
    fn();
  } catch (err) {
    assert((err as Error).message === message, `${msg}: got "${(err as Error).message}"`);
    return;
  }
  throw new Error(`Assertion failed: ${msg}: did not throw`);
}

const NOW = '2026-11-07T10:00:00.000Z';

// --- Skills -------------------------------------------------------------------------------------
{
  const skills: Skill[] = [
    { id: 's1', name: 'Guitar', category: 'Music', createdAt: 'x', drills: [{ id: 'd1', name: 'Chords', unit: 'reps', createdAt: 'x' } as never] },
    { id: 's2', name: 'Spanish', createdAt: 'x' },
  ];
  assert(skillNameProblem('  guitar ', skills[0], skills) === null, 'own name in another case is fine');
  assert(skillNameProblem('SPANISH', skills[0], skills) === 'You already have a skill with this name.', 'taken name refused (case)');
  assert(skillNameProblem('  Spanish  ', skills[0], skills) === 'You already have a skill with this name.', 'taken name refused (spaces)');
  assert(skillNameProblem('   ', skills[0], skills) === 'Fill in this field.', 'empty refused');
  const out = renameSkillIn(skills, 's1', { name: ' Electric guitar ', category: '  ' }, NOW);
  assert(out[0].id === 's1' && out[0].name === 'Electric guitar', 'same id, new trimmed name');
  assert(out[0].category === undefined, 'cleared category');
  assert(out[0].updatedAt === NOW, 'updatedAt stamped');
  assert(out[0].drills === skills[0].drills, 'drills untouched');
  assert(out[1] === skills[1], 'other skill untouched');
  assert(renameSkillIn(skills, 's1', { name: 'Guitar', category: 'Music' }, NOW) === skills, 'no change = same array');
  throwsWith(() => renameSkillIn(skills, 's1', { name: 'spanish', category: '' }, NOW), 'You already have a skill with this name.', 'store refuses taken');
  throwsWith(() => renameSkillIn(skills, 'gone', { name: 'X', category: '' }, NOW), 'This skill was deleted.', 'deleted skill');
  // Old duplicates can still be edited.
  const dup: Skill[] = [{ id: 'a', name: 'Chess', createdAt: 'x' }, { id: 'b', name: 'chess', createdAt: 'x' }];
  assert(renameSkillIn(dup, 'b', { name: 'chess', category: 'Games' }, NOW)[1].category === 'Games', 'old duplicate keeps its name, edits category');
}

// --- Workouts: today only, same field rule as logging, points recomputed ------------------------
{
  const f = workoutFields(' Running ', 30, 45, 'MINS');
  assert(f.type === 'Running' && f.durationMinutes === 45 && f.amount === 45 && f.unit === 'mins', 'minutes: amount wins');
  const r = workoutFields('Push-ups', 0, 50, 'reps');
  assert(r.durationMinutes === 0 && r.amount === 50 && r.unit === 'reps', 'reps: no minutes');
  assert(workoutFields('  ', 10).type === 'General Workout', 'blank type');

  const TODAY = '2026-11-07';
  const w = (id: string, date: string, mins: number): WorkoutLog => ({
    id, date, type: 'Running', durationMinutes: mins, amount: mins, unit: 'mins', pointsAwarded: 0, createdAt: 'c-' + id,
  });
  const list = [w('t1', TODAY, 30), w('y1', '2026-11-06', 30)];
  const edited = editWorkoutIn(list, 't1', workoutFields('Cycling', 60, 60, 'mins'), TODAY);
  assert(edited[0].id === 't1' && edited[0].date === TODAY && edited[0].createdAt === 'c-t1', 'id, date, createdAt kept');
  assert(edited[0].type === 'Cycling' && edited[0].durationMinutes === 60, 'fields changed');
  assert(edited[1] === list[1], 'yesterday untouched');
  throwsWith(() => editWorkoutIn(list, 'y1', workoutFields('Cycling', 60, 60, 'mins'), TODAY), WORKOUT_PAST_DAY_MESSAGE, 'past day refused');
  // Opened before midnight, saved after: the same log is now "yesterday".
  throwsWith(() => editWorkoutIn(list, 't1', workoutFields('Cycling', 60, 60, 'mins'), '2026-11-08'), WORKOUT_PAST_DAY_MESSAGE, 'midnight crossing refused');
  throwsWith(() => editWorkoutIn(list, 'gone', workoutFields('X', 1), TODAY), 'This workout was deleted.', 'deleted workout');

  // Today's award follows the edit through the same rule the server uses (raise and lower).
  const dayStart = new Date(`${TODAY}T00:00:00`).getTime();
  const at = dayStart + 20 * 3600_000;
  const before = computeWorkoutAwards(list, TODAY, dayStart, at, undefined).entry?.amount ?? 0;
  const after = computeWorkoutAwards(edited, TODAY, dayStart, at, undefined).entry?.amount ?? 0;
  assert(after >= before, `raising minutes never lowers today's award (${before} -> ${after})`);
  const lowered = editWorkoutIn(list, 't1', workoutFields('Running', 5, 5, 'mins'), TODAY);
  const low = computeWorkoutAwards(lowered, TODAY, dayStart, at, undefined).entry?.amount ?? 0;
  assert(low <= before, `lowering minutes never raises today's award (${before} -> ${low})`);
}

// --- Recovery tracker: rename keeps the start date ----------------------------------------------
{
  const tracker: AddictionTracker = {
    id: 'r1',
    title: 'Sobriety',
    startDate: '2026-10-01T08:00:00.000Z',
    milestonesUnlocked: ['1w', '1m'],
    awardedMilestones: [{ id: 'a1' } as never],
    revokedAwardIds: ['old'],
    createdAt: '2026-10-01T08:00:00.000Z',
  };
  const out = renameTracker(tracker, '  No   smoking ');
  assert(out.title === 'No smoking', 'title tidied');
  assert(out.startDate === tracker.startDate, 'start date preserved (no reset)');
  assert(out.id === tracker.id && out.createdAt === tracker.createdAt, 'id + createdAt preserved');
  assert(out.milestonesUnlocked === tracker.milestonesUnlocked && out.awardedMilestones === tracker.awardedMilestones, 'milestones preserved');
  assert(out.revokedAwardIds === tracker.revokedAwardIds, 'revoked ids preserved');
  assert(renameTracker(tracker, 'Sobriety') === tracker, 'same title = same object');
  throwsWith(() => renameTracker(tracker, '   '), 'Fill in this field.', 'empty title refused');
}

// --- Subtasks -------------------------------------------------------------------------------------
{
  const task: Task = {
    id: 't', title: 'Thesis', completed: false, priority: 'medium', createdAt: 'x',
    subtasks: [
      { id: 'a', title: 'Outline', completed: true },
      { id: 'b', title: 'Draft', completed: false },
      { id: 'c', title: 'draft', completed: false }, // old duplicate
    ],
  } as Task;
  const tasks = [task, { ...task, id: 'other' }];
  assert(subtaskTitleProblem('DRAFT', task, 'a') === 'This task already has a subtask with this name.', 'taken title refused');
  assert(subtaskTitleProblem('draft', task, 'c') === null, 'old duplicate keeps its own title');
  assert(subtaskTitleProblem('  ', task, 'a') === 'Fill in this field.', 'empty refused');
  const out = renameSubtaskIn(tasks, 't', 'a', ' Outline v2 ');
  assert(out[0].subtasks![0].title === 'Outline v2' && out[0].subtasks![0].completed === true, 'renamed, still done');
  assert(out[0].completed === false, 'task done state unchanged');
  assert(out[1] === tasks[1], 'other task untouched');
  assert(renameSubtaskIn(tasks, 't', 'a', 'Outline') === tasks, 'no change = same array');
  throwsWith(() => renameSubtaskIn(tasks, 't', 'zz', 'X'), 'This subtask was deleted.', 'deleted subtask');
}

// --- Habits: custom only, never Reading, blocked by a running challenge ------------------------
{
  const habit = (id: string, name: string, extra: Partial<Habit> = {}): Habit => ({
    id, name, frequency: 'daily', points: 1, isPreset: false, createdAt: 'x', completions: {}, createdAtPeriod: '2026-11-01', ...extra,
  });
  const custom = habit('h1', 'Call mom');
  const preset = habit('h2', 'Meditation', { isPreset: true, points: 2 });
  const reading = habit('h3', 'Reading (Books)', { isSystemLinked: true, linkedModule: 'reading' });
  const other = habit('h4', 'Journal at night');
  const habits = [custom, preset, reading, other];
  assert(canRenameHabit(custom) && !canRenameHabit(preset) && !canRenameHabit(reading), 'custom only, never Library or Reading');
  assert(habitNameProblem('Call dad', preset, habits, 0) === "Library habits can't be renamed.", 'Library refused');
  assert(habitNameProblem('Call dad', reading, habits, 0) === "Library habits can't be renamed.", 'Reading refused');
  assert(habitNameProblem('journal AT night', custom, habits, 0) === 'You already have a habit with this name.', 'taken refused');
  assert(habitNameProblem('cold  SHOWER', custom, habits, 0) === 'That habit is in the Library. Add it from there to earn its points.', 'Library name refused');
  assert(habitNameProblem('Call dad', custom, habits, 1) === HABIT_PACT_RENAME_MESSAGE, 'running challenge blocks rename');
  assert(habitNameProblem('call MOM', custom, habits, 1) === null, 'same name (case) is fine even while linked');
  assert(habitNameProblem('Call dad', custom, habits, 0) === null, 'free name ok');
  const out = renameHabitIn(habits, 'h1', ' Call dad ', 0, NOW);
  assert(out[0].name === 'Call dad' && out[0].updatedAt === NOW, 'renamed + stamped');
  assert(out[0].isPreset === false && out[0].points === 1 && out[0].frequency === 'daily', 'points, kind and frequency unchanged');
  assert(out[0].completions === custom.completions, 'completions unchanged');
  throwsWith(() => renameHabitIn(habits, 'h1', 'Call dad', 2, NOW), HABIT_PACT_RENAME_MESSAGE, 'store blocks linked');
  throwsWith(() => renameHabitIn(habits, 'h2', 'X', 0, NOW), "Library habits can't be renamed.", 'store blocks preset');
}

// --- Bad habits: custom only ---------------------------------------------------------------------
{
  const custom: BadHabit = { id: 'b1', name: 'Nail biting', createdAt: 'x' };
  const preset: BadHabit = { id: 'b2', name: 'Doomscrolling', isPreset: true, createdAt: 'x' };
  const done: BadHabit = { id: 'b3', name: 'Soda', isCompleted: true, createdAt: 'x' };
  const all = [custom, preset, done];
  const active = [custom, preset];
  assert(canRenameBadHabit(custom) && !canRenameBadHabit(preset), 'custom only');
  assert(badHabitNameProblem('X', preset, active, 0) === "Library bad habits can't be renamed.", 'Library refused');
  assert(badHabitNameProblem('doomscrolling', custom, active, 0) === 'You already have a bad habit with this name.', 'taken refused');
  assert(badHabitNameProblem('Porn', custom, active, 0) === 'That bad habit is in the Library. Add it from there to earn its points.', 'Library name refused');
  assert(badHabitNameProblem('soda', custom, active, 0) === null, 'a finished one does not block the name (same list as Add)');
  assert(badHabitNameProblem('Skin picking', custom, active, 1) === HABIT_PACT_RENAME_MESSAGE, 'running resist challenge blocks rename');
  const out = renameBadHabitIn(all, 'b1', ' Skin picking ', active, 0);
  assert(out[0].name === 'Skin picking' && out[0].isPreset === undefined, 'renamed, still custom');
  assert(out[1] === preset && out[2] === done, 'others untouched');
}

// --- The store's challenge count feeds the block (custom habit linked by name to a running pact) --
{
  const habit: Habit = {
    id: 'h1', name: 'Call mom', frequency: 'daily', points: 1, isPreset: false, createdAt: 'x', completions: {}, createdAtPeriod: '2026-11-01',
  };
  const bad: BadHabit = { id: 'b1', name: 'Nail biting', createdAt: 'x' };
  const partnership = { id: 'p1', user1Id: 'me', user1Username: 'me', user2Id: 'you', user2Username: 'you', pairedAt: 'x' };
  const pact = (extra: Partial<SharedChallenge>): SharedChallenge => ({
    id: 'c1', partnershipId: 'p1', title: 'Call mom', targetHabitName: 'Call mom', durationDays: 7, jointStreak: 0,
    user1Category: 'habit', user1Target: 'call MOM', user2Category: 'habit', user2Target: 'Run', status: 'active', createdAt: 'x', ...extra,
  });
  const state = (challenges: SharedChallenge[]): AppState =>
    ({ ...DEFAULT_STATE, currentUser: { id: 'me' } as AppState['currentUser'], username: 'me', partnerships: [partnership], partnership, habits: [habit], badHabits: [bad], sharedChallenges: challenges }) as AppState;
  const linked = state([pact({})]);
  assert(runningPactsLinkedTo(linked, habit) === 1, 'running pact on my side links by name');
  throwsWith(() => renameHabitIn(linked.habits, 'h1', 'Call dad', runningPactsLinkedTo(linked, habit), NOW), HABIT_PACT_RENAME_MESSAGE, 'store path blocks rename');
  const finished = state([pact({ status: 'completed' })]);
  assert(runningPactsLinkedTo(finished, habit) === 0, 'finished pact does not block');
  assert(renameHabitIn(finished.habits, 'h1', 'Call dad', 0, NOW)[0].name === 'Call dad', 'rename after the pact ends');
  const partnerSide = state([pact({ user1Target: 'Run', user2Target: 'Call mom' })]);
  assert(runningPactsLinkedTo(partnerSide, habit) === 0, "the partner's side using the name does not block mine");
  const resist = state([pact({ user1Category: 'bad_habit', user1Target: 'Nail biting', user2Category: 'bad_habit', user2Target: 'Soda' })]);
  assert(runningPactsLinkedToBadHabit(resist, bad) === 1, 'running resist pact links the bad habit');
  throwsWith(() => renameBadHabitIn(resist.badHabits, 'b1', 'Skin picking', [bad], runningPactsLinkedToBadHabit(resist, bad)), HABIT_PACT_RENAME_MESSAGE, 'resist pact blocks bad habit rename');
}

console.log('itemEdits fixtures passed');
