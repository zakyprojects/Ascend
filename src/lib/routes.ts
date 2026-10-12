import { DEFAULT_VIEW, isView, View, VIEWS } from './views';

/**
 * The URL of every page: `/` for the dashboard, `/habits`, `/prefrontal-cortex`, … One path per
 * page; the view ids stay as they are (the PFC page is `prefrontal` in code).
 */
const PATHS: Record<View, string> = Object.fromEntries(
  VIEWS.map((view) => [view, `/${view}`])
) as Record<View, string>;
PATHS.dashboard = '/';
PATHS.prefrontal = '/prefrontal-cortex';

// Old names that still resolve, so links made before a rename keep working (rewritten in place).
// (The view ids themselves also resolve: `/prefrontal`, `/dashboard`.)
const ALIASES: Record<string, View> = {
  books: 'reading',
  'index.html': 'dashboard',
};

const VIEW_BY_SEGMENT: Record<string, View> = Object.fromEntries(
  VIEWS.map((view) => [PATHS[view].slice(1), view])
);

export function pathForView(view: View): string {
  return PATHS[view];
}

/** A page name from a path or an old hash: case and slashes at either end do not matter. */
function viewFromSegment(raw: string): View | null {
  let segment: string;
  try {
    segment = decodeURIComponent(raw);
  } catch {
    return null;
  }
  segment = segment.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (segment in VIEW_BY_SEGMENT) return VIEW_BY_SEGMENT[segment];
  if (segment in ALIASES) return ALIASES[segment];
  return isView(segment) ? segment : null;
}

/** The page a path names, or null when it names none (the caller shows the dashboard). */
export function viewFromPath(pathname: string): View | null {
  return viewFromSegment(pathname);
}

/**
 * Old hash links (`#/habits`, `#/books`) before paths. Only hashes that start with `#/` were
 * routes; Supabase's `#access_token=…` / `#error=…` and a bare `#` are not ours and give null.
 * An unknown old route gives the dashboard.
 */
export function viewFromLegacyHash(hash: string): View | null {
  if (!hash.startsWith('#/')) return null;
  return viewFromSegment(hash.slice(2)) ?? DEFAULT_VIEW;
}

/** The page the address bar names right now. */
export function viewFromLocation(location: Pick<Location, 'pathname' | 'hash'> = window.location): View {
  return viewFromLegacyHash(location.hash) ?? viewFromPath(location.pathname) ?? DEFAULT_VIEW;
}
