import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, CalendarDays, Layers, MonitorSmartphone, Plus, Scale, Swords, Trophy, TrendingUp } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { LEGAL_CONTACT_EMAIL, MIN_AGE } from '@/lib/legal';
import { LESSONS } from '@/lib/lessons';
import {
  BAD_HABIT_POINTS,
  JOURNAL_POINTS,
  PFC_POINTS,
  PRESET_HABIT_POINTS,
  READING_POINTS,
  SKILLS_POINTS,
  SOBRIETY_MILESTONE_POINTS,
  TIME_TRACKER_POINTS,
  WEEKLY_GOALS_POINTS,
  WEEKLY_REFLECTION_POINTS,
  WORKOUT_POINTS,
} from '@/lib/pointsConfig';
import { PRESET_BAD_HABITS, PRESET_CATEGORIES } from '@/lib/presets';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS, MarketingLayout } from '../components/MarketingLayout';
import { Screenshot } from '../components/Screenshot';
import { CtaBand, FaqList, Section, SectionHeading, type FaqItem } from '../components/Sections';
import { fmt, pts, range } from '../features/format';
import { FEATURE_GROUPS, FEATURE_SLUGS, featurePath, featuresInGroup } from '../features/catalog';
import { SITE_MAKER, SITE_TAGLINE } from '../site';

/*
 * `/`: the public landing page. Every number on it is read from the app's own reward code
 * (pointsConfig, presets, tiers, lessons), so the page cannot drift from what the app does.
 */

/** Hero entrance order (marketing.css .m-enter staggers by --i). */
const enter = (i: number) => ({ '--i': i }) as CSSProperties;

const presetHabitPoints = range(PRESET_CATEGORIES.flatMap((c) => c.habits.map((h) => h.points)));
const resistPoints = range(PRESET_BAD_HABITS.map((h) => h.points));
const lessonPoints = range(LESSONS.map((l) => l.points));
const focusTiers = [...PFC_POINTS.focus.tiers].reverse();
const timeHigh = TIME_TRACKER_POINTS.tiers.high;
const timeMid = TIME_TRACKER_POINTS.tiers.medium;
const topRank = TIERS[TIERS.length - 1];
const milestones = SOBRIETY_MILESTONE_POINTS;

const EARNS: { what: string; rule: string; href: string }[] = [
  {
    what: 'Habits',
    rule: `${pts(presetHabitPoints)} for each library habit you complete, up to ${PRESET_HABIT_POINTS.dailyCap} a day`,
    href: featurePath('habits'),
  },
  {
    what: 'Bad habits',
    rule: `${pts(resistPoints)} for each day you resist, up to ${BAD_HABIT_POINTS.dailyCap} a day`,
    href: featurePath('bad-habits'),
  },
  {
    what: 'Exercise',
    rule: `1 point per ${WORKOUT_POINTS.units.minsPerPoint} minutes, ${WORKOUT_POINTS.units.repsPerPoint} reps, 1 set or 1 km, up to ${WORKOUT_POINTS.dailyCap} a day`,
    href: featurePath('exercise'),
  },
  {
    what: 'Reading',
    rule: `1 point per ${READING_POINTS.pagesPerPoint} pages or ${READING_POINTS.pointsPerChapter} per chapter, up to ${READING_POINTS.dailyCap} a day, plus ${READING_POINTS.completionBonus} for finishing a book`,
    href: featurePath('reading'),
  },
  {
    what: 'Skills',
    rule: `1 point per ${SKILLS_POINTS.minutesPerPoint} minutes of practice, up to ${SKILLS_POINTS.dailyCap} a day`,
    href: featurePath('skills'),
  },
  {
    what: 'Focus timer',
    rule: `${focusTiers.map((t) => `${t.minMinutes} min = ${t.points}`).join(', ')}, up to ${PFC_POINTS.focus.dailyCap} a day`,
    href: featurePath('brain-lessons'),
  },
  {
    what: 'Time Tracker',
    rule: `${pts(timeHigh.points)} for finishing ${timeHigh.minPercent}% of the day’s blocks, ${timeMid.points} for ${timeMid.minPercent}%`,
    href: featurePath('time-blocking'),
  },
  {
    what: 'Journal',
    rule: `${pts(JOURNAL_POINTS.entryCompleted)} for each day’s entry`,
    href: featurePath('journal'),
  },
  {
    what: 'Weekly goals',
    rule: `${pts(WEEKLY_GOALS_POINTS.pointsPerGoal)} per goal reached (the first ${WEEKLY_GOALS_POINTS.maxGoalsCounted} count), plus ${WEEKLY_REFLECTION_POINTS.awarded} for the weekend reflection`,
    href: featurePath('weekly-goals'),
  },
  {
    what: 'Recovery',
    rule: `${milestones['1w']}, ${milestones['1m']} and ${milestones['90d']} points at one week, one month and 90 days clean`,
    href: featurePath('recovery'),
  },
  {
    what: 'Lessons',
    rule: `${pts(lessonPoints)} for each of the ${LESSONS.length} lessons, once a season`,
    href: featurePath('brain-lessons'),
  },
];

