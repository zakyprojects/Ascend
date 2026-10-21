import { getSeasonStartByNumber } from '@/lib/leagueTime';
import { getMissPenaltyMultiplier } from '@/lib/missPenalty';
import {
  BAD_HABIT_POINTS,
  JOURNAL_POINTS,
  PFC_POINTS,
  PRESET_HABIT_POINTS,
  READING_POINTS,
  RECOVERY_POINTS,
  SKILLS_POINTS,
  TIME_TRACKER_POINTS,
  WEEKLY_GOALS_POINTS,
  WEEKLY_REFLECTION_POINTS,
  WORKOUT_POINTS,
} from '@/lib/pointsConfig';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, type FeatureContent } from '../blocks';
import { fmt, pts } from '../format';

/* /features/ranks (ranks, season points and streaks in one page). Sources: lib/tiers.ts TIERS,
   lib/leagues.ts calculateSeasonalTotal (season points only, never below 0), lib/leagueTime.ts
   (season length), lib/rankCelebration.ts (each rank celebrated once per season, a new season
   starts at Beginner), lib/missPenalty.ts (escalation from Performer), lib/pointsConfig.ts (caps),
   components/views/TierView.tsx (progress to the next rank, season countdown, recent points) and
   lib/streakLogic.ts calculateUnifiedStreak (a streak lives while the last day is today or
   yesterday; the headline streak is the longest of habits, exercise, reading, resisted bad habits
   and skill practice). No point rule pays for a streak. */

const DAY_MS = 24 * 60 * 60 * 1000;
const seasonDays = Math.round((getSeasonStartByNumber(2).getTime() - getSeasonStartByNumber(1).getTime()) / DAY_MS);
const first = TIERS[0];
const second = TIERS[1];
const top = TIERS[TIERS.length - 1];
const performer = TIERS.find((t) => t.name === 'Performer') ?? TIERS[0];
const performerIndex = TIERS.indexOf(performer) + 1;
const perDayForTop = Math.ceil(top.minPoints / seasonDays);
const times = (n: number) => `${n}×`;

