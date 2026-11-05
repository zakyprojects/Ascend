// caughtUpAnchor (clock.ts): after a sleep that paused performance.now(), the trusted time moves
// forward by the time the device clock says passed, before the server read lands (e3 in
// knowledge/mode-a-sync-remaining-2026-11-05.md). A device clock moved back is never followed.
import { caughtUpAnchor } from '../clock';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const server = Date.parse('2026-11-05T04:00:00.000Z');
const anchor = { serverMs: server, perfMs: 1_000, deviceMs: 50_000 };
const HOUR = 3_600_000;

// Awake: both clocks moved 10 s.
assert(caughtUpAnchor(anchor, 11_000, 60_000) === null, 'no drift: anchor kept');
// Within the 2 s tolerance.
assert(caughtUpAnchor(anchor, 11_000, 61_500) === null, 'small drift: anchor kept');
// Slept 3 h: performance.now() moved 5 s, the device clock 3 h + 5 s.
const slept = caughtUpAnchor(anchor, 6_000, 50_000 + 3 * HOUR + 5_000);
assert(slept !== null, 'sleep noticed');
const nowAfter = slept!.serverMs + (6_000 - slept!.perfMs);
assert(nowAfter === server + 3 * HOUR + 5_000, `time catches up with the sleep (got ${new Date(nowAfter).toISOString()})`);
assert(caughtUpAnchor(slept!, 7_000, slept!.deviceMs + 1_000) === null, 'the new anchor holds afterwards');
// Device clock moved back an hour: never followed.
assert(caughtUpAnchor(anchor, 11_000, 60_000 - HOUR) === null, 'clock moved back: anchor kept');

console.log('clockCatchUp: all passed');
