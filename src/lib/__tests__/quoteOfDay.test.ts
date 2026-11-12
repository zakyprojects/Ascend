// Fixtures for the Dashboard quote of the day: one quote per local day, counted from the first
// season's start date and wrapped over the 90-quote list. CI runs them in more than one time zone.
import { addDays, todayKey } from '../dates';
import { getSeasonStartByNumber } from '../leagueTime';
import { quoteForDay, quoteIndexForDay } from '../quoteOfDay';
import { QUOTES } from '../quotes';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const local = (key: string, hour = 0, minute = 0, second = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, second);
};

// The default season calendar (Season 1 starts 2026-11-01 00:00 UTC) is what this file pins.
const start = getSeasonStartByNumber(1);
const startKey = start.toISOString().slice(0, 10);
assert(startKey === '2026-11-01', `season 1 starts on 2026-11-01 (got ${startKey})`);

// 1. The list: exactly 90, unique, short, every line has an author.
{
  assert(QUOTES.length === 90, `90 quotes (got ${QUOTES.length})`);
  const texts = new Set(QUOTES.map((q) => q.text.trim().toLowerCase()));
  assert(texts.size === 90, `90 unique texts (got ${texts.size})`);
  for (const [i, q] of QUOTES.entries()) {
    assert(q.text.trim().length > 0, `quote ${i} has text`);
    assert(q.text.length <= 160, `quote ${i} is at most 160 chars (${q.text.length})`);
    assert(q.author.trim().length > 0, `quote ${i} has an author`);
  }
}

// 2. Day 0, day 89 and the wrap back to 0 (Season 2 day 0).
{
  assert(quoteIndexForDay('2026-11-01') === 0, 'season start day is index 0');
  assert(quoteForDay('2026-11-01') === QUOTES[0], 'season start day shows the first quote');
  assert(quoteIndexForDay('2026-11-02') === 1, 'the next day is index 1');
  assert(quoteIndexForDay('2027-01-29') === 89, '2027-01-29 is index 89');
  assert(quoteIndexForDay('2027-01-30') === 0, '2027-01-30 wraps to index 0');
  assert(quoteIndexForDay(addDays(startKey, 180)) === 0, 'two full cycles later is index 0 again');
}

// 3. No repeat inside any 90 consecutive days (checked for every start day over three years,
//    across year ends, a leap day and daylight-saving changes in the zone the test runs in).
{
  let key = '2026-01-01';
  const window: number[] = [];
  for (let i = 0; i < 3 * 366 + 90; i++) {
    window.push(quoteIndexForDay(key));
    if (window.length > 90) window.shift();
    if (window.length === 90) assert(new Set(window).size === 90, `90 different quotes in the 90 days ending ${key}`);
    const next = addDays(key, 1);
    assert(quoteIndexForDay(next) === (quoteIndexForDay(key) + 1) % 90, `one step per day at ${key}`);
    key = next;
  }
  assert(quoteIndexForDay('2028-02-29') === (quoteIndexForDay('2028-02-28') + 1) % 90, 'leap day is its own day');
}

// 4. Local midnight changes the quote; the rest of the day keeps it.
{
  for (const day of ['2026-11-12', '2027-01-29', '2027-03-14', '2026-11-01', '2027-12-31']) {
    const lateKey = todayKey(local(day, 23, 59, 59));
    const nextKey = todayKey(local(addDays(day, 1), 0, 0, 0));
    assert(lateKey === day, `23:59:59 is still ${day}`);
    assert(quoteForDay(todayKey(local(day, 0, 0, 0))).text === quoteForDay(lateKey).text, `same quote all of ${day}`);
    assert(quoteForDay(nextKey).text !== quoteForDay(lateKey).text, `new quote at local midnight after ${day}`);
  }
}

// 5. Bad clocks and bad keys: a valid index, never a crash.
{
  for (const key of ['2020-01-01', '1970-01-01', '2026-10-31', '2099-12-31']) {
    const i = quoteIndexForDay(key);
    assert(Number.isInteger(i) && i >= 0 && i < 90, `valid index for ${key} (got ${i})`);
  }
  assert(quoteIndexForDay('2026-10-31') === 89, 'the day before the season start is index 89');
  for (const key of ['', 'NaN-NaN-NaN', 'not a date', '2026-11']) {
    assert(quoteIndexForDay(key) === 0, `bad key "${key}" falls back to index 0`);
    assert(quoteForDay(key) === QUOTES[0], `bad key "${key}" still gives a quote`);
  }
  assert(quoteIndexForDay(todayKey(new Date(NaN))) === 0, 'an invalid clock falls back to index 0');
}

console.log(`quoteOfDay: all fixtures passed (zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
