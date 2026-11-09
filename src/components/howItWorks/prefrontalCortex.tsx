import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { PFC_POINTS } from '@/lib/pointsConfig';
import { FOCUS_MINUTES_PER_POINT, FOCUS_MIN_MINUTES, focusPointsForMinutes } from '@/lib/focusPoints';
import { FOCUS_PRESETS, FOCUS_RESUME_WINDOW_MINUTES, focusFinishedPoints } from '@/lib/focusSession';

/**
 * Prefrontal Cortex. Points from lib/focusPoints.ts (rule 2: 1 pt per 12 active min, a day's
 * sessions added up, from 25 min a session) and lib/focusSession.ts (presets, 30-min resume
 * window), the late-day rule (a session that ended yesterday while the app was closed). R1 and
 * PFC_POINTS.focus.tiers are legacy (old logs only): never quoted.
 * Tabs: Focus, Schedule (follows Time Tracker blocks), Decisions (Revisit on), Emotions.
 */
const capMinutes = PFC_POINTS.focus.dailyCap * FOCUS_MINUTES_PER_POINT;

export const prefrontalCortexGuide: HowItWorksGuide = {
  title: 'How Prefrontal Cortex works',
  intro: 'Focus sessions, your schedule, decisions and emotions, in four tabs.',
  steps: [
    {
      title: 'Focus',
      text: 'Run a timed focus session. It shows on all your devices: start on one, pause, resume or complete on another. Closing the app or locking your phone keeps it running; logging out pauses it everywhere. Tag a skill and its minutes are logged as practice too.',
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
      <Gain>{pts(1, true)}</Gain> for every <Fig>{FOCUS_MINUTES_PER_POINT}</Fig> min of focus. A session counts from <Fig>{FOCUS_MIN_MINUTES}</Fig> min.
      Paused time doesn’t count.
    </>,
    <>
      The minutes of all of today’s sessions add up, so two 30-min sessions give <Fig>{pts(focusPointsForMinutes(60))}</Fig>. Any length
      works the same way: {FOCUS_PRESETS.map((p) => p.focus).join(' / ')} min on their own give{' '}
      {FOCUS_PRESETS.map((p) => focusFinishedPoints(p.focus)).join(' / ')} pts.
    </>,
    <>
      Up to <Fig>{pts(PFC_POINTS.focus.dailyCap)}</Fig> a day (<Fig>{capMinutes}</Fig> min). Minutes before midnight count on that day.
    </>,
    'Only today’s sessions earn, plus one that ended yesterday while the app was closed.',
    'Breaks, decisions and emotions earn no points.',
  ],
};
