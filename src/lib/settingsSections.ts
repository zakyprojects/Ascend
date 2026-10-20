/**
 * Settings sections and their address: `/settings?section=notifications` (D-S2). The section is
 * kept in the query, so a reload stays on it and other screens can link straight to it.
 */
export const SETTINGS_SECTIONS = ['profile', 'account', 'notifications', 'privacy', 'appearance', 'sound', 'app', 'about-us', 'support'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'profile';

const PENDING_KEY = 'ascend_settings_section';
export const SETTINGS_SECTION_EVENT = 'ascend:settings-section';

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export function settingsSectionPath(section: SettingsSection): string {
  return section === DEFAULT_SETTINGS_SECTION ? '/settings' : `/settings?section=${section}`;
}

/** The section the address bar names, or the one another screen asked for just before opening Settings. */
export function initialSettingsSection(): SettingsSection {
  const fromUrl = new URLSearchParams(window.location.search).get('section');
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
  if (isSettingsSection(pending)) return pending;
  return isSettingsSection(fromUrl) ? fromUrl : DEFAULT_SETTINGS_SECTION;
}

/**
 * Asks Settings to show `section`: remembered for a Settings page about to open, and announced
 * to one already open. Call before navigating to the settings page.
 */
export function requestSettingsSection(section: SettingsSection): void {
  try {
    sessionStorage.setItem(PENDING_KEY, section);
  } catch {
    /* storage blocked: Settings opens on its first section */
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_SECTION_EVENT, { detail: section }));
}

/** An open Settings page that took the request from the event drops the remembered copy. */
export function clearPendingSettingsSection(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
}
