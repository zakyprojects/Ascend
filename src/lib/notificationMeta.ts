import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Dumbbell,
  Flag,
  Hand,
  Heart,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { AppNotification } from '@/types';
import type { View } from './views';
import { formatWeekdayDate, getWeekDates } from './dates';
import { ptsText } from './leagues';

/**
 * How the app shows each notification type: icon, tone, the page a tap opens, and the title and
 * message. The words are written here from the row's type and payload (D-N2), so they follow the
 * app's copy rules; the stored title/message (the push text, written by the server) is only the
 * fallback for a type this file does not know. Nothing here changes what the server sends.
 */

/** Icon tile colours: penalties rose, partners sky, reminders neutral, milestones/completions emerald. */
export type NotificationTone = 'rose' | 'sky' | 'neutral' | 'emerald';

export const NOTIFICATION_TONE_CLASS: Record<NotificationTone, string> = {
  rose: 'badge-rose',
  sky: 'badge-sky',
  neutral: 'badge-neutral',
  emerald: 'badge-emerald',
};

export interface NotificationView {
  icon: LucideIcon;
  tone: NotificationTone;
  /** The page a tap opens, or null when there is nowhere useful to go. */
  link: View | null;
  title: string;
  message: string;
  /** Shows the actor's avatar (partner notices only; system notices carry a decorative emoji). */
  showActor: boolean;
}

const PARTNER_TYPES = new Set([
  'partner_invite',
  'partner_invite_accepted',
  'partner_invite_declined',
  'partner_removed',
  'partner_nudge',
  'partner_pledge_done',
  'partner_missed_habit',
  'challenge_created',
  'challenge_completed',
  'challenge_deleted',
]);

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The first "quoted" text of a stored message (challenge or habit names the payload lacks). */
function quoted(message: string | undefined): string | null {
  const match = /"([^"]+)"/.exec(message || '');
  return match ? match[1] : null;
}

