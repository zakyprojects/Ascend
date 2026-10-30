import { CUSTOM_HABIT_POINTS } from '@/lib/habitAwards';
import { getMissPenaltyMultiplier } from '@/lib/missPenalty';
import { PRESET_HABIT_POINTS } from '@/lib/pointsConfig';
import { PRESET_CATEGORIES } from '@/lib/presets';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { fmt, pts, range } from '../format';

/* /features/habits. Sources: lib/presets.ts (library), lib/habitAwards.ts (custom points),
   lib/pointsConfig.ts (daily cap), lib/missPenalty.ts (miss multiplier), lib/tiers.ts, and the
   Habits page's own "How points work" (components/views/HabitTracker.tsx). */

const library = PRESET_CATEGORIES.flatMap((c) => c.habits);
const libraryPoints = range(library.map((h) => h.points));
const cap = PRESET_HABIT_POINTS.dailyCap;
const performer = TIERS.find((t) => t.name === 'Performer') ?? TIERS[0];
const rankIndex = TIERS.indexOf(performer) + 1;

/** The cost of the nth miss in a row, rounded like the app and the server. */
const missCost = (points: number, nth: number, seasonPoints: number) => Math.round(points * getMissPenaltyMultiplier(nth, seasonPoints));
const below = (n: number) => getMissPenaltyMultiplier(n, 0);
const above = (n: number) => getMissPenaltyMultiplier(n, performer.minPoints);
const times = (m: number) => `×${m}`;

/** A real two-point library habit for the worked example. */
const example = library.find((h) => h.points === 2) ?? library[0];
const exampleBelow = [1, 2, 3].map((n) => missCost(example.points, n, 0));
const exampleAbove = [1, 2, 3].map((n) => missCost(example.points, n, performer.minPoints));

