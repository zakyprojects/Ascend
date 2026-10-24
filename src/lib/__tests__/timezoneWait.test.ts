import { waitHoldsDayPreview } from '../timezoneStatus';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const NOW = Date.parse('2026-10-24T13:00:00Z');
const wait = { resumesAt: new Date('2026-10-25T00:00:00Z') };

// While the server waits on a westward move, the device's today makes no points preview.
assert(waitHoldsDayPreview(wait, '2026-10-24', '2026-10-24', NOW), "device today is held during the wait");
assert(!waitHoldsDayPreview(wait, '2026-10-23', '2026-10-24', NOW), 'another day is not held (it earns nothing anyway)');
assert(!waitHoldsDayPreview(null, '2026-10-24', '2026-10-24', NOW), 'no wait: previews as usual');
assert(
  !waitHoldsDayPreview(wait, '2026-10-24', '2026-10-24', wait.resumesAt.getTime()),
  'a wait whose resume time has passed no longer holds (a stale read must not hide real points)'
);

console.log('timezoneWait fixtures: all passed');
