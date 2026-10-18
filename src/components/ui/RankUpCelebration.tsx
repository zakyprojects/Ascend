import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Compass } from 'lucide-react';
import { Button } from './primitives';
import { TIER_ICONS } from './TierBadge';
import { TIERS } from '@/lib/tiers';
import { useReducedMotion } from '@/lib/motion';
import { celebrationFeedback } from '@/lib/actionFeedback';
import { playRankUpFanfare, rankUpVibration } from '@/lib/rankUpSound';

/**
 * Full-screen rank-up moment: the app blurs, the old rank's badge gathers, (a jump rolls quickly
 * through the ranks in between,) bursts into the new rank's badge and colour, then the
 * congratulations and Continue. Esc or Continue closes; focus stays inside.
 *
 * Intensity follows the new rank: Starter to Trainer clean, Achiever to Expert with rings and
 * sparks, Leader and Master the full show (light rays, orbit, sheen, longer). A jump of two or more
 * ranks is one level grander. Reduced motion: a plain crossfade, no particles.
 */

type Level = 0 | 1 | 2 | 3;

export interface RankUpCelebrationProps {
  /** Tier indexes (tiers.ts): the rank before and the rank reached. */
  from: number;
  to: number;
  seasonPoints: number;
  onClose: () => void;
  /** Play the fanfare whatever the user's tick feedback choice (the gallery). */
  forceSound?: boolean;
}

function levelFor(from: number, to: number): Level {
  const base = to >= 7 ? 2 : to >= 4 ? 1 : 0;
  return Math.min(3, base + (to - from >= 2 ? 1 : 0)) as Level;
}

/** Timings in ms from the overlay opening. */
function timeline(level: Level, rollSteps: number, reduced: boolean) {
  if (reduced) return { chargeAt: 0, charge: 0, step: 0, burstAt: 700, textAt: 900, hitOffset: 0 };
  const chargeAt = level >= 2 ? 800 : 650;
  const charge = [380, 460, 620, 620][level];
  const step = level === 3 ? 115 : 150;
  const burstAt = chargeAt + charge + rollSteps * step;
  const textAt = burstAt + [420, 520, 700, 760][level];
  // The fanfare's hit (rankUpSound: arpeggio of 4 + level notes) lands with the burst.
  const hitOffset = 20 + (4 + level) * (level >= 2 ? 75 : 85);
  return { chargeAt, charge, step, burstAt, textAt, hitOffset };
}

