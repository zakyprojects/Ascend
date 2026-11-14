// Fake data shared by several Gallery groups (dev only).

// Charts kit demo. Intro motion is forced on so the draw-in can be replayed here.
export const CHART_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
  label,
  value: [3, 5, 2, 6, 4, 0, 1][i],
}));
export const CHART_TREND = [120, 135, 128, 150, 170, 165, 190, 210, 205, 230, 250, 245, 270, 300].map((value, i) => ({
  label: `Day ${i + 1}`,
  value,
}));
// 12 weeks, starting mid-week (two empty leading cells), deterministic values.
export const CHART_HEAT = [null, null, ...Array.from({ length: 82 }, (_, i) => {
  const value = (i * 7) % 11 < 3 ? 0 : ((i * 5) % 6) + 1;
  return { label: `Day ${i + 1}: ${value}`, value };
})];

