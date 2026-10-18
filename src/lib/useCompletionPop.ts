import { useCallback, useEffect, useState } from 'react';
import { actionFeedback } from '@/lib/actionFeedback';

/**
 * Completion-check "pop", driven by the user's own click rather than by state.
 *
 * A checkmark animates only after the user completed the item in this mounted
 * component: never on mount, page revisit, hydration, or a sync from another
 * device. Call `arm()` from the handler that marks the item complete; the pop
 * plays when `isDone` turns true. Un-checking and checking again replays it,
 * because the check icon remounts (or leaves display:none) each time.
 * The tick feedback (vibration or sound, Settings) plays once each time the pop plays, so it follows the same rule.
 */
export function useCompletionPop(isDone: boolean) {
  const [armed, setArmed] = useState(false);
  const arm = useCallback(() => setArmed(true), []);
  const popping = armed && isDone;
  useEffect(() => {
    if (popping) actionFeedback('tick');
  }, [popping]);
  return { arm, popClass: popping ? 'animate-pop' : '' };
}
