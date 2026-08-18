export interface JournalPrompt {
  id: string;
  category: 'Gratitude' | 'Reflection' | 'Challenges' | 'Forward-Looking';
  categoryColor: string; // Tailwind color class or hex
  prompt: string;
}

export const JOURNAL_PROMPT_CATEGORIES = [
  { name: 'Gratitude', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { name: 'Reflection', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { name: 'Challenges', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  { name: 'Forward-Looking', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
] as const;

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  // Gratitude
  {
    id: 'grat-1',
    category: 'Gratitude',
    categoryColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    prompt: "What's one thing or person you're genuinely grateful for today, and why?",
  },
  {
    id: 'grat-2',
    category: 'Gratitude',
    categoryColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    prompt: 'What was a small, simple pleasure or comfort you enjoyed today?',
  },
  {
    id: 'grat-3',
    category: 'Gratitude',
    categoryColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    prompt: 'Who made a positive difference in your day, and how did they help you?',
  },
  {
    id: 'grat-4',
    category: 'Gratitude',
    categoryColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    prompt: 'What is an opportunity or privilege in your life right now that you appreciate?',
  },

  // Reflection
  {
    id: 'refl-1',
    category: 'Reflection',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompt: 'What was the most meaningful or rewarding part of your day?',
  },
  {
    id: 'refl-2',
    category: 'Reflection',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompt: 'What energy did you bring to your work and the people around you today?',
  },
  {
    id: 'refl-3',
    category: 'Reflection',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompt: 'What is one new insight or realization you discovered about yourself today?',
  },
  {
    id: 'refl-4',
    category: 'Reflection',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompt: 'How well did your actions today align with the person you aspire to become?',
  },

  // Challenges
  {
    id: 'chal-1',
    category: 'Challenges',
    categoryColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    prompt: "What's something that challenged you today, and how did you handle it?",
  },
  {
    id: 'chal-2',
    category: 'Challenges',
    categoryColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    prompt: 'What obstacle or frustration did you face, and what can it teach you?',
  },
  {
    id: 'chal-3',
    category: 'Challenges',
    categoryColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    prompt: 'Where did you feel resistance or procrastination today, and how did you respond?',
  },
  {
    id: 'chal-4',
    category: 'Challenges',
    categoryColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    prompt: 'What is a tough decision or conversation you managed today, or need to prepare for?',
  },

  // Forward-Looking
  {
    id: 'fwd-1',
    category: 'Forward-Looking',
    categoryColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    prompt: "What's one small thing or habit you want to execute differently tomorrow?",
  },
  {
    id: 'fwd-2',
    category: 'Forward-Looking',
    categoryColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    prompt: 'What is the single most important high-impact priority for your day tomorrow?',
  },
  {
    id: 'fwd-3',
    category: 'Forward-Looking',
    categoryColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    prompt: 'What standard of discipline will you hold yourself to when you wake up tomorrow?',
  },
  {
    id: 'fwd-4',
    category: 'Forward-Looking',
    categoryColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    prompt: 'How can you set up your morning environment tonight to ensure positive momentum?',
  },
];

/**
 * Deterministically retrieves a prompt for a given date string (YYYY-MM-DD).
 * An optional offset allows rotating to other prompts on the same day if user clicks shuffle.
 */
export function getDailyPrompt(dateKey: string, offset = 0): JournalPrompt {
  // Simple numeric hash from date string: e.g. "2026-08-17" -> sum of char codes
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash << 5) - hash + dateKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash + offset) % JOURNAL_PROMPTS.length;
  return JOURNAL_PROMPTS[index];
}
