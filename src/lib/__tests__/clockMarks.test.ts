// isMarkOlderThan: tab-return checks (connection, timezone wait) skip a re-read only while the last
// one is recent; no mark, an old mark, or a device clock moved back always re-reads.
import { elapsedMark, isMarkOlderThan } from '../clock';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const now = elapsedMark();
assert(isMarkOlderThan(null, 60_000), 'no mark re-reads');
assert(!isMarkOlderThan(now, 60_000), 'fresh mark skips');
assert(isMarkOlderThan(now - 61_000, 60_000), 'old mark re-reads');
assert(isMarkOlderThan(now + 3_600_000, 60_000), 'mark in the future (clock moved back) re-reads');

console.log('clockMarks: all passed');
