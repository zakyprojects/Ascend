import { useSyncExternalStore } from 'react';
import type { TimeTrackerActivity, TimeTrackerBlock, TimeTrackerState } from '@/types';
import { addDays } from './dates';
import { blockIntervalMs, blockName, formatTime12h, liveBlocksAt, plannedBlocksForDate, templateDays } from './timeTracker';

/**
 * The "current block" pill shown at the bottom of every page (components/nav/BlockPill): which
 * state it is in, what its X hides, when it next has to re-render, and its device storage.
 *
 * "Now" is liveBlocksAt over today's planned blocks, the same rule as the Time Tracker page's
 * NowCard and PFC Follow schedule, so the three never disagree. The pill only reads state: it has
 * no Done/Skip, so it never touches time_tracker_days or points.
 */

/** A newcomer's "Plan your day" stops after this many hides (on different days) until a block exists. */
export const PLAN_PILL_MAX_HIDES = 3;

export type BlockPillState =
  /** Nothing to show (switched off, on the Time Tracker page, hidden by its X, newcomer cap). */
  | { kind: 'none' }
  /** A block is running now. */
  | {
      kind: 'block';
      block: TimeTrackerBlock;
      activity: TimeTrackerActivity | undefined;
      endMs: number;
      next: TimeTrackerBlock | null;
      dismissKey: string;
    }
  /** Between blocks for someone who plans: `next` is today's next block, or null when none is left. */
  | { kind: 'free'; next: TimeTrackerBlock | null; nextStartMs: number | null; dismissKey: string }
  /** Never planned a block: points them to Time Tracker. */
  | { kind: 'plan'; dismissKey: string; hidesSoFar: number };

export interface BlockPillHidden {
  /** Dismiss key -> the date key it was set on (kept for today and yesterday only). */
  keys: Record<string, string>;
  /** How many times the newcomer pill was hidden. */
  planHides: number;
}

export const EMPTY_HIDDEN: BlockPillHidden = { keys: {}, planHides: 0 };

/**
 * Ever planned anything: a saved day with a block, or a template with blocks on at least one
 * weekday. The built-in recommended template has no weekdays, so a newcomer has no plan.
 */
export function hasPlan(tt: TimeTrackerState): boolean {
  if (Object.values(tt.dailyLogs || {}).some((blocks) => (blocks?.length ?? 0) > 0)) return true;
  return (tt.templates || []).some((t) => (t.blocks?.length ?? 0) > 0 && templateDays(t).length > 0);
}

/** A block's dismiss key; both halves of a block split at midnight share one. */
export function pairKey(block: Pick<TimeTrackerBlock, 'id' | 'splitPairId'>): string {
  return block.splitPairId ? `pair:${block.splitPairId}` : `block:${block.id}`;
}

export interface BlockPillInput {
  timeTracker: TimeTrackerState;
  today: string;
  nowMs: number;
  hidden: BlockPillHidden;
  enabled: boolean;
  /** On the Time Tracker page the NowCard already says the same thing. */
  onTimeTrackerPage: boolean;
}

/** What the pill shows now (first matching row of the plan's state table wins). */
export function blockPillState({ timeTracker, today, nowMs, hidden, enabled, onTimeTrackerPage }: BlockPillInput): BlockPillState {
  if (!enabled || onTimeTrackerPage) return { kind: 'none' };
  const planned = plannedBlocksForDate(timeTracker, today, today).blocks;
  const { activeBlock, nextBlock } = liveBlocksAt(planned, today, nowMs);

  if (activeBlock) {
    const dismissKey = pairKey(activeBlock);
    // A hidden running block hides the pill until it ends; it does not fall through to free time.
    if (hidden.keys[dismissKey]) return { kind: 'none' };
    return {
      kind: 'block',
      block: activeBlock,
      activity: (timeTracker.activities || []).find((a) => a.id === activeBlock.activityId),
      endMs: blockIntervalMs(activeBlock, today).endMs,
      next: nextBlock,
      dismissKey,
    };
  }

  if (hasPlan(timeTracker)) {
    const dismissKey = `free:${today}:${nextBlock ? pairKey(nextBlock) : 'end'}`;
    if (hidden.keys[dismissKey]) return { kind: 'none' };
    return { kind: 'free', next: nextBlock, nextStartMs: nextBlock ? blockIntervalMs(nextBlock, today).startMs : null, dismissKey };
  }

  const dismissKey = `plan:${today}`;
  if (hidden.planHides >= PLAN_PILL_MAX_HIDES || hidden.keys[dismissKey]) return { kind: 'none' };
  return { kind: 'plan', dismissKey, hidesSoFar: hidden.planHides };
}