/** Points the server took, read from its stored text ("… 7 points deducted."); null when none. */
export function notificationPenalty(n: AppNotification): number | null {
  const match = /(\d+)\s+points?\s+deducted/i.exec(n.message || '');
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "Sat, Oct 17" for a day key, "the week of Oct 12" for a week key, else the key itself. */
export function periodLabel(key: string | null): string | null {
  if (!key) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return formatWeekdayDate(key);
  if (/^\d{4}-W\d{2}$/.test(key)) {
    const start = getWeekDates(key).start;
    return `the week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return key;
}

function withPenalty(text: string, n: AppNotification): string {
  const penalty = notificationPenalty(n);
  return penalty ? `${text} · ${ptsText(-penalty)}` : text;
}

function actorName(n: AppNotification, fallback = 'Your partner'): string {
  return str(n.actorUsername) && n.actorUsername !== 'Ascend System' ? (n.actorUsername as string) : fallback;
}

/** How one notification looks in the panel. */
export function describeNotification(n: AppNotification): NotificationView {
  const p = n.payload || {};
  const who = actorName(n);
  const showActor = PARTNER_TYPES.has(n.type) && Boolean(n.actorAvatar);
  const base = { showActor };

  switch (n.type) {
    case 'partner_invite':
      return { ...base, icon: UserPlus, tone: 'sky', link: 'partner', title: 'Partner invite', message: `${actorName(n, 'Someone')} wants to be your accountability partner.` };
    case 'partner_invite_accepted':
      return { ...base, icon: Users, tone: 'sky', link: 'partner', title: 'Invite accepted', message: `${who} is now your partner.` };
    case 'partner_invite_declined':
      return { ...base, icon: XCircle, tone: 'sky', link: 'partner', title: 'Invite declined', message: `${who} declined your partner invite.` };
    case 'partner_removed':
      return { ...base, icon: UserMinus, tone: 'sky', link: 'partner', title: 'Partner removed', message: `${who} removed you as a partner.` };
    case 'partner_nudge':
      return { ...base, icon: Hand, tone: 'sky', link: 'partner', title: `${who} nudged you`, message: `${who} is waiting for you to finish today's challenges.` };
    case 'partner_pledge_done': {
      const challenge = quoted(n.message);
      return {
        ...base,
        icon: CheckCircle2,
        tone: 'sky',
        link: 'partner',
        title: `${who} did today's part`,
        message: challenge ? `${who} finished today's target for “${challenge}”. Your turn.` : `${who} finished today's target. Your turn.`,
      };
    }
    case 'challenge_created': {
      const challenge = quoted(n.message);
      return {
        ...base,
        icon: Flag,
        tone: 'sky',
        link: 'partner',
        title: 'New challenge',
        message: challenge ? `${who} started “${challenge}” with you.` : `${who} started a challenge with you.`,
      };
    }
    case 'challenge_completed': {
      const challenge = quoted(n.message);
      return {
        ...base,
        icon: Award,
        tone: 'emerald',
        link: 'partner',
        title: 'Challenge complete',
        message: challenge ? `You and ${who} finished “${challenge}”.` : `You and ${who} finished your challenge.`,
      };
    }
    case 'challenge_deleted': {
      const challenge = quoted(n.message);
      return {
        ...base,
        icon: Trash2,
        tone: 'sky',
        link: 'partner',
        title: 'Challenge deleted',
        message: challenge ? `${who} deleted “${challenge}”.` : `${who} deleted a shared challenge.`,
      };
    }
    case 'partner_missed_habit': {
      const habit = str(p.habitName) ?? quoted(n.message);
      return {
        ...base,
        icon: Heart,
        tone: 'sky',
        link: 'partner',
        title: `${who} missed a habit`,
        message: habit ? `${who} missed “${habit}”. A word from you might help.` : `${who} missed a habit. A word from you might help.`,
      };
    }
    case 'missed_habit': {
      const habit = str(p.habitName) ?? quoted(n.message) ?? 'A habit';
      const when = periodLabel(str(p.period));
      return {
        ...base,
        icon: AlertTriangle,
        tone: 'rose',
        link: 'habits',
        title: 'Missed habit',
        message: withPenalty(when ? `${habit} · ${when}` : habit, n),
      };
    }
    case 'bad_habit_no_report': {
      const habit = str(p.badHabitName) ?? quoted(n.message) ?? 'A bad habit';
      const when = periodLabel(str(p.date));
      return {
        ...base,
        icon: ShieldAlert,
        tone: 'rose',
        link: 'bad-habits',
        title: 'Bad habit not logged',
        message: withPenalty(when ? `${habit} · ${when}` : habit, n),
      };
    }
    case 'missed_exercise_target': {
      const logged = typeof p.logged === 'number' ? p.logged : null;
      const target = typeof p.target === 'number' ? p.target : null;
      const when = periodLabel(str(p.weekKey));
      const counts = logged !== null && target !== null ? `${logged} of ${target} workouts` : 'Fewer workouts than your goal';
      return {
        ...base,
        icon: Dumbbell,
        tone: 'rose',
        link: 'exercise',
        title: 'Weekly exercise goal missed',
        message: withPenalty(when ? `${counts} in ${when}` : counts, n),
      };
    }
    case 'missed_book_deadline':
      return { ...base, icon: BookOpen, tone: 'rose', link: 'reading', title: 'Reading deadline missed', message: withPenalty(n.message || '', n) };
    case 'addiction_milestone': {
      const substance = str(p.substance);
      const milestones = Array.isArray(p.milestones) ? p.milestones.filter((m): m is string => typeof m === 'string') : [];
      // Server labels are Title Case ("1 Week Clean"); the default title is 'Sobriety'.
      const milestone = milestones[0] ? milestones[0].charAt(0) + milestones[0].slice(1).toLowerCase() : null;
      const from = substance && substance !== 'Sobriety' ? substance : null;
      return {
        ...base,
        icon: Award,
        tone: 'emerald',
        link: 'recovery',
        title: 'Milestone reached',
        message: milestone ? `${milestone}${from ? ` from ${from}` : ''}.` : `A new recovery milestone${from ? ` for ${from}` : ''}.`,
      };
    }
    case 'daily_reminder': {
      const missing = Array.isArray(p.missing) ? p.missing.filter((m): m is string => typeof m === 'string') : [];
      return {
        ...base,
        icon: Bell,
        tone: 'neutral',
        link: 'dashboard',
        title: 'Evening check-in',
        message: missing.length ? `Still open today: ${missing.join(', ')}.` : 'A few things are still open today.',
      };
    }
    case 'sunday_planning':
      return { ...base, icon: CalendarCheck, tone: 'neutral', link: 'weekly-goals', title: 'Plan your week', message: "Take 5 minutes to set this week's goals." };
    default:
      return {
        ...base,
        icon: Bell,
        tone: 'neutral',
        link: PARTNER_TYPES.has(n.type) ? 'partner' : null,
        title: n.title || 'Notification',
        message: n.message,
      };
  }
}

/** Penalty notices of one type for one period are shown as one row when there are 2 or more (D-N3). */
function groupKey(n: AppNotification): string | null {
  const p = n.payload || {};
  if (n.type === 'missed_habit') return str(p.period) ? `missed_habit:${p.period}` : null;
  if (n.type === 'bad_habit_no_report') return str(p.date) ? `bad_habit_no_report:${p.date}` : null;
  if (n.type === 'partner_missed_habit') {
    return str(p.period) ? `partner_missed_habit:${n.actorId || n.actorUsername || ''}:${p.period}` : null;
  }
  return null;
}

export type NotificationEntry =
  | { kind: 'single'; id: string; item: AppNotification }
  | { kind: 'group'; id: string; items: AppNotification[] };

/** Rows for the panel, newest first; a group sits where its newest notice would. */
export function groupNotifications(list: AppNotification[]): NotificationEntry[] {
  const groups = new Map<string, AppNotification[]>();
  for (const n of list) {
    const key = groupKey(n);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), n]);
  }
  const entries: NotificationEntry[] = [];
  const placed = new Set<string>();
  for (const n of list) {
    const key = groupKey(n);
    const members = key ? groups.get(key) : undefined;
    if (key && members && members.length > 1) {
      if (placed.has(key)) continue;
      placed.add(key);
      entries.push({ kind: 'group', id: `group:${key}`, items: members });
    } else {
      entries.push({ kind: 'single', id: n.id, item: n });
    }
  }
  return entries;
}

