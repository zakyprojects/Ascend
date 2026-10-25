import { MOODS } from '@/components/journal/moods';
import { JOURNAL_PROMPTS } from '@/data/journalPrompts';
import { MIN_JOURNAL_CONTENT_LENGTH } from '@/lib/journalRules';
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { TIERS } from '@/lib/tiers';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/journal. Sources: lib/pointsConfig.ts JOURNAL_POINTS, lib/journalRules.ts (save rule),
   components/journal/moods.tsx (mood scale), data/journalPrompts.ts, the Journal page's own "How
   points work" (components/views/Journal.tsx), and the Privacy Policy's "Who can see what". */

const award = JOURNAL_POINTS.entryCompleted;
const moodNames = MOODS.map((m) => m.label);
const categories = [...new Set(JOURNAL_PROMPTS.map((p) => p.category))];
const samplePrompts = categories.map((c) => JOURNAL_PROMPTS.find((p) => p.category === c)!).filter(Boolean);
const lowMood = MOODS[0];
const topMood = MOODS[MOODS.length - 1];
const list = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export const journal: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s journal is a free gamified journal app: one short entry a day, the mood you felt, and {pts(award)} for
        showing up. Write freely or answer a guided prompt, and over the weeks you get a streak and a mood chart that show
        how your days really went.
      </p>
      <p>
        It is built for people who know journaling helps but never keep it up. One sentence counts, so the bar is low
        enough to clear on a bad day.
      </p>
    </>
  ),
  heroShot: {
    name: 'journal-phone',
    width: 540,
    height: 1246,
    alt: 'The Journal page on a phone: a 4-day journal streak, written on 5 of the last 7 days, 8 entries and the mood for each day this week',
  },
  body: (
    <>
      <Block id="how-title" title="Writing today’s entry">
        <Steps
          items={[
            {
              title: 'Pick your mood',
              text: `Choose one of ${MOODS.length}: ${list(moodNames)}. It takes a second and it is what the mood chart is built from.`,
            },
            {
              title: 'Choose how to write',
              text: `Guided prompt gives you one question for the day, with Shuffle for another. Free write gives you a blank page. AscendDay remembers which you like.`,
            },
            {
              title: 'Write at least one sentence',
              text: `An entry needs ${MIN_JOURNAL_CONTENT_LENGTH} characters or more. There is no word count to hit, and long entries are fine.`,
            },
            {
              title: 'Save, and come back tomorrow',
              text: `The first save of the day earns ${pts(award)}. You can edit today’s entry as often as you like; tomorrow it moves to your earlier entries.`,
            },
          ]}
        />
      </Block>

      <Block
        id="prompts-title"
        title="A daily journal with prompts for when you don’t know what to write"
        lead={
          <p>
            There are {JOURNAL_PROMPTS.length} prompts in {categories.length} groups: {list(categories)}. A different one
            comes up each day. A few of them:
          </p>
        }
      >
        <ul className="mt-6 grid gap-3 grid-cols-1 md:grid-cols-2">
          {samplePrompts.map((p) => (
            <li key={p.id} className="card p-5">
              <p className="stat-label">{p.category}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">“{p.prompt}”</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        id="mood-title"
        title="Your journaling streak and mood, at a glance"
        lead={
          <p>
            The top of the Journal page shows your journal streak, how many of the last 7 days you wrote, your total
            entries and the points they earned. Next to today’s entry, the mood chart shows one square per day for the
            last 7 or 30 days, how many days you felt each mood, and an average from {lowMood.score} ({lowMood.label}) to {topMood.score}{' '}
            ({topMood.label}).
          </p>
        }
      >
        <Cards
          items={[
            { title: 'Journal streak', text: 'Days in a row with an entry. Miss a day and it starts again, just like a habit.' },
            { title: 'Mood chart', text: 'A bad week shows up as a colour, not just a feeling. It is easier to change what you can see.' },
            { title: 'Earlier entries', text: 'Every past entry, newest first, with its mood. Open one to read it in full.' },
          ]}
        />
      </Block>

      <Block
        id="how-points-work"
        title="How the journal earns points"
        lead={
          <p>
            Journal points are simple on purpose: they reward the habit of writing, not the length of what you write.
          </p>
        }
      >
        <Rules
          caption="Journal points"
          rows={[
            { what: 'Today’s entry saved', amount: `+${award}`, note: `At least ${MIN_JOURNAL_CONTENT_LENGTH} characters, once per day.` },
            { what: 'Editing today’s entry', amount: '0', tone: 'none', note: 'Change it as often as you like; it earns nothing extra.' },
            { what: 'Deleting today’s entry', amount: `−${award}`, tone: 'loss', note: 'Today’s points come off, and the streak may drop.' },
            { what: 'Deleting an earlier entry', amount: 'Kept', tone: 'none', note: 'That day keeps its points, but leaves your streak and mood chart.' },
          ]}
        />
        <Note title="Small, on purpose.">
          {pts(award)} a day is a small part of a season next to habits and workouts, so nobody pads a journal for the
          score. It still counts toward your rank (from {TIERS[0].name} to {TIERS[TIERS.length - 1].name}) and your league
          totals, and a streak of entries keeps you honest about the days you skipped. Only today’s entry can be written
          or edited, so a streak can’t be filled in afterwards.
        </Note>
      </Block>

      <Block
        id="private-title"
        title="Private by default"
        lead={
          <p>
            What you write and the moods you pick are visible only to you. They never appear in leagues or to partners,
            and AscendDay never shares or sells them; a public profile shows only how many entries you have. The{' '}
            <a href="/privacy" className={LINK_CLASS}>
              Privacy Policy
            </a>{' '}
            lists exactly what is stored and who can see what. If you want to look back at the week as a whole, the{' '}
            <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
              weekly reflection
            </a>{' '}
            in Weekly Goals is the place for it.
          </p>
        }
      />
    </>
  ),
  wideShot: {
    name: 'journal-desktop',
    width: 1400,
    height: 786,
    alt: 'The Journal page on a computer: today’s saved entry with a Motivated mood, the 7-day mood chart, and the daily journal points reached',
    caption: 'The Journal page on a computer, with the demo user Ali’s entries.',
  },
  facts: [
    ['Entries', 'One per day, editable all day'],
    ['Points', `${pts(award)} for today’s entry`],
    ['Minimum', `${MIN_JOURNAL_CONTENT_LENGTH} characters`],
    ['Moods', list(moodNames)],
    ['Prompts', `${JOURNAL_PROMPTS.length} guided prompts, or free write`],
    ['Who can see it', 'Only you'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Phone, tablet or computer, in the browser'],
  ],
  fitsIf: [
    'You want a journaling habit that sticks, with a streak to protect.',
    'You like a prompt when your mind goes blank.',
    'You want a mood journal that shows your mood over weeks, not just a memory of it.',
  ],
  notFor: [
    'You want long, formatted entries with photos and tags.',
    'You need to write about past days; only today’s entry can be written.',
    'You need mental health support. A journal can help you notice things, but it is not therapy.',
  ],
  faq: [
    {
      q: 'Is the journal private?',
      a: 'Yes. What you write and your moods are visible only to you. If you make your profile public, others can see how many entries you have, never what is in them.',
    },
    {
      q: 'How long does an entry need to be?',
      a: `At least ${MIN_JOURNAL_CONTENT_LENGTH} characters, so one sentence is enough. There is no upper limit worth worrying about.`,
    },
    {
      q: 'Can I write more than one entry a day?',
      a: `There is one entry per day. You can edit it as often as you like until the day ends, and it earns ${pts(award)} once.`,
    },
    {
      q: 'Can I write an entry for yesterday?',
      a: 'No. Only today’s entry can be written or changed, which keeps the journal streak honest.',
    },
    {
      q: 'Is it free, and does it work on Windows or Mac?',
      a: 'Yes to both. AscendDay is free while in beta and runs in any modern browser, so it works on Windows, Mac, Linux, Android and iPhone.',
    },
  ],
  related: ['weekly-goals', 'habits', 'brain-lessons', 'recovery'],
  cta: { title: 'Write one sentence tonight', text: 'Pick a mood, answer today’s prompt, and your journal streak starts at one.' },
};
