import type { FeatureSlug } from './catalog';
import type { FeatureContent } from './blocks';
import { accountabilityPartners } from './pages/accountabilityPartners';
import { badHabits } from './pages/badHabits';
import { brainLessons } from './pages/brainLessons';
import { exercise } from './pages/exercise';
import { habits } from './pages/habits';
import { journal } from './pages/journal';
import { leagues } from './pages/leagues';
import { plans } from './pages/plans';
import { projectsGoals } from './pages/projectsGoals';
import { ranks } from './pages/ranks';
import { reading } from './pages/reading';
import { recovery } from './pages/recovery';
import { skills } from './pages/skills';
import { timeBlocking } from './pages/timeBlocking';
import { weeklyGoals } from './pages/weeklyGoals';

/** Every feature page's copy (a new slug in catalog.ts needs its page here). */
export const FEATURE_CONTENT: Record<FeatureSlug, FeatureContent> = {
  habits,
  'bad-habits': badHabits,
  exercise,
  reading,
  skills,
  'time-blocking': timeBlocking,
  recovery,
  'brain-lessons': brainLessons,
  journal,
  'weekly-goals': weeklyGoals,
  'projects-goals': projectsGoals,
  plans,
  leagues,
  ranks,
  'accountability-partners': accountabilityPartners,
};
