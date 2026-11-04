import { Fig, Gain, Loss, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { PRESET_HABIT_POINTS } from '@/lib/pointsConfig';
import { CUSTOM_HABIT_POINTS } from '@/lib/habitAwards';
import { missRule } from './penalties';

/**
 * Habits. Rules from lib/pointsConfig.ts PRESET_HABIT_POINTS + recomputeTodayPresetPoints (first ticked
 * first), lib/habitAwards.ts CUSTOM_HABIT_POINTS, lib/missPenalty.ts (miss multipliers), HabitRow
 * (swipe: right Done/Undo, left Delete; the Reading habit can't be ticked by hand), pact habit link.
 */
export const habitsGuide: HowItWorksGuide = {
  title: 'How habits work',
  intro: 'Tick what you did today and keep your streaks going.',
  steps: [
    { title: 'Add a habit', text: 'Pick one from the library or write your own, daily or weekly.' },
    {
      title: 'Tick it',
      text: 'Tick a daily habit today, or a weekly habit once this week. On a phone you can also swipe a row: right for done, left to delete.',
    },
    {
      title: 'Linked ticks',
      text: 'The Reading habit ticks itself when you log reading. A habit in a partner challenge ticks the challenge too, and the other way round.',
    },
  ],
  notes: ['Deleting a habit removes only today’s points from it. Earlier points and penalties stay.'],
  points: [
    <>
      Library habits earn their own points, daily custom habits <Gain>{pts(CUSTOM_HABIT_POINTS, true)}</Gain> each, up to{' '}
      <Fig>{pts(PRESET_HABIT_POINTS.dailyCap)}</Fig> a day for all of them together. The ones you tick first count first.
    </>,
    'Weekly custom habits earn no points.',
    <>
      A library habit left unticked for a day <Loss>costs its points</Loss>, from the day you add it. Each further miss in a row costs{' '}
      <Fig>×{missRule.again}</Fig>; from {missRule.rank} rank, <Fig>×{missRule.second}</Fig> for the 2nd and <Fig>×{missRule.third}</Fig> from
      the 3rd (rounded). Ticking it resets the count.
    </>,
    'Custom habits have no penalty. The Reading habit earns no points and has no penalty.',
  ],
};
