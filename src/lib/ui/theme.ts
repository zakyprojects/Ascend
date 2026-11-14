import { useSyncExternalStore } from 'react';
import type { AppState } from '@/types';

/**
 * Light/dark theme. The preference is 'system' (follow the device's light/dark setting, live) until
 * the user picks Light or Dark. The pre-paint scripts (index.html, marketing/head.ts THEME_SCRIPT)
 * and the marketing toggle (marketing/client.ts) repeat the key, the legacy rule and the colours
 * below without importing this file; KEEP IN SYNC.
 */
export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

/** This device's copy of the preference ('system' | 'dark' | 'light'), read before first paint. */
export const LOCAL_THEME_STORAGE_KEY = 'ascend_theme';
/**
 * The key before 2026-11-10. The app wrote 'dark' there on every open, so only 'light' was surely
 * the user's own choice: 'light' carries over, anything else becomes 'system'.
 */
const LEGACY_THEME_STORAGE_KEY = 'ascend_theme_preference';

/** `<meta name="theme-color">` per theme (browser bar / PWA status bar). */
const THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#0a0b0f', light: '#f6f8f7' };

/**
 * Stamp for a Light/Dark choice taken over from this device's key (picked on the public site, or
 * left by an earlier session) instead of a synced change. Marks the choice as the user's own, and,
 * being the oldest possible time, never beats a choice synced from any device.
 */
export const DEVICE_THEME_STAMP = '1970-01-01T00:00:00.000Z';

const isPreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'dark' || value === 'light';

export function getLocalThemePreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(LOCAL_THEME_STORAGE_KEY);
    if (isPreference(value)) return value;
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === null) return null;
    const migrated: ThemePreference = legacy === 'light' ? 'light' : 'system';
    localStorage.setItem(LOCAL_THEME_STORAGE_KEY, migrated);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export function setLocalThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_THEME_STORAGE_KEY, preference);
  } catch {
    // ignore local storage errors
  }
}

/** The theme fields for a fresh state: this device's preference, else 'system'. */
export function deviceThemeFields(): Pick<AppState, 'themePreference' | 'themeUpdatedAt'> {
  const preference = getLocalThemePreference() ?? 'system';
  return { themePreference: preference, themeUpdatedAt: preference === 'system' ? undefined : DEVICE_THEME_STAMP };
}

/**
 * A saved preference as it counts today. 'dark' without a stamp is the old default (the app opened
 * dark and saved 'dark' for everyone; only the theme switch stamps, since 2026-11-05), so it
 * follows the device. 'light' was always a choice. Missing stays missing.
 */
export function normalizeThemePreference(
  preference: AppState['themePreference'] | string | undefined,
  updatedAt: string | undefined
): ThemePreference | undefined {
  if (preference === 'light' || preference === 'system') return preference;
  if (preference === 'dark') return updatedAt ? 'dark' : 'system';
  return undefined;
}

const SYSTEM_LIGHT_QUERY = '(prefers-color-scheme: light)';

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(SYSTEM_LIGHT_QUERY).matches ? 'light' : 'dark';
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(SYSTEM_LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** The device's light/dark setting, re-rendering when it changes while the app is open. */
export function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => 'dark');
}

export function resolveTheme(preference: ThemePreference | undefined, systemTheme: ResolvedTheme = getSystemTheme()): ResolvedTheme {
  return preference === 'light' || preference === 'dark' ? preference : systemTheme;
}

/** Paints a theme: `data-theme` on <html> and the browser bar colour. */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/** The theme on screen right now (for code outside the store's render). */
export function appliedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
