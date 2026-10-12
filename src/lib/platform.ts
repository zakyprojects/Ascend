/** Apple keyboards label the shortcut modifier ⌘; everyone else uses Ctrl. Display only. */
export const IS_APPLE_PLATFORM =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
