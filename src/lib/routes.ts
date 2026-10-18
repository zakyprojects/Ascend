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

/**
 * The sign-in pages. They live outside the app shell: `/login` (sign in) and `/signup` (create an
 * account, or save a guest's progress). A signed-out visit to a page goes to
 * `/login?next=<that page>` and comes back to it after signing in.
 */
export type AuthRoute = 'login' | 'signup' | 'reset-password';

/**
 * `/reset-password` is where a password-reset email lands: it sits with the sign-in pages (outside
 * the shell, never a `next` target), but App shows it to anyone and never redirects away from it.
 */
const AUTH_PATHS: Record<AuthRoute, string> = { login: '/login', signup: '/signup', 'reset-password': '/reset-password' };

export function pathForAuthRoute(route: AuthRoute): string {
  return AUTH_PATHS[route];
}

/** The sign-in page a path names (case and slashes at either end do not matter), or null. */
export function authRouteFromPath(pathname: string): AuthRoute | null {
  const segment = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  return segment === 'login' || segment === 'signup' || segment === 'reset-password' ? segment : null;
}

/**
 * A `next` value made safe to send the browser to: only a path on this site (`/habits`,
 * `/prefrontal-cortex?tab=live`). Anything else gives `/`: an absolute URL, `//host`, a backslash
 * (`/\host`, which browsers read as `//host`), whitespace or control characters (browsers drop
 * tabs and newlines, so `/\t/host` would become `//host`), a scheme, or a sign-in page (a loop).
 * The query is kept; a hash is dropped (it is never part of a page's address here).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  if (/[\\\u0000-\u0020\u007f]/.test(raw)) return '/';
  let url: URL;
  try {
    url = new URL(raw, 'https://ascend.invalid');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://ascend.invalid') return '/';
  if (authRouteFromPath(url.pathname)) return '/';
  return url.pathname + url.search;
}

/** The safe `next` page carried in a sign-in page's query (`?next=%2Fhabits`), `/` when none. */
export function nextFromSearch(search: string): string {
  return safeNextPath(new URLSearchParams(search).get('next'));
}

/** A sign-in page's address that returns to `next` afterwards (no `next` when it is the dashboard). */
export function authPathWithNext(route: Exclude<AuthRoute, 'reset-password'>, next: string): string {
  const safe = safeNextPath(next);
  return safe === '/' ? AUTH_PATHS[route] : `${AUTH_PATHS[route]}?next=${encodeURIComponent(safe)}`;
}
