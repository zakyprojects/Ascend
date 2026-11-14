import { compactNumber } from '../leagues/numberFormat';
import { snapReadingAmount } from '../points/readingAwards';

/**
 * Reading amounts in the units the reader logged, never converted (Zakria 2026-11-12: a chapter's
 * length differs per book): "40 pages · 3.5 chapters", "3.5 chapters", "1 page". A unit at 0 is left
 * out; '' when both are 0. Chapters to the nearest tenth. Shared by the member card and the Reading
 * Hub, like exerciseSummary for exercise.
 */
export function readingAmountText(pages: number, chapters: number, separator = ' · '): string {
  const p = Math.max(0, pages);
  const c = Math.max(0, snapReadingAmount(chapters, 'chapters'));
  return [p > 0 && `${compactNumber(p)} ${p === 1 ? 'page' : 'pages'}`, c > 0 && `${compactNumber(c)} ${c === 1 ? 'chapter' : 'chapters'}`]
    .filter(Boolean)
    .join(separator);
}
