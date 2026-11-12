import React from 'react';

export interface ActiveBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** False for the first placement, so an indicator appears in place instead of sliding in. */
  animate: boolean;
}

/**
 * Box of the active option inside its group (offset coordinates), for an indicator that slides
 * between options. Kept current through resizes, wrapping and font loads. `deps` re-measures when
 * the options' contents change (labels, counts).
 */
export function useActiveBox(
  groupRef: React.RefObject<HTMLElement>,
  findActive: (group: HTMLElement) => HTMLElement | null | undefined,
  activeKey: string,
  deps: string = ''
): ActiveBox | null {
  const [box, setBox] = React.useState<ActiveBox | null>(null);
  const find = React.useRef(findActive);
  find.current = findActive;

  React.useLayoutEffect(() => {
    const group = groupRef.current;
    const active = group ? find.current(group) : null;
    if (!group || !active) {
      setBox(null);
      return;
    }
    const measure = () =>
      setBox((prev) => {
        const next = {
          left: active.offsetLeft,
          top: active.offsetTop,
          width: active.offsetWidth,
          height: active.offsetHeight,
          animate: prev !== null,
        };
        return prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height
          ? prev
          : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    observer.observe(active);
    return () => observer.disconnect();
  }, [groupRef, activeKey, deps]);

  return box;
}
