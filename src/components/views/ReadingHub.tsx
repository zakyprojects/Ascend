import { useState, useMemo } from 'react';
import {
  BookOpen,
  Flame,
  Plus,
  CheckCircle2,
  Trash2,
  Award,
  Sparkles,
  BookMarked,
  Search,
  Filter,
  ListTodo,
  PlayCircle,
  Library,
  Calendar,
  Clock,
  ChevronRight,
  Bookmark,
  BookCopy,
  Zap,
  Check,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CURATED_BOOKS, BOOK_CATEGORIES, getCategoryMeta } from '@/lib/books';
import { CuratedBook, UserBook, UserBookStatus, BookCategory } from '@/types';
import { todayKey, formatDateLong } from '@/lib/dates';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';

type ReadingHubTab = 'reading' | 'to-read' | 'completed' | 'discover';

export function ReadingHub({ store }: { store: AppStore }) {
  const [activeTab, setActiveTab] = useState<ReadingHubTab>('reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BookCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'bestsellers' | 'az'>('trending');

  // Modals
  const [addCustomModalOpen, setAddCustomModalOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [progressModalBook, setProgressModalBook] = useState<UserBook | null>(null);
  const [finishModalBook, setFinishModalBook] = useState<UserBook | null>(null);
  const [deleteModalBook, setDeleteModalBook] = useState<UserBook | null>(null);
  const [startReadingModalBook, setStartReadingModalBook] = useState<UserBook | null>(null);
  const [selectedCuratedDetails, setSelectedCuratedDetails] = useState<CuratedBook | null>(null);

  // Form states for Custom Book
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customCategory, setCustomCategory] = useState<BookCategory | ''>('');
  const [customTotalAmount, setCustomTotalAmount] = useState(250);
  const [customUnit, setCustomUnit] = useState<'pages' | 'chapters'>('pages');
  const [customStatus, setCustomStatus] = useState<UserBookStatus>('reading');
  const [customTargetFinishDate, setCustomTargetFinishDate] = useState('');

  // Form states for Start Reading Modal
  const [startTotalAmount, setStartTotalAmount] = useState<number>(250);
  const [startUnit, setStartUnit] = useState<'pages' | 'chapters'>('pages');
  const [startTargetDate, setStartTargetDate] = useState<string>('');

  // Form states for Progress & Finish
  const [progressInput, setProgressInput] = useState<number>(20);
  const [reflectionInput, setReflectionInput] = useState('');

  const libraryBooks = store.state.libraryBooks;
  const readingLogs = store.state.readingLogs;

  // Calculate Reading Streak based strictly on readingLogs (daily progress updates)
  const uniqueDates = useMemo(() => {
    return [...new Set(readingLogs.map((l) => l.date))].sort().reverse();
  }, [readingLogs]);

  const streak = useMemo(() => {
    let count = 0;
    const today = todayKey();
    let checkDate = new Date();
    const hasLoggedToday = uniqueDates.includes(today);

    if (hasLoggedToday || (uniqueDates.length > 0 && uniqueDates[0] === todayKey(new Date(Date.now() - 86400000)))) {
      if (!hasLoggedToday) {
        checkDate = new Date(Date.now() - 86400000);
      }
      while (true) {
        const key = todayKey(checkDate);
        if (uniqueDates.includes(key)) {
          count++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }
    return count;
  }, [uniqueDates]);

  // Count linked weekly goals for delete modal
  const linkedBookGoalsCount = useMemo(() => {
    if (!deleteModalBook) return 0;
    let count = 0;
    const matchingIds = new Set<string>([deleteModalBook.id]);
    if (deleteModalBook.linkedBookId) matchingIds.add(deleteModalBook.linkedBookId);

    store.state.weeklyGoals.forEach((doc) => {
      doc.goals.forEach((g) => {
        if (g.linkedModule === 'reading' && g.linkedItemId && matchingIds.has(g.linkedItemId)) {
          count++;
        }
      });
    });
    return count;
  }, [deleteModalBook, store.state.libraryBooks, store.state.weeklyGoals]);

  // Categorized Library Lists
  const inProgressBooks = useMemo(() => {
    return libraryBooks.filter((b) => b.status === 'reading');
  }, [libraryBooks]);

  const toReadBooks = useMemo(() => {
    return libraryBooks.filter((b) => b.status === 'to-read');
  }, [libraryBooks]);

  const completedBooks = useMemo(() => {
    return libraryBooks.filter((b) => b.status === 'completed');
  }, [libraryBooks]);

  // Filtered lists for rendering
  const filteredInProgress = useMemo(() => {
    let list = [...inProgressBooks];
    if (categoryFilter !== 'all') {
      list = list.filter((b) => b.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [inProgressBooks, categoryFilter, searchQuery]);

  const filteredToRead = useMemo(() => {
    let list = [...toReadBooks];
    if (categoryFilter !== 'all') {
      list = list.filter((b) => b.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [toReadBooks, categoryFilter, searchQuery]);

  const filteredCompleted = useMemo(() => {
    let list = [...completedBooks];
    if (categoryFilter !== 'all') {
      list = list.filter((b) => b.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q) ||
          (b.reflection || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [completedBooks, categoryFilter, searchQuery]);

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
    list.sort((a, b) => {
      if (sortBy === 'trending') {
        return (a.trendingRank || 999) - (b.trendingRank || 999);
      }
      if (sortBy === 'bestsellers') {
        return (a.bestSellerRank || 999) - (b.bestSellerRank || 999);
      }
      if (sortBy === 'az') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
    return list;
  }, [categoryFilter, searchQuery, sortBy]);

  // Overall Stats
  const totalPagesRead = useMemo(() => {
    return readingLogs.reduce((sum, l) => sum + (l.progressAmount || 0), 0);
  }, [readingLogs]);

  const totalCompletedPoints = useMemo(() => {
    return completedBooks.reduce((sum, b) => sum + (b.pointsAwarded || 0), 0);
  }, [completedBooks]);

  const { isLoading: isAdding, executeFn: executeAdd } = useAsyncAction();
  const { isLoading: isUpdatingProgress, executeFn: executeProgress } = useAsyncAction();
  const { isLoading: isFinishing, executeFn: executeFinish } = useAsyncAction();

  const handleAddCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || customTotalAmount <= 0) return;
    await executeAdd(async () => {
      store.addCustomBookToLibrary(
        customTitle.trim(),
        customAuthor.trim() || 'Unknown Author',
        customDescription.trim() || undefined,
        customCategory || undefined,
        Number(customTotalAmount),
        customUnit,
        customStatus,
        customTargetFinishDate.trim() || undefined
      );
      setAddCustomModalOpen(false);
      setCustomTitle('');
      setCustomAuthor('');
      setCustomDescription('');
      setCustomCategory('');
      setCustomTotalAmount(250);
      setCustomUnit('pages');
      setCustomStatus('reading');
      setCustomTargetFinishDate('');
    });
  };

  const openStartReadingModal = (book: UserBook) => {
    setStartReadingModalBook(book);
    setStartTotalAmount(book.totalAmount ?? book.totalPages ?? 250);
    setStartUnit((book.unit === 'chapters' ? 'chapters' : 'pages') as 'pages' | 'chapters');
    setStartTargetDate(book.targetFinishDate || '');
  };

  const handleStartReadingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startReadingModalBook || startTotalAmount <= 0) return;
    store.updateUserBookStatus(startReadingModalBook.id, 'reading', {
      totalAmount: Number(startTotalAmount),
      unit: startUnit,
      targetFinishDate: startTargetDate.trim() || undefined,
    });
    setStartReadingModalBook(null);
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressModalBook) return;
    const current = progressModalBook.currentAmount ?? progressModalBook.currentPage ?? 0;
    const newCurrent = Number(progressInput);
    const progressAmount = newCurrent - current;
    const total = progressModalBook.totalAmount ?? progressModalBook.totalPages ?? 250;

    if (progressAmount === 0) {
      setProgressModalBook(null);
      return;
    }

    await executeProgress(async () => {
      store.updateReadingProgress(progressModalBook.id, progressAmount, newCurrent);

      if (newCurrent >= total) {
        setFinishModalBook({
          ...progressModalBook,
          currentAmount: total,
          currentPage: total,
          status: 'completed',
        });
      }
      setProgressModalBook(null);
    });
  };

  const handleFinishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishModalBook || !reflectionInput.trim()) return;
    await executeFinish(async () => {
      store.finishBook(finishModalBook.id, reflectionInput.trim());
      setFinishModalBook(null);
      setReflectionInput('');
    });
  };

  const readingHabit = store.state.habits.find((h) => h.linkedModule === 'reading');

  const getUserBookForCurated = (curatedId: string): UserBook | undefined => {
    return libraryBooks.find((lb) => lb.curatedBookId === curatedId);
  };

  const renderCategoryBadge = (category?: BookCategory | string, compact = false) => {
    if (!category) return null;
    const meta = getCategoryMeta(category as BookCategory);
    return (
      <span className={`badge ${meta.bgClass} ${meta.color} border ${compact ? 'text-[10px] px-2 py-0.5' : ''}`}>
        {category}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2.5">
            <BookOpen className="text-amber-400" size={26} />
            Reading Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track daily reading progress, build continuous streaks, queue future reads, and discover foundational self-improvement books.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {readingHabit ? (
            <button
              onClick={() => setUnlinkConfirmOpen(true)}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-2 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 whitespace-nowrap"
            >
              <Check size={14} className="text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap font-medium">Linked to Habits</span>
            </button>
          ) : (
            <button
              onClick={() => store.toggleReadingHabit()}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-2 whitespace-nowrap"
            >
              <Zap size={14} className="shrink-0" />
              <span className="whitespace-nowrap">Track as Daily Habit</span>
            </button>
          )}
          <button
            onClick={() => setAddCustomModalOpen(true)}
            className="btn-primary flex items-center gap-2 py-2 px-3.5 whitespace-nowrap"
          >
            <Plus size={16} className="shrink-0" />
            <span className="whitespace-nowrap">Add Book</span>
          </button>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">
              {streak} <span className="text-xs font-normal text-slate-400">days</span>
            </div>
            <div className="text-xs text-slate-500">Reading Streak</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/15 flex items-center justify-center text-primary-400 shrink-0">
            <PlayCircle size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{inProgressBooks.length}</div>
            <div className="text-xs text-slate-500">Currently Reading</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{completedBooks.length}</div>
            <div className="text-xs text-slate-500">Books Completed</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">+{totalCompletedPoints}</div>
            <div className="text-xs text-slate-500">Completion Points</div>
          </div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-stretch justify-between w-full bg-slate-800/40 p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('reading')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-1 rounded-lg transition-all text-center ${
                activeTab === 'reading'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <PlayCircle size={14} className="shrink-0" />
              <span className="text-[9px] sm:text-xs font-semibold leading-tight sm:whitespace-nowrap">
                Currently Reading ({inProgressBooks.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('to-read')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-1 rounded-lg transition-all text-center ${
                activeTab === 'to-read'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <ListTodo size={14} className="shrink-0" />
              <span className="text-[9px] sm:text-xs font-semibold leading-tight sm:whitespace-nowrap">
                My Library ({toReadBooks.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-1 rounded-lg transition-all text-center ${
                activeTab === 'discover'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Library size={14} className="shrink-0" />
              <span className="text-[9px] sm:text-xs font-semibold leading-tight sm:whitespace-nowrap">
                Discover Books
              </span>
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-1 rounded-lg transition-all text-center ${
                activeTab === 'completed'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <CheckCircle2 size={14} className="shrink-0" />
              <span className="text-[9px] sm:text-xs font-semibold leading-tight sm:whitespace-nowrap">
                Completed ({completedBooks.length})
              </span>
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title or author..."
                className="input pl-8 py-1.5 text-xs w-full"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as BookCategory | 'all')}
              className="input py-1.5 text-xs bg-bg-800 sm:w-44"
            >
              <option value="all">All Categories</option>
              {BOOK_CATEGORIES.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'trending' | 'bestsellers' | 'az')}
              className="input py-1.5 text-xs bg-bg-800 sm:w-36"
            >
              <option value="trending">Trending</option>
              <option value="bestsellers">Best Sellers</option>
              <option value="az">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* TAB 1: CURRENTLY READING */}
      {activeTab === 'reading' && (
        <div className="space-y-4">
          {filteredInProgress.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
                <BookOpen size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-200">No books currently in progress</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Start reading a book from your To Read list, discover foundational titles, or add a custom book.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('discover')}
                  className="btn-secondary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5"
                >
                  <Library size={14} />
                  <span>Discover Books</span>
                </button>
                <button
                  onClick={() => {
                    setCustomStatus('reading');
                    setAddCustomModalOpen(true);
                  }}
                  className="btn-primary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Add Book</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInProgress.map((book) => {
                const current = book.currentAmount ?? book.currentPage ?? 0;
                const total = book.totalAmount ?? book.totalPages ?? 250;
                const unit = book.unit || 'pages';
                const percent = Math.min(100, Math.round((current / total) * 100));

                return (
                  <div
                    key={book.id}
                    className="card p-5 space-y-4 border border-amber-500/20 bg-gradient-to-br from-bg-800 to-amber-950/10 hover:border-amber-500/40 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            {renderCategoryBadge(book.category, true)}
                            {book.isCurated && (
                              <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] flex items-center gap-1">
                                <Sparkles size={10} /> Curated
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-100 truncate">{book.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">by {book.author}</p>
                        </div>
                        <button
                          onClick={() => setDeleteModalBook(book)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all shrink-0"
                          title="Remove Book"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {book.description && (
                        <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">
                          {book.description}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">
                            {current} / {total} {unit}
                          </span>
                          <span className="font-bold text-amber-400">{percent}%</span>
                        </div>
                        <div className="h-2 w-full bg-bg-950/60 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Target Date */}
                      {book.targetFinishDate && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2.5">
                          <Calendar size={12} className="text-amber-400" />
                          <span>Target Finish: {formatDateLong(book.targetFinishDate)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 pt-3 border-t border-white/5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => {
                            setProgressModalBook(book);
                            setProgressInput(book.currentAmount ?? book.currentPage ?? 0);
                          }}
                          className="btn-primary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Plus size={14} className="shrink-0" />
                          <span>Log Pages</span>
                        </button>
                        <button
                          onClick={() => {
                            setFinishModalBook(book);
                            setReflectionInput('');
                          }}
                          className="btn-secondary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          <span>Finish</span>
                        </button>
                      </div>

                      <select
                        value={book.status}
                        onChange={(e) => store.updateUserBookStatus(book.id, e.target.value as UserBookStatus)}
                        className="input text-xs py-1 px-2 bg-bg-900 border-white/10 text-slate-300 w-fit shrink-0 cursor-pointer"
                      >
                        <option value="to-read">Move to Library</option>
                        <option value="reading">Currently Reading</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY LIBRARY */}
      {activeTab === 'to-read' && (
        <div className="space-y-4">
          {filteredToRead.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-500/15 text-slate-400 flex items-center justify-center mx-auto">
                <ListTodo size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-200">No books in your library</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Browse our curated self-improvement recommendations or add your own books to your reading library.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('discover')}
                  className="btn-secondary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5"
                >
                  <Library size={14} />
                  <span>Discover Books</span>
                </button>
                <button
                  onClick={() => {
                    setCustomStatus('to-read');
                    setAddCustomModalOpen(true);
                  }}
                  className="btn-primary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Add to Library</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredToRead.map((book) => (
                <div
                  key={book.id}
                  className="card p-4 flex flex-col justify-between space-y-3 border border-white/5 hover:border-white/10 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {renderCategoryBadge(book.category, true)}
                        <h3 className="text-sm font-bold text-slate-100 mt-1 truncate">{book.title}</h3>
                        <p className="text-xs text-slate-400">by {book.author}</p>
                      </div>
                      <button
                        onClick={() => setDeleteModalBook(book)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-all"
                        title="Remove Book"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {book.description && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {book.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
                    <span className="text-[11px] text-slate-500">
                      {book.totalAmount || book.totalPages || 250} {book.unit || 'pages'}
                    </span>
                    <button
                      onClick={() => openStartReadingModal(book)}
                      className="btn-primary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5"
                    >
                      <PlayCircle size={14} />
                      <span>Start Reading</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DISCOVER BOOKS */}
      {activeTab === 'discover' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCurated.map((curated) => {
              const userBook = getUserBookForCurated(curated.id);

              return (
                <div
                  key={curated.id}
                  className="card p-5 flex flex-col justify-between space-y-4 border border-white/5 hover:border-amber-500/30 transition-all"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      {renderCategoryBadge(curated.category, true)}
                      <span className="badge bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] flex items-center gap-1">
                        <Sparkles size={10} /> +{curated.pointsOnCompletion} pts on finish
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-100">{curated.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">by {curated.author}</p>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {curated.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-y-3 gap-x-2">
                    <span className="text-[11px] text-slate-500">
                      {curated.totalPages || 250} pages
                    </span>

                    {userBook ? (
                      <span
                        className={`badge text-[10px] px-2 py-0.5 ${
                          userBook.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : userBook.status === 'reading'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        {userBook.status === 'completed'
                          ? 'Completed'
                          : userBook.status === 'reading'
                          ? 'Currently Reading'
                          : 'In Library'}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => store.addCuratedBookToLibrary(curated, 'to-read')}
                          className="btn-primary text-xs py-1.5 px-2.5 w-fit flex items-center gap-1 whitespace-nowrap"
                        >
                          <Plus size={13} className="shrink-0" />
                          <span>Add to Library</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: COMPLETED & REFLECTIONS */}
      {activeTab === 'completed' && (
        <div className="space-y-4">
          {filteredCompleted.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-200">No completed books yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Finish reading your first book to log your key insights, takeaways, and earn points rewards.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCompleted.map((book) => (
                <div
                  key={book.id}
                  className="card p-5 space-y-3 border border-emerald-500/20 bg-gradient-to-r from-bg-800 to-emerald-950/10"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {renderCategoryBadge(book.category, true)}
                        <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] flex items-center gap-1">
                          <CheckCircle2 size={10} /> Completed
                        </span>
                        {book.pointsAwarded ? (
                          <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] flex items-center gap-1">
                            <Sparkles size={10} /> +{book.pointsAwarded} pts
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-base font-bold text-slate-100 mt-1">{book.title}</h3>
                      <p className="text-xs text-slate-400">by {book.author}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {book.dateCompleted && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar size={12} className="text-emerald-400" />
                          {formatDateLong(book.dateCompleted)}
                        </span>
                      )}
                      <button
                        onClick={() => setDeleteModalBook(book)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
                        title="Remove Book"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {book.reflection && (
                    <div className="p-3.5 bg-bg-900/80 rounded-xl border border-emerald-500/15 text-xs text-slate-300 leading-relaxed space-y-1">
                      <span className="font-semibold text-emerald-400 block text-[11px]">
                        Key Takeaway / Reflection:
                      </span>
                      <p>{book.reflection}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 text-xs text-slate-500 border-t border-white/5">
                    <span>
                      {book.totalAmount || book.totalPages || 250} {book.unit || 'pages'} read
                    </span>
                    <button
                      onClick={() => store.restartBook(book.id)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                    >
                      Re-read book →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD CUSTOM BOOK */}
      <Modal
        open={addCustomModalOpen}
        onClose={() => setAddCustomModalOpen(false)}
        title="Add Book to Reading Hub"
      >
        <form onSubmit={handleAddCustomSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Book Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. Atomic Habits, Deep Work"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Author
            </label>
            <input
              type="text"
              value={customAuthor}
              onChange={(e) => setCustomAuthor(e.target.value)}
              placeholder="e.g. James Clear"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category
              </label>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as BookCategory)}
                className="input w-full bg-bg-800"
              >
                <option value="">Select category...</option>
                {BOOK_CATEGORIES.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value as UserBookStatus)}
                className="input w-full bg-bg-800"
              >
                <option value="reading">Currently Reading</option>
                <option value="to-read">Add to Library</option>
                <option value="completed">Already Completed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Total Length
              </label>
              <input
                type="number"
                min="1"
                required
                value={customTotalAmount}
                onChange={(e) => setCustomTotalAmount(Number(e.target.value))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Unit
              </label>
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as 'pages' | 'chapters')}
                className="input w-full bg-bg-800"
              >
                <option value="pages">Pages</option>
                <option value="chapters">Chapters</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Finish Date (Optional)
            </label>
            <input
              type="date"
              value={customTargetFinishDate}
              onChange={(e) => setCustomTargetFinishDate(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Why are you reading this book? What topics does it cover?"
              className="input min-h-[70px] text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setAddCustomModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {isAdding ? <AscendLoadingIndicator size="sm" /> : <Plus size={14} />}
              <span>Add to Library</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: START READING CONFIRMATION */}
      <Modal
        open={Boolean(startReadingModalBook)}
        onClose={() => setStartReadingModalBook(null)}
        title={startReadingModalBook ? `Start Reading: ${startReadingModalBook.title}` : 'Start Reading'}
      >
        <form onSubmit={handleStartReadingSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Confirm book length and set an optional target finish date before starting.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Total Length <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={startTotalAmount}
                onChange={(e) => setStartTotalAmount(Number(e.target.value))}
                className="input w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Unit
              </label>
              <select
                value={startUnit}
                onChange={(e) => setStartUnit(e.target.value as 'pages' | 'chapters')}
                className="input w-full bg-bg-800"
              >
                <option value="pages">Pages</option>
                <option value="chapters">Chapters</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Finish Date (Optional)
            </label>
            <input
              type="date"
              value={startTargetDate}
              onChange={(e) => setStartTargetDate(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setStartReadingModalBook(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <PlayCircle size={14} />
              <span>Start Reading</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: LOG PROGRESS (ABSOLUTE CURRENT PAGE MODEL) */}
      <Modal
        open={Boolean(progressModalBook)}
        onClose={() => setProgressModalBook(null)}
        title={progressModalBook ? `Log Progress: ${progressModalBook.title}` : 'Log Progress'}
      >
        <form onSubmit={handleProgressSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Total Book Size: {progressModalBook?.totalAmount ?? progressModalBook?.totalPages ?? 250}{' '}
            {progressModalBook?.unit || 'pages'}
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              What {progressModalBook?.unit === 'chapters' ? 'chapter' : 'page'} are you on currently?
            </label>
            <input
              type="number"
              required
              min="0"
              max={progressModalBook?.totalAmount ?? progressModalBook?.totalPages ?? 250}
              value={progressInput}
              onChange={(e) => setProgressInput(Number(e.target.value))}
              className="input w-full text-lg font-bold"
              placeholder="e.g. 120"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Quick Add
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 20].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setProgressInput((prev) => prev + amount)}
                  className="btn-secondary text-xs py-1.5 px-2 font-medium text-slate-200 hover:text-white border-white/10"
                >
                  +{amount}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setProgressModalBook(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingProgress}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {isUpdatingProgress ? <AscendLoadingIndicator size="sm" /> : <Plus size={14} />}
              <span>Save Progress</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: FINISH BOOK & REFLECTION (COMPULSORY REFLECTION) */}
      <Modal
        open={Boolean(finishModalBook)}
        onClose={() => setFinishModalBook(null)}
        title={finishModalBook ? `Celebrate: ${finishModalBook.title}` : 'Book Finished'}
      >
        <form onSubmit={handleFinishSubmit} className="space-y-4">
          <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-300">
            <Sparkles size={24} className="shrink-0 text-amber-400" />
            <div className="text-xs">
              <span className="font-bold block">Congratulations on finishing!</span>
              <span>
                {finishModalBook?.isCurated
                  ? `Earned +${finishModalBook.pointsReward || 40} points bonus!`
                  : 'Earned +30 points completion bonus!'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Key Insights & Reflections <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              value={reflectionInput}
              onChange={(e) => setReflectionInput(e.target.value)}
              placeholder="What core frameworks or actionable habits did you learn? How will you apply this to your life?"
              className="input min-h-[100px] text-xs leading-relaxed"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setFinishModalBook(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isFinishing || !reflectionInput.trim()}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {isFinishing ? <AscendLoadingIndicator size="sm" /> : <CheckCircle2 size={14} />}
              <span>Complete & Archive</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: UNLINK READING HABIT */}
      <Modal
        open={unlinkConfirmOpen}
        onClose={() => setUnlinkConfirmOpen(false)}
        title="Unlink Reading Habit?"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Are you sure you want to unlink and remove the automatic Reading habit from your Habit Tracker?
          </p>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setUnlinkConfirmOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                store.toggleReadingHabit();
                setUnlinkConfirmOpen(false);
              }}
              className="btn-primary text-xs bg-rose-500 hover:bg-rose-600 border-none"
            >
              Unlink & Delete Habit
            </button>
          </div>
        </div>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        open={Boolean(deleteModalBook)}
        onClose={() => setDeleteModalBook(null)}
        onConfirm={async () => {
          if (deleteModalBook) {
            store.deleteBook(deleteModalBook.id);
            setDeleteModalBook(null);
          }
        }}
        title="Remove Book from Library?"
        itemName={deleteModalBook?.title}
        description={`Are you sure you want to remove "${deleteModalBook?.title}" from your library?${
          linkedBookGoalsCount > 0
            ? ` Removing this book will also delete ${linkedBookGoalsCount} linked Weekly Goal${linkedBookGoalsCount > 1 ? 's' : ''}.`
            : ''
        }`}
        confirmText="Remove Book"
      />
    </div>
  );
}
