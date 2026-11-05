import type { AppState, Habit, MemberCard, MemberCardExercise, UserStats } from '@/types';
import { addDays, localDayStartMs, parseDate, todayKey, weekKey } from './dates';
import { calculateUnifiedStreak } from './streakLogic';
import { workoutAmountOf, workoutMeasureOf, workoutTypeKey } from './workoutTypes';

/**
 * The stats a member publishes in profiles.stats (other members read them through
 * ascend_member_profiles) and the viewer's own card in Leagues. One builder for both writers
 * (supabase.ts writeProfileFromState, store.ts getLeagueData), so what others see and the own card
 * never drift. Display only: points, ranks and the ledger never read it.
 */

/** Length of the card window, in the member's local days. */
export const MEMBER_CARD_DAYS = 30;
const TOP_EXERCISES = 3;
const NAME_MAX = 40;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_KEY = /^\d{4}-W\d{2}$/;
const DAY_MS = 86_400_000;

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

/** Everything profiles.stats holds: the older lifetime keys (still read by app versions before the card) plus the card. */
export type MemberStats = UserStats & {
  lastActiveDate: string | null;
  habitsCompletedTodayCount: number;
  card: MemberCard;
};

type Source = Partial<AppState>;

const isDone = (habit: Habit, key: string): boolean => {
  const completions = habit.completions as Habit['completions'] | string[] | undefined;
  // Legacy accounts stored completions as an array of keys (store.isHabitDone handles both).
  return Array.isArray(completions) ? completions.includes(key) : completions?.[key]?.done === true;
};

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const dayCount = (from: string, to: string): number => Math.round((localDayStartMs(to) - localDayStartMs(from)) / DAY_MS) + 1;
const dayOf = (value: string | undefined): string | null => {
  if (!value) return null;
  if (DAY_KEY.test(value)) return value;
  const date = parseDate(value);
  return date ? todayKey(date) : null;
};

