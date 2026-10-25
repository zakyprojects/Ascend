import { TIME_TRACKER_POINTS } from '@/lib/pointsConfig';
import { TIME_TRACKER_GRACE_MINUTES } from '@/lib/timeTrackerAwards';
import { ASCEND_RECOMMENDED_DAY_BLOCKS, ASCEND_RECOMMENDED_DAY_TITLE, DEFAULT_TIME_TRACKER_ACTIVITIES } from '@/types';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/time-blocking. Sources: lib/pointsConfig.ts TIME_TRACKER_POINTS +
   calculateTimeTrackerDailyPoints (tiers, skip rule), lib/timeTrackerAwards.ts (server-written,
   TIME_TRACKER_GRACE_MINUTES), lib/capCopy.ts timeTrackerCapNote, types.ts
   DEFAULT_TIME_TRACKER_ACTIVITIES + ASCEND_RECOMMENDED_DAY_BLOCKS, components/views/TimeTrackerView.tsx
   and components/views/timeTracker/* (Day, Templates, Categories, the 8+8+8 guide, NowCard). */

const T = TIME_TRACKER_POINTS;
const { high, medium } = T.tiers;
const skipPct = Math.round(T.skipExclusionRatio * 100);
const graceHour = `${String(Math.floor(TIME_TRACKER_GRACE_MINUTES / 60)).padStart(2, '0')}:00`;
const linked = DEFAULT_TIME_TRACKER_ACTIVITIES.filter((a) => a.ascendModule).map((a) => a.name);
const builtIn = DEFAULT_TIME_TRACKER_ACTIVITIES.map((a) => a.name);
const recommendedCount = ASCEND_RECOMMENDED_DAY_BLOCKS.length;
const list = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const timeBlocking: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s Time Tracker is a free time blocking app for the web: split your day into blocks, tick each one off as
        you finish it, and earn up to {pts(T.dailyCap)} a day for following your own plan. Build a day once as a template
        and it fills your weekdays on its own.
      </p>
      <p>
        Most planners only show the plan. This one also shows what really happened, because each block ends up done,
        skipped or missed, and the day’s score says how close you came.
      </p>
    </>
  ),
  heroShot: {
    name: 'time-blocking-phone',
    width: 540,
    height: 1246,
    alt: 'The Time Tracker on a phone: a day with 5 of 9 blocks done, 3 of 5 points today, and the current block, Python practice, with Done, Skip and Open Skills buttons',
  },
  body: (
    <>
      <Block id="how-title" title="A daily time block planner">
        <Steps
          items={[
            {
              title: 'Add blocks to the day',
              text: 'Give each block a start, an end and a category, plus an optional title and notes. Blocks can’t overlap, and one that runs past midnight is split into two parts, one on each day.',
            },
            {
              title: 'Or apply a template',
              text: 'Pick a saved day and add it to today or a later day. Merge keeps what is already planned and leaves out blocks that would overlap; Replace swaps the whole day.',
            },
            {
              title: 'Follow the Now card',
              text: 'The block you are in shows at the top with the time left in it, what comes next, and buttons to mark it done or skip it.',
            },
            {
              title: 'Tick blocks off',
              text: `Mark each block done when it is finished. Until ${graceHour} the next morning you can still tick the last block of the day before, so a late night doesn’t cost you.`,
            },
          ]}
        />
        <Note title="Past days are a record.">
          Today and later days can be changed. Earlier days can’t, so the week strip at the top shows the days you really
          followed your plan, with a check on each day that reached the top score.
        </Note>
      </Block>

      <Block
        id="templates-title"
        title="Day templates: build a day once"
        lead={
          <>
            <p>
              A template is a day you can reuse, such as a class day, a work day or a weekend. Choose the weekdays it
              fills, and every empty day on those weekdays starts with its blocks. Each weekday belongs to one template,
              and days you already planned stay as they are.
            </p>
            <p>
              If you don’t know where to start, add “{ASCEND_RECOMMENDED_DAY_TITLE}”: {recommendedCount} blocks with sleep,
              a workout, three deep-work sessions with short breaks, skill practice, meals, reading and a wind-down, with
              free time left on purpose. Edit it into your own.
            </p>
          </>
        }
      >
        <Cards
          items={[
            { title: '8 hours: hard work', text: 'Deep focus and your career. The guide on the Templates tab starts here.' },
            { title: '8 hours: life', text: 'Family, friends, faith, health, hobbies and the things that make a day good.' },
            { title: '8 hours: sleep', text: 'Rest for your mind and body, planned as a block like everything else.' },
          ]}
        />
      </Block>

      <Block
        id="categories-title"
        title="Categories that open the right page"
        lead={
          <p>
            Every block has a category with its own colour and icon. AscendDay starts you with {builtIn.length}:{' '}
            {list(builtIn)}. Add your own, like Classes or Family, and give a block a second category when it is two
            things at once.
          </p>
        }
      >
        <Note title="Linked to the rest of AscendDay.">
          {list(linked)} come linked to their pages: their blocks get a button that opens the{' '}
          <a href={featurePath('brain-lessons')} className={LINK_CLASS}>
            focus timer
          </a>
          , the{' '}
          <a href={featurePath('exercise')} className={LINK_CLASS}>
            workout log
          </a>
          , the{' '}
          <a href={featurePath('reading')} className={LINK_CLASS}>
            Reading Hub
          </a>{' '}
          or{' '}
          <a href={featurePath('skills')} className={LINK_CLASS}>
            Skills
          </a>
          . You can link your own categories the same way. Ticking a block doesn’t log the workout or the pages for you;
          those earn their own points on their own pages.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How time blocks earn points"
        lead={
          <p>
            Points come from the share of today’s blocks you finished, worked out again each time you tick one. The day is
            scored once, up to {pts(T.dailyCap)}, however many blocks it has.
          </p>
        }
      >
        <Rules
          caption="Points for the day"
          rows={[
            { what: `${high.minPercent}% of blocks done or more`, amount: `+${high.points}` },
            { what: `${medium.minPercent}% to ${high.minPercent - 1}% done`, amount: `+${medium.points}` },
            { what: `Under ${medium.minPercent}% done`, amount: '0', tone: 'none' },
            {
              what: 'A block left open',
              amount: 'Not done',
              tone: 'none',
              note: 'A block you neither tick nor skip counts as not done.',
            },
            {
              what: 'Skipped blocks',
              amount: 'Left out',
              tone: 'none',
              note: `Up to ${skipPct}% of the day’s blocks (rounded down, at most ${T.maxExcludedSkips}) are left out of the count. A day of ${T.smallRoutineThreshold} blocks or fewer leaves none out.`,
            },
          ]}
        />
        <Note title="An example.">
          A day of 10 blocks: finish 8 and it is {high.minPercent}%, worth {pts(high.points)}. Finish 7 and skip 2 instead:
          the 2 skips are left out, so 7 of 8 counts and it is still {pts(high.points)}. Skipping is for the honest “this
          didn’t happen today”, not a way around the plan, which is why only a few skips are forgiven.
        </Note>
        <div className="scroll-rise mt-6 max-w-3xl space-y-3 text-sm leading-relaxed text-content-tertiary">
          <p>
            With an account the server writes the day’s points, so every device shows the same score. A day’s points
            freeze at {graceHour} the next morning. Deleting a done block today works the score out again; earlier days
            keep theirs.
          </p>
        </div>
      </Block>

      <Block
        id="connect-title"
        title="Where the points go"
        lead={
          <p>
            Time Tracker points count toward your season like every other part of AscendDay, so they move your{' '}
            <a href={featurePath('ranks')} className={LINK_CLASS}>
              rank
            </a>{' '}
            and your place in the{' '}
            <a href={featurePath('leagues')} className={LINK_CLASS}>
              leagues
            </a>
            . A plan you follow is worth up to {pts(T.dailyCap)} a day here, and the blocks themselves are where the
            workouts, reading and practice happen that earn the rest.
          </p>
        }
      />
    </>
  ),
  wideShot: {
    name: 'time-blocking-desktop',
    width: 1400,
    height: 852,
    alt: 'The Time Tracker on a computer: the week strip from Monday to Sunday, 14h 15m planned and 9h 15m done, 3 of 5 points, and the Now card for a Python practice block with under an hour left',
    caption: 'The Time Tracker on a computer, with the demo user Ali’s class day.',
  },
  facts: [
    ['Points', `${high.points} at ${high.minPercent}% of blocks, ${medium.points} at ${medium.minPercent}%`],
    ['Daily cap', pts(T.dailyCap)],
    ['Skips forgiven', `Up to ${skipPct}% of blocks, at most ${T.maxExcludedSkips}`],
    ['Late finish', `Yesterday’s last block can be ticked until ${graceHour}`],
    ['Templates', 'Reusable days that fill the weekdays you pick'],
    ['Categories', `${builtIn.length} built in, plus your own`],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You already plan your day and want to see how often you stick to it.',
    'Your weekdays look alike, so a template saves you planning every morning.',
    'You like time blocking with rewards: a small daily score helps you take the plan seriously.',
  ],
  notFor: [
    'You need a calendar for meetings with other people; AscendDay doesn’t sync with Google or Outlook calendars.',
    'You want to log hours for clients or invoices; this tracks your own plan, not billable time.',
  ],
  faq: [
    {
      q: 'What is time blocking?',
      a: 'Giving every part of the day a job ahead of time: 9 to 11 deep work, 11 to 11:15 a break, and so on. AscendDay adds the other half: ticking each block off, so you see what really happened.',
    },
    {
      q: 'Is the Time Tracker free?',
      a: 'Yes. AscendDay is free while in beta, and templates, categories and points are all included.',
    },
    {
      q: 'Do I have to plan every day by hand?',
      a: 'No. Make a template, choose its weekdays, and each empty day on those weekdays starts with its blocks. You can still change any day before it starts.',
    },
    {
      q: 'What happens to a block I didn’t do?',
      a: `Skip it, or leave it open. A skipped block can be left out of the score (up to ${skipPct}% of the day’s blocks, at most ${T.maxExcludedSkips}); a block left open counts as not done.`,
    },
    {
      q: 'Can I plan a block that goes past midnight?',
      a: 'Yes. A block such as 23:00 to 07:00 sleep is saved as two parts, one at the end of the first day and one at the start of the next.',
    },
  ],
  related: ['brain-lessons', 'skills', 'weekly-goals', 'habits'],
  cta: { title: 'Plan tomorrow in blocks', text: 'Start from the recommended day and make it yours in five minutes.' },
};
