// Ctrl+Enter (Cmd+Enter on a Mac) in a Textarea saves, like clicking the form's save button.
// Plain Enter and Shift+Enter keep typing a new line.

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  /** React's synthetic event keeps these on `nativeEvent`. */
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
  isComposing?: boolean;
  keyCode?: number;
}

/** True for one Ctrl/Cmd+Enter press; false while an IME is composing or the key repeats. */
export function isSubmitShortcut(event: ShortcutKeyEvent): boolean {
  if (event.key !== 'Enter' || event.repeat) return false;
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return false;
  const native = event.nativeEvent ?? event;
  // 229 = the key went to an IME (Safari reports isComposing late on the confirming Enter).
  return !native.isComposing && native.keyCode !== 229;
}

type SubmitControl = HTMLButtonElement | HTMLInputElement;

/**
 * The button a click would save with: the form's first submit button, footer buttons linked with
 * `form=` included (`form.elements` lists them). Null when there is none or it is disabled, so the
 * shortcut never saves while the form itself says it can't (busy, or the window is closed).
 */
export function shortcutSubmitter(form: HTMLFormElement | null): SubmitControl | null {
  if (!form) return null;
  for (const el of Array.from(form.elements)) {
    const control = el as SubmitControl;
    const tag = control.tagName;
    const isSubmit =
      (tag === 'BUTTON' && control.type === 'submit') ||
      (tag === 'INPUT' && (control.type === 'submit' || control.type === 'image'));
    if (isSubmit) return control.disabled ? null : control;
  }
  return null;
}

/**
 * The Textarea's keydown after the caller's own handler: a caller that already handled the key
 * (preventDefault) wins. `onSubmitShortcut` is the save of a textarea that is not in a form.
 */
export function runSubmitShortcut(
  event: ShortcutKeyEvent & {
    defaultPrevented: boolean;
    preventDefault: () => void;
    currentTarget: { form: HTMLFormElement | null };
  },
  onSubmitShortcut?: () => void
): void {
  if (event.defaultPrevented || !isSubmitShortcut(event)) return;
  if (onSubmitShortcut) {
    event.preventDefault();
    onSubmitShortcut();
    return;
  }
  const form = event.currentTarget.form;
  const submitter = shortcutSubmitter(form);
  if (!form || !submitter) return;
  event.preventDefault();
  form.requestSubmit(submitter);
}
