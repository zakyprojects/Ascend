// The theme follows the device until the user picks Light or Dark; saved values from before
// 'system' existed carry over only when they were surely a choice (lib/theme.ts).
import {
  DEVICE_THEME_STAMP,
  deviceThemeFields,
  getLocalThemePreference,
  normalizeThemePreference,
  resolveTheme,
} from '../ui/theme';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const store = new Map<string, string>();
const g = globalThis as unknown as { window: unknown; localStorage: unknown };
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
g.window = { localStorage: g.localStorage };

const STAMP = 'Tue 2026-11-10 10:00 AM PKT (UTC+05:00)';

// Saved (synced) values.
assert(normalizeThemePreference('dark', undefined) === 'system', 'unstamped dark is the old default: follow the device');
assert(normalizeThemePreference('dark', STAMP) === 'dark', 'stamped dark is a choice');
assert(normalizeThemePreference('dark', DEVICE_THEME_STAMP) === 'dark', 'a device-key dark is a choice');
assert(normalizeThemePreference('light', undefined) === 'light', 'light was always a choice');
assert(normalizeThemePreference('system', undefined) === 'system', 'system stays');
assert(normalizeThemePreference(undefined, STAMP) === undefined, 'missing stays missing');
assert(normalizeThemePreference('blue', undefined) === undefined, 'unknown values are dropped');

// Resolving.
assert(resolveTheme('system', 'light') === 'light' && resolveTheme('system', 'dark') === 'dark', 'system follows the device');
assert(resolveTheme('dark', 'light') === 'dark' && resolveTheme('light', 'dark') === 'light', 'a choice beats the device');
assert(resolveTheme(undefined, 'light') === 'light', 'no preference follows the device');

// This device's key, and the legacy key.
store.clear();
assert(getLocalThemePreference() === null, 'nothing saved');
assert(deviceThemeFields().themePreference === 'system' && deviceThemeFields().themeUpdatedAt === undefined, 'fresh device: system, unstamped');

store.set('ascend_theme_preference', 'dark');
assert(getLocalThemePreference() === 'system', 'legacy dark (written on every open) becomes system');
assert(store.get('ascend_theme') === 'system' && !store.has('ascend_theme_preference'), 'legacy key migrated once and removed');

store.clear();
store.set('ascend_theme_preference', 'light');
assert(getLocalThemePreference() === 'light', 'legacy light carries over');
const fields = deviceThemeFields();
assert(fields.themePreference === 'light' && fields.themeUpdatedAt === DEVICE_THEME_STAMP, 'a device choice is stamped as one');

store.clear();
store.set('ascend_theme', 'dark');
store.set('ascend_theme_preference', 'light');
assert(getLocalThemePreference() === 'dark', 'the new key wins over the legacy key');

console.log('theme: all passed');
