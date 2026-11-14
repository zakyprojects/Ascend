/**
 * Fired on window by the store's refreshNow (pull-to-refresh): parts of the app that fetch on their
 * own, outside the store (the focus session), pull again too.
 */
export const APP_REFRESH_EVENT = 'ascend:refresh';
