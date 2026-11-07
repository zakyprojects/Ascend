import type { AppState, Habit, MemberCard, MemberCardExercise, UserStats } from '@/types';
import { calculateUnifiedStreak } from './streakLogic';

/**
 * profiles.stats (the legacy keys app versions in production read) and the reader of the member card
 * the server builds for the current season (ascend_member_card). Display only: points, ranks and the
 * ledger never read either.
 */

const TOP_EXERCISES = 3;
const NAME_MAX = 40;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The moments the builder needs, passed in (never read inside) so tests can fix them and personal
 * time never shares a value with league time.
 */
export interface MemberStatsClock {
  /** The member's local day (todayKey()). */
  today: string;
  /** Start of the current season in UTC ms (getSeasonStart(leagueNow())). */
  seasonStartMs: number;
}

/**
 * Everything profiles.stats holds: the streak and the lifetime keys app versions in production still
 * read. No card: the card comes from the server (ascend_member_card), never from the member's app.
 */
export type MemberStats = UserStats & {
  lastActiveDate: string | null;
  habitsCompletedTodayCount: number;
};

type Source = Partial<AppState>;

const isDone = (habit: Habit, key: string): boolean => {
  const completions = habit.completions as Habit['completions'] | string[] | undefined;
  // Legacy accounts stored completions as an array of keys (store.isHabitDone handles both).
  return Array.isArray(completions) ? completions.includes(key) : completions?.[key]?.done === true;
};


/** The full profiles.stats object: streak and the lifetime keys production app versions read. */
export function buildMemberStats(st: Source, clock: MemberStatsClock): MemberStats {
  const unified = calculateUnifiedStreak(st, clock.today);
  const habits = st.habits || [];
  return {
    streakDays: unified.currentStreakDays,
    streakSource: unified.currentStreakDays > 0 ? unified.currentStreakCategory : undefined,
    currentStreakDays: unified.currentStreakDays,
    currentStreakCategory: unified.currentStreakCategory,
    currentStreakIsActive: unified.currentStreakIsActive,
    lastActiveDate: unified.lastActiveDate,
    // Lifetime keys: kept for app versions before the card (they render them). Not shown by this version.
    habitsCompletedCount: habits.reduce(
      (acc, h) =>
        acc +
        (Array.isArray(h.completions)
          ? h.completions.length
          : Object.values(h.completions || {}).filter((c) => c && c.done).length),
      0
    ),
    habitsCompletedTodayCount: habits.filter((h) => isDone(h, clock.today)).length,
    journalEntriesCount: (st.journalEntries || []).length,
    exerciseMinutes: (st.workouts || []).reduce((sum, w) => sum + (w.durationMinutes || 0), 0),
    booksRead: (st.libraryBooks || []).filter((b) => b.status === 'completed' || b.isFinished).length,
    skillsPracticedCount: (st.skillLogs || []).length,
  };
}

const UNITS: ReadonlyArray<MemberCardExercise['unit']> = ['mins', 'reps', 'sets', 'km'];

/** A number from untrusted JSON: Postgres numerics may arrive as numbers or numeric strings ("625.00"). */
const num = (n: unknown): number => {
  const v = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
};
/** A whole count >= 0, else 0. */
const count = (n: unknown): number => Math.floor(num(n));
/** An amount >= 0 with at most 2 decimals, else 0. */
const amount = (n: unknown): number => Math.round(num(n) * 100) / 100;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const instant = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/**
 * The card ascend_member_card returns (v2): only the known keys, numbers parsed and clamped, names
 * capped. Undefined for null (not shared with this viewer) or an unknown shape.
 */
export function toSeasonCard(raw: unknown): MemberCard | undefined {
  const c = obj(raw);
  if (!c || c.v !== 2 || typeof c.asOf !== 'string' || !DAY_KEY.test(c.asOf)) return undefined;
  const seasonStart = instant(c.seasonStart);
  const seasonEnd = instant(c.seasonEnd);
  if (!seasonStart || !seasonEnd) return undefined;
  const days = Math.max(1, count(c.days));
  const streak = obj(c.streak);
  const today = obj(c.today);
  const card: MemberCard = {
    v: 2,
    season: Math.max(1, count(c.season)),
    asOf: c.asOf,
    from: typeof c.from === 'string' && DAY_KEY.test(c.from) ? c.from : c.asOf,
    days,
    active: Math.min(days, count(c.active)),
    streak: {
      days: count(streak?.days),
      category: typeof streak?.category === 'string' ? streak.category.slice(0, 60) : '',
    },
    today: { habitsDone: count(today?.habitsDone) },
    seasonStart,
    seasonEnd,
  };
  const habits = obj(c.habits);
  if (habits) {
    const due = count(habits.due);
    card.habits = { done: Math.min(due, count(habits.done)), due };
  }
  if (Array.isArray(c.exercise)) {
    card.exercise = c.exercise
      .map(obj)
      .filter((e): e is Record<string, unknown> => !!e && typeof e.name === 'string' && UNITS.includes(e.unit as MemberCardExercise['unit']))
      .slice(0, TOP_EXERCISES)
      .map((e) => ({
        name: (e.name as string).trim().slice(0, NAME_MAX) || 'Workout',
        unit: e.unit as MemberCardExercise['unit'],
        total: amount(e.total),
        days: Math.min(days, count(e.days)),
        best: amount(e.best),
      }));
  }
  const skills = obj(c.skills);
  if (skills) card.skills = { minutes: count(skills.minutes), days: Math.min(days, count(skills.days)) };
  const reading = obj(c.reading);
  if (reading) {
    card.reading = { days: Math.min(days, count(reading.days)), booksThisSeason: count(reading.booksThisSeason) };
    if (reading.pages !== undefined && reading.pages !== null) card.reading.pages = count(reading.pages);
  }
  const focus = obj(c.focus);
  if (focus) card.focus = { minutes: count(focus.minutes), sessions: count(focus.sessions) };
  const journal = obj(c.journal);
  if (journal) card.journal = { days: Math.min(days, count(journal.days)) };
  return card;
}