const FAQ: FaqItem[] = [
  {
    q: 'Is Ascend free?',
    a: 'Yes. Every feature is free while Ascend is in beta, and there are no payments anywhere in the app.',
  },
  {
    q: 'Is there an Ascend app for Android, iPhone or PC?',
    a: 'Ascend is a web app, so it runs in the browser on any phone, tablet or computer. You can add it to your home screen or install it from the browser, and it then opens like any other app. It isn’t in the app stores yet.',
  },
  {
    q: 'Do I need an account?',
    a: (
      <>
        No. You can start as a guest and try everything, then save your progress to a free account with a username and
        email whenever you like. You need to be at least {MIN_AGE} to use Ascend.
      </>
    ),
  },
  {
    q: 'How do points and ranks work?',
    a: (
      <>
        What you log earns points, with a daily cap on most things so one long session can’t buy a rank. Missing a
        library habit or slipping on a bad habit costs points. Your season points move you through {TIERS.length} ranks,
        from {TIERS[0].name} to {topRank.name} at {fmt(topRank.minPoints)} points.{' '}
        <a href={featurePath('ranks')} className={LINK_CLASS}>
          More about ranks
        </a>
      </>
    ),
  },
  {
    q: 'What happens when a season ends?',
    a: 'A season lasts 90 days. When it ends, the final standings are kept, and everyone’s rank and season points start again from Beginner, so a new player always has a real chance.',
  },
  {
    q: 'Who can see what I log?',
    a: (
      <>
        Your journal, moods, cravings and recovery tracker are visible only to you, and your data is never sold. In the
        leagues, other people see your username, avatar and points, and more only if you make your profile public. The{' '}
        <a href="/privacy" className={LINK_CLASS}>
          Privacy Policy
        </a>{' '}
        says exactly what is stored and why.
      </>
    ),
  },
  {
    q: 'Is Ascend a medical or therapy app?',
    a: 'No. The recovery tracker, the focus tools and the brain lessons are for tracking and motivation, not medical treatment or therapy. If you are struggling, please contact a licensed professional or a helpline in your country.',
  },
  {
    q: 'Is this the same as other apps called Ascend?',
    a: `No. Several unrelated apps share the name. This Ascend is the gamified self-improvement web app made by ${SITE_MAKER} at ascend-neon.vercel.app, and it is not connected to any of them.`,
  },
];

