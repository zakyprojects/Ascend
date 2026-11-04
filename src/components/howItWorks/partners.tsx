import type { HowItWorksGuide } from '@/components/ui/HowItWorks';
import { CHALLENGE_LENGTH_OPTIONS, MAX_PARTNERS } from '@/lib/partnerRules';

/**
 * Partners. Rules from lib/partnerRules.ts (partner limit, challenge lengths), AccountabilityPartner.tsx
 * (6-digit ID from Settings, waiting invites hold a place, Do / Resist, "Day 1 is today", the once-a-day
 * nudge that becomes Send support after a missed day, Start again), the resist card rework 0f600b3
 * (linked: left tick resists, Slipped/Undo at the row end, no points) and lib/pactLifecycle.ts.
 * The nudge limit is kept per device (NUDGE_STORAGE_KEY); the copy only says "once a day".
 */
const lengths = `${CHALLENGE_LENGTH_OPTIONS.slice(0, -1).join(', ')} or ${CHALLENGE_LENGTH_OPTIONS[CHALLENGE_LENGTH_OPTIONS.length - 1]}`;

export const partnersGuide: HowItWorksGuide = {
  title: 'How partners work',
  intro: 'Do a daily challenge with a friend and keep each other going.',
  steps: [
    {
      title: 'Add a partner',
      text: `Enter your friend’s 6-digit ID; they find it in their Settings. Up to ${MAX_PARTNERS} partners, and invites still waiting count too.`,
    },
    {
      title: 'Start a challenge',
      text: `Do something or resist something together for ${lengths} days. Day 1 is today.`,
    },
    {
      title: 'Tick each day',
      text: 'Tick the challenge each day you do it. A day counts when you both tick it; fill every day together to finish.',
    },
    {
      title: 'Linked ticks',
      text: 'If the challenge is one of your daily habits, the habit and the challenge tick together. A Reading challenge ticks when you log pages or chapters.',
    },
    {
      title: 'Resist challenges',
      text: 'Resist a bad habit, the same one or each your own. Linked to your bad habit, tick it or tap Slipped on the card, or log it on Bad habits; not linked, you tick it by hand.',
    },
  ],
  notes: [
    'A slip, or no tick by midnight, misses the day. Your partner sees only resisted or not yet.',
    'If a day is missed, the challenge can’t finish. Start it again from today.',
    'Nudge a partner once a day. If they missed yesterday, the nudge becomes Send support.',
  ],
  points: [
    'Challenges don’t give points. They’re for keeping each other going.',
    'A linked habit or bad habit still earns, or loses, its usual points on its own page.',
  ],
};
