/** Returns local date as YYYY-MM-DD (no timezone surprises) */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateKey(date: Date): string {
  return todayKey(date);
}

/** Start of the current week (Monday) as a Date */
export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Week key for weekly habits: YYYY-Www */
export function weekKey(date = new Date()): string {
  const d = startOfWeek(date);
  const y = d.getFullYear();
  const jan1 = new Date(y, 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

/** Returns the period key for a habit based on its frequency */
export function periodKey(frequency: 'daily' | 'weekly', date = new Date()): string {
  return frequency === 'daily' ? todayKey(date) : weekKey(date);
}

/** Returns the period key for N periods ago */
export function previousPeriodKey(frequency: 'daily' | 'weekly', periodsAgo: number, date = new Date()): string {
  if (frequency === 'daily') {
    const d = new Date(date);
    d.setDate(d.getDate() - periodsAgo);
    return todayKey(d);
  }
  const d = new Date(date);
  d.setDate(d.getDate() - periodsAgo * 7);
  return weekKey(d);
}

/** Calculate current streak from completions array */
export function calculateStreak(
  completions: string[],
  frequency: 'daily' | 'weekly',
  now = new Date()
): number {
  if (completions.length === 0) return 0;
  const sorted = [...completions].sort();

  let streak = 0;
  let cursor = now;

  // If the current period isn't completed, start from the previous one
  const currentPeriod = periodKey(frequency, now);
  if (!sorted.includes(currentPeriod)) {
    cursor = frequency === 'daily'
      ? new Date(now.getTime() - 86400000)
      : new Date(now.getTime() - 7 * 86400000);
  }

  // Walk backwards through periods
  for (let i = 0; i < 1000; i++) {
    const key = periodKey(frequency, cursor);
    if (sorted.includes(key)) {
      streak++;
      cursor = frequency === 'daily'
        ? new Date(cursor.getTime() - 86400000)
        : new Date(cursor.getTime() - 7 * 86400000);
    } else {
      break;
    }
  }

  return streak;
}

/** Calculate best (longest) streak from completions array */
export function calculateBestStreak(
  completions: string[],
  frequency: 'daily' | 'weekly'
): number {
  if (completions.length === 0) return 0;
  const sorted = [...completions].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const expected = frequency === 'daily'
      ? addDays(prev, 1)
      : addWeeks(prev, 1);

    if (curr === expected) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return todayKey(date);
}

function addWeeks(key: string, n: number): string {
  // weekKey format: YYYY-Www
  const match = key.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return key;
  const y = parseInt(match[1]);
  const w = parseInt(match[2]);
  // Convert to a date: Jan 1 + (w-1)*7 days
  const jan1 = new Date(y, 0, 1);
  const dayOfWeek = jan1.getDay();
  const offset = dayOfWeek === 0 ? 1 : 1 - dayOfWeek;
  const weekStart = new Date(y, 0, 1 + offset + (w - 1) * 7 + n * 7);
  return weekKey(weekStart);
}

/** Robustly parses any date representation into a valid Date object, or null if invalid */
export function parseDate(dateVal?: string | Date | number | null): Date | null {
  if (dateVal === null || dateVal === undefined) return null;
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;

    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return isNaN(date.getTime()) ? null : date;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDateLong(dateVal?: string | Date | number | null, fallback = 'Date unknown'): string {
  const date = parseDate(dateVal);
  if (!date) return fallback;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(dateVal?: string | Date | number | null, fallback = 'Date unknown'): string {
  const date = parseDate(dateVal);
  if (!date) return fallback;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayKey();
}

export function isTodayLocal(dateIso?: string | null): boolean {
  if (!dateIso) return false;
  const d = parseDate(dateIso);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Generates a padded 6-digit numeric UID string (e.g. "049201" or "849201") */
export function generateNumericUID(): string {
  const val = Math.floor(Math.random() * 1000000);
  return String(val).padStart(6, '0');
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

