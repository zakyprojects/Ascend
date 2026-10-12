import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from '@/lib/motion';
import { ClimbGeometry, climbGeometry, pathBetween, pointAtLength } from './climbGeometry';

export type ClimbPhase = 'idle' | 'submitting' | 'success';
export type ClimbRoute = 'account' | 'guest';

export interface ClimbTrailProps {
  /** How many steps the climb has (one per field that must be valid). */
  steps: number;
  /** How many steps are done (valid fields), 0..steps. */
  progress: number;
  /** 'submitting' sends the climber to the summit; 'success' also plants the flag there. */
  phase: ClimbPhase;
  /**
   * 'climb' (default): the climber on the staircase. 'routes': the signup choice, two routes and no
   * climber; `hoverTrail` draws one of them.
   */
  variant?: 'climb' | 'routes';
  /** Routes variant: 'account' draws the full climb to the summit, 'guest' the short way to base camp. */
  hoverTrail?: ClimbRoute | null;
  className?: string;
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'; // --ease-emphasized
const MOVE_MS = 450;
const DRAW_MS = 500;
const FLAG_MS = 320;
// The climber's ring is the panel's own colour, so the dot reads as cut out of the line.
const RING = 'var(--climb-panel-bg, #112725)';

interface Motion {
  geo: ClimbGeometry;
  from: number;
  to: number;
  anims: Animation[];
}

const translate = (p: { x: number; y: number }) => `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;

/**
 * The auth page's climb: a staircase on the growth trace. The climbed part of the line is emerald,
 * the rest faint; the climber stands on step `progress` and walks along the path when it changes
 * (transform and stroke-dashoffset only). Reduced motion: everything jumps.
 */
export function ClimbTrail({ steps, progress, phase, variant = 'climb', hoverTrail = null, className = '' }: ClimbTrailProps) {
  const geo = useMemo(() => climbGeometry(steps), [steps]);
  const reduced = useReducedMotion();
  const routes = variant === 'routes';

  const station = phase === 'idle' ? Math.min(Math.max(Math.round(progress), 0), steps) : steps + 1;
  const target = routes
    ? hoverTrail === 'account'
      ? geo.total
      : hoverTrail === 'guest'
        ? geo.stations[0]
        : 0
    : geo.stations[station];
  const duration = routes ? DRAW_MS : MOVE_MS;

  const lineRef = useRef<SVGPathElement>(null);
  const climberRef = useRef<SVGGElement>(null);
  const flagRef = useRef<SVGGElement>(null);
  const motion = useRef<Motion | null>(null);

  // React renders the end state; the animations only carry the line and climber there from where
  // they are now (mid-move when interrupted). A new step count or reduced motion jumps.
  useLayoutEffect(() => {
    const prev = motion.current;
    let from = target;
    if (prev && prev.geo === geo && !reduced) {
      from = prev.to;
      const running = prev.anims[0];
      if (running?.playState === 'running') {
        const p = running.effect?.getComputedTiming().progress;
        if (typeof p === 'number') from = prev.from + (prev.to - prev.from) * p;
      }
    }
    prev?.anims.forEach((a) => a.cancel());

    const anims: Animation[] = [];
    const line = lineRef.current;
    if (from !== target && line) {
      const timing: KeyframeAnimationOptions = { duration, easing: EASE };
      anims.push(
        line.animate(
          [{ strokeDashoffset: String(geo.total - from) }, { strokeDashoffset: String(geo.total - target) }],
          timing
        )
      );
      const climber = climberRef.current;
      if (climber) {
        const keyframes = pathBetween(geo, from, target).map(({ point, offset }) => ({ offset, transform: translate(point) }));
        anims.push(climber.animate(keyframes, timing));
      }
    }
    motion.current = { geo, from, to: target, anims };
  }, [geo, target, duration, reduced]);

  useEffect(() => () => motion.current?.anims.forEach((a) => a.cancel()), []);

  const planted = !routes && phase === 'success';
  // The flag plants once the climber has arrived.
  useEffect(() => {
    const flag = flagRef.current;
    if (!planted || !flag || reduced) return;
    const running = motion.current?.anims[0];
    const elapsed = running?.playState === 'running' ? Number(running.currentTime ?? 0) : duration;
    const anim = flag.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
      duration: FLAG_MS,
      delay: Math.max(0, duration - elapsed),
      easing: EASE,
      fill: 'backwards',
    });
    return () => anim.cancel();
  }, [planted, reduced, duration]);

  const { level, baseCamp, summit } = geo;
  const accountOn = routes && hoverTrail === 'account';
  const guestOn = routes && hoverTrail === 'guest';
  const [vbX, , vbW] = geo.viewBox.split(' ').map(Number);

  return (
    <svg
      viewBox={geo.viewBox}
      preserveAspectRatio="xMinYMax meet"
      className={`block w-full h-auto overflow-visible ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Where you stay if nothing changes: the trace's dotted level line. */}
      <line
        x1={vbX}
        x2={vbX + vbW}
        y1={level}
        y2={level}
        className="stroke-primary-200/15"
        strokeWidth={1.5}
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      <path d={geo.d} fill="none" className="stroke-primary-200/20" strokeWidth={2.5} strokeLinejoin="round" />
      <path
        ref={lineRef}
        d={geo.d}
        fill="none"
        className="stroke-primary-400"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeDasharray={`${geo.total} ${geo.total}`}
        style={{ strokeDashoffset: geo.total - target }}
      />

      {routes && (
        <g className="font-sans" fontSize={12} textAnchor="middle">
          <g className={`transition-colors duration-base ${guestOn ? 'stroke-primary-400' : 'stroke-primary-200/40'}`} fill="none" strokeWidth={2} strokeLinejoin="round">
            <path d={`M${baseCamp.x - 11} ${level} L${baseCamp.x} ${level - 16} L${baseCamp.x + 11} ${level}`} />
            <path d={`M${baseCamp.x} ${level - 16} V${level}`} strokeWidth={1.5} />
          </g>
          <text
            x={baseCamp.x}
            y={level - 26}
            className={`transition-colors duration-base ${guestOn ? 'fill-primary-50' : 'fill-primary-200/60'}`}
          >
            Guest
          </text>
          <text
            x={summit.x - 18}
            y={summit.y - 12}
            textAnchor="end"
            className={`transition-colors duration-base ${accountOn ? 'fill-primary-50' : 'fill-primary-200/60'}`}
          >
            Account
          </text>
        </g>
      )}

      {(routes || planted) && (
        <g
          ref={flagRef}
          className={`transition-colors duration-base ${routes && !accountOn ? 'text-primary-200/40' : 'text-primary-400'}`}
          style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
        >
          <line x1={summit.x - 6} x2={summit.x - 6} y1={summit.y} y2={summit.y - 32} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <path
            d={`M${summit.x - 6} ${summit.y - 32} L${summit.x + 12} ${summit.y - 26.5} L${summit.x - 6} ${summit.y - 21} Z`}
            fill={routes ? 'none' : 'currentColor'}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </g>
      )}

      {!routes && (
        <g ref={climberRef} style={{ transform: translate(pointAtLength(geo, target)) }}>
          <circle r={7} className="fill-primary-300" stroke={RING} strokeWidth={3} />
        </g>
      )}
    </svg>
  );
}
