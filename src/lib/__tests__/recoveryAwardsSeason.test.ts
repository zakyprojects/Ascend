// Recovery milestone rules (20261030090000): 1 week once per season, 7 days after the later of
// the streak start and the season start; 1 month and 90 days once per streak, in the running season.
import { computeRecoveryChanges, recoveryAwardId } from '../recoveryAwards';
import { getSeasonStart } from '../leagueTime';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const DAY = 86400000;
const s2 = getSeasonStart(new Date('2026-11-01T00:00:00Z')).getTime();
assert(new Date(s2).toISOString() === '2026-10-30T00:00:00.000Z', 'season 2 starts 2026-10-30');

const tracker = (startMs: number) => ({ id: 'trk1', title: 'Smoking', startDate: new Date(startMs).toISOString() }) as never;
const keys = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

// A streak from 2026-08-02 carried into season 2: nothing at the season's first hour.
const carried = Date.parse('2026-08-02T10:54:00Z');
assert(computeRecoveryChanges(tracker(carried), [], s2 + 3600000).length === 0, 'no re-earn at season start');

// 7 days in: the season's 1 week; the 90-day milestone (reached 2026-10-31) once per streak, no suffix.
const week = computeRecoveryChanges(tracker(carried), [], s2 + 7 * DAY + 60000);
assert(
  JSON.stringify(keys(week)) === JSON.stringify([recoveryAwardId('trk1', '1w', carried, 2), `recovery_trk1_90d_${carried}`].sort()),
  `carried streak earns 1w_s2 and 90d: ${keys(week)}`
);
assert(week.find((r) => r.id.includes('_1w_'))!.timestamp === new Date(s2 + 7 * DAY).toISOString(), '1w dated 7 days into the season');

// A streak started inside the season keeps start + 7 days.
const fresh = s2 + 2 * DAY;
const freshRows = computeRecoveryChanges(tracker(fresh), [], fresh + 7 * DAY + 60000);
assert(freshRows.length === 1 && freshRows[0].timestamp === new Date(fresh + 7 * DAY).toISOString(), 'in-season streak: start + 7 days');

// 1 month reached in an earlier season does not pay again.
const old = Date.parse('2026-09-01T00:00:00Z');
assert(!computeRecoveryChanges(tracker(old), [], s2 + 8 * DAY).some((r) => r.id.includes('_1m_')), '1m once per streak');

console.log('recoveryAwardsSeason fixtures: all passed');
