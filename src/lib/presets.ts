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
    ],
  },
  {
    name: 'Mental & Focus',
    icon: 'Brain',
    habits: [
      { name: 'Meditation', frequency: 'daily', points: 2, category: 'Mental & Focus', icon: 'Flower' },
      { name: 'No phone for first hour after waking', frequency: 'daily', points: 1, category: 'Mental & Focus', icon: 'SmartphoneNodata' },
      { name: 'Digital detox hour', frequency: 'daily', points: 1, category: 'Mental & Focus', icon: 'Unplug' },
    ],
  },
  {
    name: 'Learning & Growth',
    icon: 'GraduationCap',
    habits: [
      { name: 'Learn something new', frequency: 'daily', points: 3, category: 'Learning & Growth', icon: 'Lightbulb' },
      { name: 'Listen to educational podcast', frequency: 'daily', points: 2, category: 'Learning & Growth', icon: 'Headphones' },
    ],
  },
  {
    name: 'Discipline & Bad Habit Reduction',
    icon: 'Shield',
    habits: [
      { name: 'No procrastination (complete top priority task)', frequency: 'daily', points: 3, category: 'Discipline & Bad Habit Reduction', icon: 'CheckCircle' },
      { name: 'Wake up early', frequency: 'daily', points: 2, category: 'Discipline & Bad Habit Reduction', icon: 'Sunrise' },
    ],
  },
];

export function findPresetHabit(name: string): PresetHabit | undefined {
  for (const cat of PRESET_CATEGORIES) {
    const found = cat.habits.find((h) => h.name === name);
    if (found) return found;
  }
  return undefined;
}
