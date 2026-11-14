// The release note body (ui/WhatsNewDialog.tsx): used by the pop-up and the notification panel entry.
// Only groups with lines render, in order New, Improved, Changed, Fixed, Removed.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ReleaseNoteBody } from '../ui/WhatsNewDialog';
import type { ReleaseNote } from '@/lib/releaseNote';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const note: ReleaseNote = {
  id: 1,
  releasedAt: '2026-11-10T09:00:00+05:00',
  fixed: ['Fixed line'],
  new: ['New line'],
  improved: [],
  changed: ['   '],
};
const html = renderToString(createElement(ReleaseNoteBody, { note }));
const headings = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
assert(headings.join(',') === 'New,Fixed', `only filled groups render in order, got ${headings.join(',')}`);
assert(!html.includes('Improved') && !html.includes('Changed') && !html.includes('Removed'), 'empty groups have no heading');
assert(html.includes('New line') && html.includes('Fixed line'), 'lines render');
assert((html.match(/<li/g) ?? []).length === 2, 'one li per line, blank dropped');

const empty = renderToString(createElement(ReleaseNoteBody, { note: { id: 2, releasedAt: note.releasedAt } }));
assert(!empty.includes('<h3') && !empty.includes('<li'), 'a note with no lines renders no groups');

console.log('whatsNew body: all assertions passed');
