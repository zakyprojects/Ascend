// Hands keyboard focus from a closing ReorderList back to its Reorder button (ui/Reorder.tsx).
// Kept apart from both so the main bundle never pulls in the lazily loaded list.

// The list whose Reorder mode just closed (Done/Cancel): its Reorder button takes focus back when it renders.
let returnFocusTo: string | null = null;

/** Called by ReorderList as it closes, so keyboard focus goes back to the button that opened it. */
export function returnFocusToReorderButton(label: string) {
  returnFocusTo = label;
  // Only the render right after closing may take it; a later button with this label must not.
  setTimeout(() => {
    if (returnFocusTo === label) returnFocusTo = null;
  }, 0);
}

/** True once for the Reorder button of the list that just closed; that button then takes focus. */
export function takeReturnFocus(label: string): boolean {
  if (returnFocusTo !== label) return false;
  returnFocusTo = null;
  return true;
}
