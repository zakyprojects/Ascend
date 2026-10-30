import { PFC_POINTS, WEEKLY_GOALS_POINTS } from '@/lib/pointsConfig';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/projects-goals. Sources: lib/projectProgress.ts (bottom-up progress, automatic status),
   components/projects/HowItWorksDialog.tsx (the three levels, projects in order),
   components/views/ProjectsGoalsView.tsx (task views, filters, tab order), components/projects/TaskRow.tsx
   (focus button), types.ts Goal/Project/Task. This feature writes no points (no award in lib/ or SQL). */

const focusTop = PFC_POINTS.focus.tiers[0];

export const projectsGoals: FeatureContent = {
  intro: (
    <>
      <p>
        Projects &amp; Goals is AscendDay’s free goal planner. You write down a big goal, break it into projects with a clear
        finish line, and break those into tasks small enough to do today. When you finish tasks, their project fills up,
        and when you finish projects, their goal fills up.
      </p>
      <p>
        It is the one part of AscendDay that earns no points. It is for planning, and the work you plan here earns its
        points where you do it: in your workouts, reading, focus sessions and weekly goals.
      </p>
    </>
  ),
  heroShot: {
    name: 'projects-goals-phone',
    width: 540,
    height: 1246,
    alt: 'Projects & Goals on a phone: 26% goal progress, 4 tasks to do with 2 due today, and tasks linked to a portfolio project',
  },
  body: (
    <>
      <Block
        id="levels-title"
        title="Goal, project, task"
        lead={<p>Three levels, each on its own tab, each with a different time scale.</p>}
      >
        <Cards
          items={[
            {
              title: 'Goal: the long term',
              text: 'What you want your life to look like, with an optional category and target date. For example: get fit, speak a new language, land an internship.',
            },
            {
              title: 'Project: weeks or months',
              text: 'One phase of a goal with a clear finish line, with start and due dates and a status: not started, in progress, on hold or completed.',
            },
            {
              title: 'Task: today',
              text: 'The next small step, with a due date, a priority and optional subtasks. For example: run 3 km, list five products, move $50 to savings.',
            },
          ]}
        />
      </Block>

      <Block id="how-title" title="Break a goal into tasks you can do today">
        <Steps
          items={[
            { title: 'Write the goal', text: 'On the Goals tab, add what you are aiming for and, if you like, a target date and category.' },
            { title: 'Add its projects', text: 'From the goal, add the projects it needs. Turn on “projects in order” if one has to finish before the next starts.' },
            {
              title: 'Add tasks to a project',
              text: 'Use the quick add box at the top of Tasks, or a full task with due date, priority and subtasks. Tasks without a project are fine too.',
            },
            {
              title: 'Work the list',
              text: 'Filter by Due today, Overdue, Next 7 days, To do or Done, search, or filter by priority and project. Tick tasks as you go.',
            },
          ]}
        />
      </Block>

      <Block
        id="progress-title"
        title="Progress that adds up on its own"
        lead={
          <p>
            You never type a percentage for something that has parts. AscendDay works it out from the bottom up and changes
            the status for you.
          </p>
        }
      >
        <Cards
          cols={2}
          items={[
            {
              title: 'Tasks fill projects',
              text: 'A project’s progress is the average of its tasks. A task with subtasks counts the share of subtasks done, so half a task shows as half.',
            },
            {
              title: 'Projects fill goals',
              text: 'A goal’s progress is the average of its projects, and a completed project counts as 100%.',
            },
            {
              title: 'Status follows the work',
              text: 'A project completes itself when all its tasks are done, and a goal is achieved when all its projects are. Untick something and they reopen.',
            },
            {
              title: 'Manual when it has no parts',
              text: 'A project with no tasks, or a goal with no projects, has a progress you update by hand. A goal you abandon stays abandoned.',
            },
          ]}
        />
        <Note title="Projects in order.">
          With it on, a goal’s projects unlock one at a time, so you finish market research before building, and building
          before launch. Tasks in a project that hasn’t unlocked yet wait under Locked.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="Points: none here, on purpose"
        lead={
          <>
            <p>
              Ticking a task or finishing a project earns no points, and nothing here can cost points. A to-do list that
              paid per tick would reward splitting work into tiny pieces, which is the opposite of planning.
            </p>
            <p>
              Points come from doing the work where AscendDay can measure it. The timer button on a task’s row opens the{' '}
              <a href={featurePath('brain-lessons')} className={LINK_CLASS}>
                focus timer
              </a>{' '}
              with that task, and the session earns focus points (up to {pts(focusTop.points)} for a {focusTop.minMinutes}-minute session). Put this week’s
              part of a project into{' '}
              <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
                Weekly Goals
              </a>{' '}
              and reaching it earns {pts(WEEKLY_GOALS_POINTS.pointsPerGoal)}. Runs, pages and practice earn in{' '}
              <a href={featurePath('exercise')} className={LINK_CLASS}>
                Exercise
              </a>
              ,{' '}
              <a href={featurePath('reading')} className={LINK_CLASS}>
                Reading
              </a>{' '}
              and{' '}
              <a href={featurePath('skills')} className={LINK_CLASS}>
                Skills
              </a>
              .
            </p>
          </>
        }
      />
    </>
  ),
  wideShot: {
    name: 'projects-goals-desktop',
    width: 1400,
    height: 872,
    alt: 'The Goals tab of Projects & Goals on a computer: “Land a software internship” with projects in order at 19%, and “Run a 10K” at 33%',
    caption: 'The Goals tab on a computer, with the demo user Ali’s goals.',
  },
  facts: [
    ['Levels', 'Goals, projects, tasks and subtasks'],
    ['Progress', 'Worked out from tasks and projects'],
    ['Status', 'Changes itself as work is done'],
    ['Projects in order', 'Optional, per goal'],
    ['Task views', 'All, To do, Due today, Overdue, Next 7 days, Done, Locked'],
    ['Points', 'None (planning only)'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You have a big goal and keep losing the thread between it and today.',
    'You want progress worked out for you, not typed in.',
    'You want one goals, projects and tasks app, right next to your habits.',
  ],
  notFor: [
    'You want points for every finished task.',
    'You need team projects, shared boards or time estimates; this is for one person.',
  ],
  faq: [
    {
      q: 'Why use AscendDay for goals and projects instead of a separate planning app?',
      a: 'Because the plan sits right next to the work that carries it out. The timer button on a task starts a focus session that earns points, this week’s part of a project can become a weekly goal, and your big goals stay in view beside the habits and logs that move them. For team projects with shared boards, a team tool will fit better.',
    },
    {
      q: 'Do tasks or projects earn points?',
      a: `No. Projects & Goals is for planning and earns no points, and it can’t cost any. The work earns elsewhere, for example a focus session started from a task, or a weekly goal worth ${pts(WEEKLY_GOALS_POINTS.pointsPerGoal)}.`,
    },
    {
      q: 'What is the difference from Weekly Goals?',
      a: 'Weekly Goals is a short list for this week that earns points. Projects & Goals holds the bigger picture for months, with projects, tasks and due dates.',
    },
    {
      q: 'How is a goal’s progress worked out?',
      a: 'From its projects: the average of their progress, with a completed project counted as 100%. Each project’s progress comes from its tasks and their subtasks.',
    },
    {
      q: 'Can I make a task without a project?',
      a: 'Yes. Tasks can stand alone, and you can link them to a project later.',
    },
    {
      q: 'Can I see what is overdue?',
      a: 'Yes. The top of the page counts overdue tasks and tasks due today, and the Overdue and Due today views list them.',
    },
  ],
  related: ['weekly-goals', 'plans', 'brain-lessons', 'habits'],
  cta: { title: 'Write down the big goal', text: 'Then add one project and one task you can do today.' },
};
