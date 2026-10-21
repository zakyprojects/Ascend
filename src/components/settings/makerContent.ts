import { Coffee, CupSoda, Flame, type LucideIcon } from 'lucide-react';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';

/**
 * The maker's story and the "buy us a coffee" menu, written once and shown in two places:
 * Settings > About us / Support (MakerSections.tsx) and the public /about page
 * (marketing/pages/About.tsx). Plain data only: the public page renders it at build time in Node.
 */

export const MAKER_LEAD = 'Made by a student who thinks competition can be put to better use.';

export const MAKER_INTRO =
  'Hi, I’m Zakria Khan. I’m from Risalpur Cantt in Khyber Pakhtunkhwa, I study Computer Science in Peshawar, and I’ve completed Harvard’s CS50x and CS50P. I build Ascend on my own.';

export const MAKER_STORY: { title: string; paragraphs: string[] }[] = [
  {
    title: 'Why I built it',
    paragraphs: [
      'People love to compete. We do it in almost everything: grades, jobs, salaries, business, and on a bigger scale countries compete over technology, the economy and power. Psychologists call part of this social comparison: we work out how we’re doing by looking at the people around us.',
      'What caught my attention is what happens when someone’s life doesn’t have much of it. The need doesn’t go away. People find it somewhere else, and for a lot of us that place is a competitive game. You grind for a rank, you want to beat the other side, and you come back the next day.',
      'One question stayed with me: what if that same drive went into real life? You’d still get the competition. But at the end of a season you’d also have read more, trained more and kept more of your habits. I couldn’t think of a better trade, so I started building Ascend.',
    ],
  },
  {
    title: 'The idea',
    paragraphs: [
      'In a league you’re up against other people who are climbing too, and that’s what gets you started. But the one really worth beating is who you were yesterday. Will Durant summed up Aristotle as “We are what we repeatedly do.” Ascend counts the repeating.',
      'It only works if you’re honest with yourself. Logging a workout you didn’t do might win you a league, but it won’t change anything about you. The points are there to push you. The real prize is what changes in you.',
    ],
  },
];

export const SUPPORT_INTRO =
  'Ascend is built by one student. If it’s helped you keep a habit or win a week, you can buy me a chai or a coffee. Pick one and send me an email, and I’ll reply with how to send it.';

/** One drink on the Support menu. Nothing is paid in the app or on the site: each one opens an email to Zakria. */
export const FUEL_MENU: { name: string; line: string; icon: LucideIcon }[] = [
  { name: 'A chai', line: 'A small thank-you that says keep going.', icon: CupSoda },
  { name: 'A coffee', line: 'Fuel for a late night of fixing and building.', icon: Coffee },
  { name: 'A streak saver', line: 'For when Ascend really helped you and you want it to keep climbing.', icon: Flame },
];

export function fuelMailto(name: string): string {
  const subject = encodeURIComponent(`Buy us a coffee: ${name}`);
  return `mailto:${LEGAL_CONTACT_EMAIL}?subject=${subject}`;
}
