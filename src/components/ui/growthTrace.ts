/**
 * Growth trace: the line along the bottom of the loading screens. A dotted level line is where you
 * stay if nothing changes; beside it a staircase climbs from the left edge to the right, each step a
 * little taller than the last (small daily steps compound: 1.06^day). It draws once, start to end,
 * with a glowing head, then rests with the head breathing.
 *
 * Time comes from performance.now() (ms since the page started loading), so the pre-React splash in
 * index.html and the boot overlay draw the same frame at the same moment and the hand-over is
 * seamless. index.html duplicates this file's math: KEEP IN SYNC.
 */
export const TRACE_STEPS = 44;
export const TRACE_GROWTH = 1.06;
export const TRACE_DELAY_MS = 250;
export const TRACE_DRAW_MS = 2600;
/** The climb stops short of the right edge so its head stays in view. */
export const TRACE_END = 0.92;

/** Staircase path across a w×h screen, plus the y of the level line. */
export function growthTracePath(w: number, h: number): { d: string; level: number } {
  const level = h * 0.84;
  const rise = h * 0.26;
  const total = TRACE_GROWTH ** TRACE_STEPS - 1;
  let d = `M0 ${level.toFixed(1)}`;
  for (let i = 1; i <= TRACE_STEPS; i++) {
    const x = (w * TRACE_END * i) / TRACE_STEPS;
    const y = level - ((TRACE_GROWTH ** i - 1) / total) * rise;
    d += ` H${x.toFixed(1)} V${y.toFixed(1)}`;
  }
  return { d, level };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Draws the trace into an <svg> holding `.gt-level`, `.gt-line` and `.gt-head`. `startedAt` is the
 * performance.now() the drawing counts from (0 = page start, for the boot hand-over). Returns a stop.
 */
export function runGrowthTrace(svg: SVGSVGElement, startedAt: number): () => void {
  const level = svg.querySelector<SVGLineElement>('.gt-level');
  const line = svg.querySelector<SVGPathElement>('.gt-line');
  const head = svg.querySelector<SVGCircleElement>('.gt-head');
  if (!level || !line || !head) return () => {};
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let length = 0;
  let frame = 0;

  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const { d, level: y } = growthTracePath(w, h);
    line.setAttribute('d', d);
    level.setAttribute('x1', '0');
    level.setAttribute('x2', String(w));
    level.setAttribute('y1', String(y));
    level.setAttribute('y2', String(y));
    length = line.getTotalLength();
    line.style.strokeDasharray = String(length);
  };

  const draw = (now: number) => {
    const t = still ? 1 : Math.min(1, Math.max(0, (now - startedAt - TRACE_DELAY_MS) / TRACE_DRAW_MS));
    const drawn = length * easeOut(t);
    line.style.strokeDashoffset = String(length - drawn);
    const p = line.getPointAtLength(drawn);
    head.setAttribute('cx', String(p.x));
    head.setAttribute('cy', String(p.y));
    head.style.opacity = t > 0 ? '1' : '0';
    svg.toggleAttribute('data-done', t >= 1);
    if (t < 1) frame = requestAnimationFrame(draw);
  };

  const onResize = () => {
    layout();
    cancelAnimationFrame(frame);
    draw(performance.now());
  };

  layout();
  draw(performance.now());
  window.addEventListener('resize', onResize);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
  };
}
