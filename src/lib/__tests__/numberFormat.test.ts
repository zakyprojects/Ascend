// compactNumber (lib/numberFormat.ts): numbers on the member card. Full below 10,000, short from 10,000
// with at most one decimal, lowercase k, never "1000k", sign kept.
const { compactNumber } = await import('../leagues/numberFormat');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const cases: Array<[number, string]> = [
  [0, '0'],
  [1, '1'],
  [3.25, '3.25'],
  [999, '999'],
  [9999, '9,999'],
  [10000, '10k'],
  [10049, '10k'],
  [10050, '10.1k'],
  [12450, '12.5k'],
  [12500, '12.5k'],
  [100000, '100k'],
  [999949, '999.9k'],
  [999950, '1M'],
  [1000000, '1M'],
  [1200000, '1.2M'],
  [1250000, '1.3M'],
  [-12450, '−12.5k'],
  [-9999, '−9,999'],
  [Number.NaN, '0'],
];
for (const [n, want] of cases) {
  const got = compactNumber(n);
  assert(got === want, `${n} -> ${want} (got ${got})`);
}
console.log('numberFormat fixtures: all passed');
