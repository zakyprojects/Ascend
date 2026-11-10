import type { PointsEntry } from '@/types';
import { formatWeekRange } from './dates';

/**
 * The line a points row shows (Ranks → Recent points). The server writes each row's `reason` for
 * its own log (week keys, "(1.5x penalty)", the amount again, emoji); this turns the known sources
 * into short plain text from `source` + `metadata`, and falls back to the stored reason without
 * emoji. Display only: the stored reason is never changed. Reason strings mirror the SQL that
 * writes them (habit/bad-habit awards and penalties, module awards, weekly goals, recovery).
 */

const WEEK_KEY = /^\d{4}-W\d{2}$/;
const RECOVERY_MILESTONES: Record<string, string> = { '1w': '1 week clean', '1m': '1 month clean', '90d': '90 days clean' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Drops emoji and the spaces they leave behind. */
function withoutEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/** The name after "<prefix>: " (or after "(...x penalty): "), else null. */
function nameAfterColon(reason: string): string | null {
  const i = reason.indexOf(': ');
  const name = i >= 0 ? reason.slice(i + 2).trim() : '';
  return name || null;
}

/** " · 2x" for a penalty above the normal 1x (it explains a bigger amount); else nothing. */
function multiplierText(meta: Record<string, any> | undefined, reason: string): string {
  const fromMeta = Number(meta?.multiplier);
  const fromReason = Number(/\(([\d.]+)x penalty/.exec(reason)?.[1]);
  const m = Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : fromReason;
  return Number.isFinite(m) && m > 1 ? ` · ${m}x` : '';
}

const count = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function weekText(meta: Record<string, any> | undefined, reason: string): string | null {
  const key = typeof meta?.weekKey === 'string' && WEEK_KEY.test(meta.weekKey) ? meta.weekKey : /\d{4}-W\d{2}/.exec(reason)?.[0];
  return key ? formatWeekRange(key) : null;
}

export function pointsReasonText(entry: Pick<PointsEntry, 'reason' | 'source' | 'metadata'>): string {
  const reason = withoutEmoji(entry.reason || '');
  const meta = entry.metadata;
  const name = (key: string) => (typeof meta?.[key] === 'string' && meta[key].trim()) || nameAfterColon(reason);

  switch (entry.source) {
    case 'habit_completed': {
      const habit = name('habitName');
      return habit ? `Habit done: ${habit}` : 'Habit done';
    }
    case 'habit_missed': {
      const habit = name('habitName');
      return `${habit ? `Missed habit: ${habit}` : 'Missed habit'}${multiplierText(meta, reason)}`;
    }
    case 'bad_habit_resisted': {
      const bad = name('badHabitName');
      return bad ? `Resisted: ${bad}` : 'Resisted a bad habit';
    }
    case 'bad_habit_occurred': {
      const bad = name('badHabitName');
      return `${bad ? `Slipped: ${bad}` : 'Slipped on a bad habit'}${multiplierText(meta, reason)}`;
    }
    case 'bad_habit_no_report': {
      const bad = name('badHabitName');
      return `${bad ? `Not logged: ${bad}` : 'Bad habit not logged'}${multiplierText(meta, reason)}`;
    }
    case 'exercise': {
      const n = count(meta?.workouts);
      return n ? `Exercise: ${plural(n, 'workout')}` : 'Exercise';
    }
    case 'exercise_missed': {
      const m = /\((\d+)\/(\d+) sessions/.exec(reason);
      return `${m ? `Weekly workout goal missed: ${m[1]} of ${m[2]}` : 'Weekly workout goal missed'}${multiplierText(meta, reason)}`;
    }
    case 'reading':
      return 'Reading';
    case 'skill': {
      const n = count(meta?.sessions);
      return n ? `Skill practice: ${plural(n, 'session')}` : 'Skill practice';
    }
    case 'focus': {
      const n = count(meta?.sessions);
      return n ? `Focus: ${plural(n, 'session')}` : 'Focus';
    }
    case 'journal':
      return 'Journal entry';
    case 'time_tracker': {
      const pct = Number(meta?.percentage);
      return Number.isFinite(pct) ? `Time Tracker day: ${Math.round(pct)}% done` : 'Time Tracker day';
    }
    case 'weekly_goal_achieved': {
      const week = weekText(meta, reason);
      return week ? `Weekly goals done · ${week}` : 'Weekly goals done';
    }
    case 'weekly_review': {
      const week = weekText(meta, reason);
      return week ? `Weekly reflection · ${week}` : 'Weekly reflection';
    }
    case 'recovery_milestone': {
      const label = RECOVERY_MILESTONES[meta?.milestone];
      return label ? `Recovery milestone: ${label}` : 'Recovery milestone';
    }
    default:
      return reason;
  }
}
