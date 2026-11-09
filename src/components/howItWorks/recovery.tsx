import { Fig, Gain, pts, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { RECOVERY_POINTS } from '@/lib/pointsConfig';

/**
 * Recovery. Check-in points from pointsConfig RECOVERY_POINTS (perCheckin, seasonCap) and the rules
 * in lib/recoveryAwards.ts (server: 20261109130000_recovery_daily_checkins.sql);
 * AddictionRecovery.tsx (Start tracker, Clean today, Log craving, Emergency support, Reset / Delete).
 */
export const recoveryGuide: HowItWorksGuide = {
  title: 'How recovery works',
  intro: 'A clean streak for one thing you’re stepping away from.',
  steps: [
    { title: 'Start your streak', text: 'Pick what you’re stepping away from, like smoking or social media. The clock starts now.' },
    { title: 'Check in each day', text: 'Tap Clean today once a day. Missed it? You can still check in for yesterday today.' },
    { title: 'Log cravings', text: 'Write what triggered a craving and what helped, to see your patterns over time.' },
    { title: 'Emergency support', text: 'Box breathing and quick distraction ideas for a hard moment.' },
  ],
  notes: [
    'A missed check-in never breaks your streak. The streak counts from your start or your last reset.',
    'This is a self-help tool, not medical treatment. In a crisis, contact a professional or a helpline.',
  ],
  points: [
    <>
      Clean today = <Gain>{pts(RECOVERY_POINTS.perCheckin, true)}</Gain>, once a day. No check-in, no point.
    </>,
    'The day you start a tracker, and a day you reset the streak, earn nothing. Points start the next day.',
    <>
      Up to <Fig>{pts(RECOVERY_POINTS.seasonCap)}</Fig> a season. Your streak carries into the next season.
    </>,
    'Reset or delete: points you already earned stay. Cravings never change points.',
  ],
};
