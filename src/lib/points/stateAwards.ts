// Points the store adds or takes back for each module (habits, bad habits, workouts, skills, focus,
// journal, reading), plus server-owned points on hydration. Pure: state in, state out (moved from store.ts).
import type { AppState, PointsEntry, LeagueArchive, Habit, BadHabit, BadHabitLog, WorkoutLog, SkillSessionLog, Skill, FocusSessionLog, JournalEntry, ReadingLog, UserBook, TimeTrackerBlock } from '@/types';
import { leagueNow, getSeasonNumber, getSeasonStart } from '../time/leagueTime';
import { calculateSeasonalTotal, getEffectiveSeasonPoints } from '../leagues/leagues';
import { timezoneWaitHoldsPreview } from '../time/useTimezoneWait';
import { computeHabitAwards, isHabitAwardEntry } from './habitAwards';
import { trustedNow } from '../time/clock';
import { addPointsInternal } from './pointsLedger';
import { computeBadHabitAwards, isBadHabitDayEntry } from './badHabitAwards';
import { computeWorkoutAwards, isWorkoutDayEntry } from './workoutAwards';
import { computeSkillAwards, isSkillDayEntry } from './skillAwards';
import { isFocusDayEntry, computeFocusAwards } from './focusAwards';
import { computeJournalAward, isJournalDayEntry } from './journalAwards';
import { computeReadingDayAward, isReadingDayEntry } from './readingAwards';
import { timeTrackerGraceDay } from './timeTrackerAwards';
import { todayKey } from '../time/dates';
import { lastBlockOfDay } from '../timeTracker/timeTracker';

