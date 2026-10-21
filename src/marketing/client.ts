/**
 * The marketing pages' only script (landing, /features, feature pages, 404). The pages are static
 * HTML and work without it; this adds the theme switch, closes the Features menu on an outside
 * click or Escape, swaps "Get started" for "Open Ascend" when a session is saved on this device,
 * and turns on the app's scroll rise, card spotlight and analytics. Also the CSS entry
 * (marketing.css: the app's fonts, tokens and components, so the pages look exactly like the app).
 * Imports only DOM-level helpers from lib/ (no React), so the pages load a few KB of script.
 */
import './marketing.css';
import { installAnalytics } from '@/lib/analytics';
import { installCardSpotlight } from '@/lib/cardSpotlight';
import { installPressGlow } from '@/lib/pressGlow';
import { installScrollRise } from '@/lib/scrollRise';

const THEME_KEY = 'ascend_theme_preference'; // lib/store.ts LOCAL_THEME_STORAGE_KEY
const REVEAL_DURATION_MS = 450; // lib/themeTransition.ts

type Theme = 'light' | 'dark';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches; // lib/motion.ts

const currentTheme = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f8f7' : '#0a0b0f');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  syncToggleLabels();
}

function syncToggleLabels() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = next === 'light' ? 'Light theme' : 'Dark theme';
  });
}

/** Same circle reveal as the app's theme switch (lib/themeTransition.ts), without React. */
function toggleTheme(origin: HTMLElement) {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    applyTheme(next);
    return;
  }
  const { left, top, width, height } = origin.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => applyTheme(next));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_DURATION_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(() => undefined);
}

function installThemeToggle() {
  syncToggleLabels();
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleTheme(button));
  });
  // Another tab (or the app) changed the theme.
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
      document.documentElement.setAttribute('data-theme', event.newValue);
      syncToggleLabels();
    }
  });
}

function installMenus() {
  const menus = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-menu]'));
  if (menus.length === 0) return;
  document.addEventListener('click', (event) => {
    for (const menu of menus) {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const menu of menus) {
      if (!menu.open) continue;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}

/** A saved session on this device (lib/supabase.ts storedAuthSession; env-free key match). */
function hasSavedSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-[a-z0-9]+-auth-token$/.test(key)) continue;
      const saved = JSON.parse(localStorage.getItem(key) || 'null') as { refresh_token?: unknown } | null;
      if (typeof saved?.refresh_token === 'string' && saved.refresh_token) return true;
    }
  } catch {
    // Storage blocked: treat as signed out.
  }
  return false;
}

/** Signed-in visitors get a way into the app instead of the sign-up call to action. */
function swapCallsToAction() {
  if (!hasSavedSession()) return;
  document.querySelectorAll<HTMLAnchorElement>('a[data-cta]').forEach((link) => {
    link.href = link.dataset.ctaApp || '/dashboard';
    const label = link.querySelector<HTMLElement>('[data-cta-label]') ?? link;
    label.textContent = link.dataset.ctaAppLabel || 'Open Ascend';
  });
}

installThemeToggle();
installMenus();
swapCallsToAction();
installScrollRise({ everyWidth: true });
installCardSpotlight();
installPressGlow();
installAnalytics();
