import { useMemo, useState } from 'react';
import { BookOpen, Check, Clock, Search } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LESSONS, LESSON_CATEGORIES } from '@/lib/lessons';
import type { Lesson } from '@/types';
import { cx, EmptyState, Switch, Tabs, ToolbarInput } from '@/components/ui/primitives';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { getSeasonNumber, leagueNow } from '@/lib/leagueTime';
import { isLessonReadInSeason } from '@/lib/lessonAwards';
import { LessonReader, pointsLabel } from '@/components/lessons/LessonReader';

const ALL = 'all';

export function Lessons({ store }: { store: AppStore }) {
  const [category, setCategory] = useState<string>(ALL);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [search, setSearch] = useState('');

  const readIds = store.state.readLessonIds;
  const season = getSeasonNumber(leagueNow());
  const isRead = (lessonId: string) => isLessonReadInSeason(readIds, lessonId, season);

  const readLessons = LESSONS.filter((l) => isRead(l.id));
  const totalPoints = LESSONS.reduce((sum, l) => sum + l.points, 0);
  const earnedPoints = readLessons.reduce((sum, l) => sum + l.points, 0);
  const nextUnread = LESSONS.find((l) => !isRead(l.id));

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LESSONS;
    return LESSONS.filter((l) => [l.title, l.category, l.content].some((s) => s.toLowerCase().includes(q)));
  }, [search]);

  const filtered = searchMatches.filter(
    (l) => (category === ALL || l.category === category) && (!unreadOnly || !isRead(l.id))
  );

  const nextInList = (lesson: Lesson) => {
    // From the category's list, so a lesson just read (and hidden by Unread only) still has a next.
    const list = searchMatches.filter((l) => category === ALL || l.category === category);
    const index = list.findIndex((l) => l.id === lesson.id);
    return index >= 0 ? list.slice(index + 1).find((l) => !unreadOnly || !isRead(l.id)) : undefined;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Lessons</h1>
        <p className="page-subtitle">Short, practical reads on how habits, focus and the brain work.</p>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your lessons this season"
          ring={{
            value: readLessons.length,
            max: LESSONS.length,
            label: `Lessons read in Season ${season}: ${readLessons.length} of ${LESSONS.length}`,
            center: readLessons.length,
            caption: `of ${LESSONS.length} read`,
          }}
          lead={{
            label: 'Points earned',
            value: <CountUp value={earnedPoints} />,
            hint: `of ${totalPoints} this season. Every lesson pays again next season.`,
            valueClassName: 'text-brand-text',
          }}
          stats={
            nextUnread
              ? [
                  {
                    label: 'Next to read',
                    value: (
                      <button
                        type="button"
                        onClick={() => setOpenLesson(nextUnread)}
                        className="line-clamp-2 text-left text-sm font-medium leading-snug text-content-primary hover:underline sm:text-base"
                      >
                        {nextUnread.title}
                      </button>
                    ),
                    hint: `${nextUnread.readTime} min · ${pointsLabel(nextUnread.points)}`,
                  },
                ]
              : [{ label: 'This season', value: 'All read', valueClassName: 'text-success-text' }]
          }
        />
      </Reveal>

      <div className="space-y-3">
        <ToolbarInput
          id="lessons-search"
          type="search"
          icon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lessons"
          aria-label="Search lessons"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs
            ariaLabel="Lesson categories"
            size="sm"
            scrollable
            className="min-w-0 flex-1"
            value={category}
            onChange={setCategory}
            items={[
              { id: ALL, label: 'All', badge: searchMatches.length },
              ...LESSON_CATEGORIES.map((cat) => ({
                id: cat,
                label: cat,
                badge: searchMatches.filter((l) => l.category === cat).length,
              })),
            ]}
          />
          <div className="flex shrink-0 items-center gap-2 text-xs text-content-muted">
            <Switch checked={unreadOnly} onChange={() => setUnreadOnly(!unreadOnly)} label="Unread only" />
            <span>Unread only</span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={unreadOnly && searchMatches.length > 0 ? 'All read here' : 'No lessons found'}
          description={unreadOnly && searchMatches.length > 0 ? 'Turn off Unread only to read one again.' : 'Try a different search or category.'}
        />
      ) : (
        <div className="grid-cards-lg gap-2.5">
          {filtered.map((lesson) => {
            const read = isRead(lesson.id);
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setOpenLesson(lesson)}
                className="card card-hover enter-item flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    read ? 'bg-primary-500/15 text-brand-text' : 'bg-overlay-subtle text-content-muted'
                  )}
                >
                  {read ? <Check size={18} aria-hidden="true" /> : <BookOpen size={18} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('item-name line-clamp-2 text-sm leading-snug', read ? 'text-content-tertiary' : 'text-content-primary')}>
                    {lesson.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-content-muted">
                    <span>{lesson.category}</span>
                    <span className="figure flex items-center gap-0.5">
                      <Clock size={11} aria-hidden="true" /> {lesson.readTime} min
                    </span>
                    {read ? (
                      <span className="text-success-text">Read</span>
                    ) : (
                      <span className="figure text-brand-text">{pointsLabel(lesson.points)}</span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <LessonReader
        lesson={openLesson}
        isRead={openLesson ? isRead(openLesson.id) : false}
        next={openLesson ? nextInList(openLesson) : undefined}
        onMarkRead={(id) => store.markLessonRead(id)}
        onOpenLesson={setOpenLesson}
        onClose={() => setOpenLesson(null)}
      />
    </div>
  );
}
