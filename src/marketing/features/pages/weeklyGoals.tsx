import { WEEKLY_GOALS_POINTS, WEEKLY_REFLECTION_POINTS } from '@/lib/pointsConfig';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/weekly-goals. Sources: lib/pointsConfig.ts WEEKLY_GOALS_POINTS +
   WEEKLY_REFLECTION_POINTS, lib/weeklyAwards.ts reflectionWindow (Friday 06:00 to the end of
   Monday, local time), lib/linkedGoalMetrics.ts (what a goal can link to), lib/capCopy.ts
   weeklyGoalsCapNote, components/views/WeeklyGoalsView.tsx and components/weekly/*. */

const G = WEEKLY_GOALS_POINTS;
const reflection = WEEKLY_REFLECTION_POINTS.awarded;
const weekMax = G.maxWeeklyPoints + reflection;
const WINDOW = 'Friday 6:00 AM to the end of Monday, your local time';

export const weeklyGoals: FeatureContent = {
  intro: (
    <>
      <p>
        Weekly Goals in AscendDay is a free weekly goals app: set a few goals each Monday, link them to your habits,
        workouts, reading or skills so their progress fills in on its own, and look back at the weekend. Reached goals
        earn {pts(G.pointsPerGoal)} each and an honest reflection earns {reflection} more.
      </p>
      <p>
        A week is long enough to get something real done and short enough to stay in view. That is why AscendDay asks for
        a few goals per week, not a yearly list.
      </p>
    </>
  ),
  heroShot: {
    name: 'weekly-goals-phone',
    width: 540,
    height: 1246,
    alt: 'Weekly Goals on a phone: 1 of 4 goals achieved this week, 5 of 20 possible points and 54% average progress',
  },
  body: (
    <>
      <Block id="how-title" title="Planning a week in AscendDay">
        <Steps
          items={[
            {
              title: 'Add a goal',
              text: 'Give it a title, an optional note and a priority: high, medium or low. Priorities show on the goal and in the high-priority score at the top.',
            },
            {
              title: 'Link it, or track it by hand',
              text: 'Link a goal to something you already log and set a target, like “Meditate 5 days” or “Run 15 km”. Or leave it unlinked and update its progress yourself.',
            },
            {
              title: 'Let the week fill it in',
              text: 'Linked goals move every time you tick the habit or log the workout, pages or practice, and tick themselves when the target is reached.',
            },
            {
              title: 'Reflect, then carry over',
              text: 'From Friday morning, write what went well and what got in the way. Next week, unfinished goals from recent weeks are offered to carry over or let go.',
            },
          ]}
        />
      </Block>

      <Block
        id="link-title"
        title="Linked weekly goals that track themselves"
        lead={<p>A linked goal counts what you already log in another part of AscendDay, from Monday to Sunday:</p>}
      >
        <Cards
          cols={2}
          items={[
            { title: 'Habit', text: 'Days you ticked one of your habits this week (or the week, for a weekly habit).' },
            {
              title: 'Exercise',
              text: (
                <>
                  Workouts logged, minutes, reps, sets or kilometres, for all workouts or one type. See the{' '}
                  <a href={featurePath('exercise')} className={LINK_CLASS}>
                    workout tracker
                  </a>
                  .
                </>
              ),
            },
            {
              title: 'Reading',
              text: (
                <>
                  Pages or chapters read, across your books or in one book from the{' '}
                  <a href={featurePath('reading')} className={LINK_CLASS}>
                    Reading Hub
                  </a>
                  .
                </>
              ),
            },
            {
              title: 'Skill',
              text: (
                <>
                  Practice minutes or sessions, for all skills or one, from{' '}
                  <a href={featurePath('skills')} className={LINK_CLASS}>
                    Skills
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
        <Note title="Anything else works too.">
          “Submit the assignment” or “Call home twice” don’t live anywhere else in the app, so they stay unlinked: you set
          a count and update it, or tick the goal when it is done.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How weekly goals earn points"
        lead={<p>Up to {weekMax} points a week: {G.maxWeeklyPoints} from goals and {reflection} from the reflection.</p>}
      >
        <Rules
          caption="Points this week"
          rows={[
            {
              what: 'Each goal reached',
              amount: `+${G.pointsPerGoal}`,
              note: `The first ${G.maxGoalsCounted} you reach, in the order you reach them, count (up to ${G.maxWeeklyPoints}).`,
            },
            { what: `Goals reached after the first ${G.maxGoalsCounted}`, amount: '0', tone: 'none', note: 'Still worth doing, still counted in your progress.' },
            {
              what: 'Weekly reflection',
              amount: `+${reflection}`,
              note: `The first reflection written in the week’s window, ${WINDOW}.`,
            },
            {
              what: 'Unticking or deleting a goal reached on an earlier day',
              amount: 'Kept',
              tone: 'none',
              note: 'So is a reflection rewarded on an earlier day.',
            },
          ]}
        />
        <Note title="A few goals, not many.">
          With points on {G.maxGoalsCounted} goals, splitting one goal into ten small ones earns nothing extra. You get the
          most out of the week by choosing a few that matter. Only the current week earns points; past weeks are kept to
          look back on and can’t be edited.
        </Note>
      </Block>

      <Block
        id="review-title"
        title="Looking back: the weekly reflection"
        lead={
          <>
            <p>
              The top of the page shows the week at a glance: goals achieved, points out of {weekMax}, average progress and
              how many high-priority goals you reached. Step back to earlier weeks to see them, and a trend chart shows
              your average progress over the last weeks.
            </p>
            <p>
              The reflection opens on Friday morning and stays open until Monday ends, so a weekend reset is part of the
              routine. If you want a few lines every day as well, that is what the{' '}
              <a href={featurePath('journal')} className={LINK_CLASS}>
                journal
              </a>{' '}
              is for. For goals bigger than a week, use{' '}
              <a href={featurePath('projects-goals')} className={LINK_CLASS}>
                Projects &amp; Goals
              </a>
              .
            </p>
          </>
        }
      />
    </>
  ),
  wideShot: {
    name: 'weekly-goals-desktop',
    width: 1400,
    height: 835,
    alt: 'Weekly Goals on a computer: a meditation goal linked to a habit at 2 of 5 days, a finished high-priority assignment, 5 of 15 goal points, and the reflection that opens on Friday',
    caption: 'Weekly Goals on a computer, with the demo user Ali’s week.',
  },
  facts: [
    ['Week', 'Monday to Sunday'],
    ['Goal points', `${pts(G.pointsPerGoal)} each, first ${G.maxGoalsCounted} count`],
    ['Reflection', `+${reflection}, ${WINDOW}`],
    ['Most per week', `${weekMax} points`],
    ['Links to', 'Habits, exercise, reading and skills'],
    ['Priorities', 'High, medium, low'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You plan in weeks and want a short, focused list.',
    'You want a weekly goal tracker that updates itself from what you log.',
    'A weekend reflection is a habit you want to build.',
  ],
  notFor: [
    'You want long project plans with tasks and deadlines (use Projects & Goals for that).',
    'You want points for every small goal; only the first few each week earn.',
  ],
  faq: [
    {
      q: 'How many weekly goals should I set?',
      a: `A few that matter. Points go to the first ${G.maxGoalsCounted} goals you reach each week, so extra goals add progress, not points.`,
    },
    {
      q: 'Can a goal update itself?',
      a: 'Yes. Link it to a habit, workouts, reading or a skill and set a target. Every log in that part of the app moves the goal, and it ticks itself when the target is reached.',
    },
    {
      q: 'When can I write the weekly reflection?',
      a: `From ${WINDOW}. The first reflection in that window earns ${reflection} points.`,
    },
    {
      q: 'What happens to goals I didn’t finish?',
      a: 'On the current week, AscendDay lists unfinished goals from recent weeks. Carry each one into this week or let it go.',
    },
    {
      q: 'Does a week start on Monday?',
      a: 'Yes. Weeks run from Monday to Sunday in your own timezone.',
    },
  ],
  related: ['projects-goals', 'habits', 'journal', 'exercise'],
  cta: { title: 'Set this week’s goals', text: 'Link one to a habit, and watch it fill in before Friday.' },
};
