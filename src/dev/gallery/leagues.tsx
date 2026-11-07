import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { RankUpCelebration } from '@/components/ui/RankUpCelebration';
import { TIERS } from '@/lib/tiers';
import { Section } from './shared';

// Every single step plus the jumps Zakria asked for; points shown are the new rank's exact threshold.
const RANK_UP_DEMOS: Array<[number, number]> = [
  ...TIERS.slice(1).map((_, i): [number, number] => [i, i + 1]),
  [0, 4],
  [0, 7],
  [0, 8],
  [6, 8],
];

function RankUpDemo() {
  const [playing, setPlaying] = useState<[number, number] | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {RANK_UP_DEMOS.map(([from, to]) => (
          <Button key={`${from}-${to}`} variant="secondary" onClick={() => setPlaying([from, to])} className="justify-start">
            <Play size={14} aria-hidden="true" />
            {TIERS[from].name} → {TIERS[to].name}
            {to - from >= 2 && <span className="text-2xs font-medium text-content-muted">jump</span>}
          </Button>
        ))}
      </div>
      {playing && (
        <RankUpCelebration
          key={playing.join('-')}
          from={playing[0]}
          to={playing[1]}
          seasonPoints={TIERS[playing[1]].minPoints}
          onClose={() => setPlaying(null)}
          forceSound
        />
      )}
    </div>
  );
}

export function LeaguesGroup() {
  return (
    <>
      <Section id="rank-up">
        <RankUpDemo />
      </Section>
    </>
  );
}
