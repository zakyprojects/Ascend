// Ctrl/Cmd+Enter in a Textarea (ui/primitives/submitShortcut.ts): which presses count, which
// button a save would use, and that a disabled or missing save button does nothing.
import { isSubmitShortcut, runSubmitShortcut, shortcutSubmitter } from '../ui/primitives/submitShortcut';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const key = (over: Partial<Parameters<typeof isSubmitShortcut>[0]> = {}) => ({
  key: 'Enter',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  nativeEvent: { isComposing: false, keyCode: 13 },
  ...over,
});

// --- isSubmitShortcut ----------------------------------------------------------------------
assert(isSubmitShortcut(key()), 'Ctrl+Enter counts');
assert(isSubmitShortcut(key({ ctrlKey: false, metaKey: true })), 'Cmd+Enter counts');
assert(!isSubmitShortcut(key({ ctrlKey: false })), 'plain Enter is a new line');
assert(!isSubmitShortcut(key({ shiftKey: true })), 'Ctrl+Shift+Enter is not the shortcut');
assert(!isSubmitShortcut(key({ altKey: true })), 'Ctrl+Alt+Enter is not the shortcut');
assert(!isSubmitShortcut(key({ key: 'a' })), 'Ctrl+A is not the shortcut');
assert(!isSubmitShortcut(key({ repeat: true })), 'a held key does not save again');
assert(!isSubmitShortcut(key({ nativeEvent: { isComposing: true, keyCode: 13 } })), 'IME composing: no save');
assert(!isSubmitShortcut(key({ nativeEvent: { isComposing: false, keyCode: 229 } })), 'IME keyCode 229: no save');
assert(isSubmitShortcut({ ...key(), nativeEvent: undefined }), 'a plain DOM event without nativeEvent works');

// --- shortcutSubmitter ---------------------------------------------------------------------
type Fake = { tagName: string; type: string; disabled: boolean; name?: string };
const button = (type: string, disabled = false, name = ''): Fake => ({ tagName: 'BUTTON', type, disabled, name });
const formOf = (...elements: Fake[]) => {
  const submits: unknown[] = [];
  const form = { elements, requestSubmit: (s?: unknown) => void submits.push(s) };
  return { form: form as unknown as HTMLFormElement, submits };
};

{
  const save = button('submit', false, 'save');
  const { form } = formOf({ tagName: 'TEXTAREA', type: 'textarea', disabled: false }, button('button'), save);
  assert(shortcutSubmitter(form) === (save as unknown), 'skips type=button and fields, finds the submit button');
}
{
  // A footer button linked with form= is in form.elements like any other.
  const footer = button('submit', false, 'footer');
  const { form } = formOf(button('button', false, 'cancel'), footer);
  assert(shortcutSubmitter(form) === (footer as unknown), 'footer button linked by form= is used');
}
assert(shortcutSubmitter(formOf(button('submit', true)).form) === null, 'disabled save button (busy) → nothing');
assert(shortcutSubmitter(formOf(button('submit', true), button('submit')).form) === null, 'the default button decides, not a later one');
assert(shortcutSubmitter(formOf(button('button')).form) === null, 'no submit button → nothing');
assert(shortcutSubmitter(null) === null, 'textarea outside a form → nothing');
{
  const input = { tagName: 'INPUT', type: 'submit', disabled: false };
  assert(shortcutSubmitter(formOf({ tagName: 'INPUT', type: 'text', disabled: false }, input).form) === (input as unknown), 'input type=submit counts, text input does not');
}

// --- runSubmitShortcut ---------------------------------------------------------------------
const event = (form: HTMLFormElement | null, over: Partial<ReturnType<typeof key>> = {}) => {
  const e = {
    ...key(over),
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
    currentTarget: { form },
  };
  return e;
};

{
  const save = button('submit');
  const { form, submits } = formOf(save);
  const e = event(form);
  runSubmitShortcut(e);
  assert(submits.length === 1 && submits[0] === save, 'submits once through the save button (same validation as a click)');
  assert(e.defaultPrevented, 'the Enter does not also type a new line');
}
{
  const { form, submits } = formOf(button('submit', true));
  const e = event(form);
  runSubmitShortcut(e);
  assert(submits.length === 0 && !e.defaultPrevented, 'disabled save: no submit, key left alone');
}
{
  const { form, submits } = formOf(button('submit'));
  runSubmitShortcut(event(form, { ctrlKey: false }));
  assert(submits.length === 0, 'plain Enter never submits');
}
{
  const { form, submits } = formOf(button('submit'));
  const e = event(form);
  e.preventDefault(); // the caller's own onKeyDown handled it
  runSubmitShortcut(e);
  assert(submits.length === 0, 'a caller that already handled the key wins');
}
{
  let saved = 0;
  const { form, submits } = formOf(button('submit'));
  const e = event(form);
  runSubmitShortcut(e, () => saved++);
  assert(saved === 1 && submits.length === 0 && e.defaultPrevented, 'onSubmitShortcut runs instead of the form');
  let outside = 0;
  runSubmitShortcut(event(null), () => outside++);
  assert(outside === 1, 'onSubmitShortcut works with no form');
  runSubmitShortcut(event(null, { repeat: true }), () => outside++);
  assert(outside === 1, 'held key does not run onSubmitShortcut twice');
}

console.log('submitShortcut: all assertions passed');