/** Repeatable pseudo-random 0..1 per spark, so a render never reshuffles them. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const SPARKS: Record<Level, number> = { 0: 0, 1: 16, 2: 26, 3: 34 };
const RINGS: Record<Level, number> = { 0: 1, 1: 2, 2: 3, 3: 4 };

function tierVars(index: number): CSSProperties {
  const tier = TIERS[index];
  const key = tier.name.toLowerCase();
  return {
    '--ru-glow': tier.color,
    '--ru-text': `var(--rank-${key}-text)`,
    '--ru-bg': `var(--rank-${key}-bg)`,
    '--ru-border': `var(--rank-${key}-border)`,
  } as CSSProperties;
}

function BadgeFace({ index, className = '', style }: { index: number; className?: string; style?: CSSProperties }) {
  const Icon = TIER_ICONS[TIERS[index].icon] ?? Compass;
  return (
    <div
      className={`rankup-badge absolute inset-0 rounded-[32px] flex items-center justify-center ${className}`}
      style={{ ...tierVars(index), ...style }}
    >
      <Icon size={56} strokeWidth={1.75} aria-hidden="true" />
    </div>
  );
}

export function RankUpCelebration({ from, to, seasonPoints, onClose, forceSound = false }: RankUpCelebrationProps) {
  const reduced = useReducedMotion();
  // Fixed for the overlay's life: a theme or motion change mid-show does not restart it.
  const [setup] = useState(() => {
    const level = levelFor(from, to);
    const between = Array.from({ length: Math.max(0, to - from - 1) }, (_, i) => from + 1 + i);
    return { level, between, times: timeline(level, between.length, reduced), reduced };
  });
  const { level, between, times } = setup;
  const isReduced = setup.reduced;

  // 'gather' shows the old badge (and any rolled ranks), 'burst' the new one, 'settled' the text.
  const [phase, setPhase] = useState<'intro' | 'gather' | 'burst' | 'settled'>('intro');
  const [rolled, setRolled] = useState(-1);
  const [exiting, setExiting] = useState(false);
  const titleId = useId();
  const descId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, Math.max(0, ms)));
    if (!isReduced) {
      at(times.chargeAt, () => setPhase('gather'));
      between.forEach((_, i) => at(times.chargeAt + times.charge + i * times.step, () => setRolled(i)));
    }
    at(times.burstAt, () => setPhase('burst'));
    at(times.textAt, () => setPhase('settled'));
    at(times.burstAt - times.hitOffset, () =>
      celebrationFeedback((ctx, peak) => playRankUpFanfare(ctx, peak, level), rankUpVibration(level), forceSound)
    );
    return () => timers.forEach(clearTimeout);
  }, [times, between, level, isReduced, forceSound]);

  const close = () => {
    if (exiting) return;
    if (isReduced) return onCloseRef.current();
    setExiting(true);
    setTimeout(() => onCloseRef.current(), 260);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Dialog behaviour: page scroll locked, focus held inside, Esc closes (before any dialog under it).
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        (continueRef.current ?? rootRef.current)?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (phase === 'settled') continueRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const landed = phase === 'burst' || phase === 'settled';
  const shownBefore = rolled >= 0 ? between[rolled] : from;
  const toTier = TIERS[to];
  const isMaster = to === TIERS.length - 1;
  const jump = to - from;

  const sparks = Array.from({ length: SPARKS[level] }, (_, i) => {
    const angle = ((i + noise(i, 1) * 0.6) / SPARKS[level]) * Math.PI * 2;
    const distance = 110 + noise(i, 2) * (level >= 2 ? 150 : 100);
    const size = 3 + Math.round(noise(i, 3) * (level >= 2 ? 5 : 3));
    return {
      key: i,
      diamond: i % 3 === 0,
      style: {
        width: size,
        height: size,
        '--ru-x': `${Math.cos(angle) * distance}px`,
        '--ru-y': `${Math.sin(angle) * distance}px`,
        '--ru-dur': `${900 + Math.round(noise(i, 4) * (level >= 2 ? 900 : 500))}ms`,
        '--ru-delay': `${Math.round(noise(i, 5) * 160)}ms`,
        '--ru-spark': i % 2 === 0 ? 'var(--ru-glow)' : isMaster || level >= 2 ? '#fff7d6' : 'var(--ru-text)',
      } as CSSProperties,
    };
  });

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      className={`fixed inset-0 flex items-center justify-center overflow-hidden outline-none px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
        exiting ? 'rankup-exit pointer-events-none' : ''
      }`}
      style={{ zIndex: 'calc(var(--z-blocking) + 10)', ...tierVars(to) }}
    >
      <div aria-hidden="true" className="rankup-backdrop absolute inset-0 animate-enter-fade" />
      {landed && !isReduced && level >= 1 && <div aria-hidden="true" className="rankup-wash absolute inset-0" />}

      <div className="relative flex flex-col items-center text-center w-full max-w-sm">
        {/* The badge stage. */}
        <div aria-hidden="true" className="relative w-60 h-60 flex items-center justify-center">
          {landed && !isReduced && (
            <>
              {level >= 2 && <div className="rankup-rays absolute w-[34rem] h-[34rem] rounded-full pointer-events-none" />}
              <div className="rankup-halo absolute w-64 h-64 rounded-full" />
              <div className="rankup-flash absolute w-32 h-32 rounded-full" style={{ opacity: level === 0 ? 0.6 : 1 }} />
              {Array.from({ length: RINGS[level] }, (_, i) => (
                <div
                  key={i}
                  className="rankup-ring absolute w-32 h-32 rounded-full"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
              {sparks.map((spark) => (
                <span
                  key={spark.key}
                  className={`rankup-spark absolute rounded-full ${spark.diamond ? 'rankup-spark-diamond' : ''}`}
                  style={spark.style}
                />
              ))}
              {level >= 2 && <div className="rankup-orbit absolute w-48 h-48 rounded-full" />}
            </>
          )}
          {phase === 'gather' && rolled < 0 && (
            <div
              className="rankup-gather absolute w-32 h-32 rounded-[36px]"
              style={{ ...tierVars(between[0] ?? to), '--ru-charge': `${times.charge}ms` } as CSSProperties}
            />
          )}

          <div className="relative w-[7.5rem] h-[7.5rem]">
            {isReduced ? (
              <>
                <BadgeFace index={from} style={{ opacity: landed ? 0 : 1 }} />
                <BadgeFace index={to} className={landed ? 'rankup-badge-landed' : ''} style={{ opacity: landed ? 1 : 0 }} />
              </>
            ) : landed ? (
              <div className="rankup-pop absolute inset-0">
                <BadgeFace index={to} className="rankup-badge-landed overflow-hidden" />
                {level >= 2 && (
                  <div className="absolute inset-0 rounded-[32px] overflow-hidden">
                    <div
                      className="rankup-sheen absolute inset-0"
                      style={{ '--ru-sheen': isMaster ? 'rgba(255, 236, 170, 0.75)' : 'rgba(255, 255, 255, 0.55)' } as CSSProperties}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div
                key={rolled}
                className={`absolute inset-0 ${phase === 'intro' ? 'rankup-in' : rolled >= 0 ? 'rankup-flip' : 'rankup-charge'}`}
                style={{ '--ru-charge': `${times.charge}ms`, '--ru-step': `${times.step}ms` } as CSSProperties}
              >
                <BadgeFace index={shownBefore} className={rolled >= 0 ? 'rankup-badge-landed' : ''} />
              </div>
            )}
          </div>
        </div>

        {/* Congratulations: in the tree from the start for screen readers, shown once the badge lands. */}
        <div className={`mt-4 w-full flex flex-col items-center ${isReduced ? 'rankup-fade' : ''} ${phase === 'settled' ? '' : 'opacity-0'}`}>
          <p
            className={`text-sm font-semibold ${phase === 'settled' && !isReduced ? 'rankup-rise' : ''}`}
            style={{ color: 'var(--ru-text)' }}
          >
            Rank up!
          </p>
          <h2
            id={titleId}
            className={`mt-1 font-serif text-content-primary text-[2.5rem] sm:text-[3rem] leading-[1.05] tracking-[-0.01em] ${
              phase === 'settled' && !isReduced ? 'rankup-rise' : ''
            }`}
            style={{ '--ru-delay': '70ms' } as CSSProperties}
          >
            You&apos;re now <span style={{ color: 'var(--ru-text)' }}>{toTier.name}</span>
          </h2>
          <p
            id={descId}
            className={`mt-2 text-sm text-content-secondary figure ${phase === 'settled' && !isReduced ? 'rankup-rise' : ''}`}
            style={{ '--ru-delay': '140ms' } as CSSProperties}
          >
            {seasonPoints.toLocaleString()} points this season
            {jump >= 2 && ` · up ${jump} ranks`}
          </p>
          <div
            className={`mt-7 w-full flex justify-center ${phase === 'settled' && !isReduced ? 'rankup-rise' : ''}`}
            style={{ '--ru-delay': '220ms' } as CSSProperties}
          >
            <Button
              ref={continueRef}
              onClick={close}
              disabled={phase !== 'settled'}
              className="w-full max-w-[16rem]"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
