import type { AppState, Habit } from '@/types';
import type { View } from '@/lib/views';
import { todayKey } from '@/lib/dates';
import { dayProgress } from '@/lib/timeTracker';
import { getActiveBadHabitsOrdered } from '@/lib/badHabitEligibility';
import { trustedNow } from './clock';

/** done = today's part is finished; pending = still open; risk = still open late in the day. */
export type NavStatusTone = 'done' | 'pending' | 'risk';

export interface NavStatus {
  tone: NavStatusTone;
  /** Short mono note beside the page name ("2 left", "3/5"). */
  meta?: string;
  /** Spoken to screen readers after the page name. */
  label: string;
}

export type NavStatuses = Partial<Record<View, NavStatus>>;

/** From this hour, a daily item still open turns to risk (its day is about to close). */
const RISK_HOUR = 20;

/**
 * Today's status for each page that has a clear daily task. Pages without one get no entry
 * (no status is better than a made-up one). Pure and computed on every render, never cached.
 */
export function getNavStatuses(state: AppState, isHabitDone: (habit: Habit) => boolean, now: Date = trustedNow()): NavStatuses {
  const today = todayKey(now);
  const late = now.getHours() >= RISK_HOUR;
  const statuses: NavStatuses = {};

  // Habits: every habit done for its current period (daily: today, weekly: this week).
  const habits = state.habits ?? [];
  if (habits.length > 0) {
    const open = habits.filter((h) => !isHabitDone(h));
    if (open.length === 0) {
      statuses.habits = { tone: 'done', meta: `${habits.length}/${habits.length}`, label: 'all habits done' };
    } else {
      const dailyOpen = open.some((h) => h.frequency === 'daily');
      statuses.habits = {
        tone: late && dailyOpen ? 'risk' : 'pending',
        meta: `${open.length} left`,
        // Counts weekly habits still open this week too, so no "today".
        label: `${open.length} ${open.length === 1 ? 'habit' : 'habits'} left`,
      };
    }
  }

  // Bad habits: every active one reported (resisted or occurred) for today.
  const activeBad = getActiveBadHabitsOrdered(state.badHabits ?? []);
  if (activeBad.length > 0) {
    const reported = new Set(
      (state.badHabitLogs ?? []).filter((l) => l.date === today && l.status !== 'no_report').map((l) => l.badHabitId)
    );
    const unreported = activeBad.filter((h) => !reported.has(h.id)).length;
    statuses['bad-habits'] =
      unreported === 0
        ? { tone: 'done', label: 'all reported today' }
        : { tone: late ? 'risk' : 'pending', meta: `${unreported} to report`, label: `${unreported} to report today` };
  }

  // Journal: today's entry saved.
  const journalDone = (state.journalEntries ?? []).some((e) => e.date === today);
  statuses.journal = journalDone
    ? { tone: 'done', label: "today's entry written" }
    : { tone: late ? 'risk' : 'pending', label: "today's entry not written yet" };

  // Time tracker: today's blocks resolved (completed or skipped).
  const blocks = state.timeTracker?.dailyLogs?.[today] ?? [];
  if (blocks.length > 0) {
    const day = dayProgress(blocks);
    statuses['time-tracker'] = {
      tone: day.open === 0 ? 'done' : 'pending',
      meta: `${day.done}/${day.total}`,
      label: `${day.done} done${day.skipped > 0 ? `, ${day.skipped} skipped` : ''} of ${day.total} blocks today`,
    };
  }

  // Exercise: a workout logged today (there is no daily target, so no open state).
  if ((state.workouts ?? []).some((w) => w.date === today)) {
    statuses.exercise = { tone: 'done', label: 'workout logged today' };
  }

  // Reading: pages logged today; open only while a book is being read.
  if ((state.readingLogs ?? []).some((l) => l.date === today && l.pagesRead > 0)) {
    statuses.reading = { tone: 'done', label: 'read today' };
  } else if ((state.libraryBooks ?? []).some((b) => b.status === 'reading')) {
    statuses.reading = { tone: 'pending', label: 'not read today' };
  }

  // Skills: a practice session logged today; open once a skill exists.
  if ((state.skillLogs ?? []).some((l) => l.date === today)) {
    statuses.skills = { tone: 'done', label: 'practised today' };
  } else if ((state.skills ?? []).length > 0) {
    statuses.skills = { tone: 'pending', label: 'not practised today' };
  }

  return statuses;
}
