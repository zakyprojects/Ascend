import { useRef } from 'react';
import { TIERS, getCurrentTier, getNextTier, getProgressToNextTier, getTierIndex } from '@/lib/tiers';
import { useIntroMotion, useSeen } from '@/lib/motion';

// Drawing space. The ladder is a staircase: each tier is a ledge, then a rise to the next one.
const W = 640;
const H = 76;
const PAD_X = 6;
const TOP = 12;
const BOTTOM = 64;
const LEDGE = 0.58; // share of each step that is flat ledge; the rest is the climb to the next tier

const steps = TIERS.length - 1;
const stepW = (W - PAD_X * 2) / steps;
const ledgeY = (i: number) => BOTTOM - (i / steps) * (BOTTOM - TOP);
const ledgeX = (i: number) => PAD_X + i * stepW;

// One path through every tier: ledge, rise, ledge, ... ending on the top ledge.
const LADDER_PATH = TIERS.map((_, i) => {
  const x = ledgeX(i);
  const y = ledgeY(i);
  if (i === 0) return `M ${x} ${y}`;
  const riseStart = ledgeX(i - 1) + stepW * LEDGE;
  return `L ${riseStart.toFixed(1)} ${ledgeY(i - 1).toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(' ') + ` L ${(W - PAD_X).toFixed(1)} ${ledgeY(steps).toFixed(1)}`;

/** Where you stand on the ladder: along your tier's ledge first, then up the rise as you near the next tier. */
function positionOnLadder(tierIndex: number, fraction: number): { x: number; y: number } {
  if (tierIndex >= steps) return { x: W - PAD_X, y: ledgeY(steps) };
  const x = ledgeX(tierIndex) + fraction * stepW;
  if (fraction <= LEDGE) return { x, y: ledgeY(tierIndex) };
  const climb = (fraction - LEDGE) / (1 - LEDGE);
  return { x, y: ledgeY(tierIndex) + (ledgeY(tierIndex + 1) - ledgeY(tierIndex)) * climb };
}

/**
 * Dashboard hero signature: the nine ranks drawn as one climb, the stretch already climbed in
 * emerald and the rest as a quiet dotted path. The climbed part draws in once when it comes into
 * view (instant with reduced motion, like ProgressRing).
 */
export function AscentProfile({ totalPoints }: { totalPoints: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, useIntroMotion());

  const tier = getCurrentTier(totalPoints);
  const next = getNextTier(totalPoints);
  const index = getTierIndex(totalPoints);
  const { percent } = getProgressToNextTier(totalPoints);
  const here = positionOnLadder(index, next ? percent / 100 : 1);
  const climbedWidth = seen ? here.x : 0;

  return (
    <div ref={ref} className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="stat-label">Rank</div>
          <div className="font-display text-lg font-bold" style={{ color: `var(--rank-${tier.name.toLowerCase()}-text)` }}>
            {tier.name}
          </div>
        </div>
        <div className="text-right text-xs text-content-muted tabular-nums">
          {next ? (
            <>
              <span className="text-content-secondary font-medium">{(next.minPoints - totalPoints).toLocaleString()}</span> to {next.name}
            </>
          ) : (
            'Top of the ladder'
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full overflow-visible"
        role="img"
        aria-label={next ? `${tier.name}, ${percent}% of the way to ${next.name}` : `${tier.name}, top rank`}
      >
        <defs>
          <clipPath id="ascent-climbed">
            <rect
              x="0"
              y="0"
              height={H}
              width={climbedWidth}
              className="transition-[width] duration-slow ease-emphasized motion-reduce:transition-none"
            />
          </clipPath>
        </defs>
        <path d={LADDER_PATH} fill="none" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" className="stroke-current text-content-subtle" />
        {TIERS.map((t, i) => (
          <circle key={t.name} cx={ledgeX(i)} cy={ledgeY(i)} r="2" className="fill-current text-content-subtle" />
        ))}
        <path
          d={LADDER_PATH}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#ascent-climbed)"
          className="stroke-current text-primary-500"
        />
        <circle cx={here.x} cy={here.y} r="9" className={`fill-current text-primary-500/20 transition-opacity duration-slow ${seen ? 'opacity-100' : 'opacity-0'}`} />
        <circle
          cx={here.x}
          cy={here.y}
          r="4.5"
          className={`fill-current text-primary-400 transition-opacity duration-slow ${seen ? 'opacity-100' : 'opacity-0'}`}
        />
      </svg>

      <div className="mt-1 flex justify-between text-2xs text-content-disabled">
        <span>{TIERS[0].name}</span>
        <span>{TIERS[steps].name}</span>
      </div>
    </div>
  );
}
