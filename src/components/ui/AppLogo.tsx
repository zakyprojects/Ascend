import { BRAND_LOCKUP, BRAND_MARK } from './brandPaths';

/**
 * In-app AscendDay mark (brandPaths.ts). Drawn in `currentColor`, which defaults to the theme's
 * brand mark colour (`text-brand-mark`), so it follows `data-theme` without a store subscription.
 * Use `small` at 32px and below. Decorative: every use sits beside the visible name.
 */
export function AppLogo({ className = '', variant = 'full' }: { className?: string; variant?: 'full' | 'small' }) {
  const mark = BRAND_MARK[variant];
  return (
    <svg viewBox={mark.viewBox} className={`text-brand-mark ${className}`} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={mark.body} />
      {mark.segments.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * Mark + ASCENDDAY wordmark. ASCEND takes the text colour (`className`); the mark and DAY keep the
 * theme's brand colour unless `markClassName` sets another.
 */
export function AppLockup({ className = '', markClassName = 'text-brand-mark' }: { className?: string; markClassName?: string }) {
  return (
    <svg viewBox={BRAND_LOCKUP.viewBox} className={className} fill="currentColor" role="img" aria-label="AscendDay">
      <path className={markClassName} d={BRAND_LOCKUP.mark} />
      <path transform={BRAND_LOCKUP.wordTransform} d={BRAND_LOCKUP.word} />
      <path className={markClassName} transform={BRAND_LOCKUP.wordTransform} d={BRAND_LOCKUP.day} />
    </svg>
  );
}
