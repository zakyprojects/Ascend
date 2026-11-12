import type { HowItWorksGuide } from '@/components/ui/HowItWorks';
import { getSeasonStartByNumber } from '@/lib/time/leagueTime';

/**
 * Leagues. From lib/leagueTime.ts (UTC boundaries, season length), ascend_league_boards (points =
 * the ledger after every page's caps and penalties, more points higher), Leagues.tsx (three tabs,
 * resets shown on your clock, Past weeks/months/seasons) and marketing leagues.tsx. No points of their own.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const seasonDays = Math.round((getSeasonStartByNumber(2).getTime() - getSeasonStartByNumber(1).getTime()) / DAY_MS);

export const leaguesGuide: HowItWorksGuide = {
  title: 'How leagues work',
  intro: 'Three tables of everyone’s points. There is nothing to join.',
  steps: [
    { title: 'Weekly', text: 'Points you earn from Monday. Starts again from zero every week.' },
    { title: 'Monthly', text: 'Points you earn from the 1st of the month.' },
    { title: 'Season', text: `Points you earn in the ${seasonDays}-day season. This table sets your rank.` },
    { title: 'Resets', text: 'Each table resets at 00:00 UTC. The page shows the time left on your own clock.' },
    { title: 'Look back', text: 'Finished weeks, months and seasons stay in the past list with your place and points.' },
  ],
  points: [
    'Leagues add no points of their own. Each table adds up what every page earns, after its daily cap.',
    'Points lost to missed habits or slips come off in all three tables too.',
    'More points sit higher.',
  ],
};
