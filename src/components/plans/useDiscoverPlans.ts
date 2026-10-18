import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppStore } from '@/lib/store';
import type { ImprovementPlan } from '@/types';
import { fetchPublicPlansFromSupabase, supabase, syncBroadcaster } from '@/lib/supabase';

export type DiscoverSort = 'recent' | 'followed' | 'creator_rank';

export interface DiscoverFilters {
  search: string;
  category: string;
  planType: string;
  sortBy: DiscoverSort;
}

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = { search: '', category: 'All', planType: 'all', sortBy: 'recent' };

const SEARCH_DEBOUNCE_MS = 300;
const CHANGE_DEBOUNCE_MS = 800;
const POLL_MS = 30_000;

/**
 * Public plans for Discover. Lives on the page (not the tab), so the list, its realtime channel and
 * the copy counts of the user's own plans stay current whichever tab is open.
 *
 * - Filters run on the server; typing is debounced and only the newest request's answer is used.
 * - Any change to a public plan (realtime, another tab) triggers one quiet refetch with the
 *   current filters, so a change never shows a plan that doesn't match them.
 * - While Discover is open it also refetches every 30s: a plan turned private never reaches
 *   realtime (RLS hides the new row), so polling is what removes it.
 */
export function useDiscoverPlans(store: AppStore, active: boolean) {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);
  const [search, setSearch] = useState('');
  const [plans, setPlans] = useState<ImprovementPlan[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const storeRef = useRef(store);
  const queryRef = useRef({ ...filters, search });
  const requestIdRef = useRef(0);

  useEffect(() => {
    storeRef.current = store;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(filters.search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const load = useCallback(async (quiet: boolean) => {
    const requestId = ++requestIdRef.current;
    if (!quiet) setRefreshing(true);
    const result = await fetchPublicPlansFromSupabase(queryRef.current);
    if (requestId !== requestIdRef.current) return; // A newer request owns the list.
    setRefreshing(false);

    if (!result) {
      // A quiet refetch that fails keeps the list on screen; a requested one says it failed.
      if (!quiet) setStatus('error');
      return;
    }
    setPlans(result);
    setStatus('ready');

    // The server's copy counts for the user's own public plans.
    const own = new Map(storeRef.current.state.improvementPlans.map((p) => [p.id, p.copyCount]));
    result.forEach((p) => {
      if (own.has(p.id) && own.get(p.id) !== p.copyCount) storeRef.current.updatePlanCopyCount(p.id, p.copyCount);
    });
  }, []);

  // Filters (with the debounced search) changed: fetch that list.
  useEffect(() => {
    queryRef.current = { ...filters, search };
    void load(false);
    // filters.search is read through the debounced `search`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters.category, filters.planType, filters.sortBy, load]);

  // Realtime and other tabs: subscribed once for the page's lifetime.
  useEffect(() => {
    let timer: number | null = null;
    const scheduleQuietLoad = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(true), CHANGE_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`discover_plans_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'improvement_plans' }, scheduleQuietLoad)
      .subscribe();

    const unsubscribe = syncBroadcaster.subscribe((event) => {
      if (event === 'PLAN_CREATED' || event === 'PLAN_UPDATED' || event === 'PLAN_DELETED') scheduleQuietLoad();
    });

    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
      unsubscribe();
    };
  }, [load]);

  // Polling and coming back online, only while Discover is open.
  useEffect(() => {
    if (!active) return;
    const poll = () => {
      if (typeof navigator === 'undefined' || navigator.onLine) void load(true);
    };
    const interval = window.setInterval(poll, POLL_MS);
    window.addEventListener('online', poll);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', poll);
    };
  }, [active, load]);

  const updateFilters = useCallback((patch: Partial<DiscoverFilters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_DISCOVER_FILTERS);
    setSearch('');
  }, []);
  const retry = useCallback(() => {
    setStatus('loading');
    void load(false);
  }, [load]);

  return { plans, status, refreshing, filters, updateFilters, resetFilters, retry, refresh: () => void load(false) };
}