/** Title and message for a group row ("Missed 3 habits" / "Sat, Oct 17 · −7 pts"). */
export function describeGroup(items: AppNotification[]): NotificationView {
  const first = items[0];
  const single = describeNotification(first);
  const p = first.payload || {};
  const total = items.reduce((sum, n) => sum + (notificationPenalty(n) ?? 0), 0);
  const count = items.length;
  let title = single.title;
  let when: string | null = null;
  if (first.type === 'missed_habit') {
    title = `Missed ${count} habits`;
    when = periodLabel(str(p.period));
  } else if (first.type === 'bad_habit_no_report') {
    title = `${count} bad habits not logged`;
    when = periodLabel(str(p.date));
  } else if (first.type === 'partner_missed_habit') {
    title = `${actorName(first)} missed ${count} habits`;
    when = periodLabel(str(p.period));
  }
  const parts = [when, total > 0 ? ptsText(-total) : null].filter(Boolean);
  return { ...single, title, message: parts.join(' · ') || single.message };
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "Oct 12". */
export function formatNotificationTime(iso: string, nowMs: number): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';
  const diffMin = Math.floor((nowMs - time) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} h ago`;
  const day = new Date(time);
  const now = new Date(nowMs);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day.getFullYear() === yesterday.getFullYear() && day.getMonth() === yesterday.getMonth() && day.getDate() === yesterday.getDate()) {
    return 'Yesterday';
  }
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
