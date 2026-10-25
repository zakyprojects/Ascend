import { getSeasonStartByNumber } from '@/lib/leagueTime';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';

/* /features/leagues. Sources: lib/leagueTime.ts (UTC week/month/season windows, Season 1 start and
   length: the defaults the server's ascend_season_config also holds), lib/leagues.ts (periods
   clamped to the season start, table order points → name → id, reset time shown in local time),
   components/views/Leagues.tsx (tabs Weekly / Monthly / Season, Your place, countdown, rank badge
   from season points on every tab, past standings, "Final standings in up to 2 days", guest
   banner), lib/auth.ts (everyone with a profile is in the table), and the Privacy Policy (league
   results show username, avatar and points). Leagues award no points of their own. */

const DAY_MS = 24 * 60 * 60 * 1000;
const seasonOneStart = getSeasonStartByNumber(1);
const seasonDays = Math.round((getSeasonStartByNumber(2).getTime() - seasonOneStart.getTime()) / DAY_MS);
const utcDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const beginner = TIERS[0];
const top = TIERS[TIERS.length - 1];

export const leagues: FeatureContent = {
  intro: (
    <>
      <p>
        Leagues in Ascend are free self-improvement leagues: leaderboards where you compete on habits with real people. Every point you earn from habits,
        workouts, reading, skills, focus sessions, the journal and the rest counts in three tables at once: this week,
        this month and the {seasonDays}-day season.
      </p>
      <p>
        The weekly and monthly tables start again on a fixed calendar, so a slow start never locks you out for long. The
        season table is the long game, and it sets your rank.
      </p>
    </>
  ),
  heroShot: {
    name: 'leagues-phone',
    width: 540,
    height: 1246,
    alt: 'The weekly league on a phone: Ali in 1st place of 8 members with 112 points, a reset countdown of 3 days 15 hours, and Sara 2nd with 96 points',
  },
  body: (
    <>
      <Block
        id="three-title"
        title="Three leagues: a weekly leaderboard, a monthly one and the season"
        lead={<p>Each tab of the Leagues page ranks the same members over a different stretch of time.</p>}
      >
        <Cards
          items={[
            {
              title: 'Weekly',
              text: 'Monday 00:00 UTC to the next Monday 00:00 UTC. The quickest race: a good week can take you to the top even if you joined yesterday.',
            },
            {
              title: 'Monthly',
              text: 'From the 1st of the month at 00:00 UTC to the 1st of the next. It rewards the weeks you keep going after the first push wears off.',
            },
            {
              title: `Season (${seasonDays} days)`,
              text: `Season 1 started on ${utcDate(seasonOneStart)} at 00:00 UTC and each season lasts ${seasonDays} days. The season table is where your rank comes from.`,
            },
          ]}
        />
        <Note title="Your own clock.">
          The reset times are in UTC so everyone races to the same finish line, but the app shows the countdown and the
          reset day in your local time, such as “Resets Mon · 5:00 AM your time” in Pakistan. When a new season starts,
          a week or month that began in the old season only counts from the season’s first moment.
        </Note>
      </Block>

      <Block id="how-title" title="How to climb a league">
        <Steps
          items={[
            {
              title: 'Earn points anywhere in the app',
              text: 'There is nothing extra to join. Tick a habit, log a run, read some pages or finish a focus session, and the points land in all three tables.',
            },
            {
              title: 'Check your place',
              text: 'The top of each tab shows your place, how many members have points in that table, your points for that week, month or season, and the time left.',
            },
            {
              title: 'Look at who is around you',
              text: 'Every row shows a member’s username, avatar, season rank badge and points. Open a member to see their profile summary when you both keep your profiles public, or when they are your partner.',
            },
            {
              title: 'Look back',
              text: 'Finished weeks, months and seasons move to the side list with your final place and points, so you can see how this week compares.',
            },
          ]}
        />
      </Block>

      <Block
        id="how-points-work"
        title="How points work in leagues"
        lead={
          <>
            <p>
              Leagues have no point rules of their own. The tables add up the same points every other page earns, after
              each page’s daily cap and after any points lost to missed habits or bad-habit slips. A lost point lowers
              your league score as well.
            </p>
            <p>
              The server keeps the points ledger and adds up each member’s total, so a table cannot be changed from the
              app. Members with more points sit higher; equal points are ordered by username.
            </p>
          </>
        }
      >
        <Rules
          caption="What counts in each table"
          rows={[
            { what: 'Points you earn this week (from Monday 00:00 UTC)', amount: 'Weekly' },
            { what: 'Points you earn this month (from the 1st, 00:00 UTC)', amount: 'Monthly' },
            { what: `Points you earn this season (${seasonDays} days)`, amount: 'Season', note: 'This total also sets your rank.' },
            { what: 'Placing first, or anywhere else, in a table', amount: '0', tone: 'none', note: 'There is no prize; the place is the reward.' },
            { what: 'Points lost to a missed habit or a slip', amount: 'All three', tone: 'loss' },
          ]}
        />
        <Note title="Rank badges.">
          The badge on each row is that member’s season rank on every tab, from {beginner.name} to {top.name}, so the
          weekly table also shows who has kept it up all season. How the nine ranks work is on the{' '}
          <a href={featurePath('ranks')} className={LINK_CLASS}>
            ranks page
          </a>
          .
        </Note>
      </Block>

      <Block
        id="finish-title"
        title="When a period ends"
        lead={
          <>
            <p>
              The moment a week, month or season ends, its table starts again from zero for everyone. The finished table
              is saved with the place and points of every member who scored and shows up under Past weeks, Past months or
              Past seasons.
            </p>
            <p>
              A saved table can still change for up to two days after the period ends, while late logs from the last
              day come in. It is marked “Final standings in up to 2 days” until then.
            </p>
          </>
        }
      />

      <Block
        id="who-title"
        title="Who you compete with"
        lead={
          <>
            <p>
              Everyone with an Ascend account is in the same tables. There are no bots and no invented rivals: every row
              is a person using the app. If you try Ascend as a guest you are in the tables too, under a guest name, and
              creating an account keeps your place and lets you choose your own username.
            </p>
            <p>
              Other members see your username, avatar and points in the tables, as the{' '}
              <a href="/privacy" className={LINK_CLASS}>
                Privacy Policy
              </a>{' '}
              says. Your journal, moods and recovery tracker never appear there. If you would rather race a few friends,
              pair up with them as{' '}
              <a href={featurePath('accountability-partners')} className={LINK_CLASS}>
                partners
              </a>
              .
            </p>
          </>
        }
      />
    </>
  ),
  wideShot: {
    name: 'leagues-desktop',
    width: 1400,
    height: 1228,
    alt: 'The Leagues page on a computer: the weekly table for Oct 19 – Oct 25 with eight members and their rank badges, Ali 1st with 112 points, and past weeks where Ali finished 2nd and 1st',
    caption: 'Leagues on a computer. Ali is the demo user; the other members are invented for this picture.',
  },
  facts: [
    ['Leagues', `Weekly, monthly and ${seasonDays}-day season`],
    ['Weekly reset', 'Monday 00:00 UTC'],
    ['Monthly reset', 'The 1st, 00:00 UTC'],
    ['Season 1 began', utcDate(seasonOneStart)],
    ['Who is in it', 'Every member, guests included'],
    ['Others see', 'Username, avatar, points'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'A bit of competition gets you moving more than a checklist does.',
    'You want a fresh start every Monday without losing the long-term picture.',
    'You like a habit leaderboard that shows how your effort compares with other real people.',
  ],
  notFor: [
    'You don’t want your username and points shown to other members.',
    'You only want a private tracker with no comparison at all.',
  ],
  faq: [
    {
      q: 'When do the leagues reset?',
      a: `The weekly league resets every Monday at 00:00 UTC, the monthly league on the 1st at 00:00 UTC, and the season every ${seasonDays} days. The app shows each reset in your local time.`,
    },
    {
      q: 'Do I have to join a league?',
      a: 'No. Every member is in all three tables automatically, and the points you already earn are what count.',
    },
    {
      q: 'Are the other people in the table real?',
      a: 'Yes. Every row is someone with an Ascend account or a guest using the app. There are no bots.',
    },
    {
      q: 'Can I lose places by missing habits?',
      a: 'Yes. Points lost to a missed library habit, a bad-habit slip or an unlogged bad-habit day come off your league totals too.',
    },
    {
      q: 'What do other members see about me?',
      a: 'Your username, avatar, rank badge and points. If you both keep your profiles public they can also open a summary of your stats, and your partners always can; your journal and recovery tracker stay private.',
    },
  ],
  related: ['ranks', 'accountability-partners', 'habits', 'weekly-goals'],
  cta: { title: 'Take your place in this week’s table', text: 'Earn your first points today and see where you land before Monday.' },
};
