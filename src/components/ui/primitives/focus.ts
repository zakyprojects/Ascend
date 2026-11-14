import React from 'react';

/** A mouse or trackpad. Touch skips autofocus: the on-screen keyboard would cover the form first. */
export const isFinePointer = () => window.matchMedia('(pointer: fine)').matches;

const TYPING_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** A field the keyboard types into (a text-like input or a textarea), not a select, date, range or box. */
export function isTypingField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  return el instanceof HTMLInputElement && TYPING_TYPES.has(el.type) && !el.readOnly;
}

/** Focus a control; a text field gets its caret after the text (an edit carries on, nothing is selected). */
export function focusField(el: HTMLElement, options?: FocusOptions) {
  el.focus(options);
  // selectionStart is null where the selection API doesn't apply (number, email); setSelectionRange would throw.
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.selectionStart !== null) {
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }
}

/**
 * For an in-page editor that a button opens (and the button then goes away): call `focusNext(id)` in
 * the click handler; the field with that id is focused, caret at the end, once it has rendered.
 * Closing the editor (Cancel/Save) calls it with the opener's id, so focus goes back to that button.
 */
/**
 * After an async save, focus is still in the editor's form (or nowhere): only then does the closing
 * editor hand focus back to its opener, so a user who moved on while it saved keeps their place.
 */
export function focusStillInForm(fieldId: string): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  return document.getElementById(fieldId)?.closest('form')?.contains(active) ?? false;
}

export function useFocusOnRender() {
  const pending = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pending.current) return;
    const el = document.getElementById(pending.current);
    pending.current = null;
    if (el) focusField(el);
  });
  return React.useCallback((id: string) => {
    pending.current = id;
  }, []);
}
