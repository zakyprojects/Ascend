/**
 * Shared rules for the app's own touch gestures (ui/SwipeRow, lib/useTabSwipe), so they never
 * fight each other, the browser or the system.
 */

/** Movement before a gesture picks an axis; smaller moves are still a tap. */
export const SLOP_PX = 10;

/** Touches starting this close to a screen edge belong to the system back gesture. */
export const EDGE_PX = 24;

/**
 * Edge back is a gesture from Android 10 on; Android 9 and older have no edge gesture, so the
 * whole width is free there. Read once at startup: Chrome's user-agent string freezes the
 * Android version, only User-Agent Client Hints give the real one. Until the answer arrives,
 * or where the browser has no Client Hints (Safari, Firefox), the edges stay reserved.
 */
let edgesFree = false;

interface UserAgentData {
  platform: string;
  getHighEntropyValues: (hints: string[]) => Promise<{ platformVersion?: string }>;
}

const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
if (userAgentData?.platform === 'Android') {
  userAgentData
    .getHighEntropyValues(['platformVersion'])
    .then(({ platformVersion }) => {
      const major = Number.parseInt(platformVersion ?? '', 10);
      edgesFree = major > 0 && major < 10;
    })
    .catch(() => undefined);
}

export function nearScreenEdge(clientX: number): boolean {
  if (edgesFree) return false;
  return clientX < EDGE_PX || clientX > window.innerWidth - EDGE_PX;
}

/**
 * Controls that own horizontal movement themselves. Components with their own drag or scrub
 * (charts, the week picker, swipe rows) carry `data-no-swipe`; tab strips scroll sideways.
 */
const OWN_GESTURE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tablist"], [data-no-swipe]';

function scrollsSideways(el: Element): boolean {
  if (el.scrollWidth <= el.clientWidth) return false;
  const overflowX = getComputedStyle(el).overflowX;
  return overflowX === 'auto' || overflowX === 'scroll';
}

/**
 * True when a touch on `target` belongs to something between it and `root` that handles its own
 * horizontal movement, so `root` must leave the gesture alone. A nested gesture root
 * (`data-tab-swipe`) also counts: the innermost one owns the swipe.
 */
export function startsInsideOwnGesture(target: Element, root: Element): boolean {
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.matches(OWN_GESTURE_SELECTOR) || el.hasAttribute('data-tab-swipe') || scrollsSideways(el)) return true;
  }
  return false;
}
