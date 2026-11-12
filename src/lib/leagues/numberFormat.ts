/**
 * Numbers on the member card: below 10,000 in full with grouping (9,999; amounts keep up to 2
 * decimals: 3.25); from 10,000 short with at most one decimal and no trailing .0 (10k, 12.5k, 1.2M,
 * 3B). Rounding is half-up and moves to the next unit, so 999,950 is 1M, never 1000k. Negative
 * numbers keep their sign (−12.5k).
 */
const SHORT = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 });
const FULL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 && FULL.format(abs) !== '0' ? '−' : '';
  if (abs < 10_000) return `${sign}${FULL.format(abs)}`;
  return `${sign}${SHORT.format(abs).replace('K', 'k')}`;
}
