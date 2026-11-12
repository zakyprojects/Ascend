/**
 * Crash reports to Sentry: uncaught errors, unhandled promise rejections and ErrorBoundary
 * catches. Production builds with VITE_SENTRY_DSN only, so local and studio runs send nothing.
 *
 * Privacy: no email, username, IP or page content. The user is their account id only, console
 * output is not recorded, no session replay, no performance tracing, and URLs lose their query
 * and hash (sign-in links carry tokens there).
 *
 * The SDK (sentryClient.ts) loads after the page's load event, off the first paint. Until then
 * uncaught errors, unhandled rejections and reportError calls are queued (at most 20) and sent
 * once it is up; one that happens in a tab closed before then is lost.
 */
const DSN = ((import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '').trim();
const MAX_QUEUED = 20;

type Report = { error: unknown; extra?: Record<string, unknown> };
let enabled = false;
// Read at start-up: a signed-out visit is redirected to /login (query moved into `next`) before
// the SDK loads.
let sentryTest = false;
let send: ((report: Report) => void) | null = null;
const queued: Report[] = [];

function enqueue(report: Report): void {
  if (send) send(report);
  else if (queued.length < MAX_QUEUED) queued.push(report);
}

// No error object = a cross-origin "Script error." (an extension, an injected script): not ours.
const onError = (event: ErrorEvent) => {
  if (event.error) enqueue({ error: event.error });
};
const onRejection = (event: PromiseRejectionEvent) => enqueue({ error: event.reason });

async function loadSentry(): Promise<void> {
  try {
    const client = await import('./sentryClient');
    client.startSentry(DSN, sentryTest);
    // Sentry's own handlers take over from here.
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    send = (report) => client.captureError(report.error, report.extra);
    for (const report of queued.splice(0)) send(report);
  } catch {
    // The chunk did not load (offline, a deploy mid-load): keep queueing; assetRecovery handles
    // a stale build, and the next page load tries again.
  }
}

export function installErrorReporting(): void {
  if (!import.meta.env.PROD || !DSN) return;
  enabled = true;
  sentryTest = new URLSearchParams(window.location.search).has('sentry-test');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  if (document.readyState === 'complete') void loadSentry();
  else window.addEventListener('load', () => void loadSentry(), { once: true });
}

/** For errors the app catches itself but still wants to hear about (ErrorBoundary). */
export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!enabled) return;
  enqueue({ error, extra });
}
