/**
 * Figure-8 swoosh ribbon for the Ascend loader (brand/v2-ascend-bg/loader/v8-figure8-swoosh/gen.py).
 *
 * A tapered gold ribbon travels a tilted figure-8 around the A, in 100-unit chip space.
 * Depth is z = cos(theta): the part with z < 0 is drawn behind the mark, the rest in front.
 * The span is under 180 degrees, so a frame has at most one depth change: two closed paths.
 *
 * KEEP IN SYNC with the inline splash script in index.html, which runs before this bundle loads.
 */

const CX = 48.5;
const CY = 42;
const RX = 40;
const RY = 15;
const ROT = (-14 * Math.PI) / 180;
const SPAN = (165 * Math.PI) / 180;
const SAMPLES = 48;
const LOOP_MS = 1600;
const FRAMES = 96; // 60fps over one 1.6s loop

export interface RibbonFrame {
  back: string;
  front: string;
}

const COS_R = Math.cos(ROT);
const SIN_R = Math.sin(ROT);

function point(th: number): [number, number] {
  const x = RX * Math.sin(th);
  const y = RY * Math.sin(2 * th);
  return [CX + x * COS_R - y * SIN_R, CY + x * SIN_R + y * COS_R];
}

/** Unit normal from the analytic tangent (dx = RX cos t, dy = 2 RY cos 2t, then rotated). */
function normal(th: number): [number, number] {
  const dx = RX * Math.cos(th);
  const dy = 2 * RY * Math.cos(2 * th);
  const tx = dx * COS_R - dy * SIN_R;
  const ty = dx * SIN_R + dy * COS_R;
  const len = Math.hypot(tx, ty) || 1;
  return [-ty / len, tx / len];
}

/** Swoosh profile: pointed at both ends, fullest about 60% along (u = 0 tail, 1 head). */
function width(u: number, maxWidth: number): number {
  return maxWidth * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.9);
}

function outline(thetas: number[], head: number, maxWidth: number): string {
  const left: string[] = [];
  const right: string[] = [];
  for (const th of thetas) {
    const [px, py] = point(th);
    const [nx, ny] = normal(th);
    const w = width(1 - (head - th) / SPAN, maxWidth) / 2;
    left.push(`${(px + nx * w).toFixed(2)},${(py + ny * w).toFixed(2)}`);
    right.push(`${(px - nx * w).toFixed(2)},${(py - ny * w).toFixed(2)}`);
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

function buildFrame(t: number, maxWidth: number): RibbonFrame {
  const head = 2 * Math.PI * (t - 0.05 * Math.sin(2 * Math.PI * t));
  const tail = head - SPAN;
  // The depth flips where cos(theta) = 0, i.e. theta = pi/2 + k*pi; the span covers at most one.
  const flip = Math.ceil((tail - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
  const hasFlip = flip > tail && flip < head;

  const runs: number[][] = [[]];
  for (let i = 0; i <= SAMPLES; i++) {
    const th = tail + (SPAN * i) / SAMPLES;
    const current = runs[runs.length - 1];
    if (hasFlip && th > flip && runs.length === 1) {
      current.push(flip);
      runs.push([flip]);
    }
    runs[runs.length - 1].push(th);
  }

  const frame: RibbonFrame = { back: '', front: '' };
  for (const run of runs) {
    if (run.length < 2) continue;
    const mid = (run[0] + run[run.length - 1]) / 2;
    frame[Math.cos(mid) < 0 ? 'back' : 'front'] = outline(run, head, maxWidth);
  }
  return frame;
}

const frameCache = new Map<number, RibbonFrame[]>();

/** All frames of one loop for a ribbon width, computed once and shared. */
export function getRibbonFrames(maxWidth: number): RibbonFrame[] {
  let frames = frameCache.get(maxWidth);
  if (!frames) {
    frames = Array.from({ length: FRAMES }, (_, i) => buildFrame(i / FRAMES, maxWidth));
    frameCache.set(maxWidth, frames);
  }
  return frames;
}

type FrameListener = (frameIndex: number) => void;
const listeners = new Set<FrameListener>();
let rafId = 0;

function tick(now: number) {
  const index = Math.floor(((now % LOOP_MS) / LOOP_MS) * FRAMES);
  listeners.forEach((listener) => listener(index));
  rafId = requestAnimationFrame(tick);
}

/**
 * One shared rAF loop for every mounted loader, timed by performance.now() so all
 * loaders (and the pre-React splash) stay in phase. Returns the unsubscribe function.
 */
export function subscribeRibbonFrames(listener: FrameListener): () => void {
  listeners.add(listener);
  if (!rafId) rafId = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}
