// The app's dropdown (ui/primitives/Select.tsx): reading <option> children, moving the active
// option past disabled ones, typeahead and placing the list (flip up, height cap, edge clamp).
import { createElement as h, Fragment } from 'react';
import {
  anchorOutOfView,
  firstEnabled,
  lastEnabled,
  moveActive,
  parseOptions,
  placeMenu,
  typeahead,
  MENU_MAX_HEIGHT,
  type SelectOption,
} from '../ui/primitives/selectModel';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// --- parseOptions -------------------------------------------------------------------------
{
  const skills = ['Guitar', 'Chess'];
  const parsed = parseOptions([
    h('option', { key: 'p', value: '', disabled: true }, 'Choose a skill'),
    false,
    null,
    ...skills.map((s, i) => h('option', { key: s, value: `s${i}` }, s)),
    h(Fragment, { key: 'f' }, h('option', { value: 'new' }, 'New count…'), h('option', { value: 'x', disabled: true }, 'Used')),
    h('option', { key: 'n', value: 7 }, 'Seven ', 'days'),
    h('option', { key: 't' }, 'Text value'),
  ]);
  eq(parsed.placeholder?.text, 'Choose a skill', 'placeholder found');
  eq(parsed.options.map((o) => o.value), ['s0', 's1', 'new', 'x', '7', 'Text value'], 'list leaves the placeholder out, flattens fragments, skips false/null');
  eq(parsed.all.length, 7, 'all keeps the placeholder for the hidden select');
  eq(parsed.options[3].disabled, true, 'disabled option kept');
  eq(parsed.options[4].text, 'Seven days', 'array label text joined');
  eq(parsed.options[5].value, 'Text value', 'option without a value uses its text');
}
{
  // An enabled "" option ("No skill", "Not linked") is a normal option, not a placeholder.
  const parsed = parseOptions([h('option', { key: 'a', value: '' }, 'No skill'), h('option', { key: 'b', value: 'g' }, 'Guitar')]);
  eq(parsed.placeholder, null, 'enabled empty option is not a placeholder');
  eq(parsed.options.length, 2, 'both listed');
}
{
  const parsed = parseOptions([h('option', { key: 'p', value: '', disabled: true }, 'Choose a skill')]);
  eq(parsed.options.length, 0, 'only a placeholder: empty list');
}

// --- moveActive / first / last ---------------------------------------------------------------
const opt = (text: string, disabled = false): SelectOption => ({ value: text, label: text, text, disabled });
const list = [opt('A', true), opt('B'), opt('C', true), opt('D'), opt('E', true)];
eq(firstEnabled(list), 1, 'first enabled');
eq(lastEnabled(list), 3, 'last enabled');
eq(moveActive(list, 1, 1), 3, 'down skips disabled');
eq(moveActive(list, 3, 1), 3, 'down at the last enabled stays (no wrap)');
eq(moveActive(list, 3, -1), 1, 'up skips disabled');
eq(moveActive(list, 1, -1), 1, 'up at the first enabled stays');
eq(moveActive(list, -1, 1), 1, 'down from nothing → first enabled');
eq(moveActive(list, 1, 10), 3, 'PageDown clamps to the last enabled');
eq(moveActive(list, 3, -10), 1, 'PageUp clamps to the first enabled');
eq(moveActive([], 0, 1), -1, 'empty list');
eq(moveActive([opt('x', true)], 0, 1), -1, 'all disabled');

// --- typeahead -------------------------------------------------------------------------------
const pages = ['Dashboard', 'Daily habits', 'Exercise', 'Journal', 'Reading', 'Recovery', 'Settings', 'Éducation'].map((t) => opt(t));
eq(typeahead(pages, -1, 'r'), 4, 'R → Reading');
eq(typeahead(pages, 4, 'r'), 5, 'R again from Reading → Recovery');
eq(typeahead(pages, 5, 'r'), 4, 'wraps');
eq(typeahead(pages, 4, 'rr'), 5, 'same letter repeated cycles');
eq(typeahead(pages, 4, 'rec'), 5, 'prefix match');
eq(typeahead(pages, 4, 'rea'), 4, 'longer query keeps the current match');
eq(typeahead(pages, 0, 'da'), 0, 'case-insensitive multi-letter');
eq(typeahead(pages, 0, 'e'), 2, 'next E');
eq(typeahead(pages, 2, 'e'), 7, 'accents ignored (É)');
eq(typeahead(pages, 0, 'z'), -1, 'no match');
eq(typeahead([opt('Rest', true), opt('Run')], -1, 'r'), 1, 'disabled skipped');

// --- placeMenu -------------------------------------------------------------------------------
const area = { top: 0, left: 0, width: 375, height: 800 };
{
  const p = placeMenu({ top: 100, left: 16, width: 343, height: 44 }, area, 200);
  eq(p.side, 'below', 'room below → below');
  eq(p.top, 150, 'top = bottom + 6');
  eq(p.maxHeight, 200, 'short list keeps its height');
  eq([p.left, p.width], [16, 343], 'width = trigger width');
}
{
  const p = placeMenu({ top: 100, left: 16, width: 343, height: 44 }, area, 2000);
  eq(p.maxHeight, MENU_MAX_HEIGHT, 'long list capped at 320');
}
{
  // Near the bottom (FeedbackView "Which page?" at 375): flips up and fits above.
  const p = placeMenu({ top: 700, left: 16, width: 343, height: 44 }, area, 900);
  eq(p.side, 'above', 'little room below → above');
  eq(p.maxHeight, 320, 'above uses the cap');
  eq(p.top, 700 - 6 - 320, 'bottom edge 6px over the trigger');
}
{
  // Below has room for 240+ even though above has more: stays below.
  const p = placeMenu({ top: 480, left: 16, width: 343, height: 44 }, area, 900);
  eq(p.side, 'below', 'enough below stays below');
  eq(p.maxHeight, 800 - 524 - 6 - 12, 'height = room below');
}
{
  // Keyboard open: visible area 0..400 (visualViewport), trigger at 330.
  const p = placeMenu({ top: 330, left: 16, width: 343, height: 44 }, { top: 0, left: 0, width: 375, height: 400 }, 600);
  eq(p.side, 'above', 'keyboard shrinks the area: flips up');
  assert(p.top >= 12, `stays on screen (top ${p.top})`);
}
{
  // A narrow toolbar select at the right end of a row: at least 200 wide, right-aligned, kept 12px inside.
  const p = placeMenu({ top: 100, left: 1380, width: 100, height: 36 }, { top: 0, left: 0, width: 1500, height: 900 }, 150);
  eq(p.width, 200, 'min width 200');
  eq(p.left, 1280, 'right-aligned to the trigger');
  const q = placeMenu({ top: 100, left: 300, width: 60, height: 36 }, area, 150);
  eq(q.left, 160, 'right-aligned on a phone too');
  const q2 = placeMenu({ top: 100, left: 340, width: 60, height: 36 }, area, 150);
  eq(q2.left, 375 - 12 - 200, 'clamped 12px from the right edge');
  const r = placeMenu({ top: 100, left: 0, width: 600, height: 36 }, area, 150);
  eq([r.left, r.width], [12, 351], 'never wider than the screen');
}
eq(anchorOutOfView({ top: -60, left: 0, width: 10, height: 44 }, area), true, 'scrolled above → out');
eq(anchorOutOfView({ top: 790, left: 0, width: 10, height: 44 }, area), false, 'partly visible → in');
eq(anchorOutOfView({ top: 801, left: 0, width: 10, height: 44 }, area), true, 'below → out');

console.log('selectModel fixtures: all passed');
