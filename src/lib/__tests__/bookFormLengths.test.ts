// Book forms (Add book, Start reading): the length offered for the other unit uses 1 chapter = 20 pages
// (Zakria 2026-11-09), like a switch mid-book; the switch note says where the reader was.
import { lengthsByUnit, unitSwitchNote } from '@/components/reading/bookMeta';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const p = lengthsByUnit('pages', 256);
assert(p.pages === 256 && p.chapters === 13, `256 pages -> 13 chapters (${JSON.stringify(p)})`);
assert(lengthsByUnit('pages', 250).chapters === 13, '250 pages -> 13 chapters (rounded up)');
assert(lengthsByUnit('pages', 5).chapters === 1, 'at least 1 chapter');
const c = lengthsByUnit('chapters', 12);
assert(c.chapters === 12 && c.pages === 240, `12 chapters -> 240 pages (${JSON.stringify(c)})`);
assert(unitSwitchNote(10, 'pages') === "You were at 10 pages. Points you already earned don't change.", 'switch note');
assert(unitSwitchNote(1, 'chapters').startsWith('You were at 1 chapter.'), 'switch note, singular');

console.log('All book form length tests passed.');