/** Whole seconds left until `endMs` (what the time-left text counts). */
export function secondsLeft(endMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
}

const MIN_WAKE_MS = 250;
const MAX_WAKE_MS = 60_000;

/** Local midnight that starts the day after `today` (device wall clock, follows DST). */
function nextMidnightMs(today: string): number {
  return blockIntervalMs({ startTime: '00:00', endTime: '00:00' }, addDays(today, 1)).startMs;
}

/**
 * How long until the pill's text can change: the time left drops a minute (every second in the
 * last minute), the running block ends, the next block starts, or the day rolls over. Clamped to
 * 250 ms – 60 s as a safety net.
 */
export function nextWakeMs(state: BlockPillState, nowMs: number, today: string): number {
  const at: number[] = [nextMidnightMs(today)];
  if (state.kind === 'block') {
    const s = secondsLeft(state.endMs, nowMs);
    at.push(state.endMs);
    // "Nm left" changes when the seconds left reach 60·m − 1; under a minute every second.
    if (s > 0) at.push(state.endMs - (s < 60 ? s - 1 : Math.floor(s / 60) * 60 - 1) * 1000);
    if (state.next) at.push(blockIntervalMs(state.next, today).startMs);
  } else if (state.kind === 'free' && state.nextStartMs !== null) {
    at.push(state.nextStartMs);
  }
  const soonest = Math.min(...at.filter((t) => t > nowMs));
  const wait = Number.isFinite(soonest) ? soonest - nowMs : MAX_WAKE_MS;
  return Math.min(MAX_WAKE_MS, Math.max(MIN_WAKE_MS, wait));
}

/**
 * When to re-render: worked out as if nothing were hidden, so a hidden running block still wakes
 * the pill at its end (the next state then shows without a reload).
 */
export function wakeAfterMs(input: BlockPillInput): number {
  return nextWakeMs(blockPillState({ ...input, hidden: EMPTY_HIDDEN }), input.nowMs, input.today);
}

