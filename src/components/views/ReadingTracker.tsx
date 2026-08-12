import { useState } from 'react';
import { BookOpen, Flame, Plus, CheckCircle, Trash2, Award, Sparkles, BookMarked } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Book } from '@/types';
import { todayKey, formatDateLong } from '@/lib/dates';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';

export function ReadingTracker({ store }: { store: AppStore }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [progressModalBook, setProgressModalBook] = useState<Book | null>(null);
  const [finishModalBook, setFinishModalBook] = useState<Book | null>(null);
  const [deleteModalBook, setDeleteModalBook] = useState<Book | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState(200);
  const [unit, setUnit] = useState<'pages' | 'chapters'>('pages');
  const [targetFinishDate, setTargetFinishDate] = useState('');

  const readingGoal = store.state.readingGoal;
  const [goalCadenceInput, setGoalCadenceInput] = useState<'daily' | 'weekly'>(readingGoal?.cadence || 'daily');
  const [targetPagesInput, setTargetPagesInput] = useState<number>(readingGoal?.targetPages || 50);

  const [progressInput, setProgressInput] = useState(0);
  const [reflectionInput, setReflectionInput] = useState('');

  const books = store.state.books;
  const readingLogs = store.state.readingLogs;

  const inProgressBooks = books.filter((b) => !b.isFinished);
  const finishedBooks = books.filter((b) => b.isFinished);

  // Calculate Reading Streak (consecutive days up to today with a reading log)
  const uniqueDates = [...new Set(readingLogs.map((l) => l.date))].sort().reverse();
  let streak = 0;
  const today = todayKey();
  let checkDate = new Date();

  // If today or yesterday is logged, calculate streak
  const hasLoggedToday = uniqueDates.includes(today);
  if (hasLoggedToday || (uniqueDates.length > 0 && uniqueDates[0] === todayKey(new Date(Date.now() - 86400000)))) {
    if (!hasLoggedToday) {
      checkDate = new Date(Date.now() - 86400000);
    }
    while (true) {
      const key = todayKey(checkDate);
      if (uniqueDates.includes(key)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  const { isLoading: isAdding, executeFn: executeAdd } = useAsyncAction();
  const { isLoading: isUpdatingProgress, executeFn: executeProgress } = useAsyncAction();
  const { isLoading: isFinishing, executeFn: executeFinish } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const handleAddBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || totalPages <= 0) return;
    await executeAdd(async () => {
      await store.addBook(title, author, Number(totalPages), unit, targetFinishDate);
      setAddModalOpen(false);
      setTitle('');
      setAuthor('');
      setTotalPages(200);
      setUnit('pages');
      setTargetFinishDate('');
    });
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressModalBook) return;
    await executeProgress(async () => {
      const progressAmount = Number(progressInput);
      const newCurrent = progressModalBook.currentPage + progressAmount;
      await store.updateReadingProgress(progressModalBook.id, progressAmount, newCurrent);

      if (newCurrent >= progressModalBook.totalPages) {
        setFinishModalBook({ ...progressModalBook, currentPage: progressModalBook.totalPages });
      }
      setProgressModalBook(null);
    });
  };

  const handleFinishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishModalBook) return;
    await executeFinish(async () => {
      await store.finishBook(finishModalBook.id, reflectionInput);
      setFinishModalBook(null);
      setReflectionInput('');
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="text-amber-400" size={26} />
            Reading Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track your reading progress, maintain daily reading streaks, and reflect on finished books
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setGoalCadenceInput(readingGoal?.cadence || 'daily');
              setTargetPagesInput(readingGoal?.targetPages || 50);
              setGoalModalOpen(true);
            }}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <span>
              {readingGoal
                ? readingGoal.cadence === 'daily'
                  ? 'Goal: Read Daily'
                  : `Goal: ${readingGoal.targetPages} pgs/wk`
                : 'Set Reading Goal'}
            </span>
          </button>
          <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            <span>Add Book</span>
          </button>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Reading Streak</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {streak} <span className="text-xs font-normal text-slate-400">days</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
            <BookMarked size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">In Progress</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {inProgressBooks.length} <span className="text-xs font-normal text-slate-400">books</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Finished Books</div>
            <div className="text-xl font-display font-bold text-emerald-400">
              {finishedBooks.length} <span className="text-xs font-normal text-slate-400">completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* In Progress Books */}
      <div>
        <h2 className="section-title mb-3">Books in Progress</h2>

        {inProgressBooks.length === 0 ? (
          <div className="card p-8 text-center">
            <BookOpen size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No active books currently being read</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Add a book to start tracking daily reading progress and earn +5 pts per progress update.</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add a Book
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inProgressBooks.map((book) => {
              const percent = Math.round((book.currentPage / book.totalPages) * 100);
              return (
                <div key={book.id} className="card p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-200 text-base">{book.title}</h3>
                        <p className="text-xs text-slate-400">by {book.author}</p>
                      </div>
                      <button
                        onClick={() => setDeleteModalBook(book)}
                        className="text-slate-600 hover:text-rose-400 p-1"
                        title="Delete Book"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1 font-medium">
                        <span>
                          {book.currentPage} / {book.totalPages} {book.unit}
                        </span>
                        <span className="text-amber-400 font-bold">{percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-bg-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      {book.targetFinishDate && (
                        <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                          <span>Target Deadline:</span>
                          <span className={`font-mono font-medium ${book.targetFinishDate < today ? 'text-rose-400' : 'text-slate-300'}`}>
                            {book.targetFinishDate} {book.targetFinishDate < today ? '(Overdue)' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setProgressModalBook(book);
                        setProgressInput(10);
                      }}
                      className="btn-secondary flex-1 text-xs py-1.5"
                    >
                      + Update Progress
                    </button>
                    <button
                      onClick={() => {
                        setFinishModalBook(book);
                        setReflectionInput('');
                      }}
                      className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={14} />
                      <span>Mark Finished</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Finished Books Shelf */}
      {finishedBooks.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Finished Books Shelf</h2>
          <div className="space-y-3">
            {finishedBooks.map((book) => (
              <div key={book.id} className="card p-4 border-l-4 border-emerald-500/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                      {book.title}
                      <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px]">Finished (+30 pts)</span>
                    </h3>
                    <p className="text-xs text-slate-400">by {book.author} • {book.totalPages} {book.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {book.finishedAt ? formatDateLong(book.finishedAt) : ''}
                    </span>
                    <button
                      onClick={() => setDeleteModalBook(book)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                      title="Delete Finished Book"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {book.reflection && (
                  <div className="p-3 bg-bg-800/80 rounded-xl text-xs text-slate-300 italic border border-white/5">
                    "{book.reflection}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Book Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Book">
        <form onSubmit={handleAddBookSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Book Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Atomic Habits"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. James Clear"
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Total Amount</label>
              <input
                type="number"
                min="1"
                value={totalPages}
                onChange={(e) => setTotalPages(Number(e.target.value))}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'pages' | 'chapters')}
                className="input"
              >
                <option value="pages">Pages</option>
                <option value="chapters">Chapters</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Optional Target Finish Date</label>
            <input
              type="date"
              value={targetFinishDate}
              onChange={(e) => setTargetFinishDate(e.target.value)}
              className="input font-mono text-xs"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Set a target completion deadline to get notified if missed.</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Add Book
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Progress Modal */}
      <Modal open={!!progressModalBook} onClose={() => setProgressModalBook(null)} title={`Update Progress: ${progressModalBook?.title}`}>
        <form onSubmit={handleProgressSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Currently on {progressModalBook?.unit} <span className="font-bold text-slate-200">{progressModalBook?.currentPage}</span> of {progressModalBook?.totalPages}.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              How many {progressModalBook?.unit} did you read today?
            </label>
            <input
              type="number"
              min="1"
              max={(progressModalBook?.totalPages ?? 100) - (progressModalBook?.currentPage ?? 0)}
              value={progressInput}
              onChange={(e) => setProgressInput(Number(e.target.value))}
              className="input"
              required
            />
          </div>

          <div className="card p-3 bg-bg-800 text-xs text-slate-400 flex items-center justify-between border border-white/5">
            <span>Points for today's progress update:</span>
            <span className="font-bold text-amber-400">+5 pts</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setProgressModalBook(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Progress
            </button>
          </div>
        </form>
      </Modal>

      {/* Finish Book Reflection Modal */}
      <Modal open={!!finishModalBook} onClose={() => setFinishModalBook(null)} title={`Finish & Reflect: ${finishModalBook?.title}`}>
        <form onSubmit={handleFinishSubmit} className="space-y-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
            <Sparkles size={20} className="shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Congratulations on completing this book!</span>
              <p>You earn a <span className="underline font-bold">+30 points bonus</span>.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Short Reflection / Takeaway Note
            </label>
            <textarea
              value={reflectionInput}
              onChange={(e) => setReflectionInput(e.target.value)}
              placeholder="What did you learn or think about this book? What was your biggest takeaway?"
              className="input min-h-[100px]"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setFinishModalBook(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isFinishing} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isFinishing ? <AscendLoadingIndicator size="sm" /> : null}
              <span>{isFinishing ? 'Saving...' : 'Save & Claim +30 pts'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalBook}
        onClose={() => setDeleteModalBook(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (deleteModalBook) {
            await executeDelete(async () => {
              store.deleteBook(deleteModalBook.id);
              setDeleteModalBook(null);
            });
          }
        }}
        title="Delete Book?"
        itemName={deleteModalBook?.title}
        description={`Are you sure you want to delete "${deleteModalBook?.title}"? This will remove the book and its reading history.`}
      />

      {/* Target Reading Goal Modal */}
      <Modal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Set Target Reading Goal">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            store.setReadingGoal({
              cadence: goalCadenceInput,
              targetPages: goalCadenceInput === 'weekly' ? targetPagesInput : undefined,
            });
            setGoalModalOpen(false);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-400">
            Opt into a daily or weekly target reading expectation. Misses will incur an escalating penalty and trigger a notification.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Cadence Type</label>
            <select
              value={goalCadenceInput}
              onChange={(e) => setGoalCadenceInput(e.target.value as 'daily' | 'weekly')}
              className="input text-xs"
            >
              <option value="daily">Daily Habit (Log progress every day)</option>
              <option value="weekly">Weekly Target Pages/Chapters Goal</option>
            </select>
          </div>

          {goalCadenceInput === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Target Pages / Chapters Per Week</label>
              <input
                type="number"
                min="1"
                value={targetPagesInput}
                onChange={(e) => setTargetPagesInput(Number(e.target.value))}
                className="input text-xs"
                required
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                store.setReadingGoal(null);
                setGoalModalOpen(false);
              }}
              className="btn-secondary text-rose-400 border-rose-500/20 hover:bg-rose-500/10 text-xs px-3"
            >
              Disable Goal
            </button>
            <button type="button" onClick={() => setGoalModalOpen(false)} className="btn-secondary flex-1 text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 text-xs">
              Save Goal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
