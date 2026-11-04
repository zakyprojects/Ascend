import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { MIN_JOURNAL_CONTENT_LENGTH } from '@/lib/journalRules';

/**
 * Journal. Rules from lib/pointsConfig.ts JOURNAL_POINTS (one entry a day, server-written),
 * lib/journalRules.ts MIN_JOURNAL_CONTENT_LENGTH, Journal.tsx (today only, mood chart).
 */
export const journalGuide: HowItWorksGuide = {
  title: 'How the journal works',
  intro: 'One entry a day: a mood and a few lines.',
  steps: [
    { title: 'Write today', text: 'Pick a mood and write what’s on your mind. You can write and edit only today’s entry.' },
    { title: 'Your mood', text: 'The mood chart shows how your days have been and how many days you wrote.' },
  ],
  notes: [
    'Deleting today’s entry takes its points back. Earlier days keep their points.',
    'Deleting an entry can break your streak and removes that day from your mood.',
  ],
  points: [
    <>
      Today’s entry with at least <Fig>{MIN_JOURNAL_CONTENT_LENGTH}</Fig> characters = <Gain>{pts(JOURNAL_POINTS.entryCompleted, true)}</Gain>,
      once a day.
    </>,
    'Editing today’s entry earns nothing extra.',
  ],
};
