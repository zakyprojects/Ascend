/**
 * Growth trace: the line along the bottom of the loading screens. A dotted level line marks where you
 * stay if nothing changes. The solid line runs straight along it first (the pre-React splash), then,
 * once the app's own loader takes over, lifts off in one smooth curve and climbs to the right.
 *
 * Both halves move only by CSS transforms, which run on the compositor, so the line keeps gliding while
 * the main thread is busy (bundle parse, React mounting the app behind the loader).
 * - Splash (index.html, KEEP IN SYNC): HTML line scaled + dot translated by a CSS animation whose
 *   easing is exponential, p(t) = 1 - e^(-t/τ): fast, then always slower, never stopping.
 * - Overlay: the whole path is drawn once and revealed left to right by a clip that slides (outer box
 *   translated one way, its content the other); the dot follows the path through sampled keyframes.
 *   It starts exactly where the splash line is and at its speed, so the hand-over has no hitch.
 */
export const TRACE_DELAY_MS = 250;
/** Time constant of the splash's exponential glide (the CSS linear() easing is generated from it). */
export const TRACE_TAU_MS = 1600;
/** Length of the splash CSS animation (8 s = 5τ, 99.3% of the run); index.html's linear() matches. */
export const TRACE_SPLASH_MS = 8000;
/** Time the overlay takes to draw the rest (the curve, plus any straight part not yet drawn). */
export const TRACE_CLIMB_MS = 1100;
/** Where the straight part ends and where the climb ends, as fractions of the screen width. */
export const TRACE_LIFT_AT = 0.42;
export const TRACE_END = 0.92;
const SAMPLES = 48;
const DOT_RADIUS = 3.5;

export interface GrowthTraceGeometry {
  d: string;
  level: number;
  straight: number;
}

/** Straight run then a smooth exponential-looking lift, across a w×h screen. */
export function growthTracePath(w: number, h: number): GrowthTraceGeometry {
  const level = h * 0.84;
  const top = level - h * 0.26;
  const x1 = w * TRACE_LIFT_AT;
  const x2 = w * TRACE_END;
  const dx = x2 - x1;
  const f = (n: number) => n.toFixed(1);
  const d =
    `M0 ${f(level)} H${f(x1)} ` +
    `C${f(x1 + dx * 0.5)} ${f(level)} ${f(x1 + dx * 0.82)} ${f(level - (level - top) * 0.4)} ${f(x2)} ${f(top)}`;
  return { d, level, straight: x1 };
}

// When the splash's CSS animation started, on the performance.now() clock. Read as this module loads,
// which is before React's first render replaces the splash.
const splashStart: number | null = (() => {
  const anim = document.querySelector('#splash-trace .gt-s-line')?.getAnimations?.()[0];
  const start = anim?.startTime;
  return typeof start === 'number' ? start : null;
})();

const SPLASH_NORM = 1 - Math.exp(-TRACE_SPLASH_MS / TRACE_TAU_MS);

/** Fraction of the straight run the splash had covered at `now`, and its speed then (fraction/ms). */
function splashState(now: number): { at: number; speed: number } {
  if (splashStart === null) return { at: 0, speed: 0 };
  const t = Math.min(TRACE_SPLASH_MS, now - splashStart - TRACE_DELAY_MS);
  if (t <= 0) return { at: 0, speed: 0 };
  const left = Math.exp(-t / TRACE_TAU_MS);
  return { at: (1 - left) / SPLASH_NORM, speed: left / TRACE_TAU_MS / SPLASH_NORM };
}

/**
 * The frame the overlay should paint first: where the splash line is right now (or nothing, when not
 * continuing a splash). Rendered inline so the hand-over frame matches before the animation starts.
 */
export function growthTraceFirstFrame(continueSplash: boolean) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const geo = growthTracePath(w, h);
  const x = continueSplash ? geo.straight * splashState(performance.now()).at : 0;
  return {
    viewBox: `0 0 ${w} ${h}`,
    d: geo.d,
    level: geo.level,
    w,
    reveal: `translateX(${x - w}px)`,
    revealInner: `translateX(${w - x}px)`,
    dot: x > 0 ? `translate(${x - DOT_RADIUS}px, ${geo.level - DOT_RADIUS}px)` : undefined,
  };
}

export interface GrowthTraceParts {
  root: HTMLElement;
  level: SVGLineElement;
  path: SVGPathElement;
  reveal: HTMLElement;
  revealInner: HTMLElement;
  dot: HTMLElement;
}

/**
 * Runs the overlay half. `continueSplash`: pick up where the boot splash's line is; otherwise draw the
 * whole line from zero. Returns a stop.
 */
export function runGrowthTrace(parts: GrowthTraceParts, continueSplash: boolean): () => void {
  const { root, level, path, reveal, revealInner, dot } = parts;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mountedAt = performance.now();
  const splash = continueSplash ? splashState(mountedAt) : null;
  const duration = splash ? TRACE_CLIMB_MS : TRACE_CLIMB_MS * 2;
  let animations: Animation[] = [];

  const build = () => {
    animations.forEach((a) => a.cancel());
    const w = window.innerWidth;
    const h = window.innerHeight;
    const geo = growthTracePath(w, h);
    for (const svg of root.querySelectorAll('svg')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    path.setAttribute('d', geo.d);
    level.setAttribute('x2', String(w));
    level.setAttribute('y1', String(geo.level));
    level.setAttribute('y2', String(geo.level));

    const length = path.getTotalLength();
    const from = splash ? geo.straight * splash.at : 0; // the straight part's length is its width
    let ease = (u: number) => 1 - (1 - u) ** 3;
    if (splash) {
      // Cubic with s(0)=0, s(1)=1, s'(1)=0 and s'(0) = the splash's speed (floored so it never idles).
      const m = Math.min(3, Math.max(0.2, (geo.straight * splash.speed * duration) / (length - from)));
      ease = (u) => m * u + (3 - 2 * m) * u * u + (m - 2) * u * u * u;
    }

    const outer: Keyframe[] = [];
    const inner: Keyframe[] = [];
    const head: Keyframe[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const offset = k / SAMPLES;
      const p = path.getPointAtLength(from + (length - from) * ease(offset));
      outer.push({ offset, transform: `translateX(${p.x - w}px)` });
      inner.push({ offset, transform: `translateX(${w - p.x}px)` });
      head.push({ offset, transform: `translate(${p.x - DOT_RADIUS}px, ${p.y - DOT_RADIUS}px)` });
    }
    const timing: KeyframeAnimationOptions = { duration: still ? 0 : duration, fill: 'forwards' };
    animations = [reveal.animate(outer, timing), revealInner.animate(inner, timing), dot.animate(head, timing)];
    const elapsed = performance.now() - mountedAt;
    if (!still) animations.forEach((a) => (a.currentTime = Math.min(elapsed, duration)));
    root.removeAttribute('data-done');
    animations[2].finished.then(() => root.setAttribute('data-done', ''), () => {});
  };

  build();
  window.addEventListener('resize', build);
  return () => {
    window.removeEventListener('resize', build);
    animations.forEach((a) => a.cancel());
  };
}
