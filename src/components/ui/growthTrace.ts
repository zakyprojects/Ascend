/**
 * Growth trace: the line along the bottom of the loading screens. A dotted level line marks where you
 * stay if nothing changes. The solid line runs straight along it first (the pre-React splash), then,
 * once the app's own loader takes over, lifts off in one smooth curve and climbs to the right.
 *
 * The splash (index.html, which duplicates the straight-part math: KEEP IN SYNC) draws only the
 * straight part, on the page-start clock (performance.now()). The boot overlay reads how far the
 * splash got at the moment it mounts and continues from exactly there, so the hand-over is seamless.
 */
export const TRACE_DELAY_MS = 250;
/** Time the splash takes to draw the straight part. */
export const TRACE_STRAIGHT_MS = 1400;
/** Time the overlay takes to draw whatever is left (the curve, plus any straight part not yet drawn). */
export const TRACE_CLIMB_MS = 1100;
/** Where the straight part ends and where the climb ends, as fractions of the screen width. */
export const TRACE_LIFT_AT = 0.42;
export const TRACE_END = 0.92;

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

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** How much of the straight part the splash had drawn at `now` (0..1). */
export const splashStraightProgress = (now: number) => easeOut(clamp01((now - TRACE_DELAY_MS) / TRACE_STRAIGHT_MS));

/**
 * Draws the trace into an <svg> holding `.gt-level`, `.gt-line` and `.gt-head`.
 * `continueSplash`: start where the boot splash left off; otherwise draw the whole line from zero.
 */
export function runGrowthTrace(svg: SVGSVGElement, continueSplash: boolean): () => void {
  const level = svg.querySelector<SVGLineElement>('.gt-level');
  const line = svg.querySelector<SVGPathElement>('.gt-line');
  const head = svg.querySelector<SVGCircleElement>('.gt-head');
  if (!level || !line || !head) return () => {};
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mountedAt = performance.now();
  const startFraction = continueSplash ? splashStraightProgress(mountedAt) : 0;
  const duration = continueSplash ? TRACE_CLIMB_MS : TRACE_STRAIGHT_MS + TRACE_CLIMB_MS;
  let length = 0;
  let from = 0;
  let frame = 0;

  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const geo = growthTracePath(w, h);
    line.setAttribute('d', geo.d);
    level.setAttribute('x1', '0');
    level.setAttribute('x2', String(w));
    level.setAttribute('y1', String(geo.level));
    level.setAttribute('y2', String(geo.level));
    length = line.getTotalLength();
    from = geo.straight * startFraction; // the straight part's length is its width
    line.style.strokeDasharray = String(length);
  };

  const draw = (now: number) => {
    const t = still ? 1 : clamp01((now - mountedAt) / duration);
    const drawn = from + (length - from) * easeOut(t);
    line.style.strokeDashoffset = String(length - drawn);
    const p = line.getPointAtLength(drawn);
    head.setAttribute('cx', String(p.x));
    head.setAttribute('cy', String(p.y));
    head.style.opacity = drawn > 0 ? '1' : '0';
    svg.toggleAttribute('data-done', t >= 1);
    if (t < 1) frame = requestAnimationFrame(draw);
  };

  const onResize = () => {
    layout();
    cancelAnimationFrame(frame);
    draw(performance.now());
  };

  layout();
  draw(mountedAt);
  window.addEventListener('resize', onResize);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
  };
}
