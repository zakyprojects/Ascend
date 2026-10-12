import { prefersReducedMotion } from '@/lib/motion';

/**
 * One short buzz confirming the user's own action. Android browsers only: iOS Safari has no
 * Vibration API, so this is a silent no-op there. Off with reduced motion, which users also set
 * to quiet physical feedback.
 */
export function hapticSuccess(): void {
  if (prefersReducedMotion() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(12);
}
