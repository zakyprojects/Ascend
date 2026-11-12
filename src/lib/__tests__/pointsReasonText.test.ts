// pointsReasonText (lib/pointsReasonText.ts): Ranks → Recent points shows short plain text for the
// server's reason strings (real rows from point_entries, 2026-11-10), never week keys or emoji.
const { pointsReasonText } = await import('../points/pointsReasonText');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (got: unknown, want: unknown, msg: string) =>
  assert(got === want, `${msg}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

const t = (source: string, reason: string, metadata?: Record<string, any>) => pointsReasonText({ source, reason, metadata });

eq(t('habit_completed', 'Habit completed: Sleep 7-8 hours', { habitName: 'Sleep 7-8 hours', periodKey: '2026-11-01' }), 'Habit done: Sleep 7-8 hours', 'habit done');
eq(t('habit_completed', 'Habit completed: Make your bed'), 'Habit done: Make your bed', 'habit done, name from reason');
eq(t('habit_missed', 'Missed habit (1x penalty): Wake up early', { habitName: 'Wake up early', multiplier: 1 }), 'Missed habit: Wake up early', 'missed 1x');
eq(t('habit_missed', 'Missed habit (2x penalty): Meditation', { habitName: 'Meditation', multiplier: 2 }), 'Missed habit: Meditation · 2x', 'missed 2x');
eq(t('bad_habit_no_report', 'No-report bad habit penalty (1.5x penalty): AI chatbot', { badHabitName: 'AI chatbot', multiplier: 1.5 }), 'Not logged: AI chatbot · 1.5x', 'no report');
eq(t('bad_habit_occurred', 'Bad habit occurred (1.5x penalty): Staying up late', { status: 'occurred' }), 'Slipped: Staying up late · 1.5x', 'slipped, name + multiplier from reason');
eq(t('bad_habit_occurred', 'Bad habit occurred (1x penalty): Junk food', { status: 'occurred' }), 'Slipped: Junk food', 'slipped 1x');
eq(t('bad_habit_resisted', 'Bad habit resisted: Doomscrolling', { status: 'resisted' }), 'Resisted: Doomscrolling', 'resisted');
eq(t('exercise', 'Workouts logged (2)', { workouts: 2 }), 'Exercise: 2 workouts', 'exercise');
eq(t('exercise', 'Workouts logged (1)', { workouts: 1 }), 'Exercise: 1 workout', 'exercise one');
eq(t('exercise_missed', 'Missed weekly workout goal (1/3 sessions, 1x penalty)'), 'Weekly workout goal missed: 1 of 3', 'exercise missed');
eq(t('focus', 'Focus sessions (3)', { sessions: 3 }), 'Focus: 3 sessions', 'focus');
eq(t('skill', 'Skill practice (1)', { sessions: 1 }), 'Skill practice: 1 session', 'skill');
eq(t('reading', 'Pages logged (2)', { logs: 2 }), 'Reading', 'reading');
eq(t('journal', 'Journal entry completed'), 'Journal entry', 'journal');
eq(t('time_tracker', 'Time Tracker daily routine completed (100%): 5 pts', { percentage: 100, pointsAwarded: 5 }), 'Time Tracker day: 100% done', 'time tracker');
eq(t('weekly_goal_achieved', 'Weekly goals achieved for 2026-W45 (10 pts)', { weekKey: '2026-W45' }), 'Weekly goals done · Nov 2 – 8, 2026', 'weekly goals');
eq(t('weekly_goal_achieved', 'Weekly goals achieved for 2026-W44, Season 1 (10 pts)'), 'Weekly goals done · Oct 26 – Nov 1, 2026', 'weekly goals, key from reason');
eq(t('weekly_review', 'Weekly reflection completed for 2026-W44', { weekKey: '2026-W44' }), 'Weekly reflection · Oct 26 – Nov 1, 2026', 'weekly review');
eq(t('recovery_milestone', 'Sobriety Milestone: 1 Week Clean! 🏅', { milestone: '1w' }), 'Recovery milestone: 1 week clean', 'milestone');
eq(t('recovery_milestone', 'Sobriety Milestone: 90 Days Clean! 👑', { milestone: '90d' }), 'Recovery milestone: 90 days clean', 'milestone 90d');
// Unknown or already-plain sources keep their reason, emoji dropped.
eq(t('recovery_checkin', 'Clean day check-in'), 'Clean day check-in', 'check-in');
eq(t('lesson', 'Lesson read: The 2-Minute Rule for Procrastination'), 'Lesson read: The 2-Minute Rule for Procrastination', 'lesson');
eq(t('reading_bonus', 'Book finished: Atomic Habits'), 'Book finished: Atomic Habits', 'book bonus');
eq(t('addiction_recovery', 'Sobriety milestone taken back: 1 Week Clean'), 'Sobriety milestone taken back: 1 Week Clean', 'taken back');
eq(t('something_new', 'Party time 🎉 now'), 'Party time now', 'emoji dropped in fallback');
eq(t('admin_adjustment', 'Points removed for fake entries: duplicate workout (5), journal (5)'), 'Points removed for fake entries: duplicate workout (5), journal (5)', 'admin text kept');
// No week key or text at all never throws.
eq(t('weekly_review', ''), 'Weekly reflection', 'review without key');
eq(t('habit_missed', ''), 'Missed habit', 'missed without name');

console.log('pointsReasonText: all passed');
