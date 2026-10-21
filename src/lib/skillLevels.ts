import type { SkillLevel } from '@/types';

/**
 * Skill level thresholds in practice hours (beginner → intermediate → advanced → expert): a skill is
 * at the first level whose `below` its hours haven't reached. On its own (types only) so the public
 * feature pages can show the same numbers (src/marketing); the Skills page reads it too.
 */
export const SKILL_LEVELS: { level: SkillLevel; below: number | null; next: string | null }[] = [
  { level: 'beginner', below: 10, next: 'Intermediate' },
  { level: 'intermediate', below: 25, next: 'Advanced' },
  { level: 'advanced', below: 50, next: 'Expert' },
  { level: 'expert', below: null, next: null },
];
