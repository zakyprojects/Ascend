import { useState, useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  Trash2,
  Search,
  PlayCircle,
  Calendar,
  Zap,
  Check,
  BookOpen,
  ListTodo,
  AlertCircle,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Dialog, EmptyState, FieldRow, Form, Input, NumberField, PageColumns, ProgressBar, Select, Tabs, Textarea } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { CURATED_BOOKS, BOOK_CATEGORIES, getCategoryMeta } from '@/lib/books';
import { UserBook, UserBookStatus, BookCategory } from '@/types';
import { earliestTargetDate, isNewPastDate, todayKey, formatDateLong, getNow, weekKey, formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { READING_POINTS } from '@/lib/pointsConfig';
import { READING_BONUS_MIN_LOG_DAYS, READING_BONUS_MIN_SPAN_DAYS, readingBonusId } from '@/lib/readingAwards';
import { CapMeter } from '@/components/ui/CapMeter';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { ProgressUpdateDialog, UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { trustedNow, trustedNowMs } from '@/lib/clock';

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
  const [reflectionInput, setReflectionInput] = useState('');

  const addBookForm = useUnsavedChanges(addCustomModalOpen, [
    customTitle,
    customAuthor,
    customDescription,
    customCategory,
    customTotalAmount,
    customUnit,
    customStatus,
    customTargetFinishDate,
  ]);
  const finishForm = useUnsavedChanges(finishModalBook?.id ?? null, reflectionInput);
  const startForm = useUnsavedChanges(startReadingModalBook?.id ?? null, [startTotalAmount, startUnit, startTargetDate]);

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
    let checkDate = trustedNow();
    const hasLoggedToday = uniqueDates.includes(today);

    if (hasLoggedToday || (uniqueDates.length > 0 && uniqueDates[0] === todayKey(new Date(trustedNowMs() - 86400000)))) {
      if (!hasLoggedToday) {
        checkDate = new Date(trustedNowMs() - 86400000);
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

  // Derived finish bonus eligibility for the finish modal (same gates as meetsReadingBonusGates)
  const finishEligibility = useMemo(() => {
    if (!finishModalBook) return null;
    const alreadyAwarded =
      (finishModalBook.pointsAwarded ?? 0) > 0 ||
      store.state.pointsHistory.some((e) => e.id === readingBonusId(finishModalBook.id));

    const maxPages = finishModalBook.totalAmount ?? finishModalBook.totalPages ?? 250;
    const currentPage = finishModalBook.currentAmount ?? finishModalBook.currentPage ?? 0;
    const unreadDelta = Math.max(0, maxPages - currentPage);

    const today = todayKey(trustedNow());
    const logDates = new Set(
      readingLogs.filter((l) => l.bookId === finishModalBook.id && (l.pagesRead || 0) > 0).map((l) => l.date)
    );
    if (unreadDelta > 0) {
      logDates.add(today);
    }
    const firstLogDate = [...logDates].sort()[0];
    let spanDays = 0;
    if (firstLogDate) {
      const [sY, sM, sD] = firstLogDate.split('-').map(Number);
      const [nY, nM, nD] = today.split('-').map(Number);
      spanDays = Math.round((new Date(nY, nM - 1, nD).getTime() - new Date(sY, sM - 1, sD).getTime()) / 86400000);
    }
    const meetsSpan = spanDays >= READING_BONUS_MIN_SPAN_DAYS;
    const loggedDays = logDates.size;
    const meetsDays = loggedDays >= READING_BONUS_MIN_LOG_DAYS;
    const isEligible = !alreadyAwarded && meetsSpan && meetsDays;

    return { isEligible, spanDays, loggedDays, meetsSpan, meetsDays, alreadyAwarded };
  }, [finishModalBook, readingLogs, store.state.pointsHistory]);

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

  const totalCompletedPoints = useMemo(() => {
    return completedBooks.reduce((sum, b) => sum + (b.pointsAwarded || 0), 0);
  }, [completedBooks]);

  const { isLoading: isAdding, executeFn: executeAdd } = useAsyncAction();
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
        (customStatus !== 'completed' && customTargetFinishDate.trim()) || undefined
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

  const progressTotal = progressModalBook?.totalAmount ?? progressModalBook?.totalPages ?? 250;

  // The dialog checks the range; this saves the new total like before (delta for the log).
  const handleProgressSave = (newCurrent: number) => {
    if (!progressModalBook) return;
    const current = progressModalBook.currentAmount ?? progressModalBook.currentPage ?? 0;
    store.updateReadingProgress(progressModalBook.id, newCurrent - current, newCurrent);
    if (newCurrent >= progressTotal) {
      setFinishModalBook({
        ...progressModalBook,
        currentAmount: progressTotal,
        currentPage: progressTotal,
        status: 'completed',
      });
    }
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
      <span className={`badge ${meta.badgeClass} ${compact ? 'text-2xs px-2 py-0.5' : ''}`}>
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
              className="btn-secondary text-xs leading-5 py-2 px-3.5 flex items-center gap-2 border-emerald-500/30 text-success-text bg-emerald-500/10 hover:bg-emerald-500/20 whitespace-nowrap"
            >
              <Check size={14} className="text-success-text shrink-0" />
              <span className="whitespace-nowrap font-medium">Linked to habits</span>
            </button>
          ) : (
            <button
              onClick={() => store.toggleReadingHabit()}
              className="btn-primary text-xs leading-5 py-2 px-3.5 flex items-center gap-2 whitespace-nowrap"
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
          lead={{ label: 'Reading streak', value: <CountUp value={streak} />, hint: 'days in a row', valueClassName: 'text-warning-text' }}
          stats={[
            { label: 'Reading now', value: <CountUp value={inProgressBooks.length} />, valueClassName: 'text-brand-text' },
            { label: 'Finished', value: <CountUp value={completedBooks.length} />, valueClassName: 'text-success-text' },
            { label: 'Completion points', value: <>+<CountUp value={totalCompletedPoints} /></>, valueClassName: 'text-purple-hierarchy' },
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
                  tone="warning"
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
                icon={BookOpen}
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
                      className="card p-5 space-y-4 border border-amber-500/20 bg-gradient-to-br from-transparent to-amber-500/[0.06] hover:border-amber-500/40 transition-colors flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              {renderCategoryBadge(book.category, true)}
                              {book.isCurated && (
                                <span className="badge badge-amber text-2xs">
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
                            <span className="figure text-warning-text">{percent}%</span>
                          </div>
                          <ProgressBar value={percent} label="Reading progress" tone="warning" />
                        </div>

                        {/* Target Date */}
                        {book.targetFinishDate && (
                          <div className="flex items-center gap-1.5 text-micro text-content-muted mt-2.5">
                            <Calendar size={12} className="text-warning-text" />
                            <span>Target Finish: {formatDateLong(book.targetFinishDate)}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 pt-3 border-t border-overlay-subtle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <UpdateProgressButton
                            variant="primary"
                            label="Log progress"
                            onClick={() => setProgressModalBook(book)}
                          />
                          <button
                            onClick={() => {
                              setFinishModalBook(book);
                              setReflectionInput('');
                            }}
                            className="btn-secondary text-xs py-1.5 px-3 w-fit flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <CheckCircle2 size={14} className="text-success-text shrink-0" />
                            <span>Finish</span>
                          </button>
                        </div>

                        <select
                          aria-label="Update book reading status"
                          value={book.status}
                          onChange={(e) => {
                            const status = e.target.value as UserBookStatus;
                            // Completing goes through Finish, so its reflection and bonus checks apply.
                            if (status === 'completed') {
                              setFinishModalBook(book);
                              setReflectionInput('');
                              return;
                            }
                            store.updateUserBookStatus(book.id, status);
                          }}
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
                icon={ListTodo}
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
                    className="card p-5 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        {renderCategoryBadge(curated.category, true)}
                        <span
                          className="badge badge-amber figure text-2xs"
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
                              ? 'badge-emerald'
                              : userBook.status === 'reading'
                              ? 'badge-amber'
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
                icon={CheckCircle2}
                title="No completed books yet"
                description="Finish a book to log what you learned and earn points."
              />
            ) : (
              <div className="space-y-3">
                {filteredCompleted.map((book) => (
                  <div
                    key={book.id}
                    className="card p-5 space-y-3 border border-emerald-500/20 bg-gradient-to-r from-transparent to-emerald-500/[0.05]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {renderCategoryBadge(book.category, true)}
                          <span className="badge badge-emerald text-2xs flex items-center gap-1">
                            <CheckCircle2 size={10} /> Completed
                          </span>
                          {book.pointsAwarded ? (
                            <span className="badge badge-amber figure text-2xs">
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
                            <Calendar size={12} className="text-success-text" />
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
                      <div className="p-3.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] text-xs text-content-tertiary leading-relaxed space-y-1">
                        <span className="font-medium text-success-text block text-micro">
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
                        className={`text-xs text-warning-text hover:text-warning-text-muted font-medium transition-colors ${TAP_TARGET}`}
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
        preventClose={isAdding}
        onClose={() => setAddCustomModalOpen(false)}
        dirty={addBookForm.dirty}
        title="Add book"
        footer={
          <>
            <button
              type="button"
              disabled={isAdding}
              onClick={() => addBookForm.confirmDiscard(() => setAddCustomModalOpen(false))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" form="rh-add-form" disabled={isAdding} className="btn-primary">
              {isAdding ? <AscendLoadingIndicator size="sm" /> : <Plus size={16} />}
              <span>Add to library</span>
            </button>
          </>
        }
      >
        <Form id="rh-add-form" onSubmit={handleAddCustomSubmit} className="space-y-4">
          <Input
            id="rh-add-title"
            label="Book title"
            required
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g. Atomic Habits, Deep Work"
            maxLength={150}
            autoComplete="off"
          />

          <Input
            id="rh-add-author"
            label="Author"
            optional
            value={customAuthor}
            onChange={(e) => setCustomAuthor(e.target.value)}
            placeholder="e.g. James Clear"
            maxLength={100}
            autoComplete="off"
          />

          <FieldRow>
            <Select
              id="rh-add-category"
              label="Category"
              optional
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value as BookCategory)}
            >
              <option value="">No category</option>
              {BOOK_CATEGORIES.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </Select>

            <Select
              id="rh-add-status"
              label="Status"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value as UserBookStatus)}
            >
              <option value="reading">Currently reading</option>
              <option value="to-read">Want to read</option>
              <option value="completed">Already finished</option>
            </Select>
          </FieldRow>

          <FieldRow>
            <NumberField
              id="rh-add-total"
              label="Length"
              min={1}
              max={100000}
              required
              value={customTotalAmount}
              onValueChange={setCustomTotalAmount}
            />
            <Select
              id="rh-add-unit"
              label="Unit"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as 'pages' | 'chapters')}
            >
              <option value="pages">Pages</option>
              <option value="chapters">Chapters</option>
            </Select>
          </FieldRow>

          {customStatus !== 'completed' && (
            <Input
              id="rh-add-date"
              label="Target finish date"
              optional
              type="date"
              min={earliestTargetDate()}
              value={customTargetFinishDate}
              onChange={(e) => setCustomTargetFinishDate(e.target.value)}
            />
          )}

          <Textarea
            id="rh-add-notes"
            label="Notes"
            optional
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder="Why are you reading it? What is it about?"
            maxLength={1000}
          />
        </Form>
      </Dialog>

      {/* MODAL: START READING CONFIRMATION */}
      <Dialog
        open={Boolean(startReadingModalBook)}
        onClose={() => setStartReadingModalBook(null)}
        dirty={startForm.dirty}
        title={startReadingModalBook ? `Start reading: ${startReadingModalBook.title}` : 'Start reading'}
        description="Confirm the length and, if you like, set a target finish date."
        footer={
          <>
            <button
              type="button"
              onClick={() => startForm.confirmDiscard(() => setStartReadingModalBook(null))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" form="rh-start-form" className="btn-primary">
              <PlayCircle size={16} />
              <span>Start reading</span>
            </button>
          </>
        }
      >
        <Form
          id="rh-start-form"
          onSubmit={handleStartReadingSubmit}
          validate={() =>
            isNewPastDate(startTargetDate, startReadingModalBook?.targetFinishDate)
              ? { message: 'Pick a later date.', field: 'rh-start-date' }
              : null
          }
          className="space-y-4"
        >
          <FieldRow>
            <NumberField
              id="rh-start-total"
              label="Total length"
              min={1}
              max={100000}
              required
              value={startTotalAmount}
              onValueChange={setStartTotalAmount}
            />
            <Select
              id="rh-start-unit"
              label="Unit"
              value={startUnit}
              onChange={(e) => setStartUnit(e.target.value as 'pages' | 'chapters')}
            >
              <option value="pages">Pages</option>
              <option value="chapters">Chapters</option>
            </Select>
          </FieldRow>

          <Input
            id="rh-start-date"
            label="Target finish date"
            optional
            type="date"
            min={earliestTargetDate(startReadingModalBook?.targetFinishDate)}
            value={startTargetDate}
            onChange={(e) => setStartTargetDate(e.target.value)}
          />
        </Form>
      </Dialog>

      {/* MODAL: LOG PROGRESS */}
      <ProgressUpdateDialog
        open={Boolean(progressModalBook)}
        onClose={() => setProgressModalBook(null)}
        title={progressModalBook ? `Log progress: ${progressModalBook.title}` : 'Log progress'}
        current={progressModalBook?.currentAmount ?? progressModalBook?.currentPage ?? 0}
        target={progressTotal}
        format={(n) => `${n} ${progressModalBook?.unit === 'chapters' ? (n === 1 ? 'chapter' : 'chapters') : n === 1 ? 'page' : 'pages'}`}
        addLabel={progressModalBook?.unit === 'chapters' ? 'Chapters read' : 'Pages read'}
        setLabel={progressModalBook?.unit === 'chapters' ? 'Chapter you’re on' : 'Page you’re on'}
        onSave={handleProgressSave}
      />

      {/* MODAL: FINISH BOOK & REFLECTION (COMPULSORY REFLECTION) */}
      <Dialog
        open={Boolean(finishModalBook)}
        preventClose={isFinishing}
        onClose={() => setFinishModalBook(null)}
        dirty={finishForm.dirty}
        title={finishModalBook ? `Finish: ${finishModalBook.title}` : 'Finish book'}
        footer={
          <>
            <button
              type="button"
              disabled={isFinishing}
              onClick={() => finishForm.confirmDiscard(() => setFinishModalBook(null))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" form="rh-finish-form" disabled={isFinishing} className="btn-primary">
              {isFinishing ? <AscendLoadingIndicator size="sm" /> : <CheckCircle2 size={16} />}
              <span>
                {finishEligibility?.isEligible
                  ? `Finish (+${READING_POINTS.completionBonus})`
                  : finishEligibility?.alreadyAwarded
                    ? 'Mark finished'
                    : 'Finish without bonus'}
              </span>
            </button>
          </>
        }
      >
        <Form id="rh-finish-form" onSubmit={handleFinishSubmit} className="space-y-4">
          {finishEligibility?.isEligible ? (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-warning-text">
              <CheckCircle2 size={18} className="shrink-0 text-warning-text" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold block">Nice work finishing it.</span>
                <span>
                  You get the +{READING_POINTS.completionBonus} point completion bonus.
                </span>
                <p className="text-micro text-content-muted">
                  First log {finishEligibility.spanDays} days ago (needs {READING_BONUS_MIN_SPAN_DAYS}) • Reading days logged: {finishEligibility.loggedDays} (needs {READING_BONUS_MIN_LOG_DAYS})
                </p>
              </div>
            </div>
          ) : finishEligibility?.alreadyAwarded ? (
            <div className="p-3.5 border border-overlay-default rounded-xl flex items-center gap-3 text-content-secondary">
              <CheckCircle2 size={18} className="shrink-0 text-content-muted" />
              <p className="text-xs text-content-muted leading-relaxed">
                The completion bonus was already awarded for this book.
              </p>
            </div>
          ) : (
            finishEligibility && (
              <div
                role="alert"
                className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex flex-col gap-3 text-content-secondary"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 text-error-text mt-0.5" />
                  <div className="text-xs space-y-1">
                    <span className="font-semibold block text-error-text">Bonus conditions not met</span>
                    <ul className="space-y-0.5 text-content-muted">
                      {!finishEligibility.meetsSpan && (
                        <li>
                          First pages logged {finishEligibility.spanDays} of {READING_BONUS_MIN_SPAN_DAYS} days ago
                        </li>
                      )}
                      {!finishEligibility.meetsDays && (
                        <li>
                          Pages logged on {finishEligibility.loggedDays} of {READING_BONUS_MIN_LOG_DAYS} separate days
                        </li>
                      )}
                    </ul>
                    <p className="text-content-muted leading-relaxed">
                      You can keep reading and log pages to earn the +{READING_POINTS.completionBonus} bonus, or finish now
                      without it. Daily page points you already earned stay.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-overlay-subtle">
                  <CapMeter
                    variant="bar"
                    label={`Days since first log (${Math.min(finishEligibility.spanDays, READING_BONUS_MIN_SPAN_DAYS)}/${READING_BONUS_MIN_SPAN_DAYS})`}
                    earned={finishEligibility.spanDays}
                    cap={READING_BONUS_MIN_SPAN_DAYS}
                  />
                  <CapMeter
                    variant="bar"
                    label={`Reading days logged (${Math.min(finishEligibility.loggedDays, READING_BONUS_MIN_LOG_DAYS)}/${READING_BONUS_MIN_LOG_DAYS})`}
                    earned={finishEligibility.loggedDays}
                    cap={READING_BONUS_MIN_LOG_DAYS}
                  />
                </div>
              </div>
            )
          )}

          <Textarea
            id="rh-finish-insights"
            label="Key takeaways"
            required
            value={reflectionInput}
            onChange={(e) => setReflectionInput(e.target.value)}
            placeholder="What did you learn, and how will you use it?"
            className="min-h-[100px] leading-relaxed"
            maxLength={2000}
          />
        </Form>
      </Dialog>

      {/* MODAL: UNLINK READING HABIT */}
      <Dialog
        open={unlinkConfirmOpen}
        onClose={() => setUnlinkConfirmOpen(false)}
        title="Unlink reading habit?"
        description="This removes the automatic Reading habit from your Habit Tracker."
        footer={
          <>
            <button type="button" onClick={() => setUnlinkConfirmOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                store.toggleReadingHabit();
                setUnlinkConfirmOpen(false);
              }}
              className="btn-danger-solid"
            >
              Unlink and delete habit
            </button>
          </>
        }
      >
        {null}
      </Dialog>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        open={Boolean(deleteModalBook)}
        onClose={() => setDeleteModalBook(null)}
        onConfirm={async () => {
          if (deleteModalBook) {
            await store.deleteBook(deleteModalBook.id);
            setDeleteModalBook(null);
            showSuccessToast('Book deleted', 'Book removed successfully.', `book_${deleteModalBook.id}`);
          }
        }}
        title="Remove Book from Library?"
        itemName={deleteModalBook?.title}
        description={`Remove "${deleteModalBook?.title}" from your library?${
          linkedBookGoalsCount > 0
            ? ` Removing this book will also delete ${linkedBookGoalsCount} linked Weekly Goal${linkedBookGoalsCount > 1 ? 's' : ''} from this week and upcoming weeks (past weeks are kept).`
            : ''
        }`}
        confirmText="Remove book"
      />
    </div>
  );
}
