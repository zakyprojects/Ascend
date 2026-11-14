/**
 * Pull-to-refresh rules (lib/ui/usePullRefresh), kept free of the DOM so they can be tested: when a
 * pull may start, when it becomes a pull (straight down) or gives way to a scroll or a sideways
 * swipe, how far the indicator follows the finger and when letting go refreshes.
 */
import { SLOP_PX } from '@/lib/ui/gestures';

/** Indicator travel (px) at which letting go refreshes. */
export const PULL_THRESHOLD_PX = 64;
/** The indicator follows the finger at this rate. */
export const PULL_FOLLOW_RATE = 0.5;
/** Past the threshold it resists and tops out this much further. */
export const PULL_OVERSHOOT_PX = 32;
// Mirrors useTabSwipe's HORIZONTAL_BIAS the other way round: a slightly diagonal swipe stays a
// swipe, a slightly diagonal pull stays a pull, and the band between is neither.
const VERTICAL_BIAS = 1.7;
// A finger that rests this long before moving is selecting text or long-pressing.
const LONG_PRESS_MS = 500;

/** What the page looks like when a finger lands. */
export interface PullStartContext {
  touches: number;
  coarsePointer: boolean;
  /** The caller allows a refresh now (signed in). */
  active: boolean;
  /** A refresh is already running. */
  busy: boolean;
  /** The page's scroll position (window on phones, <main> in the wide layout). */
  scrollTop: number;
  zoomed: boolean;
  nearEdge: boolean;
  /** The touch began on something with its own drag or scroll (lib/gestures startsInsideOwnPull). */
  ownGesture: boolean;
  /** A dialog, sheet or the notification list holds the page (scroll locked). */
  overlayOpen: boolean;
  textSelected: boolean;
}

export function pullMayStart(c: PullStartContext): boolean {
  return (
    c.touches === 1 &&
    c.coarsePointer &&
    c.active &&
    !c.busy &&
    c.scrollTop <= 0 &&
    !c.zoomed &&
    !c.nearEdge &&
    !c.ownGesture &&
    !c.overlayOpen &&
    !c.textSelected
  );
}

/** Indicator travel for a finger `dy` px below where it landed: follows, then resists. */
export function pullOffset(dy: number): number {
  const follow = Math.max(0, dy) * PULL_FOLLOW_RATE;
  if (follow <= PULL_THRESHOLD_PX) return follow;
  const extra = follow - PULL_THRESHOLD_PX;
  return PULL_THRESHOLD_PX + PULL_OVERSHOOT_PX * (extra / (extra + PULL_OVERSHOOT_PX));
}

export type PullStep =
  | { kind: 'wait' }
  | { kind: 'cancel' }
  | { kind: 'pull'; offset: number; armed: boolean; armedNow: boolean };

/** One finger's pull from touchstart to touchend. */
export function createPull(x: number, y: number, startMs: number) {
  let locked = false;
  let armed = false;
  let done = false;
  return {
    move(cx: number, cy: number, atMs: number, scrollTop: number): PullStep {
      if (done) return { kind: 'cancel' };
      const dx = cx - x;
      const dy = cy - y;
      if (!locked) {
        if (Math.hypot(dx, dy) < SLOP_PX) return { kind: 'wait' };
        // Up, sideways (the tab/page swipe's), diagonal or after a long press: not a pull.
        if (atMs - startMs > LONG_PRESS_MS || dy <= 0 || dy <= Math.abs(dx) * VERTICAL_BIAS) {
          done = true;
          return { kind: 'cancel' };
        }
        locked = true;
      }
      // The page scrolled after all (an inner list let go): the scroll wins.
      if (scrollTop > 0) {
        done = true;
        armed = false;
        return { kind: 'cancel' };
      }
      const offset = pullOffset(dy);
      const nowArmed = offset >= PULL_THRESHOLD_PX;
      const armedNow = nowArmed && !armed;
      armed = nowArmed;
      return { kind: 'pull', offset, armed, armedNow };
    },
    /** Letting go: true when it should refresh (still past the threshold). */
    end(): boolean {
      const refresh = locked && armed && !done;
      done = true;
      return refresh;
    },
    /** It became a pull (the finger's click afterwards must not press anything). */
    get locked() {
      return locked;
    },
  };
}

/** Shortest time the loader shows, so a fast refresh does not flash. */
export const REFRESH_MIN_MS = 600;
/** After this the loader goes away quietly; the refresh itself carries on. */
export const REFRESH_MAX_MS = 10_000;

/** Waits for `work`, at least `minMs` and at most `maxMs`; never rejects. */
export function settleRefresh(
  work: Promise<unknown>,
  wait: (ms: number) => Promise<void>,
  minMs = REFRESH_MIN_MS,
  maxMs = REFRESH_MAX_MS
): Promise<void> {
  const finished = work.then(
    () => undefined,
    () => undefined
  );
  return Promise.race([Promise.all([finished, wait(minMs)]).then(() => undefined), wait(maxMs)]);
}
