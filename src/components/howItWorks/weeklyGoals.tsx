import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { WEEKLY_GOALS_POINTS, WEEKLY_REFLECTION_POINTS } from '@/lib/pointsConfig';

/**
 * Weekly Goals. Rules from lib/pointsConfig.ts WEEKLY_GOALS_POINTS / WEEKLY_REFLECTION_POINTS
 * (first goals reached by completion time), lib/weeklyAwards.ts reflectionWindow (Friday 06:00 to
 * the end of Monday, local), lib/linkedGoalMetrics.ts (habit, exercise, book, skill and one skill
 * count, the metrics and "any" items GoalFormDialog offers), GoalFormDialog ("Progress from"; a manual goal's
 * Target + Unit, default "times"; a weekly habit's target fixed at 1), GoalRow ("Ticks itself from linked activity";
 * manual goals tick or Update), CarryOverCard (recent weeks: carry over or dismiss). Weeks run Monday to Sunday (lib/dates.ts).
 */
const G = WEEKLY_GOALS_POINTS;

export const weeklyGoalsGuide: HowItWorksGuide = {
  title: 'How weekly goals work',
  intro: 'Pick a few goals for this week, Monday to Sunday.',
  steps: [
    { title: 'Add a goal', text: 'A title, an optional note and a priority.' },
    {
      title: 'Progress from',
      text: 'Choose “I update it myself”, or link the goal to what you already log. A linked goal fills itself from this week’s logs and ticks itself at its target.',
    },
    {
      title: 'Linked goals',
      text: 'A habit: days ticked. Exercise: workouts, minutes, reps, sets or km, for one workout or any. A book: pages or chapters, for one book or any. A skill: minutes or sessions, for one skill or any, or one of its counts, like 15 LeetCode problems.',
    },
    {
      title: 'Your own goals',
      text: 'With “I update it myself”, set a target and a unit, like 2 job applications, then update the number or tick it when done.',
    },
    { title: 'Reflect', text: 'Write the week’s reflection from Friday 6:00 AM until the end of Monday.' },
  ],
  notes: [
    'A linked goal counts the whole week’s logs, including ones from before you added it.',
    'A weekly habit counts once a week, so its target is 1.',
    'Unfinished goals from recent weeks show up at the top. Carry one into this week or dismiss it.',
  ],
  points: [
    <>
      Each goal you reach = <Gain>{pts(G.pointsPerGoal, true)}</Gain>. Only the first <Fig>{G.maxGoalsCounted}</Fig> you reach count, so up to{' '}
      <Fig>{pts(G.maxWeeklyPoints)}</Fig> a week.
    </>,
    <>
      The first reflection written in its window = <Gain>{pts(WEEKLY_REFLECTION_POINTS.awarded, true)}</Gain>.
    </>,
    'Linked and manual goals earn the same. A goal on a skill count earns like any other goal.',
    'Goals earn only during their own week, the reflection only inside its window.',
    'A goal or reflection that earned on an earlier day keeps its points if you untick or delete it later.',
  ],
};
