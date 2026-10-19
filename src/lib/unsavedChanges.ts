import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { trustedNowMs } from './clock';
import { storedAuthSession } from './supabase';

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
 *
 * A form can also keep a draft (`draft` option): while it is dirty its values are kept on this
 * device, so typing survives the phone killing the tab in the background (or a reload). The next
 * time the same form opens for the same item, the draft is put back. Closing the form any way
 * (save, discard, cancel) or undoing the typing removes the draft.
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
// Drafts kept on this device (localStorage), per account
// ---------------------------------------------------------------------------

const DRAFT_PREFIX = 'ascend_draft:';
// A draft nobody came back to for this long is dropped.
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  values: string;
  savedAt: number;
}

function draftStorageKey(key: string): string {
  // Per account: another account signing in on this phone never sees it.
  return `${DRAFT_PREFIX}${storedAuthSession()?.userId ?? 'local'}:${key}`;
}

function readDraft(storageKey: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (typeof draft?.values === 'string' && typeof draft.savedAt === 'number' && trustedNowMs() - draft.savedAt < DRAFT_MAX_AGE_MS) {
      return draft.values;
    }
    localStorage.removeItem(storageKey);
  } catch {
    /* storage blocked or a broken entry: no draft */
  }
  return null;
}

function writeDraft(storageKey: string, values: string): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ values, savedAt: trustedNowMs() } satisfies StoredDraft));
  } catch {
    /* storage full or blocked: the leave guard still protects the typing */
  }
}

function removeDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* storage blocked */
  }
}

/** Removes every draft on this device (sign-out). */
export function clearDrafts(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked */
  }
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
 *
 * `draft`: keeps the typing on this device while dirty. `key` names the form (and anything that
 * must match for the draft to apply, such as the day); a string `open` is added to it. `restore`
 * puts saved values back into the form's state; it runs right after the form opens (after its
 * own prefill), and the form then counts as dirty against what it showed before. Never use it
 * for passwords.
 */
export function useUnsavedChanges<T>(
  open: boolean | string | null,
  values: T,
  draft?: { key: string; restore: (values: T) => void }
) {
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

  // Drafts. The key is read when the form opens (the signed-in account is known by then).
  const draftKey = draft && active ? draft.key + (typeof open === 'string' ? `:${open}` : '') : null;
  const restoreRef = useRef(draft?.restore);
  restoreRef.current = draft?.restore;
  const storageKey = useMemo(() => draftKey && draftStorageKey(draftKey), [draftKey]);

  // On open: put a kept draft back once the form's own open effects have prefilled it.
  useEffect(() => {
    if (!storageKey) return;
    const saved = readDraft(storageKey);
    if (saved === null) return;
    const timer = setTimeout(() => {
      if (saved === currentRef.current) {
        removeDraft(storageKey);
        return;
      }
      baselineRef.current = currentRef.current;
      restoreRef.current?.(JSON.parse(saved) as T);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (dirty && storageKey) writeDraft(storageKey, serialized);
  }, [dirty, storageKey, serialized]);

  // Clean again, closed (saved, discarded, cancelled) or gone: the draft goes. A page the phone
  // kills runs no cleanup, so its draft stays for the next open.
  useEffect(() => {
    if (!dirty || !storageKey) return;
    return () => removeDraft(storageKey);
  }, [dirty, storageKey]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /** For a form's own Cancel button: closes at once when clean, asks first when dirty. */
  const confirmDiscard = useCallback((close: () => void) => {
    if (dirtyRef.current) requestDiscard(close);
    else close();
  }, []);

  return { dirty, confirmDiscard };
}
