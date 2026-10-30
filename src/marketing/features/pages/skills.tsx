import { SKILLS_POINTS } from '@/lib/pointsConfig';
import { SKILL_LEVELS } from '@/lib/skillLevels';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/skills. Sources: lib/pointsConfig.ts SKILLS_POINTS + calculateSkillPoints (floor per
   session, daily cap shared by all skills), lib/skillAwards.ts (server-written day award),
   lib/skillLevels.ts SKILL_LEVELS, components/views/SkillTracker.tsx (log form, quick lengths,
   streak, categories, the page's "How points work", clear older logs). */

const S = SKILLS_POINTS;
const minutesForCap = S.dailyCap * S.minutesPerPoint;
const hourPoints = Math.floor(60 / S.minutesPerPoint);
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const levels = SKILL_LEVELS.map((l, i) => ({
  name: cap(l.level),
  from: i === 0 ? 0 : (SKILL_LEVELS[i - 1].below as number),
  to: l.below,
}));
const top = levels[levels.length - 1];
const levelText = levels
  .slice(1)
  .map((l) => `${l.from} hours ${l.name}`)
  .join(', ');

export const skills: FeatureContent = {
  intro: (
    <>
      <p>
        Skills in AscendDay is a free skill practice tracker: add what you are learning, log your practice minutes, and watch each
        skill climb from {levels[0].name} to {top.name} as the hours add up. Every {S.minutesPerPoint} minutes of practice
        also earn a point, so an hour of guitar or coding counts toward your rank like a workout does.
      </p>
      <p>
        Learning something takes hundreds of quiet hours that nobody sees. Skills makes them visible: a level, a streak
        and a chart of the last week.
      </p>
    </>
  ),
  heroShot: {
    name: 'skills-phone',
    width: 540,
    height: 1246,
    alt: 'Skills on a phone: 5 of 10 skill points today, 4.2 hours of practice this week on 4 of 7 days, 51.9 hours in total across 3 skills',
  },
  body: (
    <>
      <Block id="how-title" title="Your practice hours log">
        <Steps
          items={[
            {
              title: 'Add a skill',
              text: 'Name it, like Python, Spanish or guitar, and give it a category if you like. Once you have a few categories, chips let you filter the list by them.',
            },
            {
              title: 'Log a session',
              text: 'Pick the skill, the minutes you practised (quick picks for 45 minutes, 1, 2 or 3 hours) and an optional note on what you worked on. The form shows the points it will earn before you save.',
            },
            {
              title: 'Keep the streak',
              text: 'Each skill counts the days in a row you practised it. A flame on the card shows the streak, and the top of the page shows how many days this week you practised at all.',
            },
            {
              title: 'Level up',
              text: `Every minute adds to the skill’s total hours. The card shows its level and how far it is to the next one, like “22.3/25 hrs to Advanced”.`,
            },
          ]}
        />
        <Note title="Practice is logged on the day.">
          You can log today’s practice, not earlier days. That keeps the hours and the streak a true record of when you
          actually showed up.
        </Note>
      </Block>

      <Block
        id="levels-title"
        title="Levels by practice hours"
        lead={
          <p>
            A skill’s level comes only from the hours you put in. There are {levels.length} levels, and the gaps grow as
            you go, the way real progress feels: the first level comes fast, the last one asks for real commitment.
          </p>
        }
      >
        <ol className="mt-8 grid gap-4 grid-cols-2 md:grid-cols-4">
          {levels.map((l) => (
            <li key={l.name} className="card p-5">
              <h3 className="font-semibold text-content-primary">{l.name}</h3>
              <p className="mt-1.5 text-sm tabular-nums text-content-tertiary">
                {l.to === null ? `${l.from} hours and up` : `${l.from} to ${l.to} hours`}
              </p>
            </li>
          ))}
        </ol>
        <Note title="Hours are never lost.">
          “Clear older logs” tidies the list by removing logs from before this week, but their minutes stay in the
          skill’s total, so its level doesn’t drop.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How practice earns points"
        lead={
          <p>
            Points are counted per session: the minutes divided by {S.minutesPerPoint}, rounded down. All your skills share
            one daily cap.
          </p>
        }
      >
        <Rules
          caption="Points"
          rows={[
            { what: `Every ${S.minutesPerPoint} minutes of practice`, amount: '+1' },
            { what: 'One hour in a session', amount: `+${hourPoints}` },
            {
              what: 'Daily cap, all skills together',
              amount: `${S.dailyCap} a day`,
              tone: 'none',
              note: `Reached after about ${minutesForCap / 60} hours. Practice after that still adds hours and keeps the streak.`,
            },
            {
              what: 'Deleting today’s session',
              amount: 'Taken back',
              tone: 'loss',
              note: 'Sessions from earlier days keep their points and their hours.',
            },
          ]}
        />
        <Note title="Steady beats a marathon.">
          The cap is reached after about {minutesForCap / 60} hours, so one long weekend session can’t outweigh a week of
          steady practice in the leagues. Extra hours still count where they matter most: in the skill’s level.
        </Note>
      </Block>

      <Block
        id="connect-title"
        title="Skills and the rest of your week"
        lead={<p>Practice you log also feeds three other parts of AscendDay:</p>}
      >
        <Cards
          items={[
            {
              title: 'Weekly goals',
              text: (
                <>
                  Set a{' '}
                  <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
                    weekly goal
                  </a>{' '}
                  like “Practise Spanish 150 minutes” or “4 guitar sessions” and it fills in from your logs.
                </>
              ),
            },
            {
              title: 'Time blocks',
              text: (
                <>
                  A Skills block in your{' '}
                  <a href={featurePath('time-blocking')} className={LINK_CLASS}>
                    time-blocked day
                  </a>{' '}
                  gets a button that opens this page, so logging the session is one tap away.
                </>
              ),
            },
            {
              title: 'Rank and leagues',
              text: (
                <>
                  Skill points count toward your season, your{' '}
                  <a href={featurePath('ranks')} className={LINK_CLASS}>
                    rank
                  </a>{' '}
                  and your place in the{' '}
                  <a href={featurePath('leagues')} className={LINK_CLASS}>
                    leagues
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
      </Block>
    </>
  ),
  wideShot: {
    name: 'skills-desktop',
    width: 1400,
    height: 648,
    alt: 'Skills on a computer: Python at Intermediate with 22.3 of 25 hours to Advanced and a 6-day streak, Spanish at Advanced, and 425 practice minutes in the last 7 days',
    caption: 'Skills on a computer, with the demo user Ali’s skills.',
  },
  facts: [
    ['Points', `1 per ${S.minutesPerPoint} minutes of practice`],
    ['Daily cap', `${pts(S.dailyCap)}, shared by all skills`],
    ['Levels', `${levels.length}, from ${levelText}`],
    ['Streak', 'Days in a row, per skill'],
    ['Logging', 'Today’s practice, with an optional note'],
    ['Skills', 'As many as you want, with categories'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You are learning something over months: a language, an instrument, coding, drawing.',
    'You want to track practice time and see the hours add up on the days it feels slow.',
    'You like an XP-style level for real-life skills.',
  ],
  notFor: [
    'You need lessons or exercises; AscendDay tracks your practice, it doesn’t teach the skill.',
    'You want to log practice for days you missed; only today can be logged.',
  ],
  faq: [
    {
      q: 'Why use AscendDay for skill practice instead of a separate practice app?',
      a: 'Because practice minutes count twice here: each skill climbs its own level as the hours add up, and the minutes earn points toward your overall rank and the leagues, next to your habits, workouts and reading. A weekly goal can count practice on its own, and a skills block in the Time Tracker opens the log in one tap. Learning stops being invisible work and joins the same score as everything else.',
    },
    {
      q: 'Why do minutes earn points while levels come from hours?',
      a: `Points reward today: every ${S.minutesPerPoint} minutes earn one, up to ${pts(S.dailyCap)} a day for all skills together, so one marathon session can’t buy a rank. Levels reward the long run: they come only from total hours, so they show how far a skill has really come.`,
    },
    {
      q: 'Is the skill tracker free?',
      a: 'Yes. AscendDay is free while in beta, with no limit on how many skills you track. Each one works as its own skill level tracker.',
    },
    {
      q: 'How are skill levels worked out?',
      a: `From total practice hours only: ${levelText}. Clearing older logs doesn’t lower them.`,
    },
    {
      q: 'Do two skills on the same day earn double?',
      a: `No. All skills share one cap of ${pts(S.dailyCap)} a day, reached after about ${minutesForCap / 60} hours of practice in total.`,
    },
    {
      q: 'Can I set my own level for a skill I already know well?',
      a: 'Levels come from the hours logged in AscendDay. A skill you bring in starts at Beginner and climbs as you log practice.',
    },
    {
      q: 'Can I use it like an XP tracker for real life?',
      a: `That is the idea: minutes are your XP, levels are your progress per skill, and the points join the rest of AscendDay’s ranks and leagues.`,
    },
  ],
  related: ['time-blocking', 'weekly-goals', 'reading', 'ranks'],
  cta: { title: 'Log your first practice session', text: 'Add the skill you are learning and log today’s minutes.' },
};
