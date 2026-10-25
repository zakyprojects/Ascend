import { getMissPenaltyMultiplier } from '@/lib/missPenalty';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { PRESET_BAD_HABITS } from '@/lib/presets';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { fmt, pts, range } from '../format';

/* /features/bad-habits. Sources: lib/presets.ts PRESET_BAD_HABITS, lib/pointsConfig.ts
   BAD_HABIT_POINTS, lib/missPenalty.ts, lib/tiers.ts, and the Bad habits page's own "How points
   work" (components/views/BadHabitTracker.tsx). */

const P = BAD_HABIT_POINTS;
const resistRange = range(PRESET_BAD_HABITS.map((h) => h.points));
const performer = TIERS.find((t) => t.name === 'Performer') ?? TIERS[0];
const cost = (base: number, nth: number, season = 0) => Math.round(base * getMissPenaltyMultiplier(nth, season));
const times = (m: number) => `×${m}`;
const slipRun = [1, 2, 3].map((n) => cost(P.occurBase, n));
const silentRun = [1, 2, 3].map((n) => cost(P.noReportBase, n));
const neg = (list: number[]) => list.map((n) => `−${n}`).join(', ');

export const badHabits: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s bad habit tracker is a free daily check-in for the things you are trying to stop, like doomscrolling or
        junk food. Each day you log one word per habit, Resisted or Slipped. Resisting earns points and builds a clean
        streak; slipping, or not logging at all, costs points.
      </p>
      <p>
        It works on trust: AscendDay can’t see what you did, only what you log. The points help you break bad habits by
        making an honest answer every evening feel like it matters.
      </p>
    </>
  ),
  heroShot: {
    name: 'bad-habits-phone',
    width: 540,
    height: 1246,
    alt: 'The Bad habits page on a phone: 1 of 3 resisted today, 2 still to log, and Late-night screen time with a 9-day resist streak',
  },
  body: (
    <>
      <Block
        id="how-title"
        title="One honest answer a day"
        lead={<p>The whole feature is a short evening routine. It takes less than a minute once your habits are added.</p>}
      >
        <Steps
          items={[
            {
              title: 'Add what you want to stop',
              text: `Tap New bad habit and pick one of the ${PRESET_BAD_HABITS.length} in the library, or write your own. Start with one or two that matter most.`,
            },
            {
              title: 'Log the day',
              text: 'Tick a habit to mark it Resisted, or press Slipped if it happened. On a phone, swipe right to mark Resisted. A wrong tap can be undone the same day.',
            },
            {
              title: 'See your clean streak',
              text: 'Each habit shows your current resist streak, your best one and the last seven days, with slips marked, so a pattern is easy to see.',
            },
            {
              title: 'Watch the warning',
              text: 'After bad days in a row, the habit says how many and what slipping today would cost, so you know the stakes before the evening, not after.',
            },
          ]}
        />
      </Block>

      <Block
        id="library-title"
        title="The bad-habit library"
        lead={
          <p>
            Each library bad habit has its own resist value, {resistRange} points, shown next to it below and when you
            add it. A custom bad habit earns {pts(P.customResist)} per resisted day.
          </p>
        }
      >
        <ul className="scroll-rise mt-6 flex max-w-3xl flex-wrap gap-2">
          {PRESET_BAD_HABITS.map((h) => (
            <li key={h.name} className="rounded-lg border border-overlay-default px-3 py-1.5 text-sm text-content-secondary">
              {h.name} <span className="tabular-nums text-brand-text">+{h.points}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        id="how-points-work"
        title="How resisting earns and slipping costs"
        lead={<p>Resist points add up across all your bad habits; penalties apply only to your oldest ones.</p>}
      >
        <Rules
          caption="Each day"
          rows={[
            { what: 'Resisted, library bad habit', amount: `+${resistRange}`, note: 'The habit’s own value.' },
            { what: 'Resisted, custom bad habit', amount: `+${P.customResist}` },
            {
              what: 'Daily cap for all resists together',
              amount: `${P.dailyCap} a day`,
              tone: 'none',
              note: 'The ones you log first count first.',
            },
            { what: 'Slipped', amount: `−${P.occurBase}`, tone: 'loss', note: 'Logged the same day.' },
            {
              what: 'Not logged at all',
              amount: `−${P.noReportBase}`,
              tone: 'loss',
              note: 'Charged after midnight, counting from the day you added the habit.',
            },
          ]}
        />
        <Rules
          caption="Bad days in a row"
          rows={[
            {
              what: 'Each further bad day in a row (slipped or not logged)',
              amount: times(getMissPenaltyMultiplier(2)),
              tone: 'loss',
              note: 'Rounded to whole points. A resisted day resets the count.',
            },
            {
              what: `From ${performer.name} rank (${fmt(performer.minPoints)} season points)`,
              amount: `${times(getMissPenaltyMultiplier(2, performer.minPoints))}, then ${times(getMissPenaltyMultiplier(3, performer.minPoints))}`,
              tone: 'loss',
              note: 'For the 2nd bad day in a row, then the 3rd and later.',
            },
          ]}
        />
        <Cards
          cols={2}
          items={[
            {
              title: `Only your ${P.eligibleSlots} oldest can cost points`,
              text: `Penalties apply to the ${P.eligibleSlots} bad habits you added first. Any you add after that earn resist points but never lose any, so adding a new habit to watch is never a risk.`,
            },
            {
              title: 'Earlier days stay as they were',
              text: 'Deleting a bad habit only takes back today’s points from it. Points and penalties from earlier days stay, so the record can’t be rewritten.',
            },
          ]}
        />
        <Note title="Being straight about the numbers.">
          Three slips in a row cost {neg(slipRun)}. Three days left blank cost {neg(silentRun)}. A blank day costs less
          than a slip, but it still costs points and still counts as a bad day in a row, so the honest answer is always
          the better habit, and a resisted day is the only thing that resets the count.
        </Note>
      </Block>

      <Block
        id="why-title"
        title="Why a penalty helps you quit bad habits"
        lead={
          <>
            <p>
              Most trackers only count the good days, so a slip just disappears. In AscendDay a slip has a small, known cost,
              and that cost goes into the same season points as everything else you do. Your habits, workouts and reading
              can make up for a bad day, but they can’t hide it.
            </p>
            <p>
              The points are a nudge, not a judgment. If a habit has turned into something you can’t control, such as
              drinking, drugs or gambling, use the{' '}
              <a href={featurePath('recovery')} className={LINK_CLASS}>
                Recovery tracker
              </a>{' '}
              and reach out to a professional or a helpline; AscendDay is not treatment.
            </p>
          </>
        }
      />
    </>
  ),
  wideShot: {
    name: 'bad-habits-desktop',
    width: 1400,
    height: 835,
    alt: 'The Bad habits page on a computer: two bad habits still to log with Slipped buttons, Doomscrolling resisted today with a 21-day streak, and 2 of 6 resist points earned',
    caption: 'The Bad habits page on a computer, with the demo user Ali’s bad habits.',
  },
  facts: [
    ['Library', `${PRESET_BAD_HABITS.length} bad habits, ${resistRange} points per resisted day`],
    ['Custom bad habits', `${pts(P.customResist)} per resisted day`],
    ['Daily cap', `${P.dailyCap} resist points`],
    ['Slipped', `−${P.occurBase}, more for bad days in a row`],
    ['Not logged', `−${P.noReportBase}, more for bad days in a row`],
    ['Can lose points', `Your ${P.eligibleSlots} oldest bad habits only`],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser on phone or computer'],
  ],
  fitsIf: [
    'You want a daily, honest check-in for a habit you are cutting down.',
    'A clean streak and a small penalty for slipping keep you going.',
    'You also track good habits and want both in one score.',
  ],
  notFor: [
    'You don’t want a penalty for slipping or for forgetting to log.',
    'You are dealing with an addiction that needs real support. AscendDay can sit alongside that help, not replace it.',
  ],
  faq: [
    {
      q: 'What counts as a slip?',
      a: 'You decide. Before you add a habit, settle what “slipped” means for you (for example, any scrolling after 11 pm) and log it the same way every day.',
    },
    {
      q: 'What if I forget to log a day?',
      a: `For your ${P.eligibleSlots} oldest bad habits, a day with no log costs ${P.noReportBase} points after midnight, more if it keeps happening. Habits you added later never cost points.`,
    },
    {
      q: 'Why do only some bad habits lose points?',
      a: `So the penalties stay focused on what matters most to you. Your first ${P.eligibleSlots} bad habits carry the risk; the rest are for tracking and resist points.`,
    },
    {
      q: 'Can I undo a wrong tap?',
      a: 'Yes. Today’s Resisted or Slipped can be undone on the same day. Earlier days can’t be changed.',
    },
    {
      q: 'Is anything I log public?',
      a: (
        <>
          League tables show your username, avatar and points, not what the points came from. Partners, and other
          members if your profile is public, see a summary of your stats. The{' '}
          <a href="/privacy" className={LINK_CLASS}>
            Privacy Policy
          </a>{' '}
          lists exactly who can see what.
        </>
      ),
    },
  ],
  related: ['habits', 'recovery', 'brain-lessons', 'accountability-partners'],
  cta: { title: 'Pick one habit to stop', text: 'Add it now, log tonight, and start a clean streak tomorrow.' },
};
