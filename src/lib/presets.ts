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
      { name: 'Exercise / workout', frequency: 'daily', points: 20, category: 'Physical Health', icon: 'Dumbbell' },
      { name: 'Drink 8 cups of water', frequency: 'daily', points: 5, category: 'Physical Health', icon: 'Droplets' },
      { name: 'Sleep 7-8 hours', frequency: 'daily', points: 10, category: 'Physical Health', icon: 'Moon' },
      { name: 'Morning walk', frequency: 'daily', points: 8, category: 'Physical Health', icon: 'Footprints' },
      { name: 'Cold shower', frequency: 'daily', points: 12, category: 'Physical Health', icon: 'Snowflake' },
      { name: 'Stretching / mobility', frequency: 'daily', points: 8, category: 'Physical Health', icon: 'Activity' },
    ],
  },
  {
    name: 'Mental & Focus',
    icon: 'Brain',
    habits: [
      { name: 'Deep work session', frequency: 'daily', points: 25, category: 'Mental & Focus', icon: 'Target' },
      { name: 'Meditation', frequency: 'daily', points: 12, category: 'Mental & Focus', icon: 'Flower' },
      { name: 'No phone for first hour after waking', frequency: 'daily', points: 10, category: 'Mental & Focus', icon: 'SmartphoneNodata' },
      { name: 'Digital detox hour', frequency: 'daily', points: 10, category: 'Mental & Focus', icon: 'Unplug' },
      { name: 'Journaling', frequency: 'daily', points: 8, category: 'Mental & Focus', icon: 'BookOpen' },
    ],
  },
  {
    name: 'Learning & Growth',
    icon: 'GraduationCap',
    habits: [
      { name: 'Reading (books)', frequency: 'daily', points: 12, category: 'Learning & Growth', icon: 'BookOpen' },
      { name: 'Practice a skill', frequency: 'daily', points: 15, category: 'Learning & Growth', icon: 'Wrench' },
      { name: 'Learn something new', frequency: 'daily', points: 15, category: 'Learning & Growth', icon: 'Lightbulb' },
      { name: 'Listen to educational podcast', frequency: 'daily', points: 8, category: 'Learning & Growth', icon: 'Headphones' },
    ],
  },
  {
    name: 'Discipline & Bad Habit Reduction',
    icon: 'Shield',
    habits: [
      { name: 'No porn', frequency: 'daily', points: 15, category: 'Discipline & Bad Habit Reduction', icon: 'Ban' },
      { name: 'No social media before bed', frequency: 'daily', points: 10, category: 'Discipline & Bad Habit Reduction', icon: 'Ban' },
      { name: 'No junk food', frequency: 'daily', points: 10, category: 'Discipline & Bad Habit Reduction', icon: 'Ban' },
      { name: 'No procrastination (complete top priority task)', frequency: 'daily', points: 20, category: 'Discipline & Bad Habit Reduction', icon: 'CheckCircle' },
      { name: 'Wake up early', frequency: 'daily', points: 12, category: 'Discipline & Bad Habit Reduction', icon: 'Sunrise' },
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
