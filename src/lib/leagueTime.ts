import { trustedNow } from './clock';
/**
 * leagueTime.ts
 *
 * Standalone UTC-anchored week/month/season timing and deterministic period ID generator
 * for the league and seasonal reset systems.
 *
 * Invariants:
 * - Standalone: Does not import dates.ts, leagues.ts, or any local-time module.
 * - UTC-only: All calendar boundaries and offsets are computed exclusively in UTC.
 * - Required arguments: `now: Date` is mandatory on all query functions (no default fallback).
 * - Half-open windows: All periods are strictly [start, end).
 * - Deterministic period IDs:
 *     Week:   W:YYYY-Www (ISO-8601 week)
 *     Month:  M:YYYY-MM
 *     Season: S:N
 */

/**
 * Capture current instant at call time.
 * Single entry point for wall-clock time in the league/season time system.
 */
export function leagueNow(): Date {
  return trustedNow();
}

/**
 * The season calendar's master values live on the server (public.ascend_season_epoch() /
 * ascend_season_length(), read through the ascend_season_config RPC), so the season changes at
 * one UTC instant for everyone. These defaults (Season 1 starts August 1, 2026 00:00 UTC; 90
 * days) are only used until the server's values arrive, and then the last copy this device saw.
 */
const DEFAULT_EPOCH_MS = Date.UTC(2026, 7, 1, 0, 0, 0, 0);
const DEFAULT_SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;
const SEASON_CONFIG_KEY = 'ascend_season_config';
const SEASON_CONFIG_TIMEOUT_MS = 3000;

let seasonEpochMs = DEFAULT_EPOCH_MS;
let seasonLengthMs = DEFAULT_SEASON_LENGTH_MS;

function applySeasonConfig(value: unknown): boolean {
  const config = value as { epochMs?: unknown; lengthMs?: unknown } | null;
  const epochMs = Number(config?.epochMs);
  const lengthMs = Number(config?.lengthMs);
  if (!Number.isFinite(epochMs) || !Number.isFinite(lengthMs) || lengthMs <= 0) return false;
  seasonEpochMs = epochMs;
  seasonLengthMs = lengthMs;
  return true;
}

try {
  const cached = localStorage.getItem(SEASON_CONFIG_KEY);
  if (cached) applySeasonConfig(JSON.parse(cached));
} catch {
  /* storage unavailable or unreadable: keep the defaults */
}

/**
 * Reads the season master values from the server and keeps a copy for offline starts.
 * Waits at most a few seconds; never rejects (the current values stay on any failure).
 */
export async function syncSeasonConfig(): Promise<void> {
  try {
    // Loaded lazily: supabase.ts reads the clock, so a static import would be a cycle.
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured) return;
    const request = supabase.rpc('ascend_season_config');
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SEASON_CONFIG_TIMEOUT_MS));
    const result = await Promise.race([request, timeout]);
    if (!result || result.error || !applySeasonConfig(result.data)) return;
    try {
      localStorage.setItem(SEASON_CONFIG_KEY, JSON.stringify(result.data));
    } catch {
      /* storage unavailable */
    }
  } catch {
    /* offline or server error: keep the current values */
  }
}

/** First instant of season `seasonNumber` (1-based). */
export function getSeasonStartByNumber(seasonNumber: number): Date {
  return new Date(seasonEpochMs + (Math.max(seasonNumber, 1) - 1) * seasonLengthMs);
}

/**
 * Computes UTC Monday 00:00:00.000 of the week containing `now`.
 */
export function getWeekStart(now: Date): Date {
  const day = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff, 0, 0, 0, 0));
}

/**
 * Computes exclusive end of the week containing `now` (getWeekStart(now) + 7 days).
 */
export function getWeekEnd(now: Date): Date {
  const start = getWeekStart(now);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Computes UTC 1st 00:00:00.000 of the month containing `now`.
 */
export function getMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Computes exclusive end of the month containing `now` (first instant of next UTC month).
 */
export function getMonthEnd(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * Computes the 1-indexed season number from the season master values.
 */
export function getSeasonNumber(now: Date): number {
  const elapsed = now.getTime() - seasonEpochMs;
  // Pre-epoch dates clamp to Season 1 — no wrong-clock protection at this layer; server-side clock validation was descoped for this phase per 2026-09-20 decision.
  if (elapsed < 0) return 1;
  return 1 + Math.floor(elapsed / seasonLengthMs);
}

/**
 * Computes the UTC start instant of the season containing `now`.
 */
export function getSeasonStart(now: Date): Date {
  return getSeasonStartByNumber(getSeasonNumber(now));
}

/**
 * Computes the exclusive end instant of the season containing `now` (the next season's start).
 */
export function getSeasonEnd(now: Date): Date {
  return getSeasonStartByNumber(getSeasonNumber(now) + 1);
}

/**
 * Returns deterministic ISO-8601 week period ID: `W:YYYY-Www` (e.g. `W:2026-W38`).
 */
export function getWeekPeriodId(now: Date): string {
  const target = new Date(now.getTime());
  const dayNr = (now.getUTCDay() + 6) % 7; // 0 for Mon, ..., 6 for Sun
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // target is now Thursday of this ISO week

  const firstThursday = target.getTime();
  const year = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4, 0, 0, 0, 0));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  const firstThursdayOfYear = new Date(Date.UTC(year, 0, 4 - jan4DayNr + 3, 0, 0, 0, 0));

  const weekNum = 1 + Math.round((firstThursday - firstThursdayOfYear.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const paddedWeek = String(weekNum).padStart(2, '0');
  return `W:${year}-W${paddedWeek}`;
}

/**
 * Returns deterministic month period ID: `M:YYYY-MM` (e.g. `M:2026-09`).
 */
export function getMonthPeriodId(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `M:${year}-${month}`;
}

/**
 * Returns deterministic season period ID: `S:N` (e.g. `S:1`).
 */
export function getSeasonPeriodId(now: Date): string {
  return `S:${getSeasonNumber(now)}`;
}
