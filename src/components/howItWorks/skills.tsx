import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { SKILLS_POINTS, WEEKLY_GOALS_POINTS } from '@/lib/pointsConfig';
import { SKILL_LEVELS } from '@/lib/skillLevels';
import { DRILL_UNIT_DEFAULT } from '@/lib/skillDrills';

/**
 * Skills. Rules from lib/pointsConfig.ts SKILLS_POINTS (minutes only), lib/skillLevels.ts, lib/skillDrills.ts
 * (counts, "drills" in code: minutes stay required, counts earn nothing on their own, a weekly goal
 * can count one), SkillTracker.tsx (Log practice: today only, "How many minutes?" required).
 */
const levels = SKILL_LEVELS.filter((l) => l.next && l.below != null)
  .map((l) => `${l.below} hrs ${l.next}`)
  .join(', ');

export const skillsGuide: HowItWorksGuide = {
  title: 'How skills work',
  intro: 'Log the minutes you practise. Hours build each skill’s level.',
  steps: [
    { title: 'Add a skill', text: 'Anything you’re learning, like guitar or Spanish.' },
    { title: 'Log practice', text: 'How many minutes you practised today. Minutes are required, and only today can be logged.' },
    { title: 'Levels', text: <>All your hours on a skill build its level: {levels}.</> },
    {
      title: 'Counts',
      text: `Track one part of a skill, like scales, in ${DRILL_UNIT_DEFAULT} or your own unit. Add a count while you log practice.`,
    },
    {
      title: 'Weekly goals',
      text: 'A weekly goal can follow a skill’s minutes or sessions, or add up one count, like 300 reps of scales.',
    },
  ],
  notes: [
    'Deleting today’s practice takes its points back. Earlier days keep their points and hours.',
    'Deleting old logs can break a skill’s streak.',
  ],
  points: [
    <>
      Every <Fig>{SKILLS_POINTS.minutesPerPoint}</Fig> min of practice = <Gain>1 pt</Gain>, up to <Fig>{pts(SKILLS_POINTS.dailyCap)}</Fig> a day
      across all skills.
    </>,
    'Only minutes earn points. Counts earn none on their own.',
    <>
      A weekly goal on a count earns like any weekly goal: <Gain>{pts(WEEKLY_GOALS_POINTS.pointsPerGoal, true)}</Gain> if it’s one of the
      first <Fig>{WEEKLY_GOALS_POINTS.maxGoalsCounted}</Fig> you reach that week.
    </>,
  ],
};
