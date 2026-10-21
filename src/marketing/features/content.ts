import type { FeatureSlug } from './catalog';
import type { FeatureContent } from './blocks';
import { badHabits } from './pages/badHabits';
import { habits } from './pages/habits';
import { journal } from './pages/journal';
import { projectsGoals } from './pages/projectsGoals';
import { weeklyGoals } from './pages/weeklyGoals';

/** Written feature pages; a slug missing here still renders its heading (pages still to come). */
export const FEATURE_CONTENT: Partial<Record<FeatureSlug, FeatureContent>> = {
  habits,
  'bad-habits': badHabits,
  journal,
  'weekly-goals': weeklyGoals,
  'projects-goals': projectsGoals,
};
