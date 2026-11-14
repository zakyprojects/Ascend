/** Number wording shared by the public pages (numbers themselves always come from the app's code). */

/** "1–3", or "2" when every value is the same. */
export const range = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
};

/** "1 point", "5 points", "1–3 points". */
export const pts = (n: number | string) => `${n} ${n === 1 || n === '1' ? 'point' : 'points'}`;

/** 5000 → "5,000". */
export const fmt = (n: number) => n.toLocaleString('en-US');
