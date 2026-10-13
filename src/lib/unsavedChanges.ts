import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Leave guard for typing that has not been saved yet.
 *
 * A form calls `useUnsavedChanges(open, values)`. While its values differ from what they were
 * when the user first acted on it, the form is "dirty" and:
 * - reload / tab close shows the browser's own "Leave site?" prompt (its text can't be changed);
 * - closing its Dialog (Esc, backdrop, X, Cancel) and changing page in the app (sidebar, mobile
 *   bar, palette, browser back) first ask "Discard changes?" via `DiscardChangesDialog`.
 *
 * Saved data needs none of this: the store writes it to the local mirror at once.
 */

// ---------------------------------------------------------------------------
// Registry of dirty forms (module level: one per page load)
// ---------------------------------------------------------------------------

const dirtyForms = new Set<symbol>();

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older Chrome/Safari only show the prompt when returnValue is set.
  event.returnValue = '';
}

function markDirty(id: symbol): () => void {
  if (dirtyForms.size === 0) window.addEventListener('beforeunload', onBeforeUnload);
  dirtyForms.add(id);
  return () => {
    dirtyForms.delete(id);
    if (dirtyForms.size === 0) window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0;
}

// ---------------------------------------------------------------------------
// The pending "Discard changes?" question, read by DiscardChangesDialog
// ---------------------------------------------------------------------------

let pendingDiscard: (() => void) | null = null;
const listeners = new Set<() => void>();

function setPending(next: (() => void) | null) {
  pendingDiscard = next;
  listeners.forEach((listener) => listener());
}

/** Asks "Discard changes?" and runs `onDiscard` only if the user confirms. */
export function requestDiscard(onDiscard: () => void): void {
  setPending(onDiscard);
}

/** Runs `action` at once when nothing is dirty, otherwise after the user confirms discarding. */
export function confirmLeave(action: () => void): void {
  if (hasUnsavedChanges()) requestDiscard(action);
  else action();
}

export function useDiscardRequest() {
  const pending = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pendingDiscard
  );
  const keepEditing = useCallback(() => setPending(null), []);
  const discard = useCallback(() => {
    const action = pendingDiscard;
    setPending(null);
    action?.();
  }, []);
  return { open: pending !== null, keepEditing, discard };
}

// ---------------------------------------------------------------------------
// Per-form dirty tracking
// ---------------------------------------------------------------------------

// Events that come before the user changes a value: a key (typing, paste shortcut), a pointer
// (clicks, taps, context-menu paste) and beforeinput (on-screen keyboards, voice typing, drop).
// Focus is left out on purpose: Dialog autofocuses a field before a form's own effects prefill it.
const FIRST_ACTION_EVENTS = ['keydown', 'pointerdown', 'beforeinput'] as const;

/**
 * `open`: the form is showing (its dialog is open, or its inline editor is up). A string names
 * what it edits (an item id): switching to another item starts it clean again.
 * `values`: everything the user can change in it (JSON-serialisable).
 *
 * The baseline is the values at the user's first action after the form opened, not at the open
 * itself, so forms that prefill in an effect (edit dialogs) are not reported dirty, and every
 * step of a multi-step form counts. Typing something and deleting it again is clean.
 */
export function useUnsavedChanges(open: boolean | string | null, values: unknown) {
  const active = Boolean(open);
  const serialized = JSON.stringify(values);
  const currentRef = useRef(serialized);
  currentRef.current = serialized;

  const baselineRef = useRef<string | null>(null);
  const openRef = useRef(open);
  if (openRef.current !== open) {
    openRef.current = open;
    baselineRef.current = null;
  }

  useEffect(() => {
    if (!active) return;
    const takeBaseline = () => {
      if (baselineRef.current === null) baselineRef.current = currentRef.current;
    };
    FIRST_ACTION_EVENTS.forEach((type) => document.addEventListener(type, takeBaseline, true));
    return () => {
      FIRST_ACTION_EVENTS.forEach((type) => document.removeEventListener(type, takeBaseline, true));
    };
  }, [active]);

  const dirty = active && baselineRef.current !== null && serialized !== baselineRef.current;

  useEffect(() => {
    if (!dirty) return;
    return markDirty(Symbol('unsaved-form'));
  }, [dirty]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /** For a form's own Cancel button: closes at once when clean, asks first when dirty. */
  const confirmDiscard = useCallback((close: () => void) => {
    if (dirtyRef.current) requestDiscard(close);
    else close();
  }, []);

  return { dirty, confirmDiscard };
}
