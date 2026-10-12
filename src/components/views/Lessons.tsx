import { useState } from 'react';
import { BookOpen, Check, Clock, Search, Sparkles } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LESSONS, LESSON_CATEGORIES } from '@/lib/lessons';
import { Lesson } from '@/types';
import { Dialog, EmptyState } from '@/components/ui/primitives';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { getSeasonNumber, leagueNow } from '@/lib/leagueTime';

export function Lessons({ store }: { store: AppStore }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [search, setSearch] = useState('');

  const readIds = store.state.readLessonIds;
  const activeSeasonNum = getSeasonNumber(leagueNow());
  const isLessonReadThisSeason = (lessonId: string) => {
    const seasonKey = `${lessonId}_s${activeSeasonNum}`;
    return readIds.includes(seasonKey) || (activeSeasonNum === 1 && readIds.includes(lessonId));
  };

  const readCount = LESSONS.filter((l) => isLessonReadThisSeason(l.id)).length;
  const totalPoints = LESSONS.reduce((sum, l) => sum + l.points, 0);
  const earnedPoints = LESSONS.filter((l) => isLessonReadThisSeason(l.id)).reduce((sum, l) => sum + l.points, 0);

  const filtered = LESSONS.filter((lesson) => {
    if (search && !lesson.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory && lesson.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Lessons</h1>
        <p className="text-sm text-content-disabled mt-1">Short, practical self-improvement articles</p>
      </div>

      {/* Stats */}
      <Reveal className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="stat-label">Lessons Read (Season {activeSeasonNum})</div>
          <div className="stat-value mt-1 tabular-nums">
            <CountUp value={readCount} />
            <span className="text-base text-content-disabled">/{LESSONS.length}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="stat-label">Points Earned</div>
          <div className="stat-value mt-1 text-brand-text tabular-nums">
            <CountUp value={earnedPoints} />
            <span className="text-base text-content-disabled">/{totalPoints}</span>
          </div>
        </div>
      </Reveal>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" />
        <input
          id="lessons-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lessons..."
          aria-label="Search lessons"
          className="input pl-10"
        />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`badge px-3 py-1.5 transition-all ${
            selectedCategory === null
              ? 'bg-primary-500/15 text-brand-text'
              : 'bg-bg-700 text-content-muted hover:bg-bg-600'
          }`}
        >
          All
        </button>
        {LESSON_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`badge px-3 py-1.5 transition-all ${
              selectedCategory === cat
                ? 'bg-primary-500/15 text-brand-text'
                : 'bg-bg-700 text-content-muted hover:bg-bg-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lesson list */}
      <div className="grid-cards-lg gap-2.5">
        {filtered.map((lesson) => {
          const isRead = isLessonReadThisSeason(lesson.id);
          return (
            <button
              key={lesson.id}
              onClick={() => setOpenLesson(lesson)}
              className="card p-4 card-hover w-full flex items-center gap-3 text-left"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isRead ? 'bg-primary-500/15' : 'bg-bg-600'
                }`}
              >
                {isRead ? (
                  <Check size={18} className="text-brand-text" />
                ) : (
                  <BookOpen size={18} className="text-content-disabled" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-content-secondary truncate">{lesson.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-content-disabled">{lesson.category}</span>
                  <span className="text-xs text-content-subtle flex items-center gap-0.5">
                    <Clock size={11} /> {lesson.readTime} min
                  </span>
                  <span className="text-xs text-brand-text">+{lesson.points} pts</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No lessons found"
          description="Try a different search or category."
        />
      )}

      {/* Lesson reader modal */}
      <Dialog
        open={!!openLesson}
        onClose={() => setOpenLesson(null)}
        title={openLesson?.title ?? ''}
        maxWidth="max-w-lg"
      >
        {openLesson && (
          <div>
            <div className="flex items-center gap-3 mb-4 text-xs text-content-disabled">
              <span className="badge bg-bg-600 text-content-muted">{openLesson.category}</span>
              <span className="flex items-center gap-0.5">
                <Clock size={11} /> {openLesson.readTime} min read
              </span>
              <span className="text-brand-text">+{openLesson.points} pts</span>
            </div>
            <div>
              {renderLessonContent(openLesson.content)}
            </div>
            <div className="mt-6 pt-4 border-t border-overlay-subtle">
              {isLessonReadThisSeason(openLesson.id) ? (
                <div className="flex items-center gap-2 text-sm text-brand-text">
                  <Check size={16} />
                  Lesson completed
                </div>
              ) : (
                <button
                  onClick={() => {
                    store.markLessonRead(openLesson.id, openLesson.title, openLesson.points);
                  }}
                  className="btn-primary w-full"
                >
                  <Sparkles size={16} />
                  Mark as Read (+{openLesson.points} pts)
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// Lesson bodies (lib/lessons.ts) use a small Markdown subset: ``` callouts, blank-line
// separated blocks, "- " and "1. " lists, and **bold**. Rendered here so no syntax shows.
type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

const BULLET = /^- (.*)$/;
const NUMBERED = /^(\d+)\. (.*)$/;

function parseLessonBlocks(text: string): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  for (const line of text.split('\n').map((l) => l.trim())) {
    const last = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (!line) {
      blocks.push({ kind: 'p', text: '' });
    } else if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[2]);
      else blocks.push({ kind: 'ol', items: [numbered[2]], start: Number(numbered[1]) });
    } else if (last?.kind === 'p' && last.text) {
      last.text += ` ${line}`;
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.text);
}

function renderInline(text: string) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-content-primary">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

const LIST_CLASS = 'text-sm text-content-tertiary leading-relaxed mb-3 pl-5 space-y-1.5 marker:text-content-disabled';

function renderLessonContent(content: string) {
  // Odd parts of the ``` split are callouts.
  return content.split(/```([\s\S]*?)```/).map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <div
          key={idx}
          className="my-3 p-3 rounded-xl bg-bg-700 border-l-2 border-primary-500/50 text-sm text-content-tertiary italic"
        >
          {renderInline(part.trim())}
        </div>
      );
    }
    return (
      <div key={idx}>
        {parseLessonBlocks(part).map((block, bIdx) => {
          if (block.kind === 'ul') {
            return (
              <ul key={bIdx} className={`list-disc ${LIST_CLASS}`}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          if (block.kind === 'ol') {
            return (
              <ol key={bIdx} start={block.start} className={`list-decimal ${LIST_CLASS}`}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          }
          return (
            <p key={bIdx} className="text-sm text-content-tertiary leading-relaxed mb-3">
              {renderInline(block.text)}
            </p>
          );
        })}
      </div>
    );
  });
}
