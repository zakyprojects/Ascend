import {
  leagueNow,
  getSeasonStartByNumber,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getSeasonNumber,
  getSeasonStart,
  getSeasonEnd,
  getWeekPeriodId,
  getMonthPeriodId,
  getSeasonPeriodId,
} from '../leagueTime';
import {
  getLeaguePeriodEnd,
  getLeaguePeriodLabel,
  getLeaguePointsPeriods,
  getTimeUntilReset,
} from '../leagues';
import type { LeagueType } from '@/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function runFixtures() {
  console.log('Running leagueTime fixtures tests...\n');

  // Test 1: leagueNow()
  const now = leagueNow();
  assert(now instanceof Date && !isNaN(now.getTime()), 'leagueNow() must return a valid Date instance');

  // Test 2: season master defaults (Season 1 start, 90-day length)
  assert(getSeasonStartByNumber(1).getTime() === Date.UTC(2026, 7, 1), 'Season 1 must start 2026-08-01 00:00 UTC');
  assert(getSeasonStartByNumber(2).getTime() - getSeasonStartByNumber(1).getTime() === 90 * 24 * 60 * 60 * 1000, 'A season must be 90 days');

  // Test 3: Week boundary test cases
  const oldWeekDate = new Date('2026-09-13T23:59:59.999Z'); // Sunday before Monday Sep 14
  const newWeekDate = new Date('2026-09-14T00:00:00.000Z'); // Monday Sep 14

  const oldWeekId = getWeekPeriodId(oldWeekDate);
  const newWeekId = getWeekPeriodId(newWeekDate);

  console.log(`[Week Boundary] 2026-09-13T23:59:59.999Z -> ${oldWeekId}`);
  console.log(`[Week Boundary] 2026-09-14T00:00:00.000Z -> ${newWeekId}`);

  assert(oldWeekId === 'W:2026-W37', `oldWeekId expected W:2026-W37, got ${oldWeekId}`);
  assert(newWeekId === 'W:2026-W38', `newWeekId expected W:2026-W38, got ${newWeekId}`);
  assert(oldWeekId !== newWeekId, 'Period ID must differ between Sunday 23:59:59.999Z and Monday 00:00:00.000Z');

  assert(getWeekStart(oldWeekDate).toISOString() === '2026-09-07T00:00:00.000Z', 'Old week start must be 2026-09-07T00:00:00.000Z');
  assert(getWeekEnd(oldWeekDate).toISOString() === '2026-09-14T00:00:00.000Z', 'Old week end must be 2026-09-14T00:00:00.000Z');
  assert(getWeekStart(newWeekDate).toISOString() === '2026-09-14T00:00:00.000Z', 'New week start must be 2026-09-14T00:00:00.000Z');
  assert(getWeekEnd(newWeekDate).toISOString() === '2026-09-21T00:00:00.000Z', 'New week end must be 2026-09-21T00:00:00.000Z');

  // Test 4: Month boundary test cases
  const sepEndDate = new Date('2026-09-30T23:59:59.999Z');
  const octStartDate = new Date('2026-10-01T00:00:00.000Z');

  const sepMonthId = getMonthPeriodId(sepEndDate);
  const octMonthId = getMonthPeriodId(octStartDate);

  console.log(`[Month Boundary] 2026-09-30T23:59:59.999Z -> ${sepMonthId}`);
  console.log(`[Month Boundary] 2026-10-01T00:00:00.000Z -> ${octMonthId}`);

  assert(sepMonthId === 'M:2026-09', `sepMonthId expected M:2026-09, got ${sepMonthId}`);
  assert(octMonthId === 'M:2026-10', `octMonthId expected M:2026-10, got ${octMonthId}`);
  assert(getMonthStart(sepEndDate).toISOString() === '2026-09-01T00:00:00.000Z', 'Sep start must be 2026-09-01T00:00:00.000Z');
  assert(getMonthEnd(sepEndDate).toISOString() === '2026-10-01T00:00:00.000Z', 'Sep end must be 2026-10-01T00:00:00.000Z');
  assert(getMonthStart(octStartDate).toISOString() === '2026-10-01T00:00:00.000Z', 'Oct start must be 2026-10-01T00:00:00.000Z');
  assert(getMonthEnd(octStartDate).toISOString() === '2026-11-01T00:00:00.000Z', 'Oct end must be 2026-11-01T00:00:00.000Z');

  // Test 5: Season boundary test cases (Aug 1 + 90 days = Oct 30)
  const season1EndDate = new Date('2026-10-29T23:59:59.999Z');
  const season2StartDate = new Date('2026-10-30T00:00:00.000Z');

  const season1Number = getSeasonNumber(season1EndDate);
  const season2Number = getSeasonNumber(season2StartDate);
  const season1Id = getSeasonPeriodId(season1EndDate);
  const season2Id = getSeasonPeriodId(season2StartDate);

  console.log(`[Season Boundary] 2026-10-29T23:59:59.999Z -> Season ${season1Number} (${season1Id})`);
  console.log(`[Season Boundary] 2026-10-30T00:00:00.000Z -> Season ${season2Number} (${season2Id})`);

  assert(season1Number === 1, `Season 1 number expected 1, got ${season1Number}`);
  assert(season2Number === 2, `Season 2 number expected 2, got ${season2Number}`);
  assert(season1Id === 'S:1', `Season 1 ID expected S:1, got ${season1Id}`);
  assert(season2Id === 'S:2', `Season 2 ID expected S:2, got ${season2Id}`);

  assert(getSeasonStart(season1EndDate).toISOString() === '2026-08-01T00:00:00.000Z', 'Season 1 start must be 2026-08-01T00:00:00.000Z');
  assert(getSeasonEnd(season1EndDate).toISOString() === '2026-10-30T00:00:00.000Z', 'Season 1 end must be 2026-10-30T00:00:00.000Z');
  assert(getSeasonStart(season2StartDate).toISOString() === '2026-10-30T00:00:00.000Z', 'Season 2 start must be 2026-10-30T00:00:00.000Z');
  assert(getSeasonEnd(season2StartDate).toISOString() === '2027-01-28T00:00:00.000Z', 'Season 2 end must be 2027-01-28T00:00:00.000Z');

  // Test 6: ISO week-year boundary cases
  const isoYearEndMonday = new Date('2026-12-28T00:00:00.000Z'); // Monday of ISO week 53 in 2026
  const isoYearEndSunday = new Date('2027-01-03T23:59:59.999Z'); // Sunday of ISO week 53 (calendar year 2027, ISO year 2026)
  const isoNewYearMonday = new Date('2027-01-04T00:00:00.000Z'); // Monday of ISO week 01 in 2027

  const isoYearEndMondayId = getWeekPeriodId(isoYearEndMonday);
  const isoYearEndSundayId = getWeekPeriodId(isoYearEndSunday);
  const isoNewYearMondayId = getWeekPeriodId(isoNewYearMonday);

  console.log(`[ISO Week Boundary] 2026-12-28T00:00:00.000Z -> ${isoYearEndMondayId}`);
  console.log(`[ISO Week Boundary] 2027-01-03T23:59:59.999Z -> ${isoYearEndSundayId}`);
  console.log(`[ISO Week Boundary] 2027-01-04T00:00:00.000Z -> ${isoNewYearMondayId}`);

  // Reference: ISO-8601 standard (Thursday determines the ISO week-year; 2026-12-31 is Thursday, so week belongs to 2026-W53)
  assert(isoYearEndMondayId === 'W:2026-W53', `isoYearEndMondayId expected W:2026-W53, got ${isoYearEndMondayId}`);
  assert(isoYearEndSundayId === 'W:2026-W53', `isoYearEndSundayId expected W:2026-W53 (ISO week-year 2026 across calendar year 2027 boundary), got ${isoYearEndSundayId}`);
  assert(isoNewYearMondayId === 'W:2027-W01', `isoNewYearMondayId expected W:2027-W01, got ${isoNewYearMondayId}`);
  assert(isoYearEndSundayId !== isoNewYearMondayId, 'Period ID must roll over across 2027-01-03T23:59:59.999Z and 2027-01-04T00:00:00.000Z');

  // Test 7: Leap year (2028) month and week boundaries
  const leapFebEnd = new Date('2028-02-29T23:59:59.999Z'); // Leap day
  const leapMarStart = new Date('2028-03-01T00:00:00.000Z');

  const leapFebMonthId = getMonthPeriodId(leapFebEnd);
  const leapMarMonthId = getMonthPeriodId(leapMarStart);
  const leapFebWeekId = getWeekPeriodId(leapFebEnd);

  console.log(`[Leap Year 2028] 2028-02-29T23:59:59.999Z -> ${leapFebMonthId}, ${leapFebWeekId}`);
  console.log(`[Leap Year 2028] 2028-03-01T00:00:00.000Z -> ${leapMarMonthId}`);

  assert(leapFebMonthId === 'M:2028-02', `leapFebMonthId expected M:2028-02, got ${leapFebMonthId}`);
  assert(leapMarMonthId === 'M:2028-03', `leapMarMonthId expected M:2028-03, got ${leapMarMonthId}`);
  assert(leapFebWeekId === 'W:2028-W09', `leapFebWeekId expected W:2028-W09, got ${leapFebWeekId}`);

  const febStart = getMonthStart(leapFebEnd);
  const febEnd = getMonthEnd(leapFebEnd);
  assert(febStart.toISOString() === '2028-02-01T00:00:00.000Z', '2028 Feb start must be 2028-02-01T00:00:00.000Z');
  assert(febEnd.toISOString() === '2028-03-01T00:00:00.000Z', '2028 Feb end must be 2028-03-01T00:00:00.000Z');
  assert(febEnd.getTime() - febStart.getTime() === 29 * 24 * 60 * 60 * 1000, '2028 February must span exactly 29 days');

  // Test 8: Pre-epoch dates clamp to Season 1
  const preEpochDate = new Date('2020-01-01T00:00:00.000Z');
  const preEpochSeasonNumber = getSeasonNumber(preEpochDate);
  const preEpochSeasonId = getSeasonPeriodId(preEpochDate);
  const preEpochSeasonStart = getSeasonStart(preEpochDate);
  const preEpochSeasonEnd = getSeasonEnd(preEpochDate);

  console.log(`[Pre-Epoch Clamping] 2020-01-01T00:00:00.000Z -> Season ${preEpochSeasonNumber} (${preEpochSeasonId})`);

  assert(preEpochSeasonNumber === 1, `Pre-epoch season number expected 1, got ${preEpochSeasonNumber}`);
  assert(preEpochSeasonId === 'S:1', `Pre-epoch season ID expected S:1, got ${preEpochSeasonId}`);
  assert(preEpochSeasonStart.toISOString() === '2026-08-01T00:00:00.000Z', 'Pre-epoch season start must clamp to EPOCH_UTC');
  assert(preEpochSeasonEnd.toISOString() === '2026-10-30T00:00:00.000Z', 'Pre-epoch season end must be EPOCH_UTC + 90 days');

  // Test 9: Half-open interval invariant [start, end)
  const samples = [
    oldWeekDate,
    newWeekDate,
    sepEndDate,
    octStartDate,
    season1EndDate,
    season2StartDate,
    isoYearEndMonday,
    isoYearEndSunday,
    isoNewYearMonday,
    leapFebEnd,
    leapMarStart,
    new Date(),
  ];
  for (const s of samples) {
    const ws = getWeekStart(s);
    const we = getWeekEnd(s);
    assert(s.getTime() >= ws.getTime() && s.getTime() < we.getTime(), `Sample ${s.toISOString()} must satisfy ws <= s < we`);

    const ms = getMonthStart(s);
    const me = getMonthEnd(s);
    assert(s.getTime() >= ms.getTime() && s.getTime() < me.getTime(), `Sample ${s.toISOString()} must satisfy ms <= s < me`);

    const ss = getSeasonStart(s);
    const se = getSeasonEnd(s);
    assert(s.getTime() >= ss.getTime() && s.getTime() < se.getTime(), `Sample ${s.toISOString()} must satisfy ss <= s < se`);
  }

  // Test 10: a season start inside a week or month (Season 2 begins Fri 2026-10-30 00:00 UTC,
  // inside W:2026-W44 Oct 26 - Nov 2 and M:2026-10). The running period resets at the season start.
  const utc = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min));
  const HOUR_MS = 60 * 60 * 1000;
  const endCases: [LeagueType, Date, Date][] = [
    ['weekly', utc(2026, 10, 28), utc(2026, 10, 30)],
    ['monthly', utc(2026, 10, 22), utc(2026, 10, 30)],
    ['weekly', utc(2026, 10, 31), utc(2026, 11, 2)],
    ['monthly', utc(2026, 10, 31), utc(2026, 11, 1)],
    ['weekly', utc(2026, 11, 4), utc(2026, 11, 9)],
    ['monthly', utc(2026, 9, 15), utc(2026, 10, 1)],
    ['weekly', utc(2026, 10, 21), utc(2026, 10, 26)],
    ['ninetyDay', utc(2026, 10, 28), utc(2026, 10, 30)],
    ['weekly', utc(2027, 1, 26), utc(2027, 1, 28)],
  ];
  for (const [type, at, want] of endCases) {
    const got = getLeaguePeriodEnd(type, at);
    assert(got.getTime() === want.getTime(), `getLeaguePeriodEnd(${type}, ${at.toISOString()}) expected ${want.toISOString()}, got ${got.toISOString()}`);
  }

  // Countdown just before and just after the season start.
  assert(getTimeUntilReset('weekly', utc(2026, 10, 29, 23)) === HOUR_MS, 'Weekly countdown 1 h before the season start must be 1 h');
  assert(getTimeUntilReset('monthly', utc(2026, 10, 29, 23)) === HOUR_MS, 'Monthly countdown 1 h before the season start must be 1 h');
  assert(getTimeUntilReset('weekly', utc(2026, 10, 30)) === 3 * 24 * HOUR_MS, 'Weekly countdown at the season start must run to Mon Nov 2');
  assert(getTimeUntilReset('monthly', utc(2026, 10, 30)) === 2 * 24 * HOUR_MS, 'Monthly countdown at the season start must run to Nov 1');

  // Live labels follow the cut.
  const labelCases: [LeagueType, Date, string][] = [
    ['weekly', utc(2026, 10, 28), 'Oct 26 – Oct 29'],
    ['weekly', utc(2026, 10, 31), 'Oct 30 – Nov 1'],
    ['weekly', utc(2026, 10, 21), 'Oct 19 – Oct 25'],
    ['monthly', utc(2026, 10, 22), 'Oct 1 – Oct 29'],
    ['monthly', utc(2026, 10, 31), 'Oct 30 – Oct 31'],
    ['monthly', utc(2026, 9, 15), 'September 2026'],
    ['monthly', utc(2026, 11, 15), 'November 2026'],
  ];
  for (const [type, at, want] of labelCases) {
    const got = getLeaguePeriodLabel(type, at);
    assert(got === want, `getLeaguePeriodLabel(${type}, ${at.toISOString()}) expected "${want}", got "${got}"`);
  }

  // The points windows the server accepts keep true week/month ends.
  const pointsBefore = getLeaguePointsPeriods(utc(2026, 10, 28));
  assert(pointsBefore[0].id === 'W:2026-W44' && pointsBefore[0].start.getTime() === utc(2026, 10, 26).getTime()
    && pointsBefore[0].end.getTime() === utc(2026, 11, 2).getTime(), 'Points window for W:2026-W44 on Oct 28 must stay [Oct 26, Nov 2)');
  assert(pointsBefore[13].id === 'M:2026-10' && pointsBefore[13].start.getTime() === utc(2026, 10, 1).getTime()
    && pointsBefore[13].end.getTime() === utc(2026, 11, 1).getTime(), 'Points window for M:2026-10 on Oct 28 must stay [Oct 1, Nov 1)');
  const pointsAfter = getLeaguePointsPeriods(utc(2026, 10, 31));
  assert(pointsAfter[0].start.getTime() === utc(2026, 10, 30).getTime() && pointsAfter[0].end.getTime() === utc(2026, 11, 2).getTime(),
    'Points window for W:2026-W44 on Oct 31 must be [Oct 30, Nov 2)');

  console.log('\nAll leagueTime fixture assertions PASSED successfully!');
}

runFixtures();
