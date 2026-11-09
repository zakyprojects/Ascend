import { FOCUS_PRESETS, FOCUS_RESUME_WINDOW_MINUTES, focusFinishedPoints } from '@/components/pfc/focusSession';
import { FOCUS_MINUTES_PER_POINT, FOCUS_MIN_MINUTES, focusPointsForMinutes } from '@/lib/focusPoints';
import { COMMON_EMOTIONS } from '@/components/pfc/pfcLists';
import { LESSONS, LESSON_CATEGORIES } from '@/lib/lessons';
import { PFC_POINTS } from '@/lib/pointsConfig';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { Screenshot } from '../../components/Screenshot';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts, range } from '../format';

/* /features/brain-lessons (Prefrontal Cortex page + Neuroplasticity guide + Lessons in one page).
   Sources: lib/focusPoints.ts (rule 2: 1 pt per 12 active min, a day's sessions added up, from 25 min),
   lib/pointsConfig.ts PFC_POINTS (daily cap), lib/focusSession.ts FOCUS_PRESETS and the 30-minute
   resume window (running sessions keep running when closed or locked; logout pauses),
   components/howItWorks/prefrontalCortex.tsx, the page's How it works (paused time does not count,
   Complete from 25 min, breaks/decisions/emotions earn nothing, only today earns, delete recounts today only),
   FocusTimerCard/FocusReflectionDialog/SchedulePanel, DecisionJournal + DecisionFormDialog,
   EmotionLabeler + pfcLists COMMON_EMOTIONS, components/views/Neuroplasticity.tsx (its sections),
   lib/lessons.ts LESSONS (titles, categories, read times, points), lib/lessonAwards.ts (once per
   season). Brain statements are kept general and follow Cleveland Clinic's "Prefrontal Cortex"
   page (https://my.clevelandclinic.org/health/body/prefrontal-cortex, opened 2026-10-21); the
   app's own study figures are deliberately not repeated here. */

const presets = FOCUS_PRESETS.map((p) => ({ minutes: p.focus, points: focusFinishedPoints(p.focus) }));
const shortest = presets[0];
const longest = presets[presets.length - 1];
const deep = presets.find((p) => p.minutes === 90) ?? longest; // the app suggests 90+ for complex work (AboutFocusDialog)
const focusRule = `1 point for every ${FOCUS_MINUTES_PER_POINT} minutes of focus, counted from ${FOCUS_MIN_MINUTES} minutes in a session`;
const focusCap = PFC_POINTS.focus.dailyCap;
const focusCapMinutes = focusCap * FOCUS_MINUTES_PER_POINT;
const shotMinutes = 75; // the focus-phone screenshot: 50 + 25 minutes today
const lessonPoints = [...new Set(LESSONS.map((l) => l.points))].sort((a, b) => a - b);
const lessonsWorth = (p: number) => LESSONS.filter((l) => l.points === p).length;
const lessonTotal = LESSONS.reduce((sum, l) => sum + l.points, 0);
const readTimes = range(LESSONS.map((l) => l.readTime));
const list = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const CLEVELAND_PFC = 'https://my.clevelandclinic.org/health/body/prefrontal-cortex';

