import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * "The Ascent": the living backdrop behind every page, and Ascend's idea in one picture. A night
 * range sits along the bottom of the screen; up the face of the nearest mountain runs a switchback
 * trail cut into steps, and a torch climbs it one step at a time, lighting the path it has already
 * walked. At the summit a beacon answers, then the climb begins again. Embers drift upward the
 * whole time. The message without a word: progress is a step a day, and the steps you have taken
 * stay lit.
 *
 * Pointer: over blank page space near the range, the nearest step lifts and glows (nothing happens
 * over a card, a control or a dialog). Torch and steps are moved imperatively, a transform per
 * frame at 30fps, with no React state. Paused in a background tab; reduced motion shows a still
 * frame with the torch half way and no embers; reduced transparency hides it (index.css).
 */

const W = 1600;
const H = 900;
const STEPS = 30;
const STEP_MS = 1500; // one step: move, then a short rest
const MOVE_SHARE = 0.62;
const SUMMIT_MS = 3200;
const FPS = 30;
const UI_SELECTOR =
  '.card,button,a,input,select,textarea,label,nav,header,aside,[role=dialog],[role=menu],[role=tablist],.glass';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ridge line from left to right through the given peaks, roughened with seeded noise. */
function ridge(peaks: [number, number][], seed: number, rough: number): string {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x0, y0] = peaks[i];
    const [x1, y1] = peaks[i + 1];
    const n = Math.max(2, Math.round((x1 - x0) / 38));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const edge = Math.min(t, 1 - t) * 2; // calm near the peaks, rough on the slopes
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (r() - 0.5) * rough * edge]);
    }
  }
  pts.push(peaks[peaks.length - 1]);
  return `M0 ${H} ` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L${W} ${H} Z`;
}

const SUMMIT: [number, number] = [1188, 466];
const FAR = ridge([[0, 640], [210, 560], [430, 620], [640, 540], [900, 610], [1120, 520], [1380, 590], [1600, 548]], 7, 26);
const MID = ridge([[0, 700], [260, 640], [520, 700], [760, 626], [980, 690], [1300, 640], [1600, 690]], 11, 22);
const NEAR = ridge([[0, 830], [380, 720], [760, 610], SUMMIT, [1400, 650], [1600, 760]], 23, 14);

/** Switchback treads from the foot of the near mountain to its summit: LEGS diagonal legs that
 *  turn at each end, narrowing as the mountain does, STEPS / LEGS treads per leg. */
const LEGS = 6;
const TRAIL: [number, number][] = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = i / STEPS;
  const perLeg = STEPS / LEGS;
  const leg = Math.min(LEGS - 1, Math.floor(i / perLeg));
  const along = (i - leg * perLeg) / perLeg;
  const cx = 520 + (SUMMIT[0] - 520) * t;
  const half = 26 + 130 * (1 - t);
  const dir = leg % 2 === 0 ? 1 : -1;
  return [cx + dir * half * (along * 2 - 1) * (i === STEPS ? 0 : 1), 868 + (SUMMIT[1] + 14 - 868) * t];
});
const TRAIL_PATH = TRAIL.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
const SEG = TRAIL.slice(1).map(([x, y], i) => Math.hypot(x - TRAIL[i][0], y - TRAIL[i][1]));
const TRAIL_LEN = SEG.reduce((a, b) => a + b, 0);

const PORTRAIT_VIEWBOX = '330 330 940 570';

const STARS = (() => {
  const r = rng(3);
  return Array.from({ length: 46 }, (_, i) => ({ x: r() * W, y: r() * 420, s: 0.6 + r() * 1.1, tw: i % 5 === 0 }));
})();
const EMBERS = (() => {
  const r = rng(5);
  return Array.from({ length: 16 }, () => ({ x: 120 + r() * 1360, s: 1 + r() * 1.6, dur: 16 + r() * 14, delay: -r() * 30 }));
})();

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function AscentBackdrop() {
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = rootRef.current;
    if (!svg) return;
    const torch = svg.querySelector<SVGGElement>('.ascent-torch')!;
    const lit = svg.querySelector<SVGPathElement>('.ascent-lit')!;
    const treads = Array.from(svg.querySelectorAll<SVGRectElement>('.ascent-tread'));

    // Tall screens (phones) would crop the climb to its middle; frame the whole trail instead.
    const portrait = window.matchMedia('(max-aspect-ratio: 1/1)');
    const frameScene = () => {
      svg.setAttribute('viewBox', portrait.matches ? PORTRAIT_VIEWBOX : `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', portrait.matches ? 'xMidYMax meet' : 'xMidYMax slice');
    };
    frameScene();
    portrait.addEventListener('change', frameScene);

    const place = (progress: number) => {
      // progress in steps (0..STEPS); position along the polyline by step, not by length.
      const i = Math.max(0, Math.min(STEPS - 1, Math.floor(progress)));
      const f = progress - i;
      const [x0, y0] = TRAIL[i];
      const [x1, y1] = TRAIL[i + 1];
      torch.setAttribute('transform', `translate(${(x0 + (x1 - x0) * f).toFixed(1)} ${(y0 + (y1 - y0) * f).toFixed(1)})`);
      const walked = SEG.slice(0, i).reduce((a, b) => a + b, 0) + SEG[i] * f;
      lit.style.strokeDashoffset = String(TRAIL_LEN - walked);
      treads.forEach((t, k) => t.toggleAttribute('data-lit', k <= progress));
    };

    if (prefersReducedMotion()) {
      place(STEPS * 0.5);
      return () => portrait.removeEventListener('change', frameScene);
    }

    let start = performance.now();
    let frame = 0;
    let lastPaint = 0;
    let pausedAt = 0;
    const cycle = STEPS * STEP_MS + SUMMIT_MS;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastPaint < 1000 / FPS) return;
      lastPaint = now;
      // rAF's timestamp is the frame start, which can precede `start` on the first frame.
      const t = Math.max(0, now - start) % cycle;
      if (t < STEPS * STEP_MS) {
        const step = Math.floor(t / STEP_MS);
        const within = (t % STEP_MS) / STEP_MS;
        place(step + easeInOut(Math.min(1, within / MOVE_SHARE)));
        svg.removeAttribute('data-summit');
        torch.style.opacity = t < 600 ? String(t / 600) : '1';
      } else {
        place(STEPS);
        svg.setAttribute('data-summit', '');
        const s = t - STEPS * STEP_MS;
        torch.style.opacity = s > SUMMIT_MS - 700 ? String(Math.max(0, (SUMMIT_MS - s) / 700)) : '1';
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        pausedAt = performance.now();
      } else if (!frame) {
        if (pausedAt) start += performance.now() - pausedAt;
        frame = requestAnimationFrame(tick);
      }
    };

    // Pointer: blank space near the range lifts the nearest tread.
    let hot: SVGRectElement | null = null;
    let pending: PointerEvent | null = null;
    let hoverFrame = 0;
    const setHot = (next: SVGRectElement | null) => {
      if (hot === next) return;
      hot?.removeAttribute('data-hot');
      next?.setAttribute('data-hot', '');
      hot = next;
    };
    const hover = () => {
      hoverFrame = 0;
      const e = pending;
      if (!e) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest(UI_SELECTOR)) return setHot(null);
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      let best = -1;
      let bestD = 90;
      TRAIL.forEach(([x, y], k) => {
        const d = Math.hypot(x - p.x, (y - p.y) * 0.6);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      setHot(best >= 0 ? treads[best] : null);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pending = e;
      if (!hoverFrame) hoverFrame = requestAnimationFrame(hover);
    };

    frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
      portrait.removeEventListener('change', frameScene);
    };
  }, []);

  return (
    <svg
      ref={rootRef}
      aria-hidden="true"
      className="ascent"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="ascent-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: 'var(--ascent-far-a)' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: '0' }} />
        </linearGradient>
        <linearGradient id="ascent-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: 'var(--ascent-mid-a)' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: '0.01' }} />
        </linearGradient>
        <linearGradient id="ascent-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: 'var(--ascent-near-a)' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--ascent-ridge))', stopOpacity: '0.02' }} />
        </linearGradient>
        <radialGradient id="ascent-glow">
          <stop offset="0" style={{ stopColor: 'rgb(var(--ascent-torch))', stopOpacity: '0.55' }} />
          <stop offset="0.35" style={{ stopColor: 'rgb(var(--ascent-torch))', stopOpacity: '0.18' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--ascent-torch))', stopOpacity: '0' }} />
        </radialGradient>
      </defs>

      <g className="ascent-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.s} className={s.tw ? 'ascent-twinkle' : undefined} style={{ animationDelay: `${-i * 0.7}s` }} />
        ))}
      </g>

      <path d={FAR} fill="url(#ascent-far)" />
      <path d={MID} fill="url(#ascent-mid)" />
      <path d={NEAR} fill="url(#ascent-near)" className="ascent-near" />

      <path d={TRAIL_PATH} className="ascent-trail" />
      <path d={TRAIL_PATH} className="ascent-lit" style={{ strokeDasharray: TRAIL_LEN, strokeDashoffset: TRAIL_LEN }} />
      {TRAIL.map(([x, y], i) => (
        <rect key={i} className="ascent-tread" x={x - 9} y={y - 1.5} width={18} height={3} rx={1.5} />
      ))}

      <g className="ascent-beacon" transform={`translate(${SUMMIT[0]} ${SUMMIT[1] - 6})`}>
        <circle r="46" fill="url(#ascent-glow)" className="ascent-beacon-glow" />
        <path d="M0 0 V-22 M0 -22 L13 -17 L0 -12" className="ascent-flag" />
      </g>

      <g className="ascent-torch">
        <circle r="34" fill="url(#ascent-glow)" className="ascent-torch-glow" />
        <circle r="2.6" className="ascent-torch-core" />
      </g>

      <g className="ascent-embers">
        {EMBERS.map((e, i) => (
          <circle key={i} cx={e.x} cy={H - 20} r={e.s} style={{ animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s` }} />
        ))}
      </g>
    </svg>
  );
}
