import { AppState } from '@/types';
import { todayKey } from './dates';

export interface UnifiedStreakResult {
  currentStreakDays: number;
  currentStreakCategory: string;
  currentStreakIsActive: boolean;
  formattedCurrentStreak: string;
  lastActiveDate: string | null;
}

/**
 * Normalizes a date to standard YYYY-MM-DD date key using local/ISO date boundary.
 */
function toNormalizedDateKey(dateInput: string | Date | number): string | null {
  if (!dateInput) return null;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return todayKey(d);
}

// Strict local parser to prevent UTC boundary shifting on YYYY-MM-DD inputs
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Calculates the best (longest) consecutive day streak from a sorted list of unique YYYY-MM-DD dates.
 */
function calculateBestStreakFromSortedDates(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let maxStreak = 1;
  let runningStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = parseLocalDate(sortedDates[i - 1]);
    const curr = parseLocalDate(sortedDates[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 1) {
      runningStreak++;
      if (runningStreak > maxStreak) {
        maxStreak = runningStreak;
      }
    } else if (diffDays > 1) {
      runningStreak = 1;
    }
  }

  return maxStreak;
}

/**
 * Calculates current active streak from sorted YYYY-MM-DD dates relative to a reference Date key.
 * A streak is active if the most recent date is either today or yesterday in the reference timezone.
 */