export const ranks: FeatureContent = {
  intro: (
    <>
      <p>
        Ranks in Ascend are a real-life levelling system: {TIERS.length} ranks from {first.name} to {top.name}, climbed
        with the points you earn from habits, workouts, reading and the rest. It is free, and the ladder starts again
        every {seasonDays}-day season, so a newcomer and a long-time member race from the same line.
      </p>
      <p>
        This page also covers season points, which decide your rank, and streaks, which show how many days in a row
        you have kept something going.
      </p>
    </>
  ),
  heroShot: {
    name: 'ranks-phone',
    width: 540,
    height: 1246,
    alt: `The Ranks page on a phone: Ali is a Learner with 510 season points, 390 points to Trainer, the season countdown, and the ladder from ${first.name} to Achiever`,
  },
  body: (
    <>
      <Block
        id="ladder-title"
        title={`The ${TIERS.length} ranks`}
        lead={
          <p>
            Each rank begins at a set number of season points. Reach it and you move up straight away; the Ranks page
            shows how far you are into your rank and how many points the next one needs.
          </p>
        }
      >
        <Rules
          caption="Season points needed for each rank"
          rows={TIERS.map((tier, i) => ({
            what: `${i + 1}. ${tier.name}`,
            amount: pts(fmt(tier.minPoints)),
            note: i === 0 ? 'Where everyone starts each season.' : `${fmt(tier.minPoints - TIERS[i - 1].minPoints)} more than ${TIERS[i - 1].name}.`,
          }))}
        />
        <Note title="How far is the top?">
          {top.name} needs {fmt(top.minPoints)} points inside one {seasonDays}-day season, about {perDayForTop} points a
          day on average. {second.name}, the first step up, is {fmt(second.minPoints)} points away from a fresh start.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How season points work"
        lead={
          <>
            <p>
              Your rank comes from your season points: everything you earned since the current season started, minus
              anything you lost to missed habits or bad-habit slips. There is no lifetime total behind the rank, and the
              season score never drops below zero.
            </p>
            <p>Every page adds to the same score, each with its own daily or weekly limit so no single page can carry you.</p>
          </>
        }
      >
        <Rules
          caption="Where season points come from"
          rows={[
            { what: 'Habits from the library', amount: `up to ${PRESET_HABIT_POINTS.dailyCap} a day` },
            { what: 'Resisting bad habits', amount: `up to ${BAD_HABIT_POINTS.dailyCap} a day` },
            { what: 'Workouts', amount: `up to ${WORKOUT_POINTS.dailyCap} a day` },
            { what: 'Reading', amount: `up to ${READING_POINTS.dailyCap} a day`, note: `Plus ${pts(READING_POINTS.completionBonus)} for a finished book that qualifies.` },
            { what: 'Skill practice', amount: `up to ${SKILLS_POINTS.dailyCap} a day` },
            { what: 'Focus sessions', amount: `up to ${PFC_POINTS.focus.dailyCap} a day` },
            { what: 'Following your time blocks', amount: `up to ${TIME_TRACKER_POINTS.dailyCap} a day` },
            { what: 'A journal entry', amount: `${JOURNAL_POINTS.entryCompleted} a day` },
            {
              what: 'Weekly goals and the weekend reflection',
              amount: `up to ${WEEKLY_GOALS_POINTS.maxWeeklyPoints + WEEKLY_REFLECTION_POINTS.awarded} a week`,
            },
            { what: 'Recovery milestones', amount: `up to ${RECOVERY_POINTS.seasonCap} a season` },
            { what: 'Missed library habits, slips, unlogged bad-habit days', amount: 'lose points', tone: 'loss' },
          ]}
        />
        <Note title={`From ${performer.name} up, misses cost more.`}>
          Below {fmt(performer.minPoints)} season points a repeated miss costs {times(getMissPenaltyMultiplier(2))} the
          normal amount. From {performer.name}, rank {performerIndex}, a second miss in a row costs{' '}
          {times(getMissPenaltyMultiplier(2, performer.minPoints))} and a third{' '}
          {times(getMissPenaltyMultiplier(3, performer.minPoints))}, so the higher ranks are harder to hold. The
          details are on the{' '}
          <a href={featurePath('habits')} className={LINK_CLASS}>
            habits page
          </a>
          .
        </Note>
      </Block>

      <Block
        id="season-title"
        title="A new climb every season"
        lead={
          <>
            <p>
              When a season ends, everyone goes back to {first.name} and the new season’s points start from zero. Your
              finished season is kept: its score shows in Past seasons on the Leagues page and on your profile.
            </p>
            <p>
              Each time you reach a new rank Ascend shows a short rank-up moment, once per rank per season. Dropping
              below a rank and climbing back does not show it again.
            </p>
          </>
        }
      >
        <Cards
          items={[
            {
              title: 'Why it resets',
              text: 'A ladder that never resets turns into a record of who joined first. Starting again each season keeps the top within reach for anyone who shows up.',
            },
            {
              title: 'What the Ranks page shows',
              text: 'Your rank, your season points, the share of the way to the next rank, the points still needed, the time left in the season and your latest point changes.',
            },
            {
              title: 'Where your rank appears',
              text: 'Next to your name in every league table, on your profile, on the partner card and at the bottom of the app’s sidebar.',
            },
          ]}
        />
      </Block>

      <Block
        id="streaks-title"
        title="Streaks: days in a row"
        lead={
          <>
            <p>
              A streak counts the days in a row you did something. Each habit has its own, and so do exercise, reading,
              skill practice and each bad habit you resist. A streak stays alive while your last day is today or
              yesterday, so you have until the end of today to keep it going.
            </p>
            <p>
              Your headline streak, shown on your profile and to your partners, is your longest running one. Streaks
              earn no points on their own: the points come from the ticks and logs that build them, and a streak is the
              part you can see.
            </p>
          </>
        }
      >
        <Note title="Streaks and leagues.">
          Ranks are your own climb; the{' '}
          <a href={featurePath('leagues')} className={LINK_CLASS}>
            leagues
          </a>{' '}
          put that climb next to everyone else’s, in a weekly, a monthly and a season table.
        </Note>
      </Block>
    </>
  ),
  wideShot: {
    name: 'ranks-ladder-desktop',
    width: 1400,
    height: 1081,
    alt: `The Ranks page on a computer: Learner with 510 season points and 2% of the way to Trainer, the ladder from ${first.name} (0) to Performer (${fmt(performer.minPoints)}), and recent points such as Reading: 6 pts`,
    caption: 'The Ranks page on a computer, with the demo user Ali’s season.',
  },
  facts: [
    ['Ranks', `${TIERS.length}, ${first.name} to ${top.name}`],
    ['Top rank', `${fmt(top.minPoints)} season points`],
    ['Season', `${seasonDays} days, then back to ${first.name}`],
    ['Lowest score', '0; it never goes negative'],
    ['Harder from', `${performer.name}, ${fmt(performer.minPoints)} points`],
    ['Streaks', 'Alive while you log today or yesterday'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You like games with levels and want that feeling for real progress.',
    'A clear next target, like 390 points to the next rank, keeps you going.',
    'You want a ladder that starts fresh every few months.',
  ],
  notFor: [
    'You want a rank that only ever goes up; season points can fall and every season starts again.',
    'You would rather not see numbers attached to your habits.',
  ],
  faq: [
    {
      q: 'How many ranks are there?',
      a: `${TIERS.length}: ${TIERS.map((t) => t.name).join(', ')}. ${top.name} starts at ${fmt(top.minPoints)} season points.`,
    },
    {
      q: 'Do I lose my rank?',
      a: `Your rank follows your season points, so points lost to misses can take you down a rank. Every new season also starts everyone at ${first.name} again.`,
    },
    {
      q: 'What happens to my points when the season ends?',
      a: 'The finished season’s score is kept in your past seasons and on your profile. The new season’s rank starts from zero points.',
    },
    {
      q: 'Do streaks give points?',
      a: 'No. Streaks show how many days in a row you kept something up. The points come from the habits, workouts and logs themselves.',
    },
    {
      q: 'When does a streak break?',
      a: 'When a whole day passes without it. If your last day was yesterday, the streak is still alive until today ends.',
    },
  ],
  related: ['leagues', 'habits', 'bad-habits', 'accountability-partners'],
  cta: { title: 'Start your climb this season', text: `Everyone begins at ${first.name}. Your first ${fmt(second.minPoints)} points make you a ${second.name}.` },
};
