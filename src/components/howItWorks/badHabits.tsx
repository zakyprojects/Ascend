import { Fig, Gain, Loss, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { BAD_HABIT_POINTS } from '@/lib/points/pointsConfig';
import { PRESET_BAD_HABITS } from '@/lib/content/presets';
import { missRule } from './penalties';

/**
 * Bad habits. Rules from lib/pointsConfig.ts BAD_HABIT_POINTS (resist cap, slip = the habit's points,
 * at most dailyPenaltyLimit a day), lib/presets.ts PRESET_BAD_HABITS, lib/missPenalty.ts, BadHabitRow
 * (Resisted / Slipped, Undo), Partners resist card (linked: logs through store.logBadHabitDay).
 */
const P = BAD_HABIT_POINTS;
const presetPoints = PRESET_BAD_HABITS.map((h) => h.points);
const penaltyRange = `−${Math.min(...presetPoints)} to ${pts(-Math.max(...presetPoints))}`;

export const badHabitsGuide: HowItWorksGuide = {
  title: 'How bad habits work',
  intro: 'Log each bad habit once a day: resisted or slipped.',
  steps: [
    { title: 'Add a bad habit', text: 'Pick one from the library or write your own.' },
    {
      title: 'Each day',
      text: 'Tap Resisted, or Slipped if it happened. A day you don’t log counts as a slip, charged after midnight.',
    },
    {
      title: 'Partner challenge',
      text: 'Link a bad habit to a resist challenge on Partners. Logging it here or on the challenge card counts in both places.',
    },
  ],
  notes: [
    'Tap Reorder to list your bad habits in your own order. It changes only the list, never points or penalties.',
    'Deleting a bad habit removes only today’s points from it. Earlier points and penalties stay.',
  ],
  points: [
    <>
      Resisted: library bad habits earn their own points (shown when you add them), custom ones{' '}
      <Gain>{pts(P.customResist, true)}</Gain>. Up to <Fig>{pts(P.dailyCap)}</Fig> a day for all of them together; the ones you log
      first count first.
    </>,
    <>
      Slipped, or a day not logged: the same as the habit’s resist points (library <Loss>{penaltyRange}</Loss>, custom{' '}
      <Loss>{pts(-P.customResist)}</Loss>), counting from the day you added it.
    </>,
    <>
      At most <Fig>{P.dailyPenaltyLimit}</Fig> bad habits lose points a day: the {P.dailyPenaltyLimit} largest penalties count, the rest
      cost nothing.
    </>,
    <>
      Each bad day in a row costs more: <Fig>×{missRule.again}</Fig>; from {missRule.rank} rank <Fig>×{missRule.second}</Fig> for the 2nd and{' '}
      <Fig>×{missRule.third}</Fig> from the 3rd (rounded). Resisting resets the count.
    </>,
  ],
};
