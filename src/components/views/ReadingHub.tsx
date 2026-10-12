import { useState, useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  Trash2,
  BookMarked,
  Search,
  Filter,
  PlayCircle,
  Calendar,
  Clock,
  ChevronRight,
  Bookmark,
  BookCopy,
  Zap,
  Check,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Dialog, EmptyState, PageColumns, ProgressBar, Tabs } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { CURATED_BOOKS, BOOK_CATEGORIES } from '@/lib/books';
import { CuratedBook, UserBook, UserBookStatus, BookCategory } from '@/types';
import { todayKey, formatDateLong, parseDate, getNow, weekKey, formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { READING_POINTS } from '@/lib/pointsConfig';
import { CapMeter } from '@/components/ui/CapMeter';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';

type ReadingHubTab = 'reading' | 'to-read' | 'completed' | 'discover';

export function ReadingHub({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
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
  const pageDays = lastDayKeys(7);
  const pagesByDay = sumPerDay(readingLogs, pageDays, (l) => l.pagesRead);
  const pagesThisWeek = pagesByDay.reduce((sum, p) => sum + p, 0);

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

  // Derived finish bonus eligibility for the finish modal
  const finishEligibility = useMemo(() => {
    if (!finishModalBook) return null;
    const alreadyAwarded = (finishModalBook.pointsAwarded ?? 0) > 0;
    const startStr = finishModalBook.dateStarted || finishModalBook.startedAt || finishModalBook.addedAt;
    const startParsed = parseDate(startStr);
    let spanDays = 0;
    let meetsSpan = false;
    if (startParsed) {
      const startKeyStr = todayKey(startParsed);
      const nowKeyStr = todayKey(new Date());
      const [sY, sM, sD] = startKeyStr.split('-').map(Number);
      const [nY, nM, nD] = nowKeyStr.split('-').map(Number);
      const startMidnight = new Date(sY, sM - 1, sD).getTime();
      const nowMidnight = new Date(nY, nM - 1, nD).getTime();
      spanDays = Math.floor((nowMidnight - startMidnight) / 86400000);
      meetsSpan = spanDays >= 7;
    }

    const allMatchingIds = new Set<string>([finishModalBook.id]);
    if (finishModalBook.linkedBookId) allMatchingIds.add(finishModalBook.linkedBookId);

    const maxPages = finishModalBook.totalAmount ?? finishModalBook.totalPages ?? 250;
    const currentPage = finishModalBook.currentAmount ?? finishModalBook.currentPage ?? 0;
    const unreadDelta = Math.max(0, maxPages - currentPage);

    const bookLogs = readingLogs.filter(
      (l) => Boolean(l.bookId && allMatchingIds.has(l.bookId)) && (l.pagesRead || 0) > 0
    );
    const logDates = new Set(bookLogs.map((l) => l.date));
    if (unreadDelta > 0) {
      logDates.add(todayKey(new Date()));
    }
    const loggedDays = logDates.size;
    const meetsDays = loggedDays >= 5;
    const isEligible = !alreadyAwarded && meetsSpan && meetsDays;

    return { isEligible, spanDays, loggedDays, meetsSpan, meetsDays, alreadyAwarded };
  }, [finishModalBook, readingLogs]);

  // Count linked weekly goals for delete modal
  const linkedBookGoalsCount = useMemo(() => {
    if (!deleteModalBook) return 0;
    const currentWeekKey = weekKey(getNow());
    let count = 0;
    const matchingIds = new Set<string>([deleteModalBook.id]);
    if (deleteModalBook.linkedBookId) matchingIds.add(deleteModalBook.linkedBookId);

    store.state.weeklyGoals.forEach((doc) => {
      if (doc.weekKey < currentWeekKey) return;
      doc.goals.forEach((g) => {
        if (g.linkedModule === 'reading' && g.linkedItemId && matchingIds.has(g.linkedItemId)) {
          count++;
        }
      });
    });
    return count;
  }, [deleteModalBook, store.state.weeklyGoals]);

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
    return readingLogs.reduce((sum, l) => sum + (l.pagesRead || 0), 0);
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
    const pagesDelta = newCurrent - current;
    const total = progressModalBook.totalAmount ?? progressModalBook.totalPages ?? 250;

    if (pagesDelta === 0) {
      setProgressModalBook(null);
      return;
    }

    await executeProgress(async () => {
      store.updateReadingProgress(progressModalBook.id, pagesDelta, newCurrent);

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
    return (
      <span className={compact ? 'text-2xs text-content-muted' : 'text-xs text-content-muted'}>
        {category}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Reading Hub</h1>
          <p className="page-subtitle">Log pages, keep the streak, and line up what to read next.</p>
        </div>
        <div className="page-header-actions">
          {readingHabit ? (
            <button
              onClick={() => setUnlinkConfirmOpen(true)}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-2 whitespace-nowrap"
            >
              <Check size={14} className="text-success-text shrink-0" />
              <span className="whitespace-nowrap font-medium">Linked to habits</span>
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

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your reading"
          lead={{ label: 'Reading streak', value: <CountUp value={streak} />, hint: 'days in a row' }}
          stats={[
            { label: 'Reading now', value: <CountUp value={inProgressBooks.length} /> },
            { label: 'Finished', value: <CountUp value={completedBooks.length} /> },
            { label: 'Completion points', value: <>+<CountUp value={totalCompletedPoints} /></> },
          ]}
          side={<CapMeterConnected state={store.state} capId="reading" bare />}
        />
      </Reveal>

      <PageColumns stickyAside
        aside={
          <>
            {readingLogs.length > 0 && (
              <Reveal index={1} className="card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Pages, last 7 days</h2>
                  <span className="figure text-xs text-content-muted">
                    <CountUp value={pagesThisWeek} /> pages
                  </span>
                </div>
                <BarChart
                  data={pageDays.map((day, i) => ({ label: formatWeekdayShort(day), value: pagesByDay[i] }))}
                  label={`Pages read per day, last 7 days: ${pagesThisWeek} total`}
                  tone="brand"
                  highlightIndex={pageDays.length - 1}
                  formatTooltip={(datum, i) => `${formatWeekdayDate(pageDays[i])}: ${datum.value} pages`}
                />
              </Reveal>
            )}
          </>
        }
      >
        {/* Tabs & Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-overlay-subtle pb-3">
            {/* Main Navigation Tabs */}
            <Tabs
              ariaLabel="Reading Hub sections"
              variant="segmented"
              size="sm"
              scrollable
              value={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
              items={[
                { id: 'reading', label: 'Currently reading', badge: inProgressBooks.length },
                { id: 'to-read', label: 'My library', badge: toReadBooks.length },
                { id: 'discover', label: 'Discover' },
                { id: 'completed', label: 'Completed', badge: completedBooks.length },
              ]}
            />

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full">
              <div className="relative w-full sm:flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" />
                <input
                  aria-label="Search books"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title or author"
                  className="input pl-8 py-1.5 text-xs w-full"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  aria-label="Filter books by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as BookCategory | 'all')}
                  className="input py-1.5 text-xs bg-bg-800 flex-1 sm:flex-none sm:w-44"
                >
                  <option value="all">All categories</option>
                  {BOOK_CATEGORIES.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort books"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'trending' | 'bestsellers' | 'az')}
                  className="input py-1.5 text-xs bg-bg-800 flex-1 sm:flex-none sm:w-36"
                >
                  <option value="trending">Trending</option>
                  <option value="bestsellers">Bestsellers</option>
                  <option value="az">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* TAB 1: CURRENTLY READING */}
        {activeTab === 'reading' && (
          <div className="space-y-4">
            {filteredInProgress.length === 0 ? (
              <EmptyState
                title="Nothing in progress"
                description="Start a book from your library, pick one from Discover, or add your own."
                action={
                  <div className="flex items-center justify-center gap-3 pt-2">
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
                    <button type="button" onClick={() => setActiveTab('discover')} className="btn-secondary text-xs py-1.5 px-3">
                      Discover books
                    </button>
                  </div>
                }
              />
            ) : (
              <div className="grid-cards-lg gap-4">
                {filteredInProgress.map((book) => {
                  const current = book.currentAmount ?? book.currentPage ?? 0;
                  const total = book.totalAmount ?? book.totalPages ?? 250;
                  const unit = book.unit || 'pages';
                  const percent = Math.min(100, Math.round((current / total) * 100));

                  return (
                    <div
                      key={book.id}
                      className="card p-5 space-y-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              {renderCategoryBadge(book.category, true)}
                              {book.isCurated && (
                                <span className="text-2xs text-content-muted">
                                  Curated
                                </span>
                              )}
                            </div>
                            <h3 className="item-name text-base truncate">{book.title}</h3>
                            <p className="text-xs text-content-muted mt-0.5">by {book.author}</p>
                          </div>
                          <button
                            onClick={() => setDeleteModalBook(book)}
                            aria-label="Remove book"
                            className={`p-1.5 text-content-disabled hover:text-rose-theme rounded-lg hover:bg-rose-500/10 transition-all shrink-0 ${TAP_TARGET}`}
                            title="Remove book"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {book.description && (
                          <p className="text-xs text-content-muted mt-2.5 line-clamp-2 leading-relaxed">
                            {book.description}
                          </p>
                        )}

                        {/* Progress bar */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="figure text-content-muted">
                              {current} / {total} {unit}
                            </span>
                            <span className="figure text-content-secondary">{percent}%</span>
                          </div>
                          <ProgressBar value={percent} label="Reading progress" tone="brand" />
                        </div>

                        {/* Target Date */}
                        {book.targetFinishDate && (
                          <div className="flex items-center gap-1.5 text-micro text-content-muted mt-2.5">
                            <Calendar size={12} className="text-content-subtle" />
                            <span>Target Finish: {formatDateLong(book.targetFinishDate)}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 pt-3 border-t border-overlay-subtle">
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
                            <CheckCircle2 size={14} className="shrink-0" />
                            <span>Finish</span>
                          </button>
                        </div>

                        <select
                          aria-label="Update book reading status"
                          value={book.status}
                          onChange={(e) => store.updateUserBookStatus(book.id, e.target.value as UserBookStatus)}
                          className="input text-xs py-1 px-2 bg-bg-900 border-overlay-default text-content-tertiary w-fit shrink-0 cursor-pointer"
                        >
                          <option value="to-read">Move to Library</option>
                          <option value="reading">Currently reading</option>
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
              <EmptyState
                title="No books in your library"
                description="Pick from the recommended books or add your own."
                action={
                  <div className="flex items-center justify-center gap-3 pt-2">
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
                    <button type="button" onClick={() => setActiveTab('discover')} className="btn-secondary text-xs py-1.5 px-3">
                      Discover books
                    </button>
                  </div>
                }
              />
            ) : (
              <div className="grid-cards gap-3.5">
                {filteredToRead.map((book) => (
                  <div
                    key={book.id}
                    className="card p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {renderCategoryBadge(book.category, true)}
                          <h3 className="item-name text-sm mt-1 truncate">{book.title}</h3>
                          <p className="text-xs text-content-muted">by {book.author}</p>
                        </div>
                        <button
                          onClick={() => setDeleteModalBook(book)}
                          aria-label="Remove book"
                          className={`p-1 text-content-disabled hover:text-rose-theme rounded transition-all ${TAP_TARGET}`}
                          title="Remove book"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {book.description && (
                        <p className="text-xs text-content-muted mt-2 line-clamp-2 leading-relaxed">
                          {book.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-overlay-subtle gap-2">
                      <span className="text-micro text-content-disabled">
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
            {filteredCurated.length === 0 && (
              <EmptyState size="sm" title="No books match your search" description="Try a different search or category." />
            )}
            <div className="grid-cards gap-4">
              {filteredCurated.map((curated) => {
                const userBook = getUserBookForCurated(curated.id);

                return (
                  <div
                    key={curated.id}
                    className="card p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        {renderCategoryBadge(curated.category, true)}
                        <span
                          className="figure text-2xs text-content-muted"
                          title="Needs reading in Ascend over at least 7 days, with at least 5 logged reading days"
                        >
                          +{READING_POINTS.completionBonus} pts on finish
                        </span>
                      </div>

                      <div>
                        <h3 className="item-name text-base">{curated.title}</h3>
                        <p className="text-xs text-content-muted mt-0.5">by {curated.author}</p>
                      </div>

                      <p className="text-xs text-content-muted line-clamp-3 leading-relaxed">
                        {curated.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-overlay-subtle flex flex-wrap items-center justify-between gap-y-3 gap-x-2">
                      <span className="text-micro text-content-disabled">
                        {curated.totalPages || 250} pages
                      </span>

                      {userBook ? (
                        <span
                          className={`badge text-2xs px-2 py-0.5 ${
                            userBook.status === 'completed'
                              ? 'badge-neutral'
                              : userBook.status === 'reading'
                              ? 'badge-neutral'
                              : 'bg-overlay-subtle text-content-muted'
                          }`}
                        >
                          {userBook.status === 'completed'
                            ? 'Completed'
                            : userBook.status === 'reading'
                            ? 'Currently reading'
                            : 'In library'}
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
              <EmptyState
                title="No completed books yet"
                description="Finish a book to log what you learned and earn points."
              />
            ) : (
              <div className="space-y-3">
                {filteredCompleted.map((book) => (
                  <div
                    key={book.id}
                    className="card p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {renderCategoryBadge(book.category, true)}
                          <span className="badge badge-neutral text-2xs">
                            Completed
                          </span>
                          {book.pointsAwarded ? (
                            <span className="figure text-2xs text-content-muted">
                              +{book.pointsAwarded} pts bonus
                            </span>
                          ) : (
                            <span
                              className="text-2xs text-content-disabled"
                              title="The completion bonus needs reading in Ascend over at least 7 days, with at least 5 separate logged reading days"
                            >
                              Completed without bonus
                            </span>
                          )}
                        </div>
                        <h3 className="item-name text-base mt-1">{book.title}</h3>
                        <p className="text-xs text-content-muted">by {book.author}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {book.dateCompleted && (
                          <span className="text-xs text-content-muted flex items-center gap-1">
                            <Calendar size={12} className="text-content-subtle" />
                            {formatDateLong(book.dateCompleted)}
                          </span>
                        )}
                        <button
                          onClick={() => setDeleteModalBook(book)}
                          aria-label="Remove book"
                          className={`p-1.5 text-content-disabled hover:text-rose-theme rounded-lg hover:bg-rose-500/10 transition-all ${TAP_TARGET}`}
                          title="Remove book"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {book.reflection && (
                      <div className="text-xs text-content-tertiary leading-relaxed space-y-1">
                        <span className="font-medium text-content-muted block text-micro">
                          Key takeaway
                        </span>
                        <p>{book.reflection}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 text-xs text-content-disabled border-t border-overlay-subtle">
                      <span>
                        {book.totalAmount || book.totalPages || 250} {book.unit || 'pages'} read
                      </span>
                      <button
                        onClick={() => store.restartBook(book.id)}
                        className={`text-xs text-content-secondary hover:text-content-primary font-medium transition-colors ${TAP_TARGET}`}
                      >
                        Re-read book
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PageColumns>

      {/* MODAL: ADD CUSTOM BOOK */}
      <Dialog
        open={addCustomModalOpen}
        onClose={() => setAddCustomModalOpen(false)}
        title="Add Book"
      >
        <form onSubmit={handleAddCustomSubmit} className="space-y-4">
          <div>
            <label htmlFor="rh-add-title" className="block text-xs font-medium text-content-tertiary mb-1">
              Book Title <span className="text-rose-theme">*</span>
            </label>
            <input
              id="rh-add-title"
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
            <label htmlFor="rh-add-author" className="block text-xs font-medium text-content-tertiary mb-1">
              Author
            </label>
            <input
              id="rh-add-author"
              type="text"
              value={customAuthor}
              onChange={(e) => setCustomAuthor(e.target.value)}
              placeholder="e.g. James Clear"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rh-add-category" className="block text-xs font-medium text-content-tertiary mb-1">
                Category
              </label>
              <select
                id="rh-add-category"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as BookCategory)}
                className="input w-full bg-bg-800"
              >
                <option value="">Select category</option>
                {BOOK_CATEGORIES.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rh-add-status" className="block text-xs font-medium text-content-tertiary mb-1">
                Status
              </label>
              <select
                id="rh-add-status"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value as UserBookStatus)}
                className="input w-full bg-bg-800"
              >
                <option value="reading">Currently reading</option>
                <option value="to-read">Add to Library</option>
                <option value="completed">Already finished</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rh-add-total" className="block text-xs font-medium text-content-tertiary mb-1">
                Length
              </label>
              <input
                id="rh-add-total"
                type="number"
                min="1"
                required
                value={customTotalAmount}
                onChange={(e) => setCustomTotalAmount(Number(e.target.value))}
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="rh-add-unit" className="block text-xs font-medium text-content-tertiary mb-1">
                Unit
              </label>
              <select
                id="rh-add-unit"
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
            <label htmlFor="rh-add-date" className="block text-xs font-medium text-content-tertiary mb-1">
              Target finish date (optional)
            </label>
            <input
              id="rh-add-date"
              type="date"
              value={customTargetFinishDate}
              onChange={(e) => setCustomTargetFinishDate(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="rh-add-notes" className="block text-xs font-medium text-content-tertiary mb-1">
              Notes (optional)
            </label>
            <textarea
              id="rh-add-notes"
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Why are you reading it? What is it about?"
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
      </Dialog>

      {/* MODAL: START READING CONFIRMATION */}
      <Dialog
        open={Boolean(startReadingModalBook)}
        onClose={() => setStartReadingModalBook(null)}
        title={startReadingModalBook ? `Start Reading: ${startReadingModalBook.title}` : 'Start Reading'}
      >
        <form onSubmit={handleStartReadingSubmit} className="space-y-4">
          <p className="text-xs text-content-muted">
            Confirm the length and, if you like, set a target finish date.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rh-start-total" className="block text-xs font-medium text-content-tertiary mb-1">
                Total Length <span className="text-rose-theme">*</span>
              </label>
              <input
                id="rh-start-total"
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
              <label htmlFor="rh-start-unit" className="block text-xs font-medium text-content-tertiary mb-1">
                Unit
              </label>
              <select
                id="rh-start-unit"
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
            <label htmlFor="rh-start-date" className="block text-xs font-medium text-content-tertiary mb-1">
              Target finish date (optional)
            </label>
            <input
              id="rh-start-date"
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
      </Dialog>

      {/* MODAL: LOG PROGRESS (ABSOLUTE CURRENT PAGE MODEL) */}
      <Dialog
        open={Boolean(progressModalBook)}
        onClose={() => setProgressModalBook(null)}
        title={progressModalBook ? `Log Progress: ${progressModalBook.title}` : 'Log Progress'}
      >
        <form onSubmit={handleProgressSubmit} className="space-y-4">
          <p className="text-xs text-content-muted">
            Total Book Size: {progressModalBook?.totalAmount ?? progressModalBook?.totalPages ?? 250}{' '}
            {progressModalBook?.unit || 'pages'}
          </p>

          <div>
            <label htmlFor="rh-progress-current" className="block text-xs font-medium text-content-tertiary mb-1">
              What {progressModalBook?.unit === 'chapters' ? 'chapter' : 'page'} are you on currently?
            </label>
            <input
              id="rh-progress-current"
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
            <label className="block text-micro font-medium text-content-muted mb-1.5">
              Quick add
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 20].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setProgressInput((prev) => prev + amount)}
                  className="btn-secondary text-xs py-1.5 px-2 font-medium text-content-secondary hover:text-content-primary border-overlay-default"
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
      </Dialog>

      {/* MODAL: FINISH BOOK & REFLECTION (COMPULSORY REFLECTION) */}
      <Dialog
        open={Boolean(finishModalBook)}
        onClose={() => setFinishModalBook(null)}
        title={finishModalBook ? `Finish: ${finishModalBook.title}` : 'Finish Book'}
      >
        <form onSubmit={handleFinishSubmit} className="space-y-4">
          {finishEligibility?.isEligible ? (
            <div className="p-3.5 border border-overlay-default rounded-xl flex items-center gap-3 text-content-secondary">
              <CheckCircle2 size={18} className="shrink-0 text-success-text" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold block text-content-primary">Nice work finishing it.</span>
                <span>
                  You get the +{READING_POINTS.completionBonus} point completion bonus.
                </span>
                <p className="text-micro text-content-muted">
                  Span: {finishEligibility.spanDays} days (req. ≥7) • Reading days logged: {finishEligibility.loggedDays} (req. ≥5)
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 border border-overlay-default rounded-xl flex flex-col gap-3 text-content-secondary">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="shrink-0 text-content-muted" />
                <div className="text-xs space-y-0.5">
                  <span className="font-semibold block text-content-primary">Finishing without the bonus (+0 points)</span>
                  <p className="text-content-muted leading-relaxed">
                    {finishEligibility?.alreadyAwarded
                      ? 'Completion bonus was already awarded for this book.'
                      : `The 15 pt bonus needs reading in Ascend over at least 7 days (now ${finishEligibility?.spanDays ?? 0}d) and at least 5 separate logged reading days (now ${finishEligibility?.loggedDays ?? 0}d). Daily page points you already earned stay.`}
                  </p>
                </div>
              </div>

              {!finishEligibility?.alreadyAwarded && finishEligibility && (
                <div className="space-y-2 pt-2 border-t border-overlay-subtle">
                  <CapMeter
                    variant="bar"
                    label={`Days since start (${finishEligibility.spanDays}/7)`}
                    earned={finishEligibility.spanDays}
                    cap={7}
                  />
                  <CapMeter
                    variant="bar"
                    label={`Reading days logged (${finishEligibility.loggedDays}/5)`}
                    earned={finishEligibility.loggedDays}
                    cap={5}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="rh-finish-insights" className="block text-xs font-medium text-content-tertiary mb-1">
              Key takeaways <span className="text-rose-theme">*</span>
            </label>
            <textarea
              id="rh-finish-insights"
              required
              value={reflectionInput}
              onChange={(e) => setReflectionInput(e.target.value)}
              placeholder="What did you learn, and how will you use it?"
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
              <span>Mark Finished</span>
            </button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: UNLINK READING HABIT */}
      <Dialog
        open={unlinkConfirmOpen}
        onClose={() => setUnlinkConfirmOpen(false)}
        title="Unlink Reading Habit?"
      >
        <div className="space-y-4">
          <p className="text-xs text-content-muted leading-relaxed">
            Unlink and remove the automatic Reading habit from your Habit Tracker?
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
              Unlink and Delete Habit
            </button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        open={Boolean(deleteModalBook)}
        onClose={() => setDeleteModalBook(null)}
        onConfirm={async () => {
          if (deleteModalBook) {
            await store.deleteBook(deleteModalBook.id);
            setDeleteModalBook(null);
            showSuccessToast('Book Deleted', 'Book removed successfully.', `book_${deleteModalBook.id}`);
          }
        }}
        title="Remove Book from Library?"
        itemName={deleteModalBook?.title}
        description={`Remove "${deleteModalBook?.title}" from your library?${
          linkedBookGoalsCount > 0
            ? ` Removing this book will also delete ${linkedBookGoalsCount} linked Weekly Goal${linkedBookGoalsCount > 1 ? 's' : ''} from this week and upcoming weeks (past weeks are kept).`
            : ''
        }`}
        confirmText="Remove Book"
      />
    </div>
  );
}
