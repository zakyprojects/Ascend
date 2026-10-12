import { growthTracePath } from '@/components/ui/growthTrace';

/**
 * Geometry of the auth page's climb (ClimbTrail): a staircase whose step corners sit on the loading
 * screens' growth trace (growthTrace.ts), so the sign-in climb is the same line the app boots on.
 *
 * The trail runs flat along the trace's level line to base camp, then climbs one tread per step.
 * Stations are where the climber can stand: 0 = base camp, 1..steps = one per valid field,
 * steps + 1 = the summit (reached on submit).
 */

export interface TrailPoint {
  x: number;
  y: number;
}

export interface ClimbGeometry {
  viewBox: string;
  /** The whole trail: flat approach, then the staircase. */
  d: string;
  /** Corners of `d` in order, and the path length at each. */
  vertices: TrailPoint[];
  lengths: number[];
  total: number;
  /** Path length at each station (index = station). */
  stations: number[];
  level: number;
  baseCamp: TrailPoint;
  /** Foot of the summit flag (the far end of the top tread). */
  summit: TrailPoint;
}

const VB_W = 400;
// The trace is laid out on a tall screen so its rise is steep enough to read as stairs.
const TRACE_H = 600;
const PAD_TOP = 42; // room for the flag above the top tread
const PAD_BOTTOM = 14;
const BASE_CAMP_AT = 0.62; // base camp sits this far along the flat approach

const SVG_NS = 'http://www.w3.org/2000/svg';
const cache = new Map<number, ClimbGeometry>();

/** Points on the trace's climbing curve at equal arc lengths (count + 1 points, lift to top). */
function sampleTraceCurve(d: string, straight: number, count: number): TrailPoint[] {
  // Measured on a hidden, attached path: getPointAtLength is not reliable on detached elements.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  document.body.appendChild(svg);
  try {
    const total = path.getTotalLength();
    const points: TrailPoint[] = [];
    for (let k = 0; k <= count; k++) {
      const p = path.getPointAtLength(straight + ((total - straight) * k) / count);
      points.push({ x: p.x, y: p.y });
    }
    return points;
  } finally {
    svg.remove();
  }
}

/** Trail geometry for a climb with `steps` steps (plus the summit tread). Cached per step count. */
export function climbGeometry(steps: number): ClimbGeometry {
  const n = Math.max(0, Math.round(steps)) + 1; // treads: one per step, plus the summit
  const cached = cache.get(n);
  if (cached) return cached;

  const trace = growthTracePath(VB_W, TRACE_H);
  const level = trace.level;
  const corners = sampleTraceCurve(trace.d, trace.straight, n);
  corners[0] = { x: trace.straight, y: level };

  const vertices: TrailPoint[] = [{ x: 0, y: level }, corners[0]];
  for (let i = 1; i <= n; i++) {
    vertices.push({ x: corners[i - 1].x, y: corners[i].y }, corners[i]);
  }
  const lengths = [0];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    lengths.push(lengths[i - 1] + Math.abs(b.x - a.x) + Math.abs(b.y - a.y)); // segments are axis-aligned
  }

  const baseCamp = { x: corners[0].x * BASE_CAMP_AT, y: level };
  const stations = [baseCamp.x];
  for (let i = 1; i <= n; i++) {
    // Tread i runs along vertices 2i .. 2i+1; the climber stands in its middle.
    stations.push((lengths[2 * i] + lengths[2 * i + 1]) / 2);
  }

  const f = (v: number) => v.toFixed(1);
  const d = vertices.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
  const top = corners[n].y;
  const geometry: ClimbGeometry = {
    viewBox: `0 ${f(top - PAD_TOP)} ${VB_W} ${f(level - top + PAD_TOP + PAD_BOTTOM)}`,
    d,
    vertices,
    lengths,
    total: lengths[lengths.length - 1],
    stations,
    level,
    baseCamp,
    summit: corners[n],
  };
  cache.set(n, geometry);
  return geometry;
}

/** The point `length` along the trail. */
export function pointAtLength(geo: ClimbGeometry, length: number): TrailPoint {
  const { vertices, lengths } = geo;
  const l = Math.min(Math.max(length, 0), geo.total);
  for (let i = 1; i < vertices.length; i++) {
    if (l <= lengths[i] || i === vertices.length - 1) {
      const span = lengths[i] - lengths[i - 1];
      const t = span > 0 ? (l - lengths[i - 1]) / span : 1;
      const a = vertices[i - 1];
      const b = vertices[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return vertices[0];
}

/**
 * Points to pass through going from one length to another: both ends plus every corner between,
 * each with its fraction of the distance (so keyframes on them move at an even pace along the path).
 */
export function pathBetween(geo: ClimbGeometry, from: number, to: number): { point: TrailPoint; offset: number }[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const span = hi - lo;
  const marks = [from, ...geo.lengths.filter((l) => l > lo && l < hi), to];
  if (from > to) marks.splice(1, marks.length - 2, ...marks.slice(1, -1).reverse());
  return marks.map((l) => ({ point: pointAtLength(geo, l), offset: span > 0 ? Math.abs(l - from) / span : 1 }));
}
