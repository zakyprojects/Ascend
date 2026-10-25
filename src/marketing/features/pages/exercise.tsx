import { WORKOUT_POINTS } from '@/lib/pointsConfig';
import { DEFAULT_WORKOUT_TYPES } from '@/lib/workoutTypes';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/exercise. Sources: lib/pointsConfig.ts WORKOUT_POINTS + calculateWorkoutPoints (floor per
   workout, daily cap), lib/workoutAwards.ts (server-written day award), lib/workoutTypes.ts
   (suggested workouts, one name whatever the spelling), lib/capCopy.ts capNote('exercise'),
   components/views/ExerciseTracker.tsx (log form, Log again, streak, the page's "How points work"). */

const W = WORKOUT_POINTS;
const U = W.units;
const list = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const example = [
  { what: '30 minutes of yoga', points: Math.floor(30 / U.minsPerPoint) },
  { what: '50 push-ups', points: Math.floor(50 / U.repsPerPoint) },
  { what: '5 sets of squats', points: 5 * U.pointsPerSet },
  { what: 'a 3 km run', points: 3 * U.pointsPerKm },
];

export const exercise: FeatureContent = {
  intro: (
    <>
      <p>
        Exercise in AscendDay is a free workout tracker that earns points, right in your browser: log a run, a gym session, push-ups or a bike ride in a
        few taps, and every workout moves your rank. Count it in minutes, reps, sets or kilometres, whatever fits what
        you did.
      </p>
      <p>
        It is made for people who move for their health, not for a coach. No training plans, no set-by-set spreadsheet:
        just what you did today, a streak, and a score that rewards turning up.
      </p>
    </>
  ),
  heroShot: {
    name: 'exercise-phone',
    width: 540,
    height: 1246,
    alt: 'Exercise on a phone: 8 of 10 workout points today, 4 workouts this week on 3 of 7 days, a 3-day exercise streak and a chart of points per day',
  },
  body: (
    <>
      <Block id="how-title" title="Your gamified workout log">
        <Steps
          items={[
            {
              title: 'Name the workout',
              text: `Type what you did or tap a suggestion: ${list(DEFAULT_WORKOUT_TYPES)} to start with, then your own recent workouts. “Push ups” and “push-ups” count as the same workout.`,
            },
            {
              title: 'Choose how to count it',
              text: 'Minutes for anything timed, reps for push-ups or pull-ups, sets for the gym, kilometres for a run, walk or ride. Use whichever describes it best.',
            },
            {
              title: 'Enter the amount',
              text: 'The form shows the points before you save, and how many are left under today’s cap.',
            },
            {
              title: 'Log it again tomorrow',
              text: 'Your recent workouts show as “Log again” chips with their last amount, so a regular routine is one tap.',
            },
          ]}
        />
        <Note title="Today only.">
          Workouts are logged on the day you do them. You can delete today’s, but you can’t add one to last week, so the
          streak and the chart are what really happened.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How workouts earn points"
        lead={
          <p>
            Each workout is scored on its own, rounded down to whole points, and the day adds them up to a cap. The same
            rules sit under “How points work” on the Exercise page.
          </p>
        }
      >
        <Rules
          caption="One point for each"
          rows={[
            { what: `${U.minsPerPoint} minutes`, amount: '+1', note: 'Running for 30 minutes, a yoga class, a swim.' },
            { what: `${U.repsPerPoint} reps`, amount: '+1', note: 'Push-ups, sit-ups, pull-ups, squats.' },
            { what: '1 set', amount: `+${U.pointsPerSet}`, note: 'A gym exercise counted in sets.' },
            { what: '1 km', amount: `+${U.pointsPerKm}`, note: 'A run, walk or ride by distance.' },
            {
              what: 'Daily cap, all workouts together',
              amount: `${W.dailyCap} a day`,
              tone: 'none',
              note: 'More workouts still save, and still count for the streak and your goals, without points.',
            },
            {
              what: 'Deleting today’s workout',
              amount: 'Taken back',
              tone: 'loss',
              note: 'Earlier days keep their points.',
            },
          ]}
        />
        <Note title="A few examples.">
          {example.map((e) => `${e.what} earns ${pts(e.points)}`).join('; ')}. Do two of them on the same day and you are
          close to the {W.dailyCap}-point cap. A 9-minute stretch earns 1, because only full {U.minsPerPoint}-minute blocks
          count.
        </Note>
      </Block>

      <Block
        id="fair-title"
        title="Fair across very different workouts"
        lead={
          <>
            <p>
              A {W.dailyCap * U.minsPerPoint}-minute run, {W.dailyCap * U.repsPerPoint} push-ups and {W.dailyCap} km on a
              bike all reach the same cap. Whatever kind of exercise you like, a day of it is worth the same, so the score
              follows how often you move rather than how extreme one session was. Once the cap is reached the form says
              so, and the workout still saves.
            </p>
            <p>
              Workouts have the same daily cap as habits, reading, skills and the focus timer, so nobody climbs the
              leagues on workouts alone. A short session on most days does more for your rank than one huge one a week.
            </p>
          </>
        }
      />

      <Block
        id="connect-title"
        title="Exercise in the rest of AscendDay"
        lead={<p>A logged workout reaches further than this page:</p>}
      >
        <Cards
          items={[
            {
              title: 'Weekly goals',
              text: (
                <>
                  Goals like “Run 15 km” or “3 workouts this week” on{' '}
                  <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
                    Weekly Goals
                  </a>{' '}
                  fill in from your logs, for all workouts or one type.
                </>
              ),
            },
            {
              title: 'Time blocks',
              text: (
                <>
                  Exercise and Walking blocks in the{' '}
                  <a href={featurePath('time-blocking')} className={LINK_CLASS}>
                    Time Tracker
                  </a>{' '}
                  get a button that opens this page.
                </>
              ),
            },
            {
              title: 'Partners and ranks',
              text: (
                <>
                  Your{' '}
                  <a href={featurePath('accountability-partners')} className={LINK_CLASS}>
                    partners
                  </a>{' '}
                  see your stats, such as exercise minutes, and the points count toward your{' '}
                  <a href={featurePath('ranks')} className={LINK_CLASS}>
                    rank
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
      </Block>
    </>
  ),
  wideShot: {
    name: 'exercise-desktop',
    width: 1400,
    height: 727,
    alt: 'Exercise on a computer: Log again chips for push-ups and running, today’s 50 push-ups for 5 points and a 3 km run for 3 points, and 8 of 10 workout points',
    caption: 'Exercise on a computer, with the demo user Ali’s workouts.',
  },
  facts: [
    ['Points', `${U.minsPerPoint} min, ${U.repsPerPoint} reps, 1 set or 1 km = 1 point`],
    ['Daily cap', pts(W.dailyCap)],
    ['Count in', 'Minutes, reps, sets or kilometres'],
    ['Streak', 'Days in a row with a workout'],
    ['Logging', 'Today’s workouts, any type'],
    ['Goals', 'Weekly goals fill in from workouts'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You want to move most days and like a score for it.',
    'You mix running, home workouts and the gym and want one simple exercise tracker with points.',
    'You want a workout tracker with friends, without a subscription.',
  ],
  notFor: [
    'You follow a strength programme and need weights, sets and reps per exercise; a dedicated lifting app does that better.',
    'You want GPS routes, heart rate or watch sync; AscendDay doesn’t connect to wearables.',
  ],
  faq: [
    {
      q: 'Is the workout tracker free?',
      a: 'Yes. AscendDay is free while in beta, with no subscription and no paid tier.',
    },
    {
      q: 'Which workouts can I log?',
      a: 'Any. Type its name, then count it in minutes, reps, sets or kilometres. Suggestions help you start, and your own workouts come back as one-tap chips.',
    },
    {
      q: 'How many points is a workout worth?',
      a: `One point per ${U.minsPerPoint} minutes, ${U.repsPerPoint} reps, set or kilometre, rounded down, up to ${pts(W.dailyCap)} a day for all workouts together.`,
    },
    {
      q: 'Can I log yesterday’s workout?',
      a: 'No, only today’s. If you forgot, log it on time next time; the streak shows the days you logged.',
    },
    {
      q: 'Can my friends see my workouts?',
      a: 'Your partners, and other members if your profile is public, see stat summaries such as your exercise minutes. The list of workouts itself stays in your own log.',
    },
  ],
  related: ['habits', 'weekly-goals', 'accountability-partners', 'leagues'],
  cta: { title: 'Log today’s workout', text: 'Ten push-ups is a start, and it already counts.' },
};
