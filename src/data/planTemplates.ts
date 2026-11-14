import type { PlanCategory, PlanType } from '@/types';

/**
 * Starter plans for the create dialog: two of each plan type. Picking one fills the form, which the
 * user can still change before saving. Dates are offsets from the day it is picked.
 */
export interface PlanTemplate {
  id: string;
  title: string;
  description: string;
  category: PlanCategory;
  planType: PlanType;
  // Milestones
  steps?: string[];
  // Target
  targetValue?: number;
  targetUnit?: string;
  targetInDays?: number;
  // Habit journey
  cadence?: 'daily' | 'weekly';
  duration?: number;
  // Vision
  reviewCadence?: 'weekly' | 'monthly';
  lookBackInDays?: number;
}

export const STARTER_TEMPLATES: PlanTemplate[] = [
  {
    id: 'template_get_fit',
    title: 'Get Fit Fundamentals',
    description: 'The basics of a healthy body, one habit at a time. Tick each one off once it feels normal.',
    category: 'Health',
    planType: 'milestone',
    steps: [
      'Walk 20 minutes daily',
      'Cut sugary drinks',
      'Sleep 7+ hours a night',
      'Stretch for 10 minutes daily',
      'Track meals for one full week',
    ],
  },
  {
    id: 'template_side_project',
    title: 'Ship a Side Project',
    description: 'Take one idea from a note to something real people can use.',
    category: 'Career',
    planType: 'milestone',
    steps: [
      'Write a one-page plan: problem, user, first version',
      'Build the smallest version that works',
      'Show it to 5 people and write down what they say',
      'Fix the 3 biggest problems',
      'Launch it publicly',
    ],
  },
  {
    id: 'template_90d_reading',
    title: '90-Day Reading Challenge',
    description: 'Read 12 books in 90 days. About one book a week.',
    category: 'Learning',
    planType: 'target_goal',
    targetValue: 12,
    targetUnit: 'books',
    targetInDays: 90,
  },
  {
    id: 'template_emergency_fund',
    title: 'Emergency Fund',
    description: 'Save three months of living costs so a surprise bill never becomes a crisis.',
    category: 'Finance',
    planType: 'target_goal',
    targetValue: 3,
    targetUnit: 'months of expenses',
    targetInDays: 180,
  },
  {
    id: 'template_30d_discipline',
    title: '30-Day Discipline Reset',
    description: 'One focused block of your hardest task every day for 30 days.',
    category: 'Personal Growth',
    planType: 'habit_journey',
    cadence: 'daily',
    duration: 30,
  },
  {
    id: 'template_family_time',
    title: 'Weekly Family Time',
    description: 'One planned, phone-free block with family every week for 12 weeks.',
    category: 'Relationships',
    planType: 'habit_journey',
    cadence: 'weekly',
    duration: 12,
  },
  {
    id: 'template_one_year_vision',
    title: 'One-Year Vision',
    description: 'Where you want to be a year from now, and a short weekly check-in on whether this week moved you closer.',
    category: 'Personal Growth',
    planType: 'vision',
    reviewCadence: 'weekly',
    lookBackInDays: 365,
  },
  {
    id: 'template_career_direction',
    title: 'Career Direction',
    description: 'The work you want to be doing next, with a monthly look at skills gained and the next move.',
    category: 'Career',
    planType: 'vision',
    reviewCadence: 'monthly',
    lookBackInDays: 180,
  },
];
