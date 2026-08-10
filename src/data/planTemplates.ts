import { PlanType } from '@/types';

export interface PlanTemplate {
  id: string;
  title: string;
  description: string;
  category: 'Personal Growth' | 'Learning' | 'Health';
  planType: PlanType;
  cadence?: 'daily' | 'weekly';
  duration?: number;
  targetValue?: number;
  targetUnit?: string;
  steps?: string[];
  getTargetDate?: () => string;
}

export const STARTER_TEMPLATES: PlanTemplate[] = [
  {
    id: 'template_30d_discipline',
    title: '30-Day Discipline Reset',
    description: 'Build core daily discipline through 30 consecutive days of focused execution.',
    category: 'Personal Growth',
    planType: 'habit_journey',
    cadence: 'daily',
    duration: 30,
  },
  {
    id: 'template_90d_reading',
    title: '90-Day Reading Challenge',
    description: 'Expand your knowledge base by reading 12 impactful books over the next 90 days.',
    category: 'Learning',
    planType: 'target_goal',
    targetValue: 12,
    targetUnit: 'books',
    getTargetDate: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'template_get_fit',
    title: 'Get Fit Fundamentals',
    description: 'A foundational milestone roadmap to establish consistent physical health and nutrition habits.',
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
];
