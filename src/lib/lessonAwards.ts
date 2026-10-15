import type { PointsEntry } from '@/types';
import { LESSONS } from './lessons';

/**
 * Lesson points are written by the server (supabase/migrations/20261015210000_server_lesson_awards.sql):
 * a read lesson is a lesson_reads row `<lessonId>_s<season>`, and the database awards
 * lesson_award_<lessonId>_s<season> with the points of its own copy of the catalog (src/lib/lessons.ts),
 * once, and only in the season it was read. The app computes the same row only to show it before
 * the server's copy arrives; it never uploads it. Change the catalog on both sides together.
 */

export const lessonReadId = (lessonId: string, season: number) => `${lessonId}_s${season}`;

export const lessonAwardId = (lessonId: string, season: number) => `lesson_award_${lessonReadId(lessonId, season)}`;

/** Whether the lesson counts as read in this season (season 1 also kept bare lesson ids). */
export const isLessonReadInSeason = (readLessonIds: string[], lessonId: string, season: number): boolean =>
  readLessonIds.includes(lessonReadId(lessonId, season)) || (season === 1 && readLessonIds.includes(lessonId));

/** Mirror of lesson_reads_award_points: the award of a lesson read now (null for an unknown lesson). */
export function computeLessonAward(lessonId: string, season: number, nowIso: string): PointsEntry | null {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson || !(lesson.points > 0)) return null;
  return {
    id: lessonAwardId(lessonId, season),
    amount: lesson.points,
    reason: `Lesson read: ${lesson.title}`,
    source: 'lesson',
    timestamp: nowIso,
    metadata: { lessonId, seasonNumber: season },
  };
}
