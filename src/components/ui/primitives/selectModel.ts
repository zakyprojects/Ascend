// Pure parts of the AscendDay dropdown (Select.tsx): reading <option> children, moving the active
// option, typeahead and placing the list. No DOM, so they run in the unit tests.
import React from 'react';

export interface SelectOption {
  value: string;
  /** What the option shows (the <option>'s children, kept as given). */
  label: React.ReactNode;
  /** Plain text of the label, for typeahead and the trigger's title. */
  text: string;
  disabled: boolean;
}

export interface ParsedOptions {
  /** The options the list shows (the placeholder left out). */
  options: SelectOption[];
  /** A disabled option with value "": the trigger shows it while nothing is chosen. */
  placeholder: SelectOption | null;
  /** Every <option> in order, placeholder included, for the hidden native select. */
  all: SelectOption[];
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function collect(children: React.ReactNode, out: SelectOption[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      collect((child.props as { children?: React.ReactNode }).children, out);
      return;
    }
    if (child.type !== 'option') return;
    const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
    const text = textOf(props.children);
    out.push({
      // An <option> without a value submits its text, as in HTML.
      value: props.value === undefined ? text : String(props.value),
      label: props.children,
      text,
      disabled: Boolean(props.disabled),
    });
  });
}

/** Reads `<option value disabled>label</option>` children (arrays, fragments, false/null skipped). */
export function parseOptions(children: React.ReactNode): ParsedOptions {
  const all: SelectOption[] = [];
  collect(children, all);
  const placeholderIndex = all.findIndex((o) => o.value === '' && o.disabled);
  const placeholder = placeholderIndex >= 0 ? all[placeholderIndex] : null;
  return { all, placeholder, options: all.filter((_, i) => i !== placeholderIndex) };
}

/**
 * The next enabled option from `from` going `step` (±1, ±10 for PageUp/Down), stopping at the ends
 * (no wrap, as native). A big step that lands on a disabled option keeps going the same way, then
 * falls back the other way. Returns `from` when nothing else is enabled.
 */
export function moveActive(options: SelectOption[], from: number, step: number): number {
  const n = options.length;
  if (n === 0) return -1;
  const dir = step > 0 ? 1 : -1;
  const target = Math.max(0, Math.min(n - 1, from + step));
  for (let j = target; j >= 0 && j < n; j += dir) if (!options[j].disabled) return j;
  for (let j = target - dir; j >= 0 && j < n && j !== from; j -= dir) if (!options[j].disabled) return j;
  return from >= 0 && from < n && !options[from].disabled ? from : firstEnabled(options);
}

export function firstEnabled(options: SelectOption[]): number {
  return options.findIndex((o) => !o.disabled);
}

export function lastEnabled(options: SelectOption[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
  return -1;
}

/**
 * Native typeahead: the typed text matches the start of an option's label (case and accents
 * ignored). The same letter typed again cycles to the next option starting with it. The search
 * starts after `from` and wraps. -1 when nothing matches.
 */
export function typeahead(options: SelectOption[], from: number, buffer: string): number {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const query = fold(buffer);
  if (!query) return -1;
  const sameLetter = query.length > 1 && query.split('').every((c) => c === query[0]);
  const needle = sameLetter ? query[0] : query;
  const n = options.length;
  // A longer query keeps the current option if it still matches; a new letter moves on.
  const start = needle.length > 1 ? from : from + 1;
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n;
    const o = options[i];
    if (!o.disabled && fold(o.text).startsWith(needle)) return i;
  }
  return -1;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  side: 'below' | 'above';
}

export const MENU_GAP = 6;
export const MENU_MARGIN = 12;
export const MENU_MAX_HEIGHT = 320;
export const MENU_MIN_WIDTH = 200;
/** Below the trigger unless less than this fits there and there is more room above. */
export const MENU_FLIP_UNDER = 240;

/**
 * Where the list goes: under the trigger with a small gap, or above it when less than
 * min(list height, 240px) fits below and more fits above. Height is capped at 320px and by the
 * room on that side; width is at least the trigger's (200px minimum), kept `margin` px inside the
 * visible area, right-aligned to the trigger when it would run off the right edge.
 * `area` is the visible part of the page (visualViewport minus safe areas), in the same
 * coordinates as `anchor` (getBoundingClientRect).
 */
export function placeMenu(anchor: Box, area: Box, contentHeight: number, margin = MENU_MARGIN): Placement {
  const areaBottom = area.top + area.height;
  const anchorBottom = anchor.top + anchor.height;
  const below = Math.max(0, areaBottom - anchorBottom - MENU_GAP - margin);
  const above = Math.max(0, anchor.top - area.top - MENU_GAP - margin);
  const want = Math.min(contentHeight, MENU_MAX_HEIGHT);
  const side: Placement['side'] = below >= Math.min(want, MENU_FLIP_UNDER) || below >= above ? 'below' : 'above';
  const maxHeight = Math.max(0, Math.min(want, side === 'below' ? below : above));

  const room = Math.max(0, area.width - margin * 2);
  const width = Math.min(Math.max(anchor.width, MENU_MIN_WIDTH), room);
  const minLeft = area.left + margin;
  const maxLeft = area.left + area.width - margin - width;
  let left = anchor.left;
  if (left + width > area.left + area.width - margin) left = anchor.left + anchor.width - width;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  const top = side === 'below' ? anchorBottom + MENU_GAP : anchor.top - MENU_GAP - maxHeight;
  return { top, left, width, maxHeight, side };
}

/** The trigger has left the visible area (scrolled away): the list closes, as native does. */
export function anchorOutOfView(anchor: Box, area: Box): boolean {
  return anchor.top + anchor.height < area.top || anchor.top > area.top + area.height;
}
