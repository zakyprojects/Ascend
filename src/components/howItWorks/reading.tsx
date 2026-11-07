import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { READING_POINTS } from '@/lib/pointsConfig';
import { READING_BONUS_COOLDOWN_DAYS, READING_BONUS_MIN_LOG_DAYS, READING_BONUS_MIN_SPAN_DAYS } from '@/lib/readingAwards';

/**
 * Reading Hub. Rules from lib/pointsConfig.ts READING_POINTS, lib/readingAwards.ts (finish bonus:
 * log days, span, cooldown), components/reading/bookMeta.ts (unit locked once you log),
 * FinishBookDialog (key takeaway required), ReadingHub.tsx (tabs, Discover Library/Start, Daily habit switch).
 */
export const readingGuide: HowItWorksGuide = {
  title: 'How the Reading Hub works',
  intro: 'Log what you read each day. Books move from Library to Reading to Finished.',
  steps: [
    {
      title: 'Reading',
      text: 'Books you’re reading now. Log progress in pages, or in chapters if you set the book that way. The unit locks once you log.',
    },
    { title: 'Library', text: 'Books you want to read. Start one and it moves to Reading.' },
    { title: 'Finished', text: 'Finish a book with its key takeaway. You can read it again any time.' },
    { title: 'Discover', text: 'A picked list of books. Save one to your Library or start it right away.' },
    { title: 'Daily habit', text: 'Turn on the Reading habit and it ticks itself on Habits on days you log reading.' },
  ],
  notes: [
    'Removing a book takes back its finish bonus and today’s points from it. Earlier days keep their points.',
    'The Reading habit earns no points and has no penalty.',
    'Tap Reorder to put your To read list, or the books you are reading, in your own order. A book you log goes to the top of Currently reading.',
  ],
  points: [
    <>
      Every <Fig>{READING_POINTS.pagesPerPoint}</Fig> pages = <Gain>1 pt</Gain>; in a book counted in chapters, every chapter ={' '}
      <Gain>{pts(READING_POINTS.pointsPerChapter)}</Gain>. Up to <Fig>{pts(READING_POINTS.dailyCap)}</Fig> a day across all books.
    </>,
    <>
      Finishing a book gives <Gain>{pts(READING_POINTS.completionBonus, true)}</Gain> once, when you logged pages on{' '}
      <Fig>{READING_BONUS_MIN_LOG_DAYS}</Fig> separate days and the first was <Fig>{READING_BONUS_MIN_SPAN_DAYS}</Fig>+ days ago.
    </>,
    <>
      At most one finish bonus every <Fig>{READING_BONUS_COOLDOWN_DAYS}</Fig> days; a book finished sooner gets none.
    </>,
    'The pages Finish adds for you earn no page points.',
  ],
};
