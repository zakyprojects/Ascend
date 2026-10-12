import { ReactNode } from 'react';
import { IntroMotionContext } from '@/lib/motion';

/**
 * Page entrance: a short rise-and-fade (250ms, 8px) every time a view is shown. Keyed by view in
 * AppShell, so it plays once per visit and later re-renders never replay or cut it short. It also
 * turns on the intro motion inside the view (Reveal, CountUp, ProgressBar, charts) through
 * IntroMotionContext. Reduced motion turns all of it off.
 */
export function ViewEntrance({ children }: { children: ReactNode }) {
  return (
    <IntroMotionContext.Provider value={true}>
      <div className="animate-view-enter">{children}</div>
    </IntroMotionContext.Provider>
  );
}
