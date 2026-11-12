import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { SKILLS_POINTS, WEEKLY_GOALS_POINTS } from '@/lib/points/pointsConfig';
import { SKILL_LEVELS } from '@/lib/skillLevels';

/**
 * Skills. Rules from lib/pointsConfig.ts SKILLS_POINTS (minutes only), lib/skillLevels.ts, lib/skillDrills.ts
 * (counts, "drills" in code: minutes stay required, counts earn nothing on their own, a weekly goal
 * can count one), SkillTracker.tsx (Log practice: today only, "How many minutes?" required; edit: minutes on the
 * log's own day only), lib/focusSkillLog.ts (a focus session with a skill adds a normal practice log).
 */
const levels = SKILL_LEVELS.filter((l) => l.next && l.below != null)
  .map((l) => `${l.below} hrs ${l.next}`)
  .join(', ');

export const skillsGuide: HowItWorksGuide = {
  title: 'How skills work',
  intro: 'Log the minutes you practise. Hours build each skill’s level.',
  steps: [
    { title: 'Add a skill', text: 'Anything you’re building, like Programming, Public speaking or Spanish.' },
    { title: 'Log practice', text: 'How many minutes you practised today. Minutes are required, and only today can be logged. A Deep Focus session tagged with a skill logs its minutes here too.' },
    { title: 'Levels', text: <>All your hours on a skill build its level: {levels}.</> },
    {
      title: 'Counts',
      text: 'Optional. A count tracks output next to the minutes, like LeetCode problems in Programming, practice talks in Public speaking or new words in Spanish. Name it in Log practice, then add how many each time, like 45 min and 3 problems.',
    },
    {
      title: 'Weekly goals',
      text: 'A weekly goal can follow a skill’s minutes, its sessions or one of its counts, like 15 LeetCode problems this week.',
    },
  ],
  notes: [
    'Edit a log’s note and counts any time. Its minutes can only change on the day you logged them.',
    'Deleting today’s practice takes its points back. Earlier days keep their points and hours.',
    'Deleting old logs can break a skill’s streak.',
    'Tap Reorder to put your skills, or a skill’s counts, in your own order. With a category picked, only its skills move.',
  ],
  points: [
    <>
      Every <Fig>{SKILLS_POINTS.minutesPerPoint}</Fig> min of practice = <Gain>1 pt</Gain>, up to <Fig>{pts(SKILLS_POINTS.dailyCap)}</Fig> a day
      across all skills.
    </>,
    'Only minutes earn points. Counts earn none on their own, so every log needs its minutes.',
    <>
      A weekly goal on a count earns like any weekly goal: <Gain>{pts(WEEKLY_GOALS_POINTS.pointsPerGoal, true)}</Gain> if it’s one of the
      first <Fig>{WEEKLY_GOALS_POINTS.maxGoalsCounted}</Fig> you reach that week.
    </>,
  ],
};
