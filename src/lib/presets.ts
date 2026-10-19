import { HabitFrequency } from '@/types';

export interface PresetHabit {
  name: string;
  frequency: HabitFrequency;
  points: number;
  category: string;
  icon: string;
}

export interface PresetCategory {
  name: string;
  icon: string;
  habits: PresetHabit[];
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    name: 'Physical Health',
    icon: 'Heart',
    habits: [
      { name: 'Drink 8 cups of water', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'Droplets' },
      { name: 'Sleep 7-8 hours', frequency: 'daily', points: 2, category: 'Physical Health', icon: 'Moon' },
      { name: 'Morning walk', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'Footprints' },
      { name: 'Cold shower', frequency: 'daily', points: 2, category: 'Physical Health', icon: 'Snowflake' },
      { name: 'Stretching / mobility', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'Activity' },
      { name: '10,000 steps', frequency: 'daily', points: 2, category: 'Physical Health', icon: 'Route' },
      { name: 'Eat fruits / vegetables', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'Apple' },
      { name: 'No eating after 9 pm', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'UtensilsCrossed' },
      { name: 'Morning sunlight', frequency: 'daily', points: 1, category: 'Physical Health', icon: 'Sun' },
    ],
  },
  {
    name: 'Mental & Focus',
    icon: 'Brain',
    habits: [
      { name: 'Meditation', frequency: 'daily', points: 2, category: 'Mental & Focus', icon: 'Flower' },
      { name: 'Gratitude (3 things)', frequency: 'daily', points: 1, category: 'Mental & Focus', icon: 'HeartHandshake' },
      { name: 'Plan tomorrow tonight', frequency: 'daily', points: 1, category: 'Mental & Focus', icon: 'ClipboardList' },
      { name: 'Pray / spiritual practice', frequency: 'daily', points: 2, category: 'Mental & Focus', icon: 'HandHeart' },
    ],
  },
  {
    name: 'Learning & Growth',
    icon: 'GraduationCap',
    habits: [
      { name: 'Learn something new', frequency: 'daily', points: 3, category: 'Learning & Growth', icon: 'Lightbulb' },
      { name: 'Listen to educational podcast', frequency: 'daily', points: 2, category: 'Learning & Growth', icon: 'Headphones' },
      { name: 'Learn 5 new words', frequency: 'daily', points: 1, category: 'Learning & Growth', icon: 'Languages' },
      { name: 'Watch a lecture / tutorial', frequency: 'daily', points: 2, category: 'Learning & Growth', icon: 'MonitorPlay' },
    ],
  },
  {
    name: 'Discipline',
    icon: 'Shield',
    habits: [
      { name: 'Wake up early', frequency: 'daily', points: 2, category: 'Discipline', icon: 'Sunrise' },
      { name: 'Make your bed', frequency: 'daily', points: 1, category: 'Discipline', icon: 'BedDouble' },
      { name: 'Tidy up for 10 minutes', frequency: 'daily', points: 1, category: 'Discipline', icon: 'Brush' },
    ],
  },
];

/**
 * Presets taken out of the library (2026-10-19) that still earn their points on the server
 * (ascend_preset_habit_points) until every copy has left its account: a copy ticked today is
 * retired on a later day, so today's points never drop (applyPresetHabitRemovalMigration).
 */
export const RETIRED_SCORED_PRESET_HABITS: ReadonlyMap<string, number> = new Map([
  ['No phone for first hour after waking', 1],
  ['Digital detox hour', 1],
  ['No procrastination (complete top priority task)', 3],
]);

export function findPresetHabit(name: string): PresetHabit | undefined {
  for (const cat of PRESET_CATEGORIES) {
    const found = cat.habits.find((h) => h.name === name);
    if (found) return found;
  }
  return undefined;
}

export interface PresetBadHabit {
  name: string;
  points: number;
}

/**
 * The bad-habit library. A resist earns these points (ascend_bad_habit_points; change both
 * together); a custom bad habit earns BAD_HABIT_POINTS.customResist.
 */
export const PRESET_BAD_HABITS: PresetBadHabit[] = [
  { name: 'Doomscrolling', points: 2 },
  { name: 'Phone in the first hour after waking', points: 2 },
  { name: 'Procrastination', points: 2 },
  { name: 'Late-night screen time', points: 1 },
  { name: 'Junk food', points: 1 },
  { name: 'Porn', points: 3 },
  { name: 'Gaming too long', points: 2 },
  { name: 'Smoking / vaping', points: 3 },
  { name: 'Sugary drinks', points: 1 },
  { name: 'Staying up late', points: 1 },
];
