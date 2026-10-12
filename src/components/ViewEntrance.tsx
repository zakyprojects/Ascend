import { ReactNode, useState } from 'react';
import { IntroMotionContext } from '@/lib/motion';

/**
 * Page entrance: a short rise-and-fade (250ms, 8px) the first time a view is
 * shown in a session, and a 150ms opacity fade on revisits (no movement, so it never feels
 * slow). Keyed by view in AppShell, so `animate` is read once per
 * mount and later re-renders can never cut the animation short. The same flag drives the intro
 * motion inside the view (Reveal, CountUp, ProgressBar) through IntroMotionContext.
 */
export function ViewEntrance({ animate, children }: { animate: boolean; children: ReactNode }) {
  const [shouldAnimate] = useState(animate);
  return (
    <IntroMotionContext.Provider value={shouldAnimate}>
      <div className={shouldAnimate ? 'animate-view-enter' : 'animate-view-fade'}>{children}</div>
    </IntroMotionContext.Provider>
  );
}
