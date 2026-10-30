import { MIN_AGE } from '@/lib/legal';
import { getMissPenaltyMultiplier } from '@/lib/missPenalty';
import { BAD_HABIT_POINTS, PRESET_HABIT_POINTS, READING_POINTS, WORKOUT_POINTS } from '@/lib/pointsConfig';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from './components/MarketingLayout';
import type { FaqItem } from './components/Sections';
import { FEATURE_SLUGS, featurePath } from './features/catalog';
import { fmt } from './features/format';
import { SEASON_DAYS, SITE_DEFINITION, SITE_HOST, SITE_MAKER, SITE_NAME } from './site';

/*
 * The home page's questions and answers: "Why AscendDay works the way it does" and the FAQ. Kept
 * out of Landing.tsx because the structured data (head.ts) and llms.txt (llms.ts) read the same
 * arrays the page shows. Every number comes from the app's own code.
 */

const first = TIERS[0];
const topRank = TIERS[TIERS.length - 1];
const performer = TIERS.find((t) => t.name === 'Performer') ?? TIERS[0];
const repeatMiss = getMissPenaltyMultiplier(2, 0);

/** Who AscendDay is for, and who it may not suit (home page, llms.txt). */
export const LANDING_FITS = [
  'You stay motivated when there is a score, a rank or someone to beat.',
  'You want habits, workouts, reading, skills and a journal in one place instead of five apps.',
  'You are a student or anyone building a routine, and want to see it add up week by week.',
  'You want a friend to keep you honest with a shared daily challenge.',
  'You just want one place to track everything. Competing is optional: you can ignore points, ranks and leagues completely.',
];
export const LANDING_NOT_FOR = [
  'You need medical, mental health or addiction treatment. AscendDay can sit alongside real help, never replace it.',
  'You need an app store app. AscendDay is a web app you install from the browser.',
];

/** Why the app is built the way it is: answer first, short enough to quote. */
export const LANDING_WHY: FaqItem[] = [
  {
    q: 'Why is AscendDay gamified?',
    a: 'Because most people keep doing something longer when they can see progress and have something to win. AscendDay borrows the parts of games that bring people back, a score, ranks and a leaderboard, and ties each one to something real you did today: a habit ticked, pages read, a workout logged. The game is the push; the habits are what you keep.',
  },
  {
    q: 'Why does AscendDay use points?',
    a: `Points let very different efforts add up to one number. Ten pages, a run and a journal entry are not the same thing, but each earns points under fixed rules shown in the app, so your whole week becomes one total you can compare. Most things have a daily cap (${PRESET_HABIT_POINTS.dailyCap} points a day from habits, ${WORKOUT_POINTS.dailyCap} from workouts, ${READING_POINTS.dailyCap} from reading), so steady days beat one long session.`,
  },
  {
    q: 'Why can a missed habit cost points?',
    a: `Because a streak is easier to protect when breaking it costs something. Losing points you already have tends to feel stronger than not earning new ones, the well-known idea of loss aversion, so a small cost is enough to get you to tick a habit on a tired day. Only library habits and your ${BAD_HABIT_POINTS.eligibleSlots} oldest bad habits can cost points; custom habits never do. A first miss costs the habit’s own points, each further miss in a row ×${repeatMiss} (more from ${performer.name} rank), and ticking the habit again resets the count.`,
  },
  {
    q: 'Why compete in leagues against real people?',
    a: `Because other people are a strong reason to keep going when motivation fades. Every member is in a weekly, a monthly and a ${SEASON_DAYS}-day league automatically, ranked by the points they earned, and every row is a real person, not a bot. The weekly league starts again every Monday, so a bad week never locks you out for long.`,
  },
  {
    q: `Why ranks and ${SEASON_DAYS}-day seasons?`,
    a: `Ranks give you a long goal; seasons keep it fair. Season points move you through ${TIERS.length} ranks, from ${first.name} to ${topRank.name} at ${fmt(topRank.minPoints)} points. Every ${SEASON_DAYS} days the season ends, the final standings are kept, and everyone starts again at ${first.name}, so a newcomer races from the same line as a long-time member and no lead lasts forever.`,
  },
  {
    q: 'Why one app instead of separate habit, journal and goal apps?',
    a: `Because your habits, workouts, reading, journal and goals are parts of one life, and they work better when they know about each other. ${SITE_NAME} has ${FEATURE_SLUGS.length} parts in one app, and everything that earns points adds to one score, so it all counts toward the same rank and leagues. A weekly goal fills in from your habits, workouts, reading or skills; logging pages ticks your Reading habit; ticking a linked habit ticks the challenge you share with a friend. You log things once, in one place you open every day.`,
  },
  {
    q: 'Why is AscendDay free and browser-based?',
    a: `${SITE_NAME} is free while it is in beta, with no payments anywhere in the app. It runs in the browser, so one version works on Android, iPhone, Windows, Mac and Linux without an app store, and you can install it from the browser so it opens like an app. You can start as a guest and save your progress to a free account later. It is made by one developer, ${SITE_MAKER}, in Pakistan.`,
  },
];

/** The home page's FAQ (visible, and the FAQPage structured data). */
export const LANDING_FAQ: FaqItem[] = [
  {
    q: 'What is AscendDay?',
    a: SITE_DEFINITION,
  },
  {
    q: 'Is AscendDay free?',
    a: 'Yes. AscendDay is a free self-improvement web app: every feature is free while it is in beta, and there are no payments anywhere in the app.',
  },
  {
    q: 'Is there an AscendDay app for Android, iPhone or PC?',
    a: 'AscendDay is a web app, so it runs in the browser on any phone, tablet or computer. You can add it to your home screen or install it from the browser, and it then opens like any other app. It isn’t in the app stores yet.',
  },
  {
    q: 'Do I need an account?',
    a: (
      <>
        No. You can start as a guest and try everything, then save your progress to a free account with a username and
        email whenever you like. You need to be at least {MIN_AGE} to use {SITE_NAME}.
      </>
    ),
  },
  {
    q: 'Do I have to compete?',
    a: 'No. Competing is optional. You can use AscendDay only to track your habits, workouts, reading and journal in one place, and never open the leagues or think about your rank. Points still add up in the background, and like every member your username and points appear on the league tables, but nothing asks you to check them or chase anyone. Just do your work.',
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
    q: 'Is AscendDay a medical or therapy app?',
    a: 'No. The recovery tracker, the focus tools and the brain lessons are for tracking and motivation, not medical treatment or therapy. If you are struggling, please contact a licensed professional or a helpline in your country.',
  },
  {
    q: 'Is this the same as other apps called Ascend?',
    a: `No. Several unrelated apps share the name. ${SITE_NAME} (also written Ascend Day) is the gamified self-improvement web app made by ${SITE_MAKER} at ${SITE_HOST}, and it is not connected to any of them.`,
  },
];

