import { useCallback, useState } from 'react';

export type ChartTone = 'brand' | 'success' | 'warning' | 'purple' | 'cyan';

/** Tone as a text colour: SVG strokes/fills and HTML fills read it through currentColor. */
export const toneText: Record<ChartTone, string> = {
  brand: 'text-primary-500',
  success: 'text-success-text',
  warning: 'text-warning-text',
  // Module identity colours (Skills purple, Projects cyan).
  purple: 'text-purple-500',
  cyan: 'text-cyan-500',
};

/**
 * Which data point the pointer (or keyboard focus) is on. Touch taps set it too, so the
 * tooltip works without hover; leaving the chart clears it.
 */
export function useChartHover() {
  const [active, setActive] = useState<number | null>(null);
  const clear = useCallback(() => setActive(null), []);
  return { active, setActive, clear };
}