/** The rising line from the loading screens, drawn once behind the hero (decorative). */
function HeroTrace() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 320"
      preserveAspectRatio="none"
      className="m-trace pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] w-full text-brand-text opacity-30 sm:h-[30rem]"
    >
      <line className="m-trace-level" x1="0" y1="300" x2="1200" y2="300" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
      <path d="M0 300 H500 C850 300 1060 260 1140 60" pathLength={1} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <HeroTrace />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 sm:pt-20 text-center">
        <h1 id="hero-title">
          <span className="m-enter block text-sm font-medium text-brand-text" style={enter(0)}>
            Ascend – Gamified Self-Improvement
          </span>
          <span
            className="m-enter mt-3 block font-serif text-5xl leading-[1.05] tracking-tight text-content-primary sm:text-7xl"
            style={enter(1)}
          >
            {SITE_TAGLINE}
          </span>
        </h1>
        <p
          className="m-enter mx-auto mt-6 max-w-2xl text-base leading-relaxed text-content-tertiary sm:text-lg"
          style={enter(2)}
        >
          Ascend is a free self-improvement app that plays like a game. Instead of one app for habits, another for your
          journal and another for goals, you log your habits, workouts, reading, skills and journal in one place, earn
          points for each one, rise through {TIERS.length} ranks and climb weekly, monthly and 90-day leagues against
          real people.
        </p>
        <div className="m-enter mt-8 flex flex-wrap justify-center gap-3" style={enter(3)}>
          <a href="/signup" data-cta="" className="btn-primary min-h-12 px-6 text-base">
            <span data-cta-label="">Start free</span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
          <a href="/features" className="btn-secondary min-h-12 px-6 text-base">
            See every feature
          </a>
        </div>
        <p className="m-enter mt-4 text-sm text-content-muted" style={enter(4)}>
          Free · In beta · On your phone and PC · No download needed
        </p>
        <p className="m-enter mt-2 text-sm text-content-muted min-[480px]:hidden" style={enter(4)}>
          Already have an account?{' '}
          <a href="/login" className={LINK_CLASS}>
            Sign in
          </a>
        </p>
      </div>

      <div className="m-enter relative mx-auto mt-12 max-w-6xl px-4 sm:mt-16 sm:px-6" style={enter(5)}>
        <Screenshot
          name="dashboard-phone"
          eager
          width={540}
          height={886}
          alt="The Ascend dashboard on a phone: 3 of 6 habits done today, 331 season points and the Starter rank"
          className="mx-auto w-full max-w-[280px] rounded-[1.75rem] border-4 border-bg-700 sm:hidden"
        />
        <Screenshot
          name="dashboard-desktop"
          eager
          width={1600}
          height={589}
          className="hidden sm:block"
          alt="The Ascend dashboard on a computer: 3 of 6 habits done today, 331 season points, the Starter rank and the climb from Beginner to Master"
        />
        <Screenshot
          name="dashboard-phone"
          eager
          width={540}
          height={886}
          alt="The Ascend dashboard on a phone: today’s habits with the points each one earns"
          className="absolute -bottom-10 right-8 hidden w-[190px] rounded-[1.75rem] border-4 border-bg-900 shadow-md lg:block xl:right-10 xl:w-[210px]"
        />
      </div>
    </section>
  );
}

const LOOP = [
  { icon: Plus, title: 'Log what you do', text: 'Tick off habits, log a workout, read a few pages, write today’s entry. Each one earns points.' },
  { icon: TrendingUp, title: 'Rank up', text: `Season points move you up ${TIERS.length} ranks, from ${TIERS[0].name} to ${topRank.name}. Missing a habit you chose costs points.` },
  { icon: Trophy, title: 'Compete', text: 'Weekly, monthly and 90-day leagues rank everyone by the points they earned, so every week is a new race.' },
];

