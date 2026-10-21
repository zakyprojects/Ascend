/**
 * True when the browser reports no network. `navigator.onLine === false` is reliable; `true` is
 * not (connected without internet), so callers still handle a failed request.
 */
export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
