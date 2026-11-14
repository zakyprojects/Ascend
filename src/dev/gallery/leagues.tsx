import { useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { Button, cx } from '@/components/ui/primitives';
import { RankUpCelebration } from '@/components/ui/RankUpCelebration';
import { TierBadge } from '@/components/ui/TierBadge';
import { RankChip } from '@/components/ui/RankChip';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { CompetitorProfileModal } from '@/components/ui/CompetitorProfileModal';
import { RankNumber, YouTag } from './appCopies';
import { TIERS, getCurrentTier } from '@/lib/leagues/tiers';
import type { MemberDetails } from '@/lib/leagues/useMemberDetails';
import type { LeagueCompetitor, MemberCard } from '@/types';
import { Caption, Section } from './shared';

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

const TIER_SIZES = ['sm', 'md', 'lg', 'xl'] as const;

function TierBadgesDemo() {
  return (
    <div className="space-y-4">
      {TIER_SIZES.map((size) => (
        <div key={size} className="space-y-1.5">
          <Caption>size=&quot;{size}&quot;{size === 'md' ? ' with showName' : ''}</Caption>
          <div className="flex flex-wrap items-center gap-3">
            {TIERS.map((tier) => (
              <TierBadge key={tier.name} totalPoints={tier.minPoints} size={size} showName={size === 'md'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RankChipDemo() {
  const mid = Math.round((TIERS[3].minPoints + TIERS[4].minPoints) / 2);
  const top = TIERS[TIERS.length - 1].minPoints + 1234;
  return (
    <div className="flex flex-wrap items-start gap-6">
      {[
        { label: 'Start (0)', points: 0 },
        { label: `Mid-rank (${mid})`, points: mid },
        { label: `Top rank (${top})`, points: top },
      ].map((c) => (
        <div key={c.label} className="w-60 space-y-1.5">
          <Caption>{c.label}</Caption>
          <div className="rounded-xl border border-overlay-subtle bg-bg-800 p-2">
            <RankChip seasonPoints={c.points} />
          </div>
        </div>
      ))}
    </div>
  );
}

const BOARD: Array<LeagueCompetitor & { season: number }> = [
  { id: 'c1', name: 'sara_k', avatar: '🦊', points: 412, totalPoints: 5400, season: 5400 },
  { id: 'c2', name: 'yahya', avatar: '🐺', points: 388, totalPoints: 3100, season: 3100 },
  { id: 'c3', name: 'zakria', avatar: '🦅', points: 301, totalPoints: 1840, season: 1840, isUser: true },
  { id: 'c4', name: 'a_member_with_a_really_long_username', avatar: '🐢', points: 12, totalPoints: 90, season: 90 },
  { id: 'c5', name: 'newcomer', avatar: '🌱', points: 0, totalPoints: 0, season: 0 },
];

/**
 * The Leagues board row. Its markup is inline in views/Leagues.tsx (no component of its own), so this
 * is a copy of that markup around the real TierBadge and copies of RankNumber and YouTag (appCopies.tsx): keep it in step.
 */
function LeagueRowsDemo() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <Caption>Board row (Weekly): a place, You, tier, points; 0 points has no place (–)</Caption>
        <ol className="card divide-y divide-overlay-subtle overflow-hidden p-0">
          {BOARD.map((c, idx) => {
            const rank = Math.round(c.points) > 0 ? idx + 1 : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-label={`${c.name}${c.isUser ? ', you' : ''}, ${getCurrentTier(c.season).name}`}
                  className={cx(
                    'group flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors sm:gap-4 sm:px-5',
                    c.isUser ? 'bg-overlay-subtle hover:bg-overlay-default' : 'hover:bg-overlay-subtle'
                  )}
                >
                  <RankNumber rank={rank} />
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-overlay-subtle text-base sm:h-10 sm:w-10 sm:text-lg">
                    {c.avatar}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="item-name truncate text-sm !text-content-secondary">{c.name}</span>
                    {c.isUser && <YouTag />}
                  </span>
                  <span aria-hidden="true" className="shrink-0">
                    <TierBadge totalPoints={c.season} size="sm" showName={false} />
                  </span>
                  <span className="min-w-[3.5rem] shrink-0 text-right sm:min-w-[4.5rem]">
                    <span className="figure text-sm text-content-primary">{c.points.toLocaleString()}</span>
                    <span className="ml-1 text-2xs text-content-muted">pts</span>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-content-muted transition-colors group-hover:text-content-secondary" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Caption>Past standings row (archive dialog, season board shows the tier)</Caption>
        <ol className="card divide-y divide-overlay-subtle overflow-hidden p-0">
          {BOARD.slice(0, 4).map((c, idx) => (
            <li key={c.id} className={cx('flex items-center gap-3 p-3', c.isUser && 'bg-overlay-subtle')}>
              <RankNumber rank={idx + 1} />
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-overlay-subtle text-lg">
                {c.avatar}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="item-name truncate text-sm !text-content-secondary">{c.name}</span>
                {c.isUser && <YouTag />}
              </span>
              <TierBadge totalPoints={c.season} size="sm" showName={false} />
              <span className="figure shrink-0 text-sm text-content-primary">{c.season.toLocaleString()} pts</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function LeagueCountdownDemo() {
  return (
    <div className="flex flex-wrap gap-6">
      {(
        [
          ['weekly', 'Weekly resets in'],
          ['monthly', 'Monthly resets in'],
          ['ninetyDay', 'Season ends in'],
        ] as const
      ).map(([type, label]) => (
        <div key={type} className="space-y-1">
          <Caption>{label}</Caption>
          <LeagueCountdown type={type} className="font-mono text-sm text-content-primary" />
        </div>
      ))}
    </div>
  );
}

function card(overrides: Partial<MemberCard> = {}): MemberCard {
  return {
    v: 2,
    season: 1,
    asOf: '2026-11-07',
    from: '2026-11-01',
    days: 7,
    active: 6,
    streak: { days: 6, category: 'Habits' },
    today: { habitsDone: 3 },
    seasonStart: '2026-11-01T00:00:00Z',
    seasonEnd: '2027-01-30T00:00:00Z',
    habits: { done: 31, due: 36 },
    exercise: [
      { name: 'Running', unit: 'km', total: 7.5, days: 3, best: 3.2 },
      { name: 'Push-ups', unit: 'reps', total: 240, days: 5, best: 60 },
      { name: 'Yoga', unit: 'mins', total: 95, days: 2, best: 50 },
    ],
    skills: { minutes: 410, days: 5 },
    reading: { days: 5, booksThisSeason: 1, pages: 214 },
    focus: { minutes: 300, sessions: 6 },
    journal: { days: 4 },
    ...overrides,
  } as MemberCard;
}

type MemberDemoId = 'self' | 'public' | 'loading' | 'failed' | 'private' | 'viewer-private' | 'partner' | 'large' | 'no-card';
const MEMBER_DEMOS: Array<{ id: MemberDemoId; label: string }> = [
  { id: 'self', label: 'You' },
  { id: 'public', label: 'Public member' },
  { id: 'loading', label: 'Loading' },
  { id: 'failed', label: 'Failed' },
  { id: 'private', label: 'Private member' },
  { id: 'viewer-private', label: 'You are private' },
  { id: 'partner', label: 'Partner' },
  { id: 'large', label: 'Large numbers' },
  { id: 'no-card', label: 'No card shared' },
];

const READY = (c: MemberCard | undefined): MemberDetails => ({ status: 'ready', card: c, stats: undefined, seasonHistory: [] });

function memberDemo(id: MemberDemoId): { competitor: LeagueCompetitor; seasonPoints: number; details: MemberDetails; viewerIsPublic?: boolean; isPartner?: boolean } {
  const base: LeagueCompetitor = { id: 'm-' + id, name: 'sara_k', avatar: '🦊', points: 412, totalPoints: 5400, isProfilePublic: true, isRealUser: true };
  switch (id) {
    case 'self':
      return { competitor: { ...base, name: 'zakria', avatar: '🦅', isUser: true, points: 301 }, seasonPoints: 1840, details: READY(card()) };
    case 'loading':
      return { competitor: base, seasonPoints: 5400, details: { status: 'loading' } };
    case 'failed':
      return { competitor: base, seasonPoints: 5400, details: { status: 'failed' } };
    case 'private':
      return { competitor: { ...base, isProfilePublic: false }, seasonPoints: 5400, details: READY(undefined) };
    case 'viewer-private':
      return { competitor: base, seasonPoints: 5400, details: READY(card()), viewerIsPublic: false };
    case 'partner':
      return { competitor: { ...base, isProfilePublic: false }, seasonPoints: 5400, details: READY(card()), isPartner: true };
    case 'large':
      return {
        competitor: { ...base, points: 128450, totalPoints: 999950 },
        seasonPoints: 999950,
        details: READY(
          card({
            days: 90,
            active: 88,
            streak: { days: 88, category: 'Habits' },
            habits: { done: 12500, due: 12800 },
            exercise: [
              { name: 'Push-ups', unit: 'reps', total: 125000, days: 88, best: 2500 },
              { name: 'Cycling', unit: 'km', total: 10250.5, days: 70, best: 320 },
            ],
            skills: { minutes: 99999, days: 88 },
            reading: { days: 80, booksThisSeason: 42, pages: 18750 },
            focus: { minutes: 45000, sessions: 900 },
          })
        ),
      };
    case 'no-card':
      return { competitor: base, seasonPoints: 5400, details: READY(undefined) };
    default:
      return { competitor: base, seasonPoints: 5400, details: READY(card()) };
  }
}

function MemberCardDemo() {
  const [open, setOpen] = useState<MemberDemoId | null>(null);
  const demo = memberDemo(open ?? 'public');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {MEMBER_DEMOS.map((d) => (
          <Button key={d.id} size="sm" variant="secondary" onClick={() => setOpen(d.id)}>
            {d.label}
          </Button>
        ))}
      </div>
      <p className="text-micro text-content-muted">Numbers from 10,000 show compact (12.5k); the period label is This week.</p>
      <CompetitorProfileModal
        competitor={open ? demo.competitor : null}
        seasonPoints={demo.seasonPoints}
        periodLabel="This week"
        viewerIsPublic={demo.viewerIsPublic}
        isPartner={demo.isPartner}
        details={open ? demo.details : null}
        open={open !== null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

export function LeaguesGroup() {
  return (
    <>
      <Section id="tier-badges">
        <TierBadgesDemo />
      </Section>

      <Section id="rank-chip">
        <RankChipDemo />
      </Section>

      <Section id="league-rows">
        <LeagueRowsDemo />
      </Section>

      <Section id="league-countdown">
        <LeagueCountdownDemo />
      </Section>

      <Section id="member-card">
        <MemberCardDemo />
      </Section>

      <Section id="rank-up">
        <RankUpDemo />
      </Section>
    </>
  );
}
