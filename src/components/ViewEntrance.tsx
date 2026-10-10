import { ReactNode, useState } from 'react';

/**
 * Page entrance: a short rise-and-fade (250ms, 8px) the first time a view is
 * shown in a session. Keyed by view in AppShell, so `animate` is read once per
 * mount and later re-renders can never cut the animation short.
 */
export function ViewEntrance({ animate, children }: { animate: boolean; children: ReactNode }) {
  const [shouldAnimate] = useState(animate);
  return <div className={shouldAnimate ? 'animate-view-enter' : undefined}>{children}</div>;
}