/** The card: last-30-days figures per module in each module's own unit. Pure. */
export function buildMemberCard(st: Source, clock: MemberStatsClock): MemberCard {
  const { today } = clock;
  const windowStart = addDays(today, -(MEMBER_CARD_DAYS - 1));
  const inWindow = (day: string | null | undefined): day is string => !!day && day >= windowStart && day <= today;
  const windowDays: string[] = [];
  for (let d = windowStart; d <= today; d = addDays(d, 1)) windowDays.push(d);

  const active = new Set<string>();
  const card: MemberCard = { v: 1, asOf: today, days: MEMBER_CARD_DAYS, active: 0 };

  // Habits: share of check-ins done. A daily habit is due each day from its creation; a weekly one
  // each week. Today (this week) counts only once done, so an unticked morning is never a miss.
  const habits = st.habits || [];
  if (habits.length > 0) {
    const thisWeek = weekKey(parseDate(today) ?? undefined);
    let done = 0;
    let due = 0;
    for (const habit of habits) {
      const created = habit.createdAtPeriod || '';
      if (habit.frequency === 'weekly') {
        const createdWeek = WEEK_KEY.test(created) ? created : DAY_KEY.test(created) ? weekKey(parseDate(created)!) : '';
        const weeks = [...new Set(windowDays.map((d) => weekKey(parseDate(d)!)))];
        for (const week of weeks) {
          if (createdWeek && week < createdWeek) continue;
          if (isDone(habit, week)) {
            done++;
            due++;
            const tickedOn = dayOf((habit.completions as Habit['completions'])?.[week]?.updatedAt);
            if (inWindow(tickedOn)) active.add(tickedOn);
          } else if (week !== thisWeek) {
            due++;
          }
        }
      } else {
        const from = DAY_KEY.test(created) && created > windowStart ? created : windowStart;
        for (const day of windowDays) {
          if (day < from) continue;
          if (isDone(habit, day)) {
            done++;
            due++;
            active.add(day);
          } else if (day !== today) {
            due++;
          }
        }
      }
    }
    card.habits = { done, due };
  }

  // Exercise: one row per exercise and unit (reps are never added to minutes), ranked by days done.
  const workouts = st.workouts || [];
  if (workouts.length > 0) {
    type Group = MemberCardExercise & { perDay: Map<string, number>; sessions: number; newest: string };
    const groups = new Map<string, Group>();
    for (const w of workouts) {
      if (!w || !inWindow(w.date)) continue;
      active.add(w.date);
      const unit = workoutMeasureOf(w);
      const key = `${workoutTypeKey(w.type)}|${unit}`;
      const stamp = `${w.date}|${w.createdAt || ''}`;
      const name = (w.type || '').trim() || 'Workout';
      let group = groups.get(key);
      if (!group) {
        group = { name, unit, total: 0, days: 0, best: 0, perDay: new Map(), sessions: 0, newest: stamp };
        groups.set(key, group);
      }
      const amount = finite(workoutAmountOf(w));
      group.total += amount;
      group.sessions++;
      group.perDay.set(w.date, (group.perDay.get(w.date) || 0) + amount);
      if (stamp >= group.newest) {
        group.newest = stamp;
        group.name = name;
      }
    }
    card.exercise = [...groups.values()]
      .map((g) => ({ ...g, days: g.perDay.size, best: Math.max(...g.perDay.values()) }))
      .sort((a, b) => b.days - a.days || b.sessions - a.sessions || b.newest.localeCompare(a.newest))
      .slice(0, TOP_EXERCISES)
      .map(({ name, unit, total, days, best }) => ({ name: name.slice(0, NAME_MAX), unit, total: round2(total), days, best: round2(best) }));
  }

  // Skills: practice time and days only. Skill names stay private.
  if ((st.skills || []).length > 0 || (st.skillLogs || []).length > 0) {
    let minutes = 0;
    const days = new Set<string>();
    for (const log of st.skillLogs || []) {
      if (!log || !inWindow(log.date)) continue;
      minutes += finite(log.durationMinutes);
      days.add(log.date);
      active.add(log.date);
    }
    card.skills = { minutes: Math.round(minutes), days: days.size };
  }

  // Reading: days read (Finish logs count as a reading day, as on the Reading page), books finished
  // this season, and pages only when every page log was for a book counted in pages.
  const books = st.libraryBooks || [];
  const readingLogs = st.readingLogs || [];
  if (books.length > 0 || readingLogs.length > 0) {
    const days = new Set<string>();
    let pages = 0;
    let pagesOnly = true;
    let pageLogs = 0;
    for (const log of readingLogs) {
      if (!log || !inWindow(log.date)) continue;
      days.add(log.date);
      active.add(log.date);
      if (log.finish) continue;
      pageLogs++;
      const book = books.find((b) => !!log.bookId && (b.id === log.bookId || b.linkedBookId === log.bookId));
      const unit = String(book?.unit || 'pages').toLowerCase();
      if (!book || unit !== 'pages') pagesOnly = false;
      pages += finite(log.pagesRead);
    }
    const booksThisSeason = books.filter((b) => {
      if (b.status !== 'completed' && !b.isFinished) return false;
      const at = parseDate(b.completedAt || b.dateCompleted);
      return !!at && at.getTime() >= clock.seasonStartMs;
    }).length;
    card.reading = { days: days.size, booksThisSeason };
    if (pagesOnly && pageLogs > 0) card.reading.pages = Math.round(pages);
  }

  // Focus (Prefrontal Cortex timer): active minutes and sessions.
  if ((st.focusLogs || []).length > 0) {
    let minutes = 0;
    let sessions = 0;
    for (const log of st.focusLogs || []) {
      if (!log || !inWindow(log.date)) continue;
      minutes += finite(log.durationMinutes);
      sessions++;
      active.add(log.date);
    }
    card.focus = { minutes: Math.round(minutes), sessions };
  }

  // Journal: days written only. Never content or mood.
  if ((st.journalEntries || []).length > 0) {
    const days = new Set<string>();
    for (const entry of st.journalEntries || []) {
      if (!entry || !inWindow(entry.date)) continue;
      days.add(entry.date);
      active.add(entry.date);
    }
    card.journal = { days: days.size };
  }

  // A member younger than the window counts days from joining (or their first log, if earlier).
  const joined = dayOf(st.currentUser?.createdAt);
  if (joined && joined > windowStart) {
    const first = [joined, ...active].sort()[0];
    card.days = Math.min(MEMBER_CARD_DAYS, Math.max(1, dayCount(first, today)));
  }
  card.active = active.size;
  return card;
}

/** The full profiles.stats object: streak, the lifetime keys older app versions read, and the card. */
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
    card: buildMemberCard(st, clock),
  };
}

const UNITS: ReadonlyArray<MemberCardExercise['unit']> = ['mins', 'reps', 'sets', 'km'];

/** A whole count >= 0 from untrusted JSON, else 0. */
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
/** An amount >= 0 from untrusted JSON (2 decimals), else 0. */
const amount = (n: unknown): number => round2(finite(n));
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * A card read from another member's profiles.stats: only the known keys, numbers clamped, names
 * capped. Undefined when there is none (an app version before the card) or it is not version 1.
 */
export function toMemberCard(raw: unknown): MemberCard | undefined {
  const c = obj(raw);
  if (!c || c.v !== 1 || typeof c.asOf !== 'string' || !DAY_KEY.test(c.asOf)) return undefined;
  const days = Math.min(MEMBER_CARD_DAYS, Math.max(1, count(c.days) || MEMBER_CARD_DAYS));
  const card: MemberCard = { v: 1, asOf: c.asOf, days, active: Math.min(days, count(c.active)) };
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
    if (typeof reading.pages === 'number') card.reading.pages = count(reading.pages);
  }
  const focus = obj(c.focus);
  if (focus) card.focus = { minutes: count(focus.minutes), sessions: count(focus.sessions) };
  const journal = obj(c.journal);
  if (journal) card.journal = { days: Math.min(days, count(journal.days)) };
  return card;
}
