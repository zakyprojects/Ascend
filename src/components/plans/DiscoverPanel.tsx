import type { ReactNode } from 'react';
import { Check, Compass, Copy, RefreshCw, Search } from 'lucide-react';
import { EmptyState, Skeleton, ToolbarInput, ToolbarSelect } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { TierBadge } from '@/components/ui/TierBadge';
import { getProfileSeasonPointsByUsername } from '@/lib/auth';
import { leagueNow } from '@/lib/leagueTime';
import { PLAN_CATEGORIES, type ImprovementPlan } from '@/types';
import { PlanCard } from './PlanCard';
import { PLAN_TYPES, PLAN_TYPE_META } from './planMeta';
import type { DiscoverSort, useDiscoverPlans } from './useDiscoverPlans';

type Discover = ReturnType<typeof useDiscoverPlans>;

function copiesLabel(n: number): string {
  if (n <= 0) return 'Not copied yet';
  return n === 1 ? 'Copied once' : `Copied ${n} times`;
}

export function DiscoverPanel({
  discover,
  ownPlans,
  currentUserId,
  copiedPlanIds,
  isCopying,
  onCopy,
  ownControls,
}: {
  discover: Discover;
  /** The user's own plans: their Discover cards show this device's copy (newest edits, sharing). */
  ownPlans: ImprovementPlan[];
  currentUserId?: string;
  copiedPlanIds: Set<string>;
  isCopying: (planId: string) => boolean;
  onCopy: (plan: ImprovementPlan) => void;
  ownControls: (plan: ImprovementPlan) => ReactNode;
}) {
  const { plans, status, refreshing, filters, updateFilters, resetFilters, retry, refresh } = discover;
  const ownById = new Map(ownPlans.map((p) => [p.id, p]));
  const now = leagueNow();
  const seasonPoints = (username: string) => getProfileSeasonPointsByUsername(username, 'ninetyDay', now) || 0;

  const visible = plans
    .map((p) => {
      const own = ownById.get(p.id);
      return own ? { ...own, copyCount: p.copyCount } : p;
    })
    .filter((p) => p.isPublic);
  if (filters.sortBy === 'creator_rank') {
    visible.sort((a, b) => seasonPoints(b.creatorUsername) - seasonPoints(a.creatorUsername));
  }

  const hasFilters = filters.search.trim() !== '' || filters.category !== 'All' || filters.planType !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <ToolbarInput
          type="search"
          icon={Search}
          aria-label="Search public plans"
          wrapperClassName="flex-1"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          placeholder="Search plans"
        />
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <ToolbarSelect aria-label="Plan type" value={filters.planType} onChange={(e) => updateFilters({ planType: e.target.value })}>
            <option value="all">All types</option>
            {PLAN_TYPES.map((t) => (
              <option key={t} value={t}>
                {PLAN_TYPE_META[t].label}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect aria-label="Category" value={filters.category} onChange={(e) => updateFilters({ category: e.target.value })}>
            <option value="All">All categories</option>
            {PLAN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect
            aria-label="Sort plans"
            value={filters.sortBy}
            onChange={(e) => updateFilters({ sortBy: e.target.value as DiscoverSort })}
          >
            <option value="recent">Newest</option>
            <option value="followed">Most copied</option>
            <option value="creator_rank">Top creators</option>
          </ToolbarSelect>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="btn-ghost hidden text-xs lg:inline-flex items-center gap-1.5"
          aria-label="Refresh public plans"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {status === 'loading' && plans.length === 0 ? (
        <div role="status" aria-label="Loading public plans" className="grid-cards-lg gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-8 w-32 rounded-xl" />
            </div>
          ))}
        </div>
      ) : status === 'error' ? (
        <EmptyState
          icon={Compass}
          title="Couldn't load public plans"
          description="Check your connection and try again."
          action={
            <button type="button" onClick={retry} className="btn-secondary text-xs">
              Try again
            </button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={hasFilters ? 'No plans match' : 'No public plans yet'}
          description={hasFilters ? 'Try a different search, type or category.' : 'Share one of yours to be the first.'}
          action={
            hasFilters ? (
              <button type="button" onClick={resetFilters} className="btn-secondary text-xs">
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid-cards-lg gap-4">
          {visible.map((plan) => {
            const isOwn = Boolean(currentUserId) && plan.creatorId === currentUserId;
            const copied = copiedPlanIds.has(plan.id);
            const copying = isCopying(plan.id);
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                category={plan.category}
                controls={isOwn ? ownControls(plan) : undefined}
                source={
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">{plan.creatorAvatar || '🧑'}</span>
                    {isOwn ? 'Your plan' : <>by @{plan.creatorUsername}</>}
                    <TierBadge totalPoints={seasonPoints(plan.creatorUsername)} size="sm" />
                  </span>
                }
                footer={
                  <>
                    <span className="text-xs text-content-muted">{copiesLabel(plan.copyCount || 0)}</span>
                    {!isOwn &&
                      (copied ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-text">
                          <Check size={14} /> In your plans
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCopy(plan)}
                          disabled={copying}
                          className="btn-primary text-xs inline-flex items-center gap-1.5"
                        >
                          {copying ? <AscendLoadingIndicator size="sm" /> : <Copy size={14} />}
                          {copying ? 'Copying' : 'Copy to my plans'}
                        </button>
                      ))}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
