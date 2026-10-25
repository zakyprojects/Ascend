import { STARTER_TEMPLATES } from '@/data/planTemplates';
import { PLAN_CATEGORIES } from '@/types';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';

/* /features/plans. Sources: components/views/ImprovementPlans.tsx and components/plans/* (plan types
   in planMeta.ts PLAN_TYPE_META, CreatePlanDialog templates, DiscoverPanel sorts and filters, copies,
   check-in notes), data/planTemplates.ts STARTER_TEMPLATES, types.ts PLAN_CATEGORIES, and the
   Privacy Policy ("Plans you make public show your username and avatar"). Plans award no points:
   no plan code writes a point entry. */

const list = (items: readonly string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const templateTitles = STARTER_TEMPLATES.map((t) => t.title);

export const plans: FeatureContent = {
  intro: (
    <>
      <p>
        Plans in AscendDay is a free self-improvement plan builder: write down where you want to get to, choose how you will
        track it, and tick it forward. A plan can be a list of milestones, one number to reach, a daily or weekly habit
        journey, or a long-term vision you check in on.
      </p>
      <p>
        Plans earn no points, the same as Projects &amp; Goals. This is where you think about direction; the points come
        from the habits, workouts, reading and practice that carry the plan out.
      </p>
    </>
  ),
  heroShot: {
    name: 'plans-phone',
    width: 540,
    height: 1246,
    alt: 'Plans on a phone: 4 active plans, 46% done on average, 1 of 1 habit journey done today, and a milestone plan, Learn SQL properly, at 3 of 6 steps',
  },
  body: (
    <>
      <Block
        id="types-title"
        title="Four kinds of plan"
        lead={<p>Pick the kind that matches the goal. The form then asks only for what that kind needs.</p>}
      >
        <Cards
          cols={2}
          items={[
            {
              title: 'Milestones',
              text: 'A list of steps you tick off in order, like the chapters of a course or the stages of a project. Progress is the share of steps done.',
            },
            {
              title: 'Target',
              text: 'One number to reach, like 12 books or 100 km, with an optional target date. Update the progress as you go and the bar fills.',
            },
            {
              title: 'Habit journey',
              text: 'Do one thing every day or every week for a set length, such as 30 days or 12 weeks. Mark each day done, keep the streak, and undo a tap by mistake.',
            },
            {
              title: 'Vision',
              text: 'A long-term direction with a review date and check-in notes every week or month: how is it going, and what will you change?',
            },
          ]}
        />
      </Block>

      <Block id="how-title" title="Making a plan">
        <Steps
          items={[
            {
              title: 'Start blank or from a template',
              text: `There are ${STARTER_TEMPLATES.length} starter templates, such as ${list(templateTitles.slice(0, 4))}. Each fills in the form, and you change anything you like.`,
            },
            {
              title: 'Say what it is for',
              text: `Give it a title, the result you want and why it matters, and a category: ${list(PLAN_CATEGORIES)}.`,
            },
            {
              title: 'Track it',
              text: 'Tick steps, update the number, mark today’s journey done or write a check-in. The top of the page shows active plans, the average progress and check-ins due.',
            },
            {
              title: 'Keep it private, or share it',
              text: 'A new plan is only yours. Share it in Discover when you want others to be able to copy it, and make it private again at any time.',
            },
          ]}
        />
      </Block>

      <Block
        id="discover-title"
        title="Discover: copy a plan that already works"
        lead={
          <>
            <p>
              Discover lists the plans other members chose to share. Search them, filter by type or category, and sort by
              newest, most copied or top creators (by the creator’s season points). Each plan shows how many times it was
              copied.
            </p>
            <p>
              Copy one and it becomes yours: a separate copy you can edit and track at your own pace. Your progress and
              changes never touch the original or anyone else’s copy. Copies show where they came from, as “Copied from
              @username”.
            </p>
          </>
        }
      >
        <Note title="What sharing shows.">
          A public plan shows its contents with your username and avatar, as the{' '}
          <a href="/privacy" className={LINK_CLASS}>
            Privacy Policy
          </a>{' '}
          says. If you delete your account, copies others already made stay, without your name.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="Plans and points"
        lead={
          <p>
            Plans earn no points. A plan with fifty tiny steps would be easy to tick off in an evening, so the points
            live in the work the plan points you to, where the daily caps keep them fair.
          </p>
        }
      >
        <Rules
          caption="What a plan earns"
          rows={[
            { what: 'Creating a plan', amount: '0', tone: 'none' },
            { what: 'Ticking a milestone step or updating a target', amount: '0', tone: 'none' },
            { what: 'Marking a habit journey done', amount: '0', tone: 'none', note: 'It keeps the plan’s own streak.' },
            { what: 'Writing a vision check-in', amount: '0', tone: 'none' },
            { what: 'Someone copying your public plan', amount: '0', tone: 'none', note: 'It raises the plan’s copy count.' },
          ]}
        />
        <Note title="Where the points are.">
          Turn the plan into things AscendDay scores: a daily{' '}
          <a href={featurePath('habits')} className={LINK_CLASS}>
            habit
          </a>{' '}
          for a habit journey,{' '}
          <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
            weekly goals
          </a>{' '}
          for this week’s share of a milestone, or the{' '}
          <a href={featurePath('reading')} className={LINK_CLASS}>
            Reading Hub
          </a>{' '}
          for a books target. Those earn points, and the plan shows the bigger picture.
        </Note>
      </Block>

      <Block
        id="vs-title"
        title="Plans or Projects & Goals?"
        lead={
          <p>
            Both are for big goals.{' '}
            <a href={featurePath('projects-goals')} className={LINK_CLASS}>
              Projects &amp; Goals
            </a>{' '}
            breaks one goal into projects and dated tasks, like a to-do list with structure. Plans is lighter: a single
            card per goal in one of four shapes, built to be shared and copied. Use Plans for direction and routines, and
            Projects &amp; Goals when the work has many tasks and deadlines.
          </p>
        }
      />
    </>
  ),
  wideShot: {
    name: 'plans-desktop',
    width: 1400,
    height: 909,
    alt: 'Plans on a computer: a Learn SQL milestone plan with 3 of 6 steps ticked, a Read 12 books target at 5 of 12, and a Phone-free mornings habit journey on day 12 of 30 with an 11-day streak',
    caption: 'Plans on a computer, with the demo user Ali’s plans.',
  },
  facts: [
    ['Plan kinds', 'Milestones, target, habit journey, vision'],
    ['Templates', `${STARTER_TEMPLATES.length} starter plans`],
    ['Categories', `${PLAN_CATEGORIES.length}, from ${PLAN_CATEGORIES[0]} to ${PLAN_CATEGORIES[PLAN_CATEGORIES.length - 1]}`],
    ['Sharing', 'Private by default; share in Discover'],
    ['Copies', 'Yours to edit; the original is untouched'],
    ['Points', 'None; plans guide the work that earns them'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You want a clear plan for a goal without a project-management tool.',
    'You like starting from a habit plan template someone else already tested.',
    'You want a vision you revisit every week or month.',
  ],
  notFor: [
    'You want points for planning; Plans earns none.',
    'You need tasks with due dates and sub-tasks; Projects & Goals does that.',
  ],
  faq: [
    {
      q: 'Do plans earn points?',
      a: 'No. Plans are for direction. Points come from the habits, workouts, reading, skills and goals that carry a plan out.',
    },
    {
      q: 'Can other people see my plans?',
      a: 'Only if you share them in Discover. A shared plan shows your username and avatar. You can make it private again whenever you want.',
    },
    {
      q: 'What happens when I copy a self-improvement plan from someone else?',
      a: 'You get your own copy to edit and track. The original and other people’s copies don’t change, and your progress stays yours.',
    },
    {
      q: 'What is a habit journey?',
      a: 'A plan to do one thing every day or every week for a set length, like 30 days. You mark each day or week done and it keeps a streak.',
    },
    {
      q: 'Is it free?',
      a: 'Yes. AscendDay is free while in beta, including making, sharing and copying plans.',
    },
  ],
  related: ['projects-goals', 'weekly-goals', 'habits', 'journal'],
  cta: { title: 'Write your first plan', text: 'Start from a template or a blank card, and keep it private until it’s ready.' },
};
