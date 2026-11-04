import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { PFC_POINTS } from '@/lib/pointsConfig';
import {
  FOCUS_FINISH_BONUS,
  FOCUS_FIRST_MILESTONE_POINTS,
  FOCUS_MILESTONES,
  FOCUS_MIN_MINUTES,
  FOCUS_STEP_MINUTES,
  FOCUS_STEP_POINTS,
} from '@/lib/focusPoints';
import { FOCUS_PRESETS, FOCUS_RESUME_WINDOW_MINUTES, focusFinishedPoints } from '@/lib/focusSession';

/**
 * Prefrontal Cortex. Points from lib/focusPoints.ts (rule R1: milestones, finish bonus) and
 * lib/focusSession.ts (presets, 30-min resume window), the late-day rule (a session that ended
 * yesterday while the app was closed). PFC_POINTS.focus.tiers is legacy (old logs only): never quoted.
 * Tabs: Focus, Schedule (follows Time Tracker blocks), Decisions (Revisit on), Emotions.
 */
const finishBonus = FOCUS_FINISH_BONUS.slice().reverse();

export const prefrontalCortexGuide: HowItWorksGuide = {
  title: 'How Prefrontal Cortex works',
  intro: 'Focus sessions, your schedule, decisions and emotions, in four tabs.',
  steps: [
    {
      title: 'Focus',
      text: 'Run a timed focus session. Closing the app or locking your phone keeps it running; logging out pauses it.',
    },
    {
      title: 'Schedule',
      text: 'A timer that follows today’s Time Tracker blocks. Done and Skip there tick the blocks on Time Tracker.',
    },
    { title: 'Decisions', text: 'Write down a choice and why, then pick a day to revisit it and note what really happened.' },
    { title: 'Emotions', text: 'Name a strong feeling and what triggered it, to help it settle.' },
  ],
  notes: [
    <>
      Resume a paused session within <Fig>{FOCUS_RESUME_WINDOW_MINUTES}</Fig> min. After that it ends at the pause: saved from{' '}
      <Fig>{FOCUS_MIN_MINUTES}</Fig> min, dropped below.
    </>,
    <>
      From <Fig>{FOCUS_MIN_MINUTES}</Fig> min you can Complete early and keep your points. Before that, Discard saves nothing.
    </>,
    'Deleting today’s session recounts today; earlier days keep theirs.',
  ],
  points: [
    <>
      <Gain>{pts(FOCUS_FIRST_MILESTONE_POINTS)}</Gain> at <Fig>{FOCUS_MIN_MINUTES}</Fig> min of focus, then <Gain>{pts(FOCUS_STEP_POINTS, true)}</Gain>{' '}
      every <Fig>{FOCUS_STEP_MINUTES}</Fig> min up to <Fig>{FOCUS_MILESTONES[FOCUS_MILESTONES.length - 1]}</Fig> min. Paused time doesn’t count.
    </>,
    <>
      Finish the length you planned:{' '}
      {finishBonus.map((b, i) => (
        <span key={b.minPlanned}>
          {i > 0 && ', '}
          <Gain>{pts(b.points, true)}</Gain> for <Fig>{b.minPlanned}</Fig> min or more
        </span>
      ))}
      . So {FOCUS_PRESETS.map((p) => p.focus).join(' / ')} min give {FOCUS_PRESETS.map((p) => focusFinishedPoints(p.focus)).join(' / ')} pts.
    </>,
    <>
      Up to <Fig>{pts(PFC_POINTS.focus.dailyCap)}</Fig> a day, counted on the day each point is reached.
    </>,
    'Only today’s sessions earn, plus one that ended yesterday while the app was closed.',
    'Breaks, decisions and emotions earn no points.',
  ],
};
