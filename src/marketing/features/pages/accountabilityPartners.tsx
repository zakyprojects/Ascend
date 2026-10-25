import { CHALLENGE_LENGTH_OPTIONS, MAX_PARTNERS } from '@/lib/partnerRules';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';

/* /features/accountability-partners. Sources: components/views/AccountabilityPartner.tsx (add by
   6-digit ID, waiting invites hold a place, shared or different daily goals, a day counts when both
   tick, ticking a linked habit ticks the challenge, nudge once per partner per day, "Challenges
   don't give points", season points + streak + rank side by side), lib/partnerRules.ts (limits,
   also enforced by the server), lib/pactLifecycle.ts (finished when every day was done together,
   ended when the days run out, joint streak), settings PreferenceSections ("Partner invites") and
   NotificationsSection ("Partner activity"), the missed-habit notice in ascend_process_penalties,
   and the Privacy Policy "Who can see what" (partners: your stats, timezone and what you share in
   the partnership; only you: journal, moods, cravings, recovery tracker). The nudge is the one
   partner notice the app itself sends; the rest come from the server. */

const lengths = (() => {
  const days = CHALLENGE_LENGTH_OPTIONS.map((d) => `${d}`);
  return `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]} days`;
})();

export const accountabilityPartners: FeatureContent = {
  intro: (
    <>
      <p>
        Partners in Ascend is a free accountability partner app inside your self-improvement tracker. Add a friend, pick
        one thing you will each do every day, and tick it off side by side. You both see who has done today’s part, and
        a gentle nudge is one tap away.
      </p>
      <p>
        You can have up to {MAX_PARTNERS} partners and run challenges of {lengths}. Your journal and anything private stay
        private: a partner sees your progress, not your thoughts.
      </p>
    </>
  ),
  heroShot: {
    name: 'partners-phone',
    width: 540,
    height: 1246,
    alt: 'Partners on a phone: Ali with 2 partners and 3 of 3 challenges ticked today, Sara 167 points ahead this season, and a Read 20 pages challenge at 10 of 30 days together',
  },
  body: (
    <>
      <Block id="how-title" title="How a habit challenge with a friend works">
        <Steps
          items={[
            {
              title: 'Add a friend by their ID',
              text: 'Every member has a 6-digit ID in Settings. Enter your friend’s, they accept the invite, and you are partners. Either of you can remove the other at any time.',
            },
            {
              title: 'Start a challenge',
              text: `Write what you will both do every day, like “Read 20 pages”, or switch on a different goal for each of you. Choose ${lengths}. Day 1 is today.`,
            },
            {
              title: 'Tick your part each day',
              text: 'Each of you ticks the challenge when you have done it. A day counts once you have both ticked it, and the bar fills with the days you did together.',
            },
            {
              title: 'Nudge a friend, or get nudged',
              text: 'If your partner has not done today’s part yet, send a nudge: a short notice that you are waiting for them. One nudge per partner per day.',
            },
          ]}
        />
        <Note title="Link it to a habit.">
          If your side of the challenge is one of your{' '}
          <a href={featurePath('habits')} className={LINK_CLASS}>
            habits
          </a>
          , ticking the habit ticks the challenge too, so you only log it once.
        </Note>
      </Block>

      <Block
        id="card-title"
        title="Side by side, every day"
        lead={
          <p>
            Each partner has a card with the two of you next to each other: this season’s points, your rank badges and
            your current day streaks, with a line that says who is ahead and by how much. Below it are your running
            challenges, showing for each of you whether today is done.
          </p>
        }
      >
        <Cards
          items={[
            {
              title: 'Together streak',
              text: 'Each challenge counts the days in a row you both ticked it. Miss a day together and it starts again, but the days already done stay in the total.',
            },
            {
              title: 'Finished or ended',
              text: 'Fill every day of the challenge together and it is completed. If the days run out first, it ends. Either way it moves to Finished, where you can start it again.',
            },
            {
              title: 'Different days, different clocks',
              text: 'Your partner’s “today” follows their own timezone, so a friend in another country is never marked late because of yours.',
            },
          ]}
        />
      </Block>

      <Block
        id="how-points-work"
        title="Partners and points"
        lead={
          <p>
            Challenges don’t give points. They are there to keep each other going, not to farm a score, and the points
            already come from the habit, workout or reading the challenge is about.
          </p>
        }
      >
        <Rules
          caption="What partner activity earns"
          rows={[
            { what: 'Adding a partner', amount: '0', tone: 'none' },
            { what: 'Ticking today’s part of a challenge', amount: '0', tone: 'none', note: 'A linked habit still earns what it normally earns.' },
            { what: 'A day you both ticked', amount: '0', tone: 'none', note: 'It raises the together streak and the days done.' },
            { what: 'Finishing a challenge', amount: '0', tone: 'none' },
            { what: 'Sending or getting a nudge', amount: '0', tone: 'none' },
          ]}
        />
        <Note title="Competing with a partner.">
          The partner card compares your season points, which come from everything else you do in Ascend. To race each
          other over a week or a month, look at the{' '}
          <a href={featurePath('leagues')} className={LINK_CLASS}>
            leagues
          </a>
          , where you are both in the same tables.
        </Note>
      </Block>

      <Block
        id="privacy-title"
        title="What a partner can see"
        lead={
          <>
            <p>
              A partner sees your stats, such as your streaks, your season points and rank, and how many habits, journal
              entries, books, exercise minutes and skills you have. They also see your timezone and everything you share
              in the partnership and its challenges.
            </p>
            <p>
              They never see your email, your journal entries, your moods, your cravings or your recovery tracker. Those
              stay only yours, as the{' '}
              <a href="/privacy" className={LINK_CLASS}>
                Privacy Policy
              </a>{' '}
              sets out.
            </p>
          </>
        }
      >
        <Note title="Notices between partners.">
          Ascend tells your partners when you start a challenge with them, when you finish today’s part of it, when you finish it together,
          and when you miss a habit that costs you points, with the habit’s name so they can check in. You can turn
          these off under Partner activity in Settings, and switch off Partner invites to stop new requests.
        </Note>
      </Block>
    </>
  ),
  wideShot: {
    name: 'partners-desktop',
    width: 1400,
    height: 1339,
    alt: 'Partners on a computer: the card for partner Sara with 742 season points and a 31-day streak next to Ali’s 575 and 21 days, a Nudge Sara button, and two challenges, Read 20 pages and Morning walk',
    caption: 'Partners on a computer. Ali is the demo user; Sara and Omar are invented for this picture.',
  },
  facts: [
    ['Partners', `Up to ${MAX_PARTNERS}, waiting invites included`],
    ['Add by', 'A 6-digit ID from Settings'],
    ['Challenge lengths', lengths],
    ['A day counts', 'When you both tick it'],
    ['Nudges', 'One per partner per day'],
    ['Points', 'None; challenges keep you going'],
    ['Partners never see', 'Journal, moods, recovery'],
    ['Price', 'Free while in beta'],
  ],
  fitsIf: [
    'You keep promises to a friend better than promises to yourself.',
    'You and a friend want to build the same habit at the same time.',
    'A small daily check-in is enough; you don’t need a group chat.',
  ],
  notFor: [
    'You want challenges to earn points; they don’t.',
    'You want a big group challenge; each challenge is between two people.',
  ],
  faq: [
    {
      q: 'How do I add an accountability partner?',
      a: 'Ask your friend for the 6-digit ID in their Settings, enter it under Add partner, and you are partners once they accept.',
    },
    {
      q: 'How many partners can I have?',
      a: `Up to ${MAX_PARTNERS}. Invites you sent that are still waiting count toward that number.`,
    },
    {
      q: 'Can my partner read my journal?',
      a: 'No. Partners see your stats and what you share in your challenges. Your journal, moods, cravings and recovery tracker stay private.',
    },
    {
      q: 'Do partner challenges earn points?',
      a: 'No. The habit or activity behind a challenge still earns its own points, but the challenge itself gives none.',
    },
    {
      q: 'What happens if one of us misses a day?',
      a: 'That day does not count together and the together streak starts again. The days you already did together still count toward finishing.',
    },
  ],
  related: ['leagues', 'habits', 'ranks', 'journal'],
  cta: { title: 'Bring a friend along', text: `Share your 6-digit ID, start a ${CHALLENGE_LENGTH_OPTIONS[0]}-day challenge and see who ticks first tomorrow.` },
};
