import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { TIME_TRACKER_POINTS } from '@/lib/pointsConfig';
import { TIME_TRACKER_GRACE_MINUTES } from '@/lib/timeTrackerAwards';

/**
 * Time Tracker. Rules from lib/pointsConfig.ts TIME_TRACKER_POINTS + calculateTimeTrackerDailyPoints
 * (tiers, skip rule, open blocks count as not done), lib/timeTrackerAwards.ts (grace: yesterday's last
 * block until 02:00, DayTab graceBlockId), lib/timeTracker.ts normalizeOrSplitMidnightBlock,
 * TemplateEditorModal ("On these weekdays…"), ApplyTemplateModal (today or later), ActivityModal
 * ("Link to a section"), PFC SchedulePanel (Done/Skip there tick these blocks).
 */
const T = TIME_TRACKER_POINTS;
const { high, medium } = T.tiers;
const skipPct = Math.round(T.skipExclusionRatio * 100);
const graceTime = `${String(Math.floor(TIME_TRACKER_GRACE_MINUTES / 60)).padStart(2, '0')}:${String(TIME_TRACKER_GRACE_MINUTES % 60).padStart(2, '0')}`;

export const timeTrackerGuide: HowItWorksGuide = {
  title: 'How the Time Tracker works',
  intro: 'Plan the day in blocks, then tick each one off.',
  steps: [
    { title: 'Day', text: 'Add blocks with a start, an end and a category. A block that runs past midnight is split over the two days.' },
    { title: 'Done or skip', text: 'Tick a block when it’s done, or skip it if plans changed. A block left open counts as not done.' },
    {
      title: 'Templates',
      text: 'Save a plan as a template and pick its weekdays: a day you haven’t planned on those weekdays starts with it. You can also apply one to today or a later day.',
    },
    {
      title: 'Categories',
      text: 'Each block has a category with a colour and icon. Link a category to a section, like Reading, and its blocks get a button that opens it.',
    },
    { title: 'Schedule', text: 'Prefrontal Cortex › Schedule runs a timer through today’s blocks. Done and Skip there tick them here.' },
  ],
  notes: [
    <>
      Until <Fig>{graceTime}</Fig> you can still tick yesterday’s last block. After that the day is fixed.
    </>,
    'Other past days are read-only.',
    'Deleting a done block today works today’s points out again. Earlier days keep theirs.',
    'A small pill at the bottom of every page shows the block happening now. Drag it to either side, or turn it off in Settings › Appearance.',
    'Tap Reorder to put your categories or templates in your own order. The block picker uses the category order.',
  ],
  points: [
    <>
      Per day: <Fig>{high.minPercent}%</Fig> of blocks done or more = <Gain>{pts(high.points, true)}</Gain>,{' '}
      <Fig>
        {medium.minPercent}–{high.minPercent - 1}%
      </Fig>{' '}
      = <Gain>{pts(medium.points, true)}</Gain>, under <Fig>{medium.minPercent}%</Fig> = <Fig>0</Fig>. Up to{' '}
      <Fig>{pts(T.dailyCap)}</Fig> a day.
    </>,
    <>
      Skipped blocks are left out of the count, up to <Fig>{skipPct}%</Fig> of the day’s blocks (rounded down, at most{' '}
      <Fig>{T.maxExcludedSkips}</Fig>). On a day of <Fig>{T.smallRoutineThreshold}</Fig> blocks or fewer, every skip counts as not done.
    </>,
    'Only today’s blocks earn points, plus yesterday’s last block until the time above.',
  ],
};
