import { lazy, useState, type ComponentType } from 'react';
import { VIEWS, type View } from '@/lib/views';
import { viewFromPath } from '@/lib/routes';
import { reloadOnceForStaleChunk } from '@/lib/chunkReload';

/**
 * Every page is its own chunk, loaded on first need: the app shell boots without the 19 pages.
 * `preloadView` fetches a page ahead of time (link hover, idle time, before a navigation's view
 * transition), so opening it later renders at once with no Suspense fallback.
 */

const preloaders = {} as Record<View, () => Promise<unknown>>;

function page<P extends object>(view: View, importer: () => Promise<ComponentType<P>>): ComponentType<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const load = () => {
    pending ??= importer().then(
      (component) => (loaded = component),
      (error) => {
        pending = null; // a later attempt may succeed (back online)
        throw error;
      }
    );
    return pending;
  };
  preloaders[view] = load;

  const Lazy = lazy(() =>
    load().then(
      (component) => ({ default: component }),
      (error) => {
        reloadOnceForStaleChunk();
        throw error;
      }
    )
  ) as unknown as ComponentType<P>;

  // React.lazy suspends on its first render even when the module is already here; a page that has
  // been preloaded renders its component directly instead. Chosen once per mount, so a page never
  // switches component (and loses its state) mid-visit.
  function Page(props: P) {
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Component {...props} />;
  }
  Page.displayName = `Page(${view})`;
  return Page;
}

/** Starts loading a page's code (or returns the load already under way / done). */
export function preloadView(view: View): Promise<unknown> {
  return preloaders[view]();
}

/**
 * Hovering, focusing or touching a link to a page starts loading that page, so the click that
 * usually follows finds it ready. One listener for every in-app link (`<a href="/habits">`).
 */
export function installPagePrefetch(): void {
  const onIntent = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin) return;
    const view = viewFromPath(link.pathname);
    if (view) preloadView(view).catch(() => undefined);
  };
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('focusin', onIntent);
  document.addEventListener('touchstart', onIntent, { passive: true });
}

/**
 * After the app is on screen, loads every page's code one at a time in idle moments, so later
 * page changes are instant. Skipped when the user asked to save data.
 */
export function prefetchAllViewsWhenIdle(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const idle = (callback: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(callback, { timeout: 4000 }) : window.setTimeout(callback, 400);
  const queue = [...VIEWS];
  const next = () => {
    const view = queue.shift();
    if (!view) return;
    preloadView(view)
      .catch(() => undefined)
      .then(() => idle(next));
  };
  idle(next);
}

export const Dashboard = page('dashboard', () => import('./Dashboard').then((m) => m.Dashboard));
export const HabitTracker = page('habits', () => import('./HabitTracker').then((m) => m.HabitTracker));
export const TimeTrackerView = page('time-tracker', () => import('./TimeTrackerView').then((m) => m.TimeTrackerView));
export const WeeklyGoalsView = page('weekly-goals', () => import('./WeeklyGoalsView').then((m) => m.WeeklyGoalsView));
export const ProjectsGoalsView = page('projects-goals', () => import('./ProjectsGoalsView').then((m) => m.ProjectsGoalsView));
export const Journal = page('journal', () => import('./Journal').then((m) => m.Journal));
export const ExerciseTracker = page('exercise', () => import('./ExerciseTracker').then((m) => m.ExerciseTracker));
export const ReadingHub = page('reading', () => import('./ReadingHub').then((m) => m.ReadingHub));
export const SkillTracker = page('skills', () => import('./SkillTracker').then((m) => m.SkillTracker));
export const BadHabitTracker = page('bad-habits', () => import('./BadHabitTracker').then((m) => m.BadHabitTracker));
export const AddictionRecovery = page('recovery', () => import('./AddictionRecovery').then((m) => m.AddictionRecovery));
export const PrefrontalCortex = page('prefrontal', () => import('./PrefrontalCortex').then((m) => m.PrefrontalCortex));
export const TierView = page('tiers', () => import('./TierView').then((m) => m.TierView));
export const Leagues = page('leagues', () => import('./Leagues').then((m) => m.Leagues));
export const Lessons = page('lessons', () => import('./Lessons').then((m) => m.Lessons));
export const Neuroplasticity = page('neuroplasticity', () => import('./Neuroplasticity').then((m) => m.Neuroplasticity));
export const ImprovementPlans = page('plans', () => import('./ImprovementPlans').then((m) => m.ImprovementPlans));
export const AccountabilityPartner = page('partner', () => import('./AccountabilityPartner').then((m) => m.AccountabilityPartner));
export const SettingsView = page('settings', () => import('./SettingsView').then((m) => m.SettingsView));
export const ReportBugView = page('report-bug', () => import('./FeedbackView').then((m) => m.FeedbackView));
export const SuggestIdeaView = page('suggest-idea', () => import('./FeedbackView').then((m) => m.FeedbackView));
