import { BOOK_CATEGORIES, CURATED_BOOKS } from '@/lib/books';
import { READING_POINTS } from '@/lib/pointsConfig';
import { READING_BONUS_COOLDOWN_DAYS, READING_BONUS_MIN_LOG_DAYS, READING_BONUS_MIN_SPAN_DAYS } from '@/lib/readingAwards';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/reading. Sources: lib/pointsConfig.ts READING_POINTS, lib/readingAwards.ts (server-written
   day award + finish bonus gates and cooldown, bookRemovalPoints), lib/books.ts (Discover list and
   categories), components/views/ReadingHub.tsx and components/reading/* (tabs, streak, Finish,
   the Reading habit switch, the page's "How points work"). */

const R = READING_POINTS;
const pagesForCap = R.dailyCap * R.pagesPerPoint;
const categories = BOOK_CATEGORIES.map((c) => c.name);
const list = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const BONUS_RULE = `you logged pages on at least ${READING_BONUS_MIN_LOG_DAYS} different days and the first of them was ${READING_BONUS_MIN_SPAN_DAYS} or more days before you finish`;

export const reading: FeatureContent = {
  intro: (
    <>
      <p>
        The Reading Hub is AscendDay’s free gamified reading tracker: keep a library of books, log the pages or chapters you read
        each day, and earn points for the reading itself, not only for the last page. Every {R.pagesPerPoint} pages earn a
        point, and a finished book adds a {R.completionBonus}-point bonus.
      </p>
      <p>
        A reading streak counts the days in a row you logged pages, so ten pages on a busy evening still keeps it alive.
        That is the habit most readers are really trying to build.
      </p>
    </>
  ),
  heroShot: {
    name: 'reading-phone',
    width: 540,
    height: 1246,
    alt: 'The Reading Hub on a phone: a 5-day reading streak, 6 of 10 reading points today, 2 books in progress, 1 finished and a chart of 54 pages read in the last 7 days',
  },
  body: (
    <>
      <Block id="how-title" title="Tracking a book from start to finish">
        <Steps
          items={[
            {
              title: 'Add a book',
              text: 'Pick one from Discover or add your own with its title, author and length. Choose pages for most books or chapters for books you read chapter by chapter.',
            },
            {
              title: 'Log your progress',
              text: 'Enter the page or chapter you are on, and AscendDay works out how much you read today. The card shows the percentage done and what is left.',
            },
            {
              title: 'Finish it',
              text: 'Mark it finished when you reach the end, or tap Finish early and the unread pages are filled in for you. Add a key takeaway so you remember why it mattered.',
            },
            {
              title: 'Line up the next one',
              text: 'Books you want to read wait in the Library tab. Move a book back there if you pause it, and pick it up later where you left off.',
            },
          ]}
        />
        <Note title="Four tabs, one shelf.">
          Reading shows the books in progress, Library the ones you want to read, Finished the ones you completed (with
          the date and your takeaway), and Discover a list of {CURATED_BOOKS.length} well-known self-improvement books
          you can add in one tap.
        </Note>
      </Block>

      <Block
        id="discover-title"
        title="Discover: a starting list of good books"
        lead={
          <p>
            Discover holds {CURATED_BOOKS.length} books in {categories.length} categories: {list(categories)}. Search by
            title, author or takeaway, filter by category, and sort by trending, bestsellers or A to Z. A book you add from
            Discover keeps its length, so you only have to log pages.
          </p>
        }
      />

      <Block
        id="how-points-work"
        title="How reading earns points"
        lead={
          <p>
            The rules below are the same ones the Reading Hub shows under “How points work”. With an account the server
            counts them, so the total matches on every device.
          </p>
        }
      >
        <Rules
          caption="Points"
          rows={[
            { what: `Every ${R.pagesPerPoint} pages`, amount: '+1' },
            {
              what: 'Every chapter, in a book counted in chapters',
              amount: `+${R.pointsPerChapter}`,
              note: `A chapter counts as ${R.pointsPerChapter * R.pagesPerPoint} pages.`,
            },
            {
              what: 'Daily cap, across all your books',
              amount: `${R.dailyCap} a day`,
              tone: 'none',
              note: `Reached at ${pagesForCap} pages. Reading more still counts for the book, the streak and your goals.`,
            },
            { what: 'Finishing a book', amount: `+${R.completionBonus}`, note: `Once per book, when ${BONUS_RULE}.` },
            {
              what: 'Pages that Finish fills in for you',
              amount: '0',
              tone: 'none',
              note: 'They complete the book but earn no page points.',
            },
          ]}
        />
        <Note title="Why the bonus has conditions.">
          The bonus is for reading a book, not for adding one and pressing Finish. Finish bonuses also come at most once
          every {READING_BONUS_COOLDOWN_DAYS} days; a book finished sooner after the last bonus gets none. While you read,
          the Finish dialog shows how many reading days you have and how many days since your first log, so you always
          know whether the bonus will come.
        </Note>
        <div className="scroll-rise mt-6 max-w-3xl space-y-3 text-sm leading-relaxed text-content-tertiary">
          <p>
            Removing a book is the one place points go back: it takes back that book’s finish bonus and today’s page
            points from it, and the confirm dialog says exactly how many. Earlier days keep their page points.
          </p>
        </div>
      </Block>

      <Block
        id="connect-title"
        title="Reading inside the rest of AscendDay"
        lead={
          <p>
            Pages you log don’t stay in one place. They count toward your season, your rank and the leagues, and they can
            fill other parts of the app as well:
          </p>
        }
      >
        <Cards
          items={[
            {
              title: 'A daily Reading habit',
              text: (
                <>
                  Turn on the switch and a Reading habit joins your{' '}
                  <a href={featurePath('habits')} className={LINK_CLASS}>
                    habits
                  </a>
                  , ticked by itself on every day you log pages. It keeps a habit streak and earns nothing extra, so
                  pages are never counted twice.
                </>
              ),
            },
            {
              title: 'Weekly reading goals',
              text: (
                <>
                  A{' '}
                  <a href={featurePath('weekly-goals')} className={LINK_CLASS}>
                    weekly goal
                  </a>{' '}
                  like “Read 100 pages” or “3 chapters of one book” fills in from your logs and ticks itself at the target.
                </>
              ),
            },
            {
              title: 'Reading blocks',
              text: (
                <>
                  Put a reading block in your{' '}
                  <a href={featurePath('time-blocking')} className={LINK_CLASS}>
                    time-blocked day
                  </a>{' '}
                  and it gets a button that opens the Reading Hub.
                </>
              ),
            },
          ]}
        />
      </Block>
    </>
  ),
  wideShot: {
    name: 'reading-desktop',
    width: 1400,
    height: 847,
    alt: 'The Reading Hub on a computer: Atomic Habits at 156 of 320 pages, Clean Code at 3 of 17 chapters, 6 of 10 reading points today and +105 points earned',
    caption: 'The Reading Hub on a computer, with the demo user Ali’s books.',
  },
  facts: [
    ['Page points', `1 per ${R.pagesPerPoint} pages, or ${R.pointsPerChapter} per chapter`],
    ['Daily cap', `${pts(R.dailyCap)}, shared by all books`],
    ['Finish bonus', `+${R.completionBonus}, at most once every ${READING_BONUS_COOLDOWN_DAYS} days`],
    ['Streak', 'Days in a row with pages logged'],
    ['Discover', `${CURATED_BOOKS.length} books in ${categories.length} categories`],
    ['Units', 'Pages or chapters, set per book'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You want to read a little every day, not just count finished books.',
    'You read on paper or on another app and want one book tracker with points for your progress.',
    'Points and a streak help you pick up a book instead of your phone.',
  ],
  notFor: [
    'You want book reviews, ratings and a social feed; AscendDay tracks your reading, it isn’t a book community.',
    'You want an e-reader; you read the book wherever you have it and log the pages here.',
  ],
  faq: [
    {
      q: 'Is the reading tracker free?',
      a: 'Yes. AscendDay is free while in beta. The library, Discover, the reading streak tracker, the pages read log and the points are all included.',
    },
    {
      q: 'Can I track a book by chapters instead of pages?',
      a: `Yes. Choose chapters when you add it. For a chapter book every chapter earns ${pts(R.pointsPerChapter)}. A book’s unit is fixed once you log it, so earlier logs never change meaning.`,
    },
    {
      q: 'How do I get the finish bonus?',
      a: `Finish a book after ${BONUS_RULE}. The bonus is ${pts(R.completionBonus)}, once per book, and at most once every ${READING_BONUS_COOLDOWN_DAYS} days.`,
    },
    {
      q: 'What breaks a reading streak?',
      a: 'A day with no pages logged. Any amount keeps it going, and the Finished and Library tabs don’t affect it.',
    },
    {
      q: 'Can I add a book that isn’t in Discover?',
      a: 'Yes. Add any book with its title, author and length. Discover is only a starting list.',
    },
  ],
  related: ['habits', 'weekly-goals', 'skills', 'time-blocking'],
  cta: { title: 'Start your reading streak', text: 'Add the book on your desk, log today’s pages, and day one is done.' },
};
