import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { WORKOUT_POINTS } from '@/lib/points/pointsConfig';

/**
 * Exercise. Rules from lib/pointsConfig.ts WORKOUT_POINTS + calculateWorkoutPoints (floor per unit,
 * daily cap), ExerciseTracker.tsx (measures Minutes/Reps/Sets/Km, Log again, today only).
 */
const U = WORKOUT_POINTS.units;

export const exerciseGuide: HowItWorksGuide = {
  title: 'How exercise works',
  intro: 'Log what you did today, in the unit that fits it.',
  steps: [
    { title: 'Log a workout', text: 'What you did and how much: minutes, reps, sets or km. Only today can be logged.' },
    { title: 'Log again', text: 'Recent workouts sit under Log again, so a repeat takes one tap and the amount.' },
  ],
  notes: [
    'Deleting today’s workout takes its points back. Earlier days keep their points.',
    'Deleting old logs can break your exercise streak.',
  ],
  points: [
    <>
      <Fig>{U.minsPerPoint}</Fig> minutes, <Fig>{U.repsPerPoint}</Fig> reps, <Fig>1</Fig> set or <Fig>1</Fig> km = <Gain>1 pt</Gain>. Only
      full blocks count.
    </>,
    <>
      Up to <Fig>{pts(WORKOUT_POINTS.dailyCap)}</Fig> a day. More workouts still save, without points.
    </>,
  ],
};
