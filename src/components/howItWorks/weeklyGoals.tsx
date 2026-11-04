import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { WEEKLY_GOALS_POINTS, WEEKLY_REFLECTION_POINTS } from '@/lib/pointsConfig';

/**
 * Weekly Goals. Rules from lib/pointsConfig.ts WEEKLY_GOALS_POINTS / WEEKLY_REFLECTION_POINTS
 * (first goals reached by completion time), lib/weeklyAwards.ts reflectionWindow (Friday 06:00 to
 * the end of Monday, local), lib/linkedGoalMetrics.ts (habit, exercise, book, skill and one skill
 * count), GoalFormDialog ("Progress from"), GoalRow ("Ticks itself from linked activity"),
 * CarryOverCard (recent weeks: carry over or dismiss). Weeks run Monday to Sunday (lib/dates.ts).
 */
const G = WEEKLY_GOALS_POINTS;

export const weeklyGoalsGuide: HowItWorksGuide = {
  title: 'How weekly goals work',
  intro: 'Pick a few goals for this week, Monday to Sunday.',
  steps: [
    { title: 'Add a goal', text: 'A title, an optional note and a priority.' },
    {
      title: 'Progress from',
      text: 'Link it to a habit, exercise, a book or a skill and it fills itself from what you log this week, then ticks itself at its target. Or update it yourself.',
    },
    { title: 'Skill counts', text: 'A skill goal can add up one count, like 300 reps of scales.' },
    { title: 'Reflect', text: 'Write the week’s reflection from Friday 6:00 AM until the end of Monday.' },
    { title: 'Carry over', text: 'Unfinished goals from recent weeks show up at the top. Carry one into this week or dismiss it.' },
  ],
  points: [
    <>
      Each goal you reach = <Gain>{pts(G.pointsPerGoal, true)}</Gain>. Only the first <Fig>{G.maxGoalsCounted}</Fig> you reach count, so up to{' '}
      <Fig>{pts(G.maxWeeklyPoints)}</Fig> a week.
    </>,
    <>
      The first reflection written in its window = <Gain>{pts(WEEKLY_REFLECTION_POINTS.awarded, true)}</Gain>.
    </>,
    'Goals earn only during their own week, the reflection only inside its window.',
    'A goal or reflection that earned on an earlier day keeps its points if you untick or delete it later.',
  ],
};