export function excisePointsEntriesInternal(
  prev: AppState,
  matcher: (entry: PointsEntry) => boolean,
  maxExciseCount: number = Infinity
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> & {
  excisedEntryIds: string[];
} {
  const now = leagueNow();
  const activeSeasonNumber = getSeasonNumber(now);
  const activeSeasonStart = getSeasonStart(now);

  let seasonId = typeof prev.seasonId === 'number' ? prev.seasonId : 1;
  const leagueArchives: LeagueArchive[] = prev.leagueArchives ? [...prev.leagueArchives] : [];

  // Season Rollover Check (the closing season's archive comes from the server)
  if (seasonId < activeSeasonNumber) {
    seasonId = activeSeasonNumber;
  }

  const excisedEntryIds: string[] = [];
  const keptHistory: PointsEntry[] = [];
  let excisedCount = 0;

  for (const entry of prev.pointsHistory || []) {
    if (excisedCount < maxExciseCount && matcher(entry)) {
      if (entry.id) {
        excisedEntryIds.push(entry.id);
      }
      excisedCount++;
    } else {
      keptHistory.push(entry);
    }
  }

  const newSeasonPoints = calculateSeasonalTotal(keptHistory, activeSeasonStart);

  return {
    seasonId,
    seasonPoints: newSeasonPoints,
    totalPoints: newSeasonPoints,
    pointsHistory: keptHistory,
    leagueArchives,
    excisedEntryIds,
  };
}

export function withHydratedPoints(merged: AppState, hydrated: AppState): AppState {
  const serverPoints = hydrated.pointsHistory || [];
  if (serverPoints.length === 0) return merged;
  const live = new Set(serverPoints.map((entry) => entry.id));
  const pointsHistory = (merged.pointsHistory || []).filter((entry) => live.has(entry.id));
  if (pointsHistory.length === (merged.pointsHistory || []).length) return merged;
  const seasonPoints = calculateSeasonalTotal(pointsHistory, getSeasonStart(leagueNow()));
  return { ...merged, pointsHistory, seasonPoints, totalPoints: seasonPoints };
}

/** The state's points as they are: what a preview returns while a timezone wait holds the day. */
function unchangedPoints(
  state: AppState
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> {
  const { seasonPoints, totalPoints, seasonId, pointsHistory, leagueArchives } = state;
  return { seasonPoints, totalPoints, seasonId, pointsHistory, leagueArchives };
}

/**
 * Replaces one local day's habit award entries with the ones the server computes for these
 * habits (computeHabitAwards), and stamps each checked preset's pointsAwarded. The entries
 * are shown at once and never uploaded; the server's own rows replace them on the next pull.
 * While a timezone wait holds the day (the server awards nothing for it), nothing changes.
 */
export function applyHabitAwardsInternal(
  state: AppState,
  habits: Habit[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; habits: Habit[] } {
  if (timezoneWaitHoldsPreview(day)) return { points: unchangedPoints(state), habits };
  const { allocation, entries } = computeHabitAwards(
    habits,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(
    state,
    (entry) => isHabitAwardEntry(entry) && entry.metadata?.periodKey === day
  );
  let points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> = excised;
  for (const entry of entries) {
    points = addPointsInternal(
      { ...state, ...points },
      entry.amount,
      entry.reason,
      entry.source,
      entry.metadata,
      entry.timestamp,
      entry.id
    );
  }

  const nextHabits = habits.map((h) => {
    if (!h || !(h.id in allocation) || Array.isArray(h.completions)) return h;
    const comp = h.completions?.[day];
    if (!comp) return h;
    return { ...h, completions: { ...h.completions, [day]: { ...comp, pointsAwarded: allocation[h.id] } } };
  });
  return { points, habits: nextHabits };
}

/**
 * Replaces one local day's bad-habit resist/occurred entries with the ones the server computes
 * (computeBadHabitAwards), and stamps the day's logs with their points. The entries are shown
 * at once and never uploaded; the server's own rows replace them on the next pull.
 */
export function applyBadHabitAwardsInternal(
  state: AppState,
  badHabits: BadHabit[],
  logs: BadHabitLog[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; logs: BadHabitLog[] } {
  const { entries, logPoints } = computeBadHabitAwards(
    badHabits,
    logs,
    state.pointsHistory || [],
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    getEffectiveSeasonPoints(state, leagueNow())
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (entry) =>
    isBadHabitDayEntry(entry, day)
  );
  let points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> = excised;
  for (const entry of entries) {
    points = addPointsInternal(
      { ...state, ...points },
      entry.amount,
      entry.reason,
      entry.source,
      entry.metadata,
      entry.timestamp,
      entry.id
    );
  }

  const nextLogs = logs.map((l) =>
    l && logPoints.has(l.id) && logPoints.get(l.id) !== l.pointsAwardedOrDeducted
      ? { ...l, pointsAwardedOrDeducted: logPoints.get(l.id)! }
      : l
  );
  return { points, logs: nextLogs };
}

/**
 * Replaces one local day's workout award entry with the one the server computes for these
 * workouts (computeWorkoutAwards), and stamps each of the day's workouts with its points. The
 * entry is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
export function applyWorkoutAwardsInternal(
  state: AppState,
  workouts: WorkoutLog[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; workouts: WorkoutLog[] } {
  const { entry, workoutPoints } = computeWorkoutAwards(
    workouts,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isWorkoutDayEntry(e, day))
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isWorkoutDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextWorkouts = workouts.map((w) =>
    w && workoutPoints.has(w.id) && workoutPoints.get(w.id) !== w.pointsAwarded ? { ...w, pointsAwarded: workoutPoints.get(w.id)! } : w
  );
  return { points, workouts: nextWorkouts };
}

/**
 * Replaces one local day's skill award entry with the one the server computes for these
 * sessions and skills (computeSkillAwards), and stamps each counted session with its points.
 * The entry is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
export function applySkillAwardsInternal(
  state: AppState,
  skillLogs: SkillSessionLog[],
  skills: Skill[],
  day: string,
  opts: { floor?: boolean } = {}
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; skillLogs: SkillSessionLog[] } {
  const { entry, sessionPoints } = computeSkillAwards(
    skillLogs,
    skills,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isSkillDayEntry(e, day)),
    opts
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isSkillDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = skillLogs.map((l) =>
    l && sessionPoints.has(l.id) && sessionPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: sessionPoints.get(l.id)! } : l
  );
  return { points, skillLogs: nextLogs };
}

/**
 * Replaces one local day's focus award entry with the one the server computes for these
 * sessions (computeFocusAwards), and stamps each session of the day with its points. The entry
 * is shown at once and never uploaded; the server's own row replaces it on the next pull.
 * While a timezone wait holds the day, nothing changes.
 */
export function applyFocusAwardsInternal(
  state: AppState,
  focusLogs: FocusSessionLog[],
  day: string,
  opts: { floor?: boolean } = {}
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; focusLogs: FocusSessionLog[] } {
  if (timezoneWaitHoldsPreview(day)) return { points: unchangedPoints(state), focusLogs };
  const existing = (state.pointsHistory || []).find((e) => isFocusDayEntry(e, day));
  const { entry, sessionPoints } = computeFocusAwards(
    focusLogs,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    existing,
    opts
  );
  // The day before (a session across midnight): the server only ever raises it, and its
  // sessions keep the points they show.
  if (opts.floor) {
    if (!entry || entry === existing) return { points: unchangedPoints(state), focusLogs };
    const { excisedEntryIds: _gone, ...without } = excisePointsEntriesInternal(state, (e) => isFocusDayEntry(e, day));
    return {
      points: addPointsInternal({ ...state, ...without }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id),
      focusLogs,
    };
  }

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isFocusDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = focusLogs.map((l) =>
    l && sessionPoints.has(l.id) && sessionPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: sessionPoints.get(l.id)! } : l
  );
  return { points, focusLogs: nextLogs };
}

/**
 * Replaces one local day's journal award entry with the one the server computes for these
 * entries (computeJournalAward). The entry is shown at once and never uploaded; the server's own
 * row replaces it on the next pull.
 */
export function applyJournalAwardInternal(
  state: AppState,
  journalEntries: JournalEntry[],
  day: string
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> {
  const entry = computeJournalAward(
    journalEntries,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isJournalDayEntry(e, day))
  );
  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isJournalDayEntry(e, day));
  return entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;
}

/**
 * Replaces one local day's reading page award entry with the one the server computes for these
 * logs and books (computeReadingDayAward), and stamps each counted log with its points. The entry
 * is shown at once and never uploaded; the server's own row replaces it on the next pull.
 * While a timezone wait holds the day, nothing changes.
 */
export function applyReadingAwardsInternal(
  state: AppState,
  readingLogs: ReadingLog[],
  books: UserBook[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; readingLogs: ReadingLog[] } {
  if (timezoneWaitHoldsPreview(day)) return { points: unchangedPoints(state), readingLogs };
  const { entry, logPoints } = computeReadingDayAward(
    readingLogs,
    books,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isReadingDayEntry(e, day))
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isReadingDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = readingLogs.map((l) =>
    l && logPoints.has(l.id) && logPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: logPoints.get(l.id)! } : l
  );
  return { points, readingLogs: nextLogs };
}

/** Local midnight of a day key, in ms (the start of "today" for the earlier-day rule). */
/**
 * Whether a block's done tick can change now: any block of today, or until 02:00 (the grace
 * window) yesterday's last block when it isn't skipped. Past days are read-only otherwise.
 */
export function canToggleTimeBlock(blocks: TimeTrackerBlock[], dateKey: string, blockId: string): boolean {
  const inGrace = dateKey === timeTrackerGraceDay(trustedNow());
  if (dateKey !== todayKey() && !inGrace) return false;
  const target = blocks.find((b) => b.id === blockId);
  if (!target) return false;
  return !inGrace || (!target.skipped && lastBlockOfDay(blocks)?.id === blockId);
}