function WhatItIs() {
  return (
    <Section labelledBy="what-title">
      <SectionHeading id="what-title" kicker="What Ascend is" title="Self-improvement with a scoreboard">
        Most self-improvement apps do one thing: one tracks habits, another holds your journal, another tracks your
        time, another your goals. Ascend puts all of it in one app and turns your whole day into a season: the work
        you put in becomes points, the points become a rank, and the leagues show how your week compares with
        everyone else’s.
      </SectionHeading>
      <ol className="mt-10 grid gap-4 grid-cols-1 md:grid-cols-3">
        {LOOP.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="card card-hover p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="stat-label">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-content-primary">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-content-tertiary">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const REASONS = [
  {
    icon: Layers,
    title: 'All in one app',
    text: 'Habits, bad habits, workouts, reading, skills, journal, time blocks, weekly goals and projects live together. No switching between five apps, and nothing forgotten because it was in the wrong one.',
  },
  {
    icon: Swords,
    title: 'Competition that builds you',
    text: 'You compete with real people in weekly, monthly and 90-day leagues. Beating someone feels as good as it does in a game, but every point came from something that made you better.',
  },
  {
    icon: Scale,
    title: 'An honest score',
    text: 'Everything you log adds to one total, and skipping a habit you chose costs points. Doing nothing is never neutral, so your rank shows how you really did.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Free, on phone and PC',
    text: 'No download and no payment. Open it in the browser or install it like an app.',
  },
];

function WhyAscend() {
  return (
    <Section labelledBy="why-title">
      <SectionHeading id="why-title" kicker="One app, and a reason to keep going" title="Why Ascend" />
      <ul className="mt-10 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="card card-hover p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
              <Icon size={20} aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-content-primary">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-content-tertiary">{text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Features() {
  return (
    <Section labelledBy="features-title">
      <SectionHeading id="features-title" kicker="Features" title="Everything you work on, in one app">
        Habits, journal, time tracking, goals, reading and more: things you would usually need a separate app for, in
        one place. {FEATURE_SLUGS.length} parts, grouped the way the app groups them. Each one has its own page with
        the exact rules.
      </SectionHeading>
      <div className="mt-10 space-y-12">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="scroll-rise flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold text-content-primary">{group.id}</h3>
              <p className="text-sm text-content-muted">{group.line}</p>
            </div>
            <ul className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {featuresInGroup(group.id).map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.slug} className="flex">
                    <a href={featurePath(feature.slug)} className={cx('card card-hover group flex w-full flex-col p-5', FOCUS_RING)}>
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="font-semibold text-content-primary">{feature.name}</span>
                      </span>
                      <span className="mt-3 text-sm leading-relaxed text-content-tertiary">{feature.summary}</span>
                      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand-text">
                        See how it works
                        <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-base group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The nine ranks as rising steps, like the segments of the logo's A. */
function RankSteps() {
  const max = topRank.minPoints;
  return (
    <ol aria-label="Ranks and the season points each one needs" className="flex h-40 items-end gap-1.5 sm:h-56 sm:gap-2">
      {TIERS.map((tier, i) => (
        <li key={tier.name} className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <span
            className="block rounded-t-lg bg-primary-500"
            style={{ height: `${12 + (tier.minPoints / max) * 76}%`, opacity: 0.25 + (0.75 * i) / (TIERS.length - 1) }}
            aria-hidden="true"
          />
          <span className="mt-2 hidden truncate text-center text-xs font-medium text-content-secondary sm:block">{tier.name}</span>
          <span className="hidden text-center text-xs tabular-nums text-content-muted sm:block">{fmt(tier.minPoints)}</span>
          <span className="sr-only sm:hidden">
            {tier.name}, {fmt(tier.minPoints)} points
          </span>
        </li>
      ))}
    </ol>
  );
}

function PointsRanksLeagues() {
  return (
    <Section labelledBy="how-title">
      <SectionHeading id="how-title" kicker="How it works" title="Points, ranks and leagues">
        The rules are the same for everyone and fully shown in the app. Here they are in short.
      </SectionHeading>

      <div className="mt-10 grid gap-6 grid-cols-1 lg:grid-cols-5">
        <div className="card p-6 sm:p-8 lg:col-span-3">
          <h3 className="text-lg font-semibold text-content-primary">What earns points</h3>
          <p className="mt-1 text-sm text-content-muted">Most things have a daily cap, so one long session can’t buy a rank.</p>
          <dl className="mt-5 divide-y divide-overlay-subtle">
            {EARNS.map(({ what, rule, href }) => (
              <div key={what} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt>
                  <a href={href} className={cx('text-sm font-semibold text-content-primary hover:text-brand-text rounded', FOCUS_RING)}>
                    {what}
                  </a>
                </dt>
                <dd className="text-sm leading-relaxed text-content-tertiary">{rule}.</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-xl bg-overlay-subtle p-4 text-sm leading-relaxed text-content-secondary">
            <span className="font-semibold text-content-primary">And what costs points.</span> Missing a library habit,
            slipping on a bad habit or not logging one takes points away, and the cost grows when it keeps happening.
            Projects, plans and partner challenges are for planning and support, so they don’t earn points.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:col-span-2 lg:self-start">
          <div className="card p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 text-brand-text">
                <CalendarDays size={18} aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold text-content-primary">Three leagues, always running</h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-content-tertiary">
              <li>
                <span className="font-semibold text-content-primary">Weekly</span> starts again every Monday at 00:00 UTC.
              </li>
              <li>
                <span className="font-semibold text-content-primary">Monthly</span> starts again on the 1st of each month
                (UTC).
              </li>
              <li>
                <span className="font-semibold text-content-primary">90-Day</span> is the season. When it ends, final
                standings are kept and every rank starts again from {TIERS[0].name}.
              </li>
            </ul>
            <a href={featurePath('leagues')} className={cx(LINK_CLASS, 'mt-4 inline-flex min-h-11 items-center gap-1 text-sm')}>
              How leagues work <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-lg font-semibold text-content-primary">{TIERS.length} ranks per season</h3>
          <p className="text-sm text-content-tertiary">
            Season points move you up. {topRank.name} needs {fmt(topRank.minPoints)}.
          </p>
        </div>
        <div className="mt-6">
          <RankSteps />
        </div>
        <ul aria-hidden="true" className="mt-4 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs sm:hidden">
          {TIERS.map((tier) => (
            <li key={tier.name} className="flex justify-between gap-2">
              <span className="font-medium text-content-secondary">{tier.name}</span>
              <span className="tabular-nums text-content-muted">{fmt(tier.minPoints)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="scroll-rise mt-6">
        <Screenshot
          name="ranks-desktop"
          width={1400}
          height={885}
          alt="The Ranks page in Ascend: Starter rank at 43% of the way to Learner, the season countdown, all nine ranks with the points they need, and recent points"
        />
      </div>
    </Section>
  );
}

function Platforms() {
  return (
    <Section labelledBy="where-title">
      <div className="grid items-center gap-10 grid-cols-1 lg:grid-cols-2">
        <div>
          <SectionHeading id="where-title" kicker="Free, in beta" title="On your phone and your PC">
            Ascend runs in the browser, so there is nothing to download and it works on Android, iPhone, Windows, Mac and
            Linux. Add it to your home screen or install it from the browser and it opens like an app. Sign in on another
            device and your progress is there.
          </SectionHeading>
          <ul className="scroll-rise mt-6 space-y-2 text-sm text-content-secondary">
            <li>Free while in beta, with no payments in the app.</li>
            <li>Start as a guest, then save to a free account with a username and email.</li>
            <li>Light and dark theme.</li>
          </ul>
          <div className="scroll-rise mt-8 flex flex-wrap gap-3">
            <a href="/signup" data-cta="" className="btn-primary min-h-11">
              <span data-cta-label="">Create a free account</span>
            </a>
            <a href="/login" className="btn-ghost min-h-11">
              Sign in
            </a>
          </div>
        </div>
        <div className="scroll-rise mx-auto w-full max-w-[300px]">
          <Screenshot
            name="dashboard-phone"
            width={540}
            height={886}
            alt="Ascend on a phone: the dashboard with today’s habits, season points and rank"
            className="rounded-[2rem] border-4 border-bg-700"
          />
        </div>
      </div>
    </Section>
  );
}

function WhoFor() {
  const forList = [
    'You stay motivated when there is a score, a rank or someone to beat.',
    'You want habits, workouts, reading, skills and a journal in one place instead of five apps.',
    'You are a student or anyone building a routine, and want to see it add up week by week.',
    'You want a friend to keep you honest with a shared daily challenge.',
  ];
  const notList = [
    'You want a plain to-do list with no points or competition.',
    'You need medical, mental health or addiction treatment. Ascend can sit alongside real help, never replace it.',
    'You need an app store app. Ascend is a web app you install from the browser.',
  ];
  return (
    <Section labelledBy="who-title">
      <SectionHeading id="who-title" kicker="Who it is for" title="Made for people who like to compete" />
      <div className="mt-10 grid gap-6 grid-cols-1 md:grid-cols-2">
        <div className="card p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-content-primary">Ascend fits if</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-content-tertiary">
            {forList.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-content-primary">It may not fit if</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-content-tertiary">
            {notList.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-content-muted" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function About() {
  const facts: [string, ReactNode][] = [
    ['What it is', 'A gamified self-improvement web app'],
    ['Made by', `${SITE_MAKER}, a computer science student in Peshawar, Pakistan`],
    ['Website', 'ascend-neon.vercel.app'],
    ['Price', 'Free (beta)'],
    ['Works on', 'Any modern browser on phone, tablet and computer; installable as an app'],
    ['Account', `Free account or guest; age ${MIN_AGE} and up`],
    [
      'Contact',
      <a key="mail" href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={cx(LINK_CLASS, 'break-all')}>
        {LEGAL_CONTACT_EMAIL}
      </a>,
    ],
  ];
  return (
    <Section labelledBy="about-title">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
        <div className="card p-6 sm:p-8 lg:col-span-2">
          <h2 id="about-title" className="text-2xl font-semibold tracking-tight text-content-primary">
            Ascend at a glance
          </h2>
          <dl className="mt-5 space-y-4">
            {facts.map(([term, value]) => (
              <div key={term}>
                <dt className="stat-label">{term}</dt>
                <dd className="mt-0.5 text-sm text-content-primary">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-overlay-subtle pt-4 text-sm leading-relaxed text-content-muted">
            Other apps also use the name Ascend. This Ascend is not affiliated with any of them.
          </p>
        </div>

        <figure className="card p-6 sm:p-8 lg:col-span-3">
          <h3 className="text-lg font-semibold text-content-primary">Why I built Ascend</h3>
          <blockquote className="mt-4 space-y-4 text-base leading-relaxed text-content-secondary">
            <p>
              People love to compete: in grades, jobs and sport. When real life doesn’t give that drive a good place to
              go, it finds one anyway. For some of us it’s a ranked game like PUBG or Valorant. For others it’s
              followers and likes, who has the better phone or bike, or winning every argument in the comments. The
              drive is real; it’s just aimed at things that leave us with nothing at the end.
            </p>
            <p>
              I kept asking what would happen if that same drive went into the right place. You’d still get the
              competition, but at the end of a season you’d also have read more, trained more and kept more of your
              habits.
            </p>
            <p>
              The league gets you started, but the one really worth beating is who you were yesterday. It only works if
              you’re honest with yourself. The points are there to push you; the real prize is what changes in you.
            </p>
          </blockquote>
          <figcaption className="mt-6 text-sm">
            <span className="font-semibold text-content-primary">{SITE_MAKER}</span>
            <span className="text-content-muted"> · Maker of Ascend, computer science student in Peshawar</span>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

function Faq() {
  return (
    <Section labelledBy="faq-title">
      <SectionHeading id="faq-title" kicker="FAQ" title="Questions people ask" />
      <FaqList items={FAQ} />
    </Section>
  );
}

function FinalCta() {
  return (
    <CtaBand id="cta-title" title="The season is already running">
      Join now, log today, and see where you stand on Monday. It’s free.
    </CtaBand>
  );
}

export function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <WhatItIs />
      <WhyAscend />
      <Features />
      <PointsRanksLeagues />
      <Platforms />
      <WhoFor />
      <About />
      <Faq />
      <FinalCta />
    </MarketingLayout>
  );
}
