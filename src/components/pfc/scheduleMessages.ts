import { DEFAULT_TIME_TRACKER_ACTIVITIES } from '@/types';

/** Lines shown in Follow schedule for a block's activity: exact default activity, then its Ascend module, then a generic line. */
type ActivityLike = { id?: string; name: string; ascendModule?: string } | null | undefined;

// Tier 1: Exact System-Default Category ID / Name Match
const CATEGORY_EXACT_MESSAGES: Record<string, string> = {
  'act-sleep': 'Get some proper rest for tomorrow.',
  'act-deep-work': 'No distractions. Just the work.',
  'act-praying': 'Take a quiet moment for prayer.',
  'act-exercise': 'Time to train.',
  'act-reading': 'Time to read.',
  'act-skills': 'Practice with intent.',
  'act-break': 'Step away from screens and unwind.',
  'act-meals': 'Eat slowly, away from screens.',
  'act-entertainment': 'Enjoy your downtime.',
  'act-walking': 'Get some fresh air.',
};

// Tier 2: Generic Ascend Module Match (For any custom category linked to an Ascend module)
const MODULE_CONTEXTUAL_MESSAGES: Record<string, string> = {
  'Deep Focus': 'Protect your attention.',
  'Exercise': 'Time to train.',
  'Reading': 'Read and take notes.',
  'Skills': 'Practice with intent.',
  'Habits': 'Keep the streak going.',
  'Recovery': 'Rest and recover.',
};

export function getBlockContextualMessage(activity?: ActivityLike): string {
  if (!activity) return 'Stay on task.';

  // 1. Exact default ID match
  if (activity.id && CATEGORY_EXACT_MESSAGES[activity.id]) {
    return CATEGORY_EXACT_MESSAGES[activity.id];
  }

  // 1b. Exact default Name match
  const nameLower = (activity.name || '').toLowerCase().trim();
  for (const [id, msg] of Object.entries(CATEGORY_EXACT_MESSAGES)) {
    const def = DEFAULT_TIME_TRACKER_ACTIVITIES.find((a) => a.id === id);
    if (def && def.name.toLowerCase() === nameLower) {
      return msg;
    }
  }

  // 2. Ascend Module match
  if (activity.ascendModule && MODULE_CONTEXTUAL_MESSAGES[activity.ascendModule]) {
    return MODULE_CONTEXTUAL_MESSAGES[activity.ascendModule];
  }

  // 3. Fallback for custom / unlinked categories
  return `Focus on ${activity.name}.`;
}

// Early Completion Messages - Tier 1: Exact Default Category ID Match
const EARLY_COMPLETION_EXACT_MESSAGES: Record<string, string> = {
  'act-deep-work': "Done early. Take a breath or start what's next.",
  'act-exercise': 'Workout done early. Drink some water.',
  'act-reading': 'Reading done early.',
  'act-skills': 'Practice done early.',
  'act-praying': 'Done early.',
  'act-sleep': 'Rest done early. You have some extra time.',
  'act-meals': 'Meal done early. You have some extra time.',
  'act-entertainment': 'Done early.',
  'act-walking': 'Walk done early.',
  'act-break': 'Break done early.',
};

// Early Completion Messages - Tier 2: Module Match
const EARLY_COMPLETION_MODULE_MESSAGES: Record<string, string> = {
  'Deep Focus': 'Focus block done early.',
  'Exercise': 'Workout done early. Rest up.',
  'Reading': 'Reading done early.',
  'Skills': 'Practice done early.',
  'Habits': 'Habit done early.',
  'Recovery': 'Done early.',
};

export function getEarlyCompletionContextualMessage(activity?: ActivityLike): string {
  if (!activity) return 'Finished early. You have some extra time.';

  if (activity.id && EARLY_COMPLETION_EXACT_MESSAGES[activity.id]) {
    return EARLY_COMPLETION_EXACT_MESSAGES[activity.id];
  }

  const nameLower = (activity.name || '').toLowerCase().trim();
  for (const [id, msg] of Object.entries(EARLY_COMPLETION_EXACT_MESSAGES)) {
    const def = DEFAULT_TIME_TRACKER_ACTIVITIES.find((a) => a.id === id);
    if (def && def.name.toLowerCase() === nameLower) {
      return msg;
    }
  }

  if (activity.ascendModule && EARLY_COMPLETION_MODULE_MESSAGES[activity.ascendModule]) {
    return EARLY_COMPLETION_MODULE_MESSAGES[activity.ascendModule];
  }

  return `Finished ${activity.name} early. Take a break or start the next task.`;
}

/** Toast after skipping a block: blocks tied to an Ascend module count as skipped in the day's score. */
export function getSkipToastMessage(activity?: { ascendModule?: string } | null): { title: string; subtitle: string } {
  return { title: 'Block skipped', subtitle: activity?.ascendModule ? 'Logged as skipped.' : 'Schedule updated.' };
}

// Gap State Skip Messages - Tier 1: Exact Default Category ID Match
const SKIP_EXACT_MESSAGES: Record<string, string> = {
  'act-deep-work': 'Session skipped.',
  'act-exercise': 'Workout skipped.',
  'act-reading': 'Reading skipped.',
  'act-skills': 'Practice skipped.',
  'act-praying': 'Session skipped.',
  'act-sleep': 'Rest skipped.',
  'act-meals': 'Meal skipped. Eat when you can.',
  'act-entertainment': 'Downtime skipped.',
  'act-walking': 'Walk skipped.',
  'act-break': 'Break skipped.',
};

// Gap State Skip Messages - Tier 2: Module Match
const SKIP_MODULE_MESSAGES: Record<string, string> = {
  'Deep Focus': 'Focus block skipped.',
  'Exercise': 'Workout skipped.',
  'Reading': 'Reading skipped.',
  'Skills': 'Practice skipped.',
  'Habits': 'Habit skipped.',
  'Recovery': 'Recovery skipped.',
};

export function getSkipContextualMessage(activity?: ActivityLike): string {
  if (!activity) return 'Block skipped.';

  if (activity.id && SKIP_EXACT_MESSAGES[activity.id]) {
    return SKIP_EXACT_MESSAGES[activity.id];
  }

  const nameLower = (activity.name || '').toLowerCase().trim();
  for (const [id, msg] of Object.entries(SKIP_EXACT_MESSAGES)) {
    const def = DEFAULT_TIME_TRACKER_ACTIVITIES.find((a) => a.id === id);
    if (def && def.name.toLowerCase() === nameLower) {
      return msg;
    }
  }

  if (activity.ascendModule && SKIP_MODULE_MESSAGES[activity.ascendModule]) {
    return SKIP_MODULE_MESSAGES[activity.ascendModule];
  }

  return `${activity.name} skipped. Regroup and prepare for what is ahead.`;
}
