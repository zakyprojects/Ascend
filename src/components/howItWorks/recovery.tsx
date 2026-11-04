import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { RECOVERY_POINTS, SOBRIETY_MILESTONE_POINTS } from '@/lib/pointsConfig';
import { RECOVERY_MILESTONES } from '@/lib/recoveryAwards';

/**
 * Recovery. Milestones from lib/recoveryAwards.ts RECOVERY_MILESTONES (hours) and pointsConfig
 * SOBRIETY_MILESTONE_POINTS / RECOVERY_POINTS.seasonCap; the 7-day activity gate (server, 10-30);
 * AddictionRecovery.tsx (Start tracker, Log craving, Emergency support, Reset / Delete).
 */
const milestones = RECOVERY_MILESTONES.map((m) => ({ days: m.hours / 24, points: SOBRIETY_MILESTONE_POINTS[m.key] }));

export const recoveryGuide: HowItWorksGuide = {
  title: 'How recovery works',
  intro: 'A clean streak for one thing you’re stepping away from.',
  steps: [
    { title: 'Start your streak', text: 'Pick what you’re stepping away from, like smoking or social media. The clock starts now.' },
    { title: 'Milestones', text: 'The streak passes milestones as the days add up. Reset it if you slip.' },
    { title: 'Log cravings', text: 'Write what triggered a craving and what helped, to see your patterns over time.' },
    { title: 'Emergency support', text: 'Box breathing and quick distraction ideas for a hard moment.' },
  ],
  notes: ['This is a self-help tool, not medical treatment. In a crisis, contact a professional or a helpline.'],
  points: [
    <>
      {milestones.map((m, i) => (
        <span key={m.days}>
          {i > 0 && ', '}
          <Fig>{m.days}</Fig> days clean = <Gain>{pts(m.points, true)}</Gain>
        </span>
      ))}
      .
    </>,
    <>
      Up to <Fig>{pts(RECOVERY_POINTS.seasonCap)}</Fig> a season. Points arrive within the hour, even with the app closed, if you opened the
      app in the 7 days before.
    </>,
    'Reset or delete: the streak’s milestone points from this season come off. Earlier seasons keep theirs.',
    'A new streak can earn the milestones again. Cravings never change points.',
  ],
};
