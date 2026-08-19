import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  BookMarked,
  CheckCircle2,
  Circle,
  PlayCircle,
  ListTodo,
  Award,
  Sparkles,
  Library,
  BookCopy,
  BookOpen,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CURATED_BOOKS, BOOK_CATEGORIES, getCategoryMeta } from '@/lib/books';
import { CuratedBook, UserBook, UserBookStatus, BookCategory } from '@/types';
import { formatDateLong } from '@/lib/dates';

type Tab = 'discover' | 'library';

export function SelfImprovementBooks({ store }: { store: AppStore }) {
  const [tab, setTab] = useState<Tab>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BookCategory | 'all'>('all');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<UserBookStatus | 'all'>('all');
  const [bookToRemove, setBookToRemove] = useState<UserBook | null>(null);

  const [addCustomModalOpen, setAddCustomModalOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customCategory, setCustomCategory] = useState<BookCategory | ''>('');

  const libraryBooks = store.state.libraryBooks;

  const linkedLibraryBookGoalsCount = useMemo(() => {
    if (!bookToRemove) return 0;
    const target = store.state.libraryBooks.find((lb) => lb.id === bookToRemove.id);
    if (!target) return 0;
    const matchingBookIds = new Set<string>([target.id]);
    if (target.linkedBookId) matchingBookIds.add(target.linkedBookId);

    let count = 0;
    store.state.weeklyGoals.forEach((doc) => {
      doc.goals.forEach((g) => {
        if (g.linkedModule === 'reading' && g.linkedItemId && matchingBookIds.has(g.linkedItemId)) {
          count++;
        }
      });
    });
    return count;
  }, [bookToRemove, store.state.libraryBooks, store.state.weeklyGoals]);

  const filteredCurated = useMemo(() => {
    let list = [...CURATED_BOOKS];
    if (categoryFilter !== 'all') {
      list = list.filter((b) => b.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [searchQuery, categoryFilter]);

  const filteredLibrary = useMemo(() => {
    let list = [...libraryBooks];
    if (libraryStatusFilter !== 'all') {
      list = list.filter((lb) => lb.status === libraryStatusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (lb) =>
          lb.title.toLowerCase().includes(q) ||
          lb.author.toLowerCase().includes(q) ||
          (lb.description ?? '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }, [libraryBooks, searchQuery, libraryStatusFilter]);

  const stats = useMemo(() => {
    const toRead = libraryBooks.filter((lb) => lb.status === 'to-read').length;
    const reading = libraryBooks.filter((lb) => lb.status === 'reading').length;
    const completed = libraryBooks.filter((lb) => lb.status === 'completed').length;
    const curatedCompletedPoints = libraryBooks
      .filter((lb) => lb.status === 'completed')
      .reduce((sum, lb) => sum + lb.pointsAwarded, 0);
    return { toRead, reading, completed, curatedCompletedPoints };
  }, [libraryBooks]);

  const getUserBookForCurated = (curatedId: string): UserBook | undefined => {
    return libraryBooks.find((lb) => lb.curatedBookId === curatedId);
  };

  const handleAddCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    store.addCustomBookToLibrary(
      customTitle.trim(),
      customAuthor,
      customDescription,
      customCategory || undefined
    );
    setAddCustomModalOpen(false);
    setCustomTitle('');
    setCustomAuthor('');
    setCustomDescription('');
    setCustomCategory('');
  };

  const renderStatusBadge = (status: UserBookStatus) => {
    if (status === 'to-read')
      return (
        <span className="badge bg-slate-500/15 text-slate-400 border border-slate-500/30 text-[10px]">
          <ListTodo size={11} /> To Read
        </span>
      );
    if (status === 'reading')
      return (
        <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
          <PlayCircle size={11} /> Reading
        </span>
      );
    return (
      <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px]">
        <CheckCircle2 size={11} /> Completed
      </span>
    );
  };

  const renderCategoryBadge = (category: BookCategory | string, compact = false) => {
    const meta = getCategoryMeta(category as BookCategory);
    return (
      <span className={`badge ${meta.bgClass} ${meta.color} border ${compact ? 'text-[10px] px-2 py-0.5' : ''}`}>
        {category}
      </span>
    );
  };

  const renderActionButtons = (book: CuratedBook, userBook?: UserBook) => {
    const status = userBook?.status;

    if (!status) {
      return (
        <button
          onClick={() => store.addCuratedBookToLibrary(book, 'to-read')}
          className="btn-primary w-full text-xs py-2"
        >
          <Plus size={14} />
          Add to My Library
        </button>
      );
    }

    return (
      <div className="flex gap-1.5 w-full flex-wrap">
        {status !== 'to-read' && (
          <button
            onClick={() => userBook && store.updateUserBookStatus(userBook.id, 'to-read')}
            className="flex-1 btn-secondary text-xs py-1.5 min-w-[70px]"
            title="Move to To Read"
          >
            <Circle size={12} />
            <span className="hidden sm:inline">To Read</span>
          </button>
        )}
        {status !== 'reading' && (
          <button
            onClick={() => userBook && store.updateUserBookStatus(userBook.id, 'reading')}
            className={`flex-1 ${status === 'to-read' ? 'btn-primary' : 'btn-secondary'} text-xs py-1.5 min-w-[70px]`}
            title="Mark as Reading"
          >
            <PlayCircle size={12} />
            <span className="hidden sm:inline">Reading</span>
          </button>
        )}
        {status !== 'completed' && (
          <button
            onClick={() => userBook && store.updateUserBookStatus(userBook.id, 'completed')}
            className="flex-1 text-xs py-1.5 min-w-[70px] rounded-xl inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-95 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            title="Mark as Completed (+pts for curated)"
          >
            <CheckCircle2 size={12} />
            <span className="hidden sm:inline">Complete</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <BookMarked className="text-violet-400" size={26} />
            Self Improvement Books
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            A curated library of life-changing books. Complete curated books to earn bonus points.
          </p>
        </div>
        <button onClick={() => setAddCustomModalOpen(true)} className="btn-secondary flex items-center gap-2">
          <BookCopy size={16} />
          Add Custom Book
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500/15 flex items-center justify-center text-slate-400 shrink-0">
            <Library size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500">In Library</div>
            <div className="text-xl font-display font-bold text-slate-100">{libraryBooks.length}</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0">
            <ListTodo size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500">To Read</div>
            <div className="text-xl font-display font-bold text-slate-100">{stats.toRead}</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <PlayCircle size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Reading</div>
            <div className="text-xl font-display font-bold text-slate-100">{stats.reading}</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <Award size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Completed</div>
            <div className="text-xl font-display font-bold text-emerald-400">
              {stats.completed}
              <span className="text-xs ml-1 font-sans text-slate-400 font-normal">· {stats.curatedCompletedPoints} pts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 p-1 bg-bg-800 rounded-xl">
          <button
            onClick={() => setTab('discover')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'discover'
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Search size={15} />
              Discover
            </span>
          </button>
          <button
            onClick={() => setTab('library')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'library'
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Library size={15} />
              My Library
            </span>
          </button>
        </div>

        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tab === 'discover' ? 'Search curated books...' : 'Search my library...'}
              className="input input-has-icon py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 text-slate-400 shrink-0">
            <Filter size={16} />
            <select
              value={tab === 'discover' ? categoryFilter : libraryStatusFilter}
              onChange={(e) => {
                if (tab === 'discover') {
                  setCategoryFilter(e.target.value as BookCategory | 'all');
                } else {
                  setLibraryStatusFilter(e.target.value as UserBookStatus | 'all');
                }
              }}
              className="bg-bg-700 border border-white/5 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500/50"
            >
              <option value="all">All {tab === 'discover' ? 'Categories' : 'Status'}</option>
              {tab === 'discover'
                ? BOOK_CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))
                : (
                  <>
                    <option value="to-read">To Read</option>
                    <option value="reading">Reading</option>
                    <option value="completed">Completed</option>
                  </>
                )}
            </select>
          </div>
        </div>
      </div>

      {tab === 'discover' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredCurated.map((book) => {
            const userBook = getUserBookForCurated(book.id);
            const catMeta = getCategoryMeta(book.category);
            return (
              <div key={book.id} className="card p-4 flex flex-col justify-between space-y-3 card-hover">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-200 text-base leading-snug">
                        {book.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">by {book.author}</p>
                    </div>
                    {renderCategoryBadge(book.category)}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {book.description}
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-medium ${catMeta.color}`}>
                      <Sparkles size={11} className="inline mr-1" />
                      Curated Pick
                    </span>
                    <span className="text-amber-400 font-bold">
                      +{book.pointsOnCompletion} pts
                      <span className="text-slate-500 font-normal ml-1">on finish</span>
                    </span>
                  </div>

                  {userBook && (
                    <div className="flex items-center justify-between">
                      {renderStatusBadge(userBook.status)}
                      {userBook.pointsAwarded > 0 && (
                        <span className="text-[10px] text-emerald-400 font-bold">
                          ✓ {userBook.pointsAwarded} pts awarded
                        </span>
                      )}
                    </div>
                  )}

                  {renderActionButtons(book, userBook)}
                </div>
              </div>
            );
          })}

          {filteredCurated.length === 0 && (
            <div className="col-span-full card p-8 text-center">
              <Search size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No books match your search</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting the category filter or search terms.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'library' && (
        <>
          {libraryStatusFilter === 'all' && filteredLibrary.length > 0 ? (
            <div className="space-y-6">
              {(['reading', 'to-read', 'completed'] as UserBookStatus[]).map((groupStatus) => {
                const groupBooks = filteredLibrary.filter((lb) => lb.status === groupStatus);
                if (groupBooks.length === 0) return null;
                return (
                  <div key={groupStatus}>
                    <h2 className="section-title mb-3 flex items-center gap-2">
                      {groupStatus === 'to-read' && <ListTodo size={18} className="text-slate-400" />}
                      {groupStatus === 'reading' && <PlayCircle size={18} className="text-amber-400" />}
                      {groupStatus === 'completed' && <CheckCircle2 size={18} className="text-emerald-400" />}
                      {groupStatus === 'to-read' ? 'To Read' : groupStatus === 'reading' ? 'Currently Reading' : 'Completed'}
                      <span className="text-sm font-sans font-normal text-slate-500">({groupBooks.length})</span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupBooks.map((lb) => (
                        <LibraryCard
                          key={lb.id}
                          userBook={lb}
                          onRemove={() => setBookToRemove(lb)}
                          onStatusChange={(s) => store.updateUserBookStatus(lb.id, s)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredLibrary.map((lb) => (
                <LibraryCard
                  key={lb.id}
                  userBook={lb}
                  onRemove={() => setBookToRemove(lb)}
                  onStatusChange={(s) => store.updateUserBookStatus(lb.id, s)}
                />
              ))}
            </div>
          )}

          {filteredLibrary.length === 0 && (
            <div className="card p-8 text-center">
              <Library size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">
                {libraryBooks.length === 0 ? 'Your library is empty' : 'No books match your filters'}
              </p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                {libraryBooks.length === 0
                  ? 'Browse the curated library and add books to start building your reading list.'
                  : 'Try a different status filter or search term.'}
              </p>
              {libraryBooks.length === 0 && (
                <button onClick={() => setTab('discover')} className="btn-primary mx-auto">
                  Browse Curated Books
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={addCustomModalOpen} onClose={() => setAddCustomModalOpen(false)} title="Add Custom Book">
        <form onSubmit={handleAddCustomSubmit} className="space-y-4">
          <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center gap-3 text-sky-400">
            <BookOpen size={18} className="shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Custom books don't award curated bonus points.</span>
              <p>They are only for your personal tracking.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Book Title *</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. The Psychology of Money"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Author</label>
            <input
              type="text"
              value={customAuthor}
              onChange={(e) => setCustomAuthor(e.target.value)}
              placeholder="e.g. Morgan Housel"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Category (optional)</label>
            <select
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value as BookCategory | '')}
              className="input"
            >
              <option value="">Select a category...</option>
              {BOOK_CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Short Description (optional)</label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="What is this book about?"
              className="input min-h-[80px]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddCustomModalOpen(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Add to Library
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Remove Book Modal */}
      <ConfirmDeleteModal
        open={Boolean(bookToRemove)}
        onClose={() => setBookToRemove(null)}
        onConfirm={() => {
          if (bookToRemove) {
            store.removeBookFromLibrary(bookToRemove.id);
            setBookToRemove(null);
          }
        }}
        title="Remove Book from Library?"
        itemName={bookToRemove?.title}
        description={`Are you sure you want to remove "${bookToRemove?.title}" from your library?${
          linkedLibraryBookGoalsCount > 0
            ? ` Removing this book will also delete ${linkedLibraryBookGoalsCount} linked Weekly Goal${linkedLibraryBookGoalsCount > 1 ? 's' : ''}.`
            : ''
        }`}
        confirmText="Remove Book"
      />
    </div>
  );
}

function LibraryCard({
  userBook,
  onRemove,
  onStatusChange,
}: {
  userBook: UserBook;
  onRemove: () => void;
  onStatusChange: (s: UserBookStatus) => void;
}) {
  const renderCategoryBadge = (category: BookCategory | string) => {
    const meta = getCategoryMeta(category as BookCategory);
    return (
      <span className={`badge ${meta.bgClass} ${meta.color} border text-[10px] px-2 py-0.5`}>
        {category}
      </span>
    );
  };

  return (
    <div className="card p-4 flex flex-col justify-between space-y-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-slate-200 text-base leading-snug">{userBook.title}</h3>
              {userBook.isCustom && (
                <span className="badge bg-slate-500/10 text-slate-400 text-[9px] border border-slate-500/20">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">by {userBook.author}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {userBook.category && renderCategoryBadge(userBook.category)}
            <button
              onClick={onRemove}
              className="text-slate-600 hover:text-rose-400 p-1"
              title="Remove from library"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {userBook.description && (
          <p className="text-xs text-slate-400 leading-relaxed mt-2 line-clamp-2">
            {userBook.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
          <span>Added {formatDateLong(userBook.addedAt)}</span>
          <div className="flex items-center gap-2">
            {userBook.status === 'completed' && userBook.completedAt && (
              <span className="text-emerald-400">✓ {formatDateLong(userBook.completedAt)}</span>
            )}
            {userBook.pointsAwarded > 0 && (
              <span className="text-amber-400 font-bold">+{userBook.pointsAwarded} pts</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {userBook.status !== 'to-read' && (
          <button
            onClick={() => onStatusChange('to-read')}
            className="flex-1 btn-secondary text-xs py-1.5"
          >
            <Circle size={12} />
            <span className="hidden sm:inline">To Read</span>
          </button>
        )}
        {userBook.status !== 'reading' && (
          <button
            onClick={() => onStatusChange('reading')}
            className={`flex-1 ${userBook.status === 'to-read' ? 'btn-primary' : 'btn-secondary'} text-xs py-1.5`}
          >
            <PlayCircle size={12} />
            <span className="hidden sm:inline">Reading</span>
          </button>
        )}
        {userBook.status !== 'completed' && (
          <button
            onClick={() => onStatusChange('completed')}
            className="flex-1 text-xs py-1.5 rounded-xl inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-95 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          >
            <CheckCircle2 size={12} />
            <span className="hidden sm:inline">Complete</span>
            {!userBook.isCustom && (
              <span className="text-[10px] ml-1 opacity-75 hidden sm:inline">+pts</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
