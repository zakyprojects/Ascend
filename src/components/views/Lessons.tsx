import { useState } from 'react';
import { BookOpen, Check, Clock, ArrowLeft, Search, Sparkles } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LESSONS, LESSON_CATEGORIES } from '@/lib/lessons';
import { Lesson } from '@/types';
import { Modal } from '@/components/ui/Modal';

export function Lessons({ store }: { store: AppStore }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [search, setSearch] = useState('');

  const readIds = store.state.readLessonIds;
  const readCount = readIds.length;
  const totalPoints = LESSONS.reduce((sum, l) => sum + l.points, 0);
  const earnedPoints = LESSONS.filter((l) => readIds.includes(l.id)).reduce((sum, l) => sum + l.points, 0);

  const filtered = LESSONS.filter((lesson) => {
    if (search && !lesson.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory && lesson.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Lessons</h1>
        <p className="text-sm text-slate-500 mt-1">Short, practical self-improvement articles</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="stat-label">Lessons Read</div>
          <div className="stat-value mt-1">
            {readCount}
            <span className="text-base text-slate-500">/{LESSONS.length}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="stat-label">Points Earned</div>
          <div className="stat-value mt-1 text-primary-400">
            {earnedPoints}
            <span className="text-base text-slate-500">/{totalPoints}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lessons..."
          className="input pl-10"
        />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`badge px-3 py-1.5 transition-all ${
            selectedCategory === null
              ? 'bg-primary-500/15 text-primary-400'
              : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
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
                ? 'bg-primary-500/15 text-primary-400'
                : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lesson list */}
      <div className="space-y-2.5">
        {filtered.map((lesson) => {
          const isRead = readIds.includes(lesson.id);
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
                  <Check size={18} className="text-primary-400" />
                ) : (
                  <BookOpen size={18} className="text-slate-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-slate-200 truncate">{lesson.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500">{lesson.category}</span>
                  <span className="text-xs text-slate-600 flex items-center gap-0.5">
                    <Clock size={11} /> {lesson.readTime} min
                  </span>
                  <span className="text-xs text-primary-400">+{lesson.points} pts</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500">No lessons found. Try a different search or category.</p>
        </div>
      )}

      {/* Lesson reader modal */}
      <Modal
        open={!!openLesson}
        onClose={() => setOpenLesson(null)}
        title={openLesson?.title ?? ''}
        maxWidth="max-w-lg"
      >
        {openLesson && (
          <div>
            <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
              <span className="badge bg-bg-600 text-slate-400">{openLesson.category}</span>
              <span className="flex items-center gap-0.5">
                <Clock size={11} /> {openLesson.readTime} min read
              </span>
              <span className="text-primary-400">+{openLesson.points} pts</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              {renderLessonContent(openLesson.content)}
            </div>
            <div className="mt-6 pt-4 border-t border-white/5">
              {readIds.includes(openLesson.id) ? (
                <div className="flex items-center gap-2 text-sm text-primary-400">
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
      </Modal>
    </div>
  );
}

function renderLessonContent(content: string) {
  // Split by code blocks (```...```) and render them as styled callouts
  const parts = content.split(/```([\s\S]*?)```/);
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      // Odd indices are code blocks — render as callout
      return (
        <div
          key={idx}
          className="my-3 p-3 rounded-xl bg-bg-700 border-l-2 border-primary-500/50 text-sm text-slate-300 italic"
        >
          {part.trim()}
        </div>
      );
    }
    // Even indices are regular text — render paragraphs
    return (
      <div key={idx}>
        {part.trim().split('\n\n').map((para, pIdx) => (
          <p key={pIdx} className="text-sm text-slate-300 leading-relaxed mb-3">
            {para.trim()}
          </p>
        ))}
      </div>
    );
  });
}