export const habits: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s gamified habit tracker is a free daily and weekly habit list where every tick earns points. Pick habits from a
        library of {library.length} or write your own, tick them off each day, watch the streak grow, and see those points
        move your rank and your place in the leagues.
      </p>
      <p>
        It also works the other way: a habit you chose from the library and then skip costs points. That small cost is
        what makes a streak feel worth protecting.
      </p>
    </>
  ),
  heroShot: {
    name: 'habits-phone',
    width: 540,
    height: 1246,
    alt: 'The Habits page on a phone: 3 of 6 habits done today, 4 of 10 habit points earned and a 7 of 7 active-day week',
  },
  body: (
    <>
      <Block
        id="what-title"
        title="Two kinds of habits"
        lead={
          <p>
            Every habit in AscendDay is either a library habit or a custom one. The difference matters, because it decides
            what a tick earns and what a miss costs.
          </p>
        }
      >
        <Cards
          cols={2}
          items={[
            {
              title: `Library habits (${library.length})`,
              text: (
                <>
                  Ready-made daily habits in {PRESET_CATEGORIES.length} groups: {PRESET_CATEGORIES.map((c) => c.name).join(', ')}.
                  Each is worth {libraryPoints} points, shown when you add it, so “{example.name}” is worth more
                  than a quick win like “{library.find((h) => h.points === 1)?.name ?? library[0].name}”. These are the
                  habits that can cost points when missed.
                </>
              ),
            },
            {
              title: 'Custom habits',
              text: (
                <>
                  Anything else you want to build, daily or weekly. A daily custom habit earns{' '}
                  {pts(CUSTOM_HABIT_POINTS)} per tick; a weekly one keeps a streak but earns no points. Custom habits never
                  cost points, so they are a safe place to try something new.
                </>
              ),
            },
          ]}
        />
      </Block>

      <Block id="how-title" title="How to use it">
        <Steps
          items={[
            {
              title: 'Add a habit',
              text: 'Tap New habit, choose Library or Custom, and for a custom habit pick Daily or Weekly. A few habits you will really do beat a long list.',
            },
            {
              title: 'Tick it when it’s done',
              text: 'Tap the box next to the habit. On a phone you can also swipe it right to mark it done, or left to delete it. Done habits move to the Done list.',
            },
            {
              title: 'Watch the streak',
              text: 'Each habit shows its current streak, your best streak and the last few days at a glance, and the week card shows how many of the last 7 days you were active.',
            },
            {
              title: 'Keep an eye on misses',
              text: 'If a library habit was missed, its row says how many days in a row and what missing today would cost, before it happens.',
            },
          ]}
        />
        <Note title="Only today counts.">
          You can tick a habit for today, or for this week if it is weekly. Past days can’t be ticked later, so a streak
          shows what you really did.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="A habit tracker with points: how habits earn and lose them"
        lead={
          <p>
            These are the same rules the app shows under “How points work” on the Habits page. With an account, points are
            counted on the server, so every device shows the same total.
          </p>
        }
      >
        <Rules
          caption="Earning"
          rows={[
            { what: 'Tick a library habit', amount: `+${libraryPoints}`, note: 'Its own value, shown when you add it.' },
            { what: 'Tick a daily custom habit', amount: `+${CUSTOM_HABIT_POINTS}` },
            { what: 'Tick a weekly custom habit', amount: '0', tone: 'none', note: 'Keeps the streak only.' },
            {
              what: 'Daily cap for all habits together',
              amount: `${cap} a day`,
              tone: 'none',
              note: 'The habits you tick first count first. After the cap a tick still counts for your streak.',
            },
          ]}
        />
        <Rules
          caption="Missing a library habit"
          rows={[
            { what: 'First missed day', amount: times(below(1)), tone: 'loss', note: 'It costs the habit’s own points, counted from the day you add it.' },
            { what: 'Each further missed day in a row', amount: times(below(2)), tone: 'loss', note: 'Rounded to whole points.' },
            {
              what: `From ${performer.name} rank (${fmt(performer.minPoints)} season points)`,
              amount: `${times(above(2))}, then ${times(above(3))}`,
              tone: 'loss',
              note: `The 2nd miss in a row costs ${times(above(2))}, the 3rd and later ${times(above(3))}.`,
            },
            { what: 'Tick the habit again', amount: 'Reset', tone: 'none', note: 'The count of misses starts over.' },
          ]}
        />
        <Note title={`Example with “${example.name}” (${pts(example.points)}).`}>
          Miss it three days in a row and it costs {exampleBelow.map((n) => `−${n}`).join(', ')}. At {performer.name} rank
          or higher the same three days cost {exampleAbove.map((n) => `−${n}`).join(', ')}. Custom habits and the Reading
          habit never cost anything.
        </Note>
        <div className="scroll-rise mt-6 max-w-3xl space-y-3 text-sm leading-relaxed text-content-tertiary">
          <p>
            The Reading habit is special: it ticks itself when you log pages in the{' '}
            <a href={featurePath('reading')} className={LINK_CLASS}>
              Reading Hub
            </a>{' '}
            and earns its points there, not here. Deleting a habit only takes back today’s points from it; points and
            penalties from earlier days stay.
          </p>
        </div>
      </Block>

      <Block
        id="rank-title"
        title="Where the points go"
        lead={
          <>
            <p>
              Habit points join everything else you earn in the season. Your season points decide your rank, from{' '}
              {TIERS[0].name} up to {TIERS[TIERS.length - 1].name} across {TIERS.length} ranks, and the same points place
              you in the weekly, monthly and 90-day leagues. {performer.name} is rank {rankIndex} of {TIERS.length}, and from
              there a missed habit costs more.
            </p>
            <p>
              Because of the daily cap, a long list can’t buy a rank. A few habits done every day, plus your workouts,
              reading and journal, is how people climb. See{' '}
              <a href={featurePath('ranks')} className={LINK_CLASS}>
                how ranks work
              </a>{' '}
              and{' '}
              <a href={featurePath('leagues')} className={LINK_CLASS}>
                how the leagues work
              </a>
              .
            </p>
          </>
        }
      />
    </>
  ),
  wideShot: {
    name: 'habits-desktop',
    width: 1400,
    height: 761,
    alt: 'The Habits page on a computer: today’s to-do habits with streaks, best streaks and points, the 4 of 10 daily cap meter and the last 7 days',
    caption: 'The Habits page on a computer, with the demo user Ali’s habits.',
  },
  facts: [
    ['Library', `${library.length} daily habits in ${PRESET_CATEGORIES.length} groups, ${libraryPoints} points each`],
    ['Custom habits', `Daily (${pts(CUSTOM_HABIT_POINTS)}) or weekly (streak only)`],
    ['Daily cap', `${cap} points from habits`],
    ['Missed library habit', `Its points, ${times(below(2))} for more misses in a row`],
    ['Streaks', 'Current and best streak per habit'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Phone, tablet and computer, in the browser or installed'],
    ['Account', 'Start as a guest, save to a free account later'],
  ],
  fitsIf: [
    'You want a habit streak tracker with a score, not just a checklist.',
    'You keep habits better when skipping one has a small cost.',
    'You want your habits next to your workouts, reading and journal in one app.',
  ],
  notFor: [
    'You want to track dozens of tiny habits; the daily cap rewards a short list.',
    'You don’t want any penalty at all. (Custom habits never have one, but library habits do.)',
  ],
  faq: [
    {
      q: 'Why use AscendDay for habits instead of a separate habit tracker app?',
      a: 'Because here a habit doesn’t stop at a checkmark. Each tick earns points that count toward your rank and your place in the weekly, monthly and season leagues, together with your workouts, reading and journal. A habit can also fill a weekly goal on its own and tick a challenge you share with a friend, so you log it once and it counts everywhere. A separate habit app gives you a streak; AscendDay gives that streak a reason to last.',
    },
    {
      q: 'Why does missing a habit cost points?',
      a: 'Because a streak is easier to protect when breaking it costs something. Losing points you already have tends to feel stronger than missing out on new ones, so a small cost is enough to get the habit done on a tired day. Only library habits carry that cost; custom habits never do, so you decide how much is at stake.',
    },
    {
      q: 'Is the habit tracker free?',
      a: 'Yes. AscendDay is a free habit tracker web app while in beta, with no payments in the app. Every habit feature, library and custom, is included.',
    },
    {
      q: 'What happens if I miss a habit?',
      a: `If it is a library habit, it costs its own points after the day ends, and more if you keep missing it (${times(below(2))} each further day in a row, more from ${performer.name} rank). Ticking it again resets the count. Custom habits never cost points.`,
    },
    {
      q: 'Can I track weekly habits?',
      a: 'Yes. Make a custom habit and choose Weekly. It is due once a week, keeps a weekly streak, and earns no points.',
    },
    {
      q: 'Can I tick off yesterday’s habit?',
      a: 'No. You can tick today, or this week for a weekly habit. That keeps every streak honest, including the ones in the leagues.',
    },
    {
      q: 'Does it work on my PC and phone?',
      a: 'Yes. AscendDay runs in any modern browser and can be installed from it. Sign in on another device and your habits and streaks are there.',
    },
  ],
  related: ['bad-habits', 'weekly-goals', 'ranks', 'accountability-partners'],
  cta: { title: 'Start your first streak today', text: 'Add three habits, tick one now, and it already counts this week.' },
};