/** Time left for a screen reader: "1 hour 12 minutes left", "42 minutes left", "38 seconds left". */
export function spokenTimeLeft(seconds: number): string {
  if (seconds <= 0) return 'ending now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (seconds < 60) return `${unit(seconds, 'second')} left`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')} left` : `${unit(minutes, 'minute')} left`;
}

const TURN_OFF_NOTE = 'You can turn it off in Settings › Appearance.';

/** The toast after X: what was hidden and when it comes back. */
export function hideHint(state: BlockPillState, activities: TimeTrackerActivity[] = []): { title: string; message: string } | null {
  const nameOf = (b: TimeTrackerBlock) => blockName(b, activities.find((a) => a.id === b.activityId));
  const forToday = { title: 'Hidden for today', message: `It comes back with your first block tomorrow. ${TURN_OFF_NOTE}` };
  switch (state.kind) {
    case 'block':
      return state.next
        ? {
            title: 'Hidden until your next block',
            message: `It comes back when ${nameOf(state.next)} starts at ${formatTime12h(state.next.startTime)}. ${TURN_OFF_NOTE}`,
          }
        : forToday;
    case 'free':
      return state.next
        ? { title: `Hidden until ${formatTime12h(state.next.startTime)}`, message: `It comes back when ${nameOf(state.next)} starts. ${TURN_OFF_NOTE}` }
        : forToday;
    case 'plan':
      return state.hidesSoFar + 1 >= PLAN_PILL_MAX_HIDES
        ? { title: 'Hidden until you plan a block', message: `Plan a block in Time Tracker and it shows what’s happening now. ${TURN_OFF_NOTE}` }
        : { title: 'Hidden for today', message: `It comes back tomorrow, or as soon as you plan a block. ${TURN_OFF_NOTE}` };
    default:
      return null;
  }
}

/** Hides after pressing X: remembers the key on `today`, drops keys older than yesterday. */
export function hideState(hidden: BlockPillHidden, state: BlockPillState, today: string): BlockPillHidden {
  if (state.kind === 'none') return hidden;
  const yesterday = addDays(today, -1);
  const keys: Record<string, string> = {};
  for (const [key, day] of Object.entries(hidden.keys)) if (day === today || day === yesterday) keys[key] = day;
  keys[state.dismissKey] = today;
  return { keys, planHides: hidden.planHides + (state.kind === 'plan' ? 1 : 0) };
}

// --- Device storage ----------------------------------------------------------------------------

export type PillSide = 'left' | 'right';
export type PillLayout = 'phone' | 'desktop';
export interface PillPosition {
  side: PillSide;
  /** Distance of the dock's bottom edge from the viewport bottom, px. */
  bottom: number;
}
export interface BlockPillPrefs {
  enabled: boolean;
  pos: Partial<Record<PillLayout, PillPosition>>;
}

/** Phone and desktop keep their own position (the AppShell breakpoint). */
export const PILL_DESKTOP_QUERY = '(min-width: 1024px)';
export const pillLayout = (): PillLayout => (window.matchMedia(PILL_DESKTOP_QUERY).matches ? 'desktop' : 'phone');

/** Device-wide like Sound & vibration: a layout choice, never synced to the account. */
const PREFS_KEY = 'ascend_block_pill';
/** Per account (`local` without one), so another account on this browser starts fresh. */
const HIDDEN_PREFIX = 'ascend_block_pill_hidden:';
const CHANGE_EVENT = 'ascend:block-pill';

const DEFAULT_PREFS: BlockPillPrefs = { enabled: true, pos: {} };

// Used only where storage is blocked, so a choice still lasts until reload.
const memory = new Map<string, string | null>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function parsePosition(value: unknown): PillPosition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { side, bottom } = value as Record<string, unknown>;
  if ((side !== 'left' && side !== 'right') || typeof bottom !== 'number' || !Number.isFinite(bottom)) return undefined;
  return { side, bottom };
}

/** Parses the stored prefs; missing or corrupt values give the defaults. */
export function parsePrefs(raw: string | null): BlockPillPrefs {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
    const pos: BlockPillPrefs['pos'] = {};
    const phone = parsePosition(parsed.pos?.phone);
    const desktop = parsePosition(parsed.pos?.desktop);
    if (phone) pos.phone = phone;
    if (desktop) pos.desktop = desktop;
    return { enabled: parsed.enabled !== false, pos };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Parses stored hides; missing or corrupt values give none. */
export function parseHidden(raw: string | null): BlockPillHidden {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_HIDDEN;
    const keys: Record<string, string> = {};
    if (parsed.keys && typeof parsed.keys === 'object') {
      for (const [k, v] of Object.entries(parsed.keys)) if (typeof v === 'string') keys[k] = v;
    }
    const planHides = Number.isFinite(parsed.planHides) ? Math.max(0, Number(parsed.planHides)) : 0;
    return { keys, planHides };
  } catch {
    return EMPTY_HIDDEN;
  }
}

function read<T>(key: string, parse: (raw: string | null) => T): T {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: object | null): void {
  const raw = value ? JSON.stringify({ v: 1, ...value }) : null;
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const getBlockPillPrefs = (): BlockPillPrefs => read(PREFS_KEY, parsePrefs);
export const getBlockPillHidden = (account: string): BlockPillHidden => read(HIDDEN_PREFIX + account, parseHidden);

export function setBlockPillHidden(account: string, hidden: BlockPillHidden): void {
  write(HIDDEN_PREFIX + account, hidden);
}

/** Turning it on clears every hide (all accounts on this device), so it shows at once. */
export function setBlockPillEnabled(enabled: boolean): void {
  if (enabled) {
    const stale = [...memory.keys()].filter((k) => k.startsWith(HIDDEN_PREFIX));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(HIDDEN_PREFIX)) stale.push(key);
      }
    } catch {
      /* storage blocked */
    }
    for (const key of new Set(stale)) write(key, null);
  }
  write(PREFS_KEY, { ...getBlockPillPrefs(), enabled });
}

export function setBlockPillPosition(layout: PillLayout, position: PillPosition | null): void {
  const prefs = getBlockPillPrefs();
  const pos = { ...prefs.pos };
  if (position) pos[layout] = position;
  else delete pos[layout];
  write(PREFS_KEY, { ...prefs, pos });
}

function subscribe(onChange: () => void): () => void {
  // 'storage' carries a change made in another tab.
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useBlockPillPrefs(): BlockPillPrefs {
  return useSyncExternalStore(subscribe, getBlockPillPrefs, () => DEFAULT_PREFS);
}

export function useBlockPillHidden(account: string): BlockPillHidden {
  return useSyncExternalStore(
    subscribe,
    () => getBlockPillHidden(account),
    () => EMPTY_HIDDEN
  );
}