function calculateCurrentStreakFromSortedDates(sortedDates: string[], referenceNowKey: string): number {
  if (sortedDates.length === 0) return 0;

  const refDate = parseLocalDate(referenceNowKey);
  const yesterdayDate = new Date(refDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  const lastDate = sortedDates[sortedDates.length - 1];
  if (lastDate !== referenceNowKey && lastDate !== yesterdayStr) {
    return 0; // Streak broken
  }

  let streak = 1;
  for (let i = sortedDates.length - 2; i >= 0; i--) {
    const prev = parseLocalDate(sortedDates[i]);
    const curr = parseLocalDate(sortedDates[i + 1]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Single Source of Truth for calculating user streak status across all activity logs.
 */
export function calculateUnifiedStreak(
  state?: Partial<AppState> | null,
  referenceNowKey: string = todayKey(new Date())
): UnifiedStreakResult {
  if (!state) {
    return {
      currentStreakDays: 0,
      currentStreakCategory: '',
      currentStreakIsActive: true,
      formattedCurrentStreak: '0d',
      lastActiveDate: null,
    };
  }

  const candidates: Array<{
    currentDays: number;
    category: string;
    priority: number;
    isActive: boolean;
    lastDate: string | null;
  }> = [];

  let globalLatestDate: string | null = null;

  const trackLatestDate = (dateStr: string | null) => {
    if (!dateStr) return;
    if (!globalLatestDate || dateStr > globalLatestDate) {
      globalLatestDate = dateStr;
    }
  };

  // 1. Regular Habits & Points History Lineages (Priority 100)
  interface Lineage {
    name: string;
    category: string;
    dateNet: Map<string, number>;
  }
  const lineageMap = new Map<string, Lineage>();

  (state.pointsHistory || []).forEach((e) => {
    if (!e || !e.timestamp) return;
    const isCompleted =
      e.source === 'habit_completed' ||
      e.source === 'habit' ||
      (e.reason && (e.reason.startsWith('Habit completed:') || e.reason.startsWith('Completed habit:')));

    const isUnchecked =
      e.source === 'habit_unchecked' ||
      (e.reason && (e.reason.startsWith('Habit unchecked:') || e.reason.startsWith('Unchecked habit:')));

    if (!isCompleted && !isUnchecked) return;

    let habitName = e.metadata?.habitName;
    if (!habitName && e.reason) {
      habitName = e.reason
        .replace(/^(Habit completed:|Completed habit:|Habit unchecked:|Unchecked habit:)\s*/i, '')
        .trim();
    }
    if (!habitName || habitName === 'Habit') habitName = 'Habit Journey';

    const dKey = toNormalizedDateKey(e.timestamp);
    if (!dKey) return;
    trackLatestDate(dKey);

    if (!lineageMap.has(habitName)) {
      lineageMap.set(habitName, {
        name: habitName,
        category: e.metadata?.category || 'Habit Journey',
        dateNet: new Map<string, number>(),
      });
    }

    const lin = lineageMap.get(habitName)!;
    if (e.metadata?.category) lin.category = e.metadata.category;
    const current = lin.dateNet.get(dKey) || 0;
    lin.dateNet.set(dKey, current + (isCompleted ? 1 : -1));
  });

  (state.habits || []).forEach((h) => {
    if (!h) return;
    const name = h.name || 'Habit Journey';
    if (!lineageMap.has(name)) {
      lineageMap.set(name, {
        name,
        category: h.category || 'Habit Journey',
        dateNet: new Map<string, number>(),
      });
    }
    const lin = lineageMap.get(name)!;
    if (h.category) lin.category = h.category;

    (h.completions || []).forEach((c) => {
      const dKey = toNormalizedDateKey(c);
      if (dKey) {
        trackLatestDate(dKey);
        if (!lin.dateNet.has(dKey)) {
          lin.dateNet.set(dKey, 1);
        }
      }
    });
  });

  lineageMap.forEach((lin) => {
    const validDates = Array.from(lin.dateNet.entries())
      .filter(([_, net]) => net > 0)
      .map(([date]) => date)
      .sort();

    if (validDates.length === 0) return;

    const activeHabit = (state.habits || []).find(
      (h) => h?.name?.toLowerCase() === lin.name.toLowerCase()
    );
    const isActive = !!activeHabit;
    if (!isActive) return; // Discard immediately if habit is deleted/inactive

    const category = (activeHabit?.category || lin.category || 'Habit Journey').trim();
    const current = calculateCurrentStreakFromSortedDates(validDates, referenceNowKey);

    if (current > 0) {
      candidates.push({
        currentDays: current,
        category,
        priority: 100,
        isActive: true,
        lastDate: validDates[validDates.length - 1] || null,
      });
    }
  });

  // 2. Exercise Streak (Priority 80)
  if (state.workouts && state.workouts.length > 0) {
    const workoutDates = Array.from(
      new Set(state.workouts.map((w) => toNormalizedDateKey(w.date)).filter((d): d is string => d !== null))
    ).sort();
    if (workoutDates.length > 0) {
      trackLatestDate(workoutDates[workoutDates.length - 1]);
      const current = calculateCurrentStreakFromSortedDates(workoutDates, referenceNowKey);
      if (current > 0) {
        candidates.push({
          currentDays: current,
          category: 'Exercise',
          priority: 80,
          isActive: true,
          lastDate: workoutDates[workoutDates.length - 1],
        });
      }
    }
  }

  // 3. Reading Streak (Priority 60)
  if (state.readingLogs && state.readingLogs.length > 0) {
    const readingDates = Array.from(
      new Set(state.readingLogs.map((r) => toNormalizedDateKey(r.date)).filter((d): d is string => d !== null))
    ).sort();
    if (readingDates.length > 0) {
      trackLatestDate(readingDates[readingDates.length - 1]);
      const current = calculateCurrentStreakFromSortedDates(readingDates, referenceNowKey);
      if (current > 0) {
        candidates.push({
          currentDays: current,
          category: 'Reading',
          priority: 60,
          isActive: true,
          lastDate: readingDates[readingDates.length - 1],
        });
      }
    }
  }

  // 4. Bad Habit Resisted Streaks (Priority 40)
  (state.badHabits || []).filter((bh) => bh && !bh.isCompleted).forEach((bh) => {
    const logs = (state.badHabitLogs || []).filter((l) => l && l.badHabitId === bh.id);
    const resistedDates = Array.from(
      new Set(
        logs
          .filter((l) => l.status === 'resisted')
          .map((l) => toNormalizedDateKey(l.date))
          .filter((d): d is string => d !== null)
      )
    ).sort();

    if (resistedDates.length > 0) {
      trackLatestDate(resistedDates[resistedDates.length - 1]);
      const current = calculateCurrentStreakFromSortedDates(resistedDates, referenceNowKey);
      if (current > 0) {
        candidates.push({
          currentDays: current,
          category: 'Resisted',
          priority: 40,
          isActive: true,
          lastDate: resistedDates[resistedDates.length - 1],
        });
      }
    }
  });

  // 5. Skill Practice Streak (Priority 20)
  if (state.skillLogs && state.skillLogs.length > 0) {
    const skillDates = Array.from(
      new Set(state.skillLogs.map((s) => toNormalizedDateKey(s.date)).filter((d): d is string => d !== null))
    ).sort();
    if (skillDates.length > 0) {
      trackLatestDate(skillDates[skillDates.length - 1]);
      const current = calculateCurrentStreakFromSortedDates(skillDates, referenceNowKey);
      if (current > 0) {
        candidates.push({
          currentDays: current,
          category: 'Skill Practice',
          priority: 20,
          isActive: true,
          lastDate: skillDates[skillDates.length - 1],
        });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      currentStreakDays: 0,
      currentStreakCategory: '',
      currentStreakIsActive: true,
      formattedCurrentStreak: '0d',
      lastActiveDate: globalLatestDate,
    };
  }

  const sortedForCurrent = [...candidates].sort((a, b) => {
    if (b.currentDays !== a.currentDays) return b.currentDays - a.currentDays;
    return b.priority - a.priority;
  });
  const topCurrent = sortedForCurrent[0];

  const formattedCurrent = topCurrent.currentDays > 0
    ? `${topCurrent.currentDays}d${topCurrent.category ? ` - ${topCurrent.category}` : ''}`
    : '0d';

  return {
    currentStreakDays: topCurrent.currentDays,
    currentStreakCategory: topCurrent.category,
    currentStreakIsActive: true,
    formattedCurrentStreak: formattedCurrent,
    lastActiveDate: globalLatestDate,
  };
}

/**
 * Extracts and formats streak metadata consistently from a profile stats payload or database row.
 */
export function getProfileStreakStats(stats: Record<string, any> | undefined | null): UnifiedStreakResult {
  if (!stats) {
    return {
      currentStreakDays: 0,
      currentStreakCategory: '',
      currentStreakIsActive: true,
      formattedCurrentStreak: '0d',
      lastActiveDate: null,
    };
  }

  const cDays = stats.currentStreakDays ?? stats.streakDays ?? 0;
  const cCat = stats.currentStreakCategory ?? stats.streakSource ?? '';
  const cActive = stats.currentStreakIsActive !== undefined ? Boolean(stats.currentStreakIsActive) : true;
  const lastActiveDate = stats.lastActiveDate || stats.last_active_date || null;

  const formattedCurrent = cDays > 0
    ? `${cDays}d${cCat ? ` - ${cCat}` : ''}`
    : '0d';

  return {
    currentStreakDays: cDays,
    currentStreakCategory: cCat,
    currentStreakIsActive: cActive,
    formattedCurrentStreak: formattedCurrent,
    lastActiveDate,
  };
}
