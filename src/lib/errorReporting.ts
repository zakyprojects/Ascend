import * as Sentry from '@sentry/react';
import { supabase } from './supabase';
import { isBuildFileError } from './assetRecovery';

/**
 * Crash reports to Sentry: uncaught errors, unhandled promise rejections and ErrorBoundary
 * catches. Production builds with VITE_SENTRY_DSN only, so local and studio runs send nothing.
 *
 * Privacy: no email, username, IP or page content. The user is their account id only, console
 * output is not recorded, no session replay, no performance tracing, and URLs lose their query
 * and hash (sign-in links carry tokens there).
 */
const DSN = ((import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '').trim();

let enabled = false;

/** Path only: a query or hash may hold a token or an id. */
function stripUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export function installErrorReporting(): void {
  if (!import.meta.env.PROD || !DSN) return;
  enabled = true;
  Sentry.init({
    dsn: DSN,
    release: `ascend@${__APP_VERSION__}`,
    environment: 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    integrations: [Sentry.breadcrumbsIntegration({ console: false })],
    // Only our own files: errors from browser extensions and injected scripts are not ours to fix.
    allowUrls: [window.location.origin],
    ignoreErrors: [
      // The browser's layout notice, not a crash.
      'ResizeObserver loop',
      // Offline or a dropped connection; the app already shows its own message.
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
    ],
    beforeSend(event, hint) {
      // An update landed while the page was open; assetRecovery repairs and reloads on its own.
      if (isBuildFileError(hint.originalException)) return null;
      if (event.request?.url) event.request.url = stripUrl(event.request.url);
      if (event.request) {
        delete event.request.query_string;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data;
      if (data) {
        for (const key of ['url', 'from', 'to'] as const) {
          if (typeof data[key] === 'string') data[key] = stripUrl(data[key]);
        }
      }
      return breadcrumb;
    },
  });
  // Setup check: open the app with ?sentry-test and one test crash is reported from our own file.
  if (new URLSearchParams(window.location.search).has('sentry-test')) {
    window.setTimeout(() => {
      throw new Error('Sentry test crash (safe to resolve)');
    }, 0);
  }
  // Which account hit it (id only), so one person's repeated crash reads as one person.
  supabase.auth.onAuthStateChange((_event, session) => {
    Sentry.setUser(session?.user ? { id: session.user.id } : null);
  });
}

/** For errors the app catches itself but still wants to hear about (ErrorBoundary). */
export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}