export const brainLessons: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s brain pages are three free tools in one corner of the app: a deep-focus timer that earns points, with a
        decision journal and emotion labeling next to it; a plain-language guide to neuroplasticity; and{' '}
        {LESSONS.length} short lessons on discipline, habits, goals, mindset and the brain.
      </p>
      <p>
        They are for people who want to understand why habits feel hard at first and to practise the everyday skills
        behind them: staying on one task, thinking a choice through, and noticing a feeling before it takes over.
      </p>
    </>
  ),
  heroShot: {
    name: 'focus-phone',
    width: 540,
    height: 1246,
    alt: `The Prefrontal Cortex page on a phone: ${focusPointsForMinutes(shotMinutes)} of ${focusCap} focus points today from ${shotMinutes} minutes in 2 sessions, 175 focus minutes this week, 1 decision to revisit, 5 emotions labeled in the last 7 days, and the timer’s ${list(FOCUS_PRESETS.map((p) => `${p.focus}`))}-minute presets`,
  },
  body: (
    <>
      <Block
        id="pfc-title"
        title="Why a page is named after the prefrontal cortex"
        lead={
          <>
            <p>
              The prefrontal cortex is the front part of the brain, just behind the forehead. Cleveland Clinic’s{' '}
              <a href={CLEVELAND_PFC} className={LINK_CLASS}>
                overview of the prefrontal cortex
              </a>{' '}
              lists attention, decision-making, emotions, goal setting, self-control and working memory among the skills
              it helps with.
            </p>
            <p>
              AscendDay’s Prefrontal Cortex page is built around three of those everyday skills: a timer for staying on one
              task, a journal for thinking choices through, and a quick way to name what you feel. They are practice
              tools for daily life. They do not measure your brain, and nothing in AscendDay promises a change inside it.
            </p>
          </>
        }
      />

      <Block id="focus-title" title="Running a deep-focus session">
        <Steps
          items={[
            {
              title: 'Pick a length',
              text: `Choose ${list(FOCUS_PRESETS.map((p) => `${p.focus} minutes with a ${p.break}-minute break`))}, or set a custom length. The app suggests ${shortest.minutes} minutes if you are starting out and ${deep.minutes} or more for complex work.`,
            },
            {
              title: 'Name the task',
              text: `Write what you are working on and, if you like, tag one of your skills. The timer keeps running when you switch pages, close the app or lock your phone, and the same session shows on all your devices, so you can start on your computer and complete it on your phone. You can pause it, and logging out pauses it too; resume within ${FOCUS_RESUME_WINDOW_MINUTES} minutes to carry on. A tagged skill also gets the minutes as practice.`,
            },
            {
              title: 'Stay with it',
              text: `Points build up while you focus: ${focusRule}, and the minutes of all of the day’s sessions add up. From ${FOCUS_MIN_MINUTES} minutes you can complete early and keep what you earned; before that a stop saves nothing. Allow notifications and AscendDay tells you when the session and the break are over.`,
            },
            {
              title: 'Note how it went',
              text: 'When the session ends you can add a short optional note: what you got done and what got in the way. Your sessions and a 7-day focus chart sit under the timer.',
            },
          ]}
        />
      </Block>

      <Block
        id="schedule-title"
        title="Following today’s schedule"
        lead={
          <p>
            The Schedule tab turns the timer into a guide for your whole day. It reads today’s blocks from the{' '}
            <a href={featurePath('time-blocking')} className={LINK_CLASS}>
              time blocking planner
            </a>{' '}
            and counts down each one as it happens, so you never start a timer by hand.
          </p>
        }
      >
        <Steps
          items={[
            {
              title: 'Start the day',
              text: 'The tab shows how many blocks today has and how long they run in total. Press Start today’s schedule once, and it keeps following for the rest of that day on that device.',
            },
            {
              title: 'Work the block you are in',
              text: 'A large countdown shows the time left in the current block, with a bar for how far through it you are. When the block’s category is linked to an AscendDay page, such as Reading or Exercise, one tap opens that page.',
            },
            {
              title: 'Take a short break',
              text: 'In a linked block, once half of it is done and enough time is left, you can pause for 5, 10 or 15 minutes, or any length up to 15. You can end the break early.',
            },
            {
              title: 'Finish or skip',
              text: 'Mark the block completed or skip it. A block that runs out of time without either stops at 00:00 as overdue and waits for your answer.',
            },
            {
              title: 'Between blocks',
              text: 'A countdown shows when the next block begins. Ready early? Start it now and keep its length, or start now and keep its planned end. An early start can be undone.',
            },
          ]}
        />
        <div className="mt-8 grid items-start gap-6 grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <figure className="scroll-rise">
            <Screenshot
              name="schedule-desktop"
              width={1400}
              height={727}
              alt="The Prefrontal Cortex page on the Schedule tab: the live block Python practice, 6:30 PM to 8:00 PM, with 37:51 left, 58% done, and Take a break, Skip block and Mark completed buttons"
            />
            <figcaption className="mt-3 text-center text-sm text-content-muted">
              The Schedule tab during a planned block: the countdown, how far through it you are, and what you can do next.
            </figcaption>
          </figure>
          <figure className="scroll-rise mx-auto w-full max-w-xs lg:max-w-none">
            <Screenshot
              name="schedule-day-phone"
              width={540}
              height={1410}
              alt="Time Tracker on a phone, the same day: Praying, Exercise, Classes, DBMS assignment and Reading done, Break skipped, Python practice 6:30 PM to 8:00 PM marked Now, and Dinner with family next"
            />
            <figcaption className="mt-3 text-center text-sm text-content-muted">The day it follows, from Time Tracker.</figcaption>
          </figure>
        </div>
        <Note title="One plan, two views.">
          Completing a block here is the same as ticking it off in the Time Tracker, so it counts toward that page’s daily
          points. Stopping the schedule takes you back to the Focus tab and leaves your blocks as they are.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How points work on these pages"
        lead={
          <p>
            Focus sessions and lessons earn points that count toward your season score. The decision journal, emotion
            labeling and the neuroplasticity guide earn none: they are there to use, not to farm.
          </p>
        }
      >
        <Rules
          caption="What earns points"
          rows={[
            { what: `Every ${FOCUS_MINUTES_PER_POINT} minutes of focus`, amount: '+1', note: `A session counts from ${FOCUS_MIN_MINUTES} minutes. Paused time does not count.` },
            { what: 'All focus sessions in one day', amount: `up to ${focusCap} a day`, note: `Their minutes add up, so ${focusCapMinutes} minutes reach the limit. Only today’s sessions earn, plus one that ended yesterday while the app was closed. Deleting one recounts today; earlier days keep their points.` },
            ...lessonPoints.map((p) => ({ what: `Reading one of the ${lessonsWorth(p)} lessons worth ${pts(p)}`, amount: pts(p), note: 'Once per lesson per season.' })),
            { what: 'Breaks, decisions and emotions', amount: 'no points', tone: 'none' as const },
          ]}
        />
        <Note title="The numbers in one line.">
          On its own, a {list(presets.map((p) => `${p.minutes}-minute session earns ${pts(p.points)}`))}; two 30-minute sessions
          on one day earn {pts(focusPointsForMinutes(60))}, and reading every lesson is worth {pts(lessonTotal)} each season.
        </Note>
      </Block>

      <Block id="mind-title" title="A decision journal and emotion labeling">
        <Cards
          cols={2}
          items={[
            {
              title: 'Decision journal',
              text: 'Write down a choice, why you made it, what you expect to happen and a day to look back. On that day it appears under To revisit, and you write what actually happened and what you learned.',
            },
            {
              title: 'Emotion labeling',
              text: `Tap a feeling such as ${list(COMMON_EMOTIONS.slice(0, 4))}, or name your own, rate it from 1 to 10 and add what was going on. A 30-day summary shows the feelings that came up most and their average strength.`,
            },
          ]}
        />
        <Note title="Kept to yourself.">
          Decisions and emotion entries are not part of the stats partners or other members can see. One of the lessons
          explains the idea behind labeling a feeling.
        </Note>
      </Block>

      <Block
        id="neuro-title"
        title="A plain guide to neuroplasticity"
        lead={
          <>
            <p>
              Neuroplasticity is the brain’s ability to change. Cleveland Clinic describes it as the brain building new
              pathways and strengthening old ones when you learn, practise or repeat activities. Habit tracking leans on the
              same idea, and AscendDay’s Neuro page explains it in everyday words.
            </p>
            <p>
              The guide covers how repeated actions get easier and unused ones fade, what the idea can and cannot help
              with, practical steps such as starting small and repeating daily, what the first weeks of a new habit tend
              to feel like, and a few common myths. It closes with links to the parts of AscendDay that put it to work and
              to the related lessons.
            </p>
          </>
        }
      />

      <Block
        id="lessons-title"
        title={`${LESSONS.length} short lessons`}
        lead={
          <p>
            Each lesson is a {readTimes}-minute read in plain language, in {LESSON_CATEGORIES.length} groups, neuroplasticity lessons included. Search them,
            filter by group or show only the ones you have not read. Press Mark as read at the end to earn its points;
            every lesson pays again in the next season.
          </p>
        }
      >
        <Cards
          items={LESSON_CATEGORIES.map((category) => ({
            title: category,
            text: LESSONS.filter((l) => l.category === category)
              .map((l) => l.title)
              .join(' · '),
          }))}
        />
        <Note title="General education, not medical advice.">
          The lessons and the Neuro guide explain ideas; they are not treatment, therapy or a diagnosis. If you are worried
          about your focus, mood or memory, talk to a doctor or another qualified professional.
        </Note>
      </Block>
    </>
  ),
  wideShot: {
    name: 'lessons-desktop',
    width: 1400,
    height: 1167,
    alt: `The Lessons page on a computer: 5 of ${LESSONS.length} lessons read and 8 of ${lessonTotal} points this season, The 2-Minute Rule for Procrastination next to read, and every lesson card with its group, read time and points`,
    caption: 'The Lessons page on a computer, with the demo user Ali’s season.',
  },
  facts: [
    ['Focus points', `1 per ${FOCUS_MINUTES_PER_POINT} min, from ${FOCUS_MIN_MINUTES} min a session`],
    ['Focus limit', `${focusCap} points a day`],
    ['Lessons', `${LESSONS.length}, ${lessonPoints.map((p) => `${lessonsWorth(p)} × ${pts(p)}`).join(' + ')}`],
    ['Lesson points', `${lessonTotal} a season, once per lesson`],
    ['Decisions, emotions', 'No points'],
    ['Neuro guide', 'Free to read, no points'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You study or work in long blocks and want a focus timer that earns points for the time you focus.',
    'You like knowing why a habit works before you commit to it.',
    'You want short reads you can finish between classes.',
  ],
  notFor: [
    'You want clinically tested brain training or help with a medical condition such as ADHD.',
    'You want long courses; each lesson takes a few minutes.',
  ],
  faq: [
    {
      q: 'Why use AscendDay for focus sessions instead of a separate Pomodoro app?',
      a: `Because focus time here earns points (up to ${pts(focusCap)} a day) toward your rank and the leagues, next to your habits, workouts and reading. You can start a session straight from a task in Projects & Goals or from a focus block in the Time Tracker, and the lessons explain why focus and new habits feel hard at first. A separate timer counts minutes; here they count toward everything else you are working on.`,
    },
    {
      q: 'How do focus sessions earn points?',
      a: `By the minutes you focus: 1 point for every ${FOCUS_MINUTES_PER_POINT} minutes, and the minutes of all of the day’s sessions add up, up to ${pts(focusCap)} a day (${focusCapMinutes} minutes). A session counts from ${FOCUS_MIN_MINUTES} minutes, because deep work takes time to get into; a shorter one saves nothing. So on its own a ${list(presets.map((p) => `${p.minutes}-minute session earns ${pts(p.points)}`))}, and a custom length works the same way.`,
    },
    {
      q: 'Is the focus timer a Pomodoro timer?',
      a: `It can be. The ${FOCUS_PRESETS[0].focus}-minute preset with a ${FOCUS_PRESETS[0].break}-minute break works like one, and the longer presets suit deeper work. Longer sessions earn more points, up to ${pts(focusCap)} a day.`,
    },
    {
      q: 'What if I stop a session early?',
      a: `From ${FOCUS_MIN_MINUTES} minutes of focus you can complete it early and keep the points you reached: every minute counts the same, so there is nothing extra for running the full length. Before ${FOCUS_MIN_MINUTES} minutes a discarded session saves nothing. A paused session can be resumed within ${FOCUS_RESUME_WINDOW_MINUTES} minutes; after that it ends where you paused.`,
    },
    {
      q: 'Can I earn lesson points more than once?',
      a: 'Once per lesson per season. When a new season starts, every lesson can be read for points again.',
    },
    {
      q: 'Will this rewire my brain?',
      a: 'AscendDay makes no such promise. The pages explain general ideas and give you tools to practise focus and reflection; they are not brain training with a measured result and not medical advice.',
    },
    {
      q: 'Who can see my decisions and emotions?',
      a: 'Only you. They are not in the stats partners or other members see. Your focus minutes and number of focus sessions are, like your other stats. Focus and lesson points add to your season total, which league tables show as a number.',
    },
  ],
  related: ['time-blocking', 'skills', 'journal', 'recovery'],
  cta: { title: 'Start your first focus session', text: `${shortest.minutes} minutes is enough to earn ${pts(shortest.points)}.` },
};
