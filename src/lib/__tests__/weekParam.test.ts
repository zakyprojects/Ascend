// Fixtures for opening Weekly Goals at a week (`?week=`) and the week a Sunday planning notice
// opens, including the 2026 → 2027 year end where the app's week numbering has no 2027-W01.
import { weekKey } from '../time/dates';
import { isWeekKey, planningWeekKey, weekFromParam, weekSearch } from '../time/weekParam';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const local = (key: string, hour = 0, minute = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

// 1. Which keys are real weeks in the app's numbering.
{
  assert(isWeekKey('2026-W46'), 'plain week');
  assert(isWeekKey('2026-W53'), '2026 has a W53 (Mon Dec 28)');
  assert(!isWeekKey('2027-W01'), '2027-W01 does not exist (that Monday is 2026-W53)');
  assert(isWeekKey('2027-W02'), 'first week of 2027 is W02');
  for (const bad of ['', 'abc', '2026-W99', '2026-W00', '2026-w46', '2026-W4', ' 2026-W46', '2026-W46x', '2026-11-09']) {
    assert(!isWeekKey(bad), `not a week key: "${bad}"`);
  }
  assert(!isWeekKey(null) && !isWeekKey(undefined) && !isWeekKey(46), 'non-strings are not week keys');
}

// 2. ?week= value → the week the page opens (this week for anything past or unreadable).
{
  const current = '2026-W45';
  assert(weekFromParam('2026-W46', current) === '2026-W46', 'next week opens next week');
  assert(weekFromParam('2026-W45', current) === '2026-W45', 'this week opens this week');
  assert(weekFromParam('2026-W50', current) === '2026-W50', 'a later week opens as named');
  assert(weekFromParam('2026-W44', current) === current, 'a past week opens this week');
  assert(weekFromParam('2025-W53', current) === current, 'an old year opens this week');
  assert(weekFromParam('2026-W99', current) === current, 'a week that does not exist opens this week');
  assert(weekFromParam('abc', current) === current, 'garbage opens this week');
  assert(weekFromParam('', current) === current, 'empty opens this week');
  assert(weekFromParam(null, current) === current, 'no param opens this week');
  assert(weekFromParam('2027-W01', '2026-W53') === '2026-W53', 'missing 2027-W01 opens this week');
  assert(weekFromParam('2027-W02', '2026-W53') === '2027-W02', 'across the year end');
  assert(weekSearch('2026-W46') === '?week=2026-W46', 'search for a valid key');
  assert(weekSearch('2026-W99') === '' && weekSearch(null) === '', 'no search for a bad key');
}

// 3. The week a Sunday planning notice opens: the server's planWeekKey first.
{
  assert(planningWeekKey({ planWeekKey: '2026-W47', weekKey: '2026-W46' }, '2026-11-15T14:02:00.000Z') === '2026-W47', 'payload planWeekKey wins');
  // Old rows (ISO weekKey only, or a planWeekKey that is not a real week): the week of the day after.
  const created = local('2026-11-08', 19, 2).toISOString();
  assert(planningWeekKey({ weekKey: '2026-W45' }, created) === '2026-W46', 'old row: Sunday 19:02 → next week');
  assert(planningWeekKey({ planWeekKey: 'nope' }, created) === '2026-W46', 'bad planWeekKey falls back to created_at');
  assert(planningWeekKey(undefined, created) === '2026-W46', 'no payload falls back to created_at');
  assert(planningWeekKey({}, 'not a date') === null, 'nothing readable → null');
}

// 4. Year end: each Sunday's ending week and planned week (what the SQL sends as weekKey and
//    planWeekKey via ascend_week_key(sunday) / ascend_week_key(sunday + 1)) agree with the client.
{
  const cases: Array<{ sunday: string; ending: string; plan: string }> = [
    { sunday: '2026-11-08', ending: '2026-W45', plan: '2026-W46' },
    { sunday: '2026-11-15', ending: '2026-W46', plan: '2026-W47' },
    { sunday: '2026-12-27', ending: '2026-W52', plan: '2026-W53' },
    { sunday: '2027-01-03', ending: '2026-W53', plan: '2027-W02' },
    { sunday: '2027-01-10', ending: '2027-W02', plan: '2027-W03' },
  ];
  for (const { sunday, ending, plan } of cases) {
    const sun = local(sunday, 19, 2);
    const mon = local(sunday, 19, 2);
    mon.setDate(mon.getDate() + 1);
    assert(weekKey(sun) === ending, `${sunday}: ending week ${ending} (got ${weekKey(sun)})`);
    assert(weekKey(mon) === plan, `${sunday}: plan week ${plan} (got ${weekKey(mon)})`);
    assert(isWeekKey(plan) && isWeekKey(ending), `${sunday}: both keys are real weeks`);
    // An old row created that Sunday evening opens the same week as a new row's planWeekKey.
    assert(planningWeekKey({}, sun.toISOString()) === plan, `${sunday}: created_at fallback = ${plan}`);
    assert(planningWeekKey({ planWeekKey: plan }, sun.toISOString()) === plan, `${sunday}: payload = ${plan}`);
    // Sunday night it is next week; opened Monday morning it is this week; a week later, this week.
    assert(weekFromParam(plan, ending) === plan, `${sunday}: Sunday night opens next week`);
    assert(weekFromParam(plan, plan) === plan, `${sunday}: Monday morning opens this week`);
    const later = weekKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7));
    assert(weekFromParam(plan, later) === later, `${sunday}: a week later opens the current week`);
  }
}

console.log('\nAll weekParam fixture assertions PASSED successfully!');
