import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ListTodo, Pause, Pencil, PlayCircle, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Badge, Dialog, Disclosure, EmptyState, PageColumns, ProgressBar, Switch, Tabs, ToolbarInput, ToolbarSelect } from '@/components/ui/primitives';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { CURATED_BOOKS, BOOK_CATEGORIES } from '@/lib/books';
import type { BookCategory, CuratedBook, UserBook } from '@/types';
import { formatDateLong, getNow, weekKey, formatWeekdayDate, formatWeekdayShort, addDays } from '@/lib/dates';
import { READING_POINTS } from '@/lib/pointsConfig';
import { READING_BONUS_MIN_LOG_DAYS, READING_BONUS_MIN_SPAN_DAYS, bookRemovalPoints, isRetiredAppReadingAward } from '@/lib/readingAwards';
import { getCapStatus } from '@/lib/capStatus';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { ProgressUpdateDialog, UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';
import { useToast } from '@/components/ui/Toast';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { BookCard, ClampedText } from '@/components/reading/BookCard';
import { BookFormDialog } from '@/components/reading/BookFormDialog';
import { StartReadingDialog } from '@/components/reading/StartReadingDialog';
import { FinishBookDialog } from '@/components/reading/FinishBookDialog';
import { bookBonus, bookProgress, byNewest, formatAmount, matchesBookFilter, sameBook, targetLine } from '@/components/reading/bookMeta';

type ReadingHubTab = 'reading' | 'library' | 'finished' | 'discover';
type DiscoverSort = 'trending' | 'bestsellers' | 'az';

const TARGET_TONE = {
  muted: 'text-content-muted',
  warning: 'text-warning-text',
  danger: 'text-error-text',
  success: 'text-success-text',
} as const;

function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'rounded-lg p-1.5 text-content-disabled transition-colors',
        danger ? 'hover:bg-rose-500/10 hover:text-rose-theme' : 'hover:bg-overlay-subtle hover:text-content-secondary',
        TAP_TARGET
      )}
    >
      {children}
    </button>
  );
}

export function ReadingHub({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [activeTab, setActiveTab] = useState<ReadingHubTab>('reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BookCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<DiscoverSort>('trending');

  // Dialogs. Each form dialog is remounted per open (key), so it starts from saved values.
  const [bookForm, setBookForm] = useState<{ open: boolean; bookId: string | null; status: UserBook['status']; key: number }>({
    open: false,
    bookId: null,
    status: 'reading',
    key: 0,
  });
  const [startBookId, setStartBookId] = useState<{ id: string | null; key: number }>({ id: null, key: 0 });
  const [finishBookId, setFinishBookId] = useState<{ id: string | null; key: number }>({ id: null, key: 0 });
  const [progressBookId, setProgressBookId] = useState<string | null>(null);
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);

  const { libraryBooks, readingLogs, pointsHistory } = store.state;
  const findBook = (id: string | null) => (id ? libraryBooks.find((b) => b.id === id) ?? null : null);
  const formBook = findBook(bookForm.bookId);
  const startBook = findBook(startBookId.id);
  const finishBook = findBook(finishBookId.id);
  const progressBook = findBook(progressBookId);
  const deleteBook = findBook(deleteBookId);

  const openAdd = (status: UserBook['status'] = 'reading') =>
    setBookForm((f) => ({ open: true, bookId: null, status, key: f.key + 1 }));
  const openEdit = (book: UserBook) => setBookForm((f) => ({ open: true, bookId: book.id, status: book.status, key: f.key + 1 }));
  const openStart = (book: UserBook) => setStartBookId((s) => ({ id: book.id, key: s.key + 1 }));
  const openFinish = (book: UserBook) => setFinishBookId((s) => ({ id: book.id, key: s.key + 1 }));

  const changeTab = (tab: ReadingHubTab) => {
    setActiveTab(tab);
    // Filters belong to the list they were set on; a hidden filter would hide books.
    setSearchQuery('');
    setCategoryFilter('all');
  };

  // Hero and chart numbers, computed live.
  // Rolls at local midnight like the other day-scoped pages (streak, Last 7 days, points today).
  const today = useLocalDayKey();
  const pageDays = lastDayKeys(7, today);
  const pagesByDay = sumPerDay(readingLogs, pageDays, (l) => l.pagesRead);
  const pagesThisWeek = pagesByDay.reduce((sum, p) => sum + p, 0);

  const streak = useMemo(() => {
    // Any logged day counts, as before (older logs carry their amount under another field).
    const days = new Set(readingLogs.filter(Boolean).map((l) => l.date));
    let day = days.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (days.has(day)) {
      count++;
      day = addDays(day, -1);
    }
    return count;
  }, [readingLogs, today]);

  const pointsToday = getCapStatus(store.state, 'reading', getNow()).earned;
  // Points come from the points ledger (page points and finish bonuses): removing a book keeps
  // earlier days' page points here and takes back only what the ledger takes back.
  const readingPoints = useMemo(
    () =>
      pointsHistory
        .filter((e) => (e.source === 'reading' || e.source === 'reading_bonus') && !isRetiredAppReadingAward(e))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [pointsHistory]
  );

  const readingBooks = useMemo(
    () => libraryBooks.filter((b) => b.status === 'reading').sort(byNewest('updatedAt', 'startedAt', 'addedAt')),
    [libraryBooks]
  );
  const libraryList = useMemo(
    () => libraryBooks.filter((b) => b.status === 'to-read' || b.status === 'to_read').sort(byNewest('updatedAt', 'addedAt')),
    [libraryBooks]
  );
  const finishedBooks = useMemo(
    () => libraryBooks.filter((b) => b.status === 'completed').sort(byNewest('dateCompleted', 'completedAt', 'updatedAt')),
    [libraryBooks]
  );

  const shownLibrary = libraryList.filter((b) => matchesBookFilter(b, searchQuery, categoryFilter));
  const shownFinished = finishedBooks.filter((b) => matchesBookFilter(b, searchQuery, categoryFilter));
  const shownCurated = useMemo(() => {
    const list = CURATED_BOOKS.filter((b) => matchesBookFilter(b, searchQuery, categoryFilter));
    return list.sort((a, b) => {
      if (sortBy === 'bestsellers') return (a.bestSellerRank || 999) - (b.bestSellerRank || 999);
      if (sortBy === 'az') return a.title.localeCompare(b.title);
      return (a.trendingRank || 999) - (b.trendingRank || 999);
    });
  }, [searchQuery, categoryFilter, sortBy]);

  const linkedGoalsCount = useMemo(() => {
    if (!deleteBook) return 0;
    const currentWeekKey = weekKey(getNow());
    const ids = new Set([deleteBook.id, deleteBook.linkedBookId].filter(Boolean));
    return store.state.weeklyGoals
      .filter((doc) => doc.weekKey >= currentWeekKey)
      .reduce(
        (n, doc) => n + doc.goals.filter((g) => g.linkedModule === 'reading' && g.linkedItemId && ids.has(g.linkedItemId)).length,
        0
      );
  }, [deleteBook, store.state.weeklyGoals]);

  // Points removing the book takes back (its finish bonus + today's page points from it), the same
  // number deleteBook and the server take back.
  const deletePoints = useMemo(
    () => (deleteBook ? bookRemovalPoints(deleteBook, libraryBooks, readingLogs, pointsHistory, today) : null),
    [deleteBook, libraryBooks, readingLogs, pointsHistory, today]
  );
  const deletePointsLine = (() => {
    if (!deletePoints || deletePoints.total <= 0) return '';
    const what =
      deletePoints.bonus > 0 && deletePoints.today > 0
        ? 'finish bonus and today’s pages'
        : deletePoints.bonus > 0
          ? 'finish bonus'
          : 'today’s pages';
    return `Removing this book takes back its ${deletePoints.total} point${deletePoints.total === 1 ? '' : 's'} (${what}). `;
  })();

  const readingHabit = store.state.habits.find((h) => h.linkedModule === 'reading');
  // A book you added yourself with the same title and author counts as this curated book, so it
  // can't be added twice.
  const bookForCurated = (curated: CuratedBook) =>
    libraryBooks.find((b) => b.curatedBookId === curated.id) ?? libraryBooks.find((b) => !b.curatedBookId && sameBook(b, curated));

  const handleProgressSave = (newCurrent: number) => {
    if (!progressBook) return;
    const { current, total } = bookProgress(progressBook);
    store.updateReadingProgress(progressBook.id, newCurrent - current, newCurrent);
    if (newCurrent >= total) openFinish(progressBook);
  };

  const showFilters = activeTab !== 'reading';

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reading Hub</h1>
          <p className="page-subtitle">Log pages, keep the streak, and line up what to read next.</p>
        </div>
        <div className="page-header-actions">
          <button type="button" onClick={() => openAdd(activeTab === 'library' ? 'to-read' : 'reading')} className="btn-primary">
            <Plus size={16} className="shrink-0" />
            <span className="whitespace-nowrap">Add book</span>
          </button>
        </div>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your reading"
          ring={{
            value: pointsToday,
            max: READING_POINTS.dailyCap,
            label: `Points today: ${pointsToday} of ${READING_POINTS.dailyCap}`,
            center: (
              <>
                {pointsToday}
                <span className="text-sm font-medium text-content-muted">/{READING_POINTS.dailyCap}</span>
              </>
            ),
            caption: 'points today',
            tone: 'warning',
          }}
          lead={{
            label: 'Reading streak',
            value: <CountUp value={streak} />,
            hint: streak === 1 ? 'day in a row' : 'days in a row',
            valueClassName: 'text-warning-text',
          }}
          stats={[
            { label: 'Reading now', value: <CountUp value={readingBooks.length} />, valueClassName: 'text-brand-text' },
            { label: 'Finished', value: <CountUp value={finishedBooks.length} />, valueClassName: 'text-success-text' },
            { label: 'Points earned', value: <>{readingPoints > 0 && '+'}<CountUp value={Math.max(0, readingPoints)} /></>, valueClassName: 'text-purple-hierarchy' },
          ]}
          side={<CapMeterConnected state={store.state} capId="reading" bare />}
        />
      </Reveal>

      <PageColumns
        stickyAside
        aside={
          <>
            {readingLogs.length > 0 && (
              <Reveal index={1} className="card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Last 7 days</h2>
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

            <Reveal index={2} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="section-title">Daily habit</h2>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {readingHabit ? 'Ticks itself on days you log pages.' : 'Add a Reading habit that ticks itself when you log pages.'}
                  </p>
                </div>
                <Switch
                  checked={Boolean(readingHabit)}
                  label="Track reading as a daily habit"
                  onChange={() => (readingHabit ? setUnlinkConfirmOpen(true) : store.toggleReadingHabit())}
                />
              </div>
            </Reveal>

            <Disclosure title="How points work">
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  Every <span className="figure">{READING_POINTS.pagesPerPoint}</span> pages ={' '}
                  <span className="figure text-success-text">1 pt</span>, up to{' '}
                  <span className="figure">{READING_POINTS.dailyCap}</span> pts a day, across all books.
                </li>
                <li>
                  Finishing a book gives <span className="figure text-success-text">+{READING_POINTS.completionBonus}</span> once,
                  when you logged pages on {READING_BONUS_MIN_LOG_DAYS} separate days and the first was {READING_BONUS_MIN_SPAN_DAYS}+
                  days ago.
                </li>
                <li>The pages Finish adds for you earn no page points.</li>
                <li>Removing a book takes back its finish bonus and today's points from it. Earlier days keep their points.</li>
              </ul>
            </Disclosure>
          </>
        }
      >
        <div className="space-y-3">
          <Tabs
            ariaLabel="Reading Hub sections"
            variant="segmented"
            size="sm"
            scrollable
            value={activeTab}
            onChange={(id) => changeTab(id as ReadingHubTab)}
            items={[
              { id: 'reading', label: 'Reading', badge: readingBooks.length },
              { id: 'library', label: 'Library', badge: libraryList.length },
              { id: 'finished', label: 'Finished', badge: finishedBooks.length },
              { id: 'discover', label: 'Discover' },
            ]}
          />

          {showFilters && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ToolbarInput
                type="search"
                icon={Search}
                aria-label="Search books"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'finished' ? 'Search books or takeaways' : 'Search title or author'}
                wrapperClassName="sm:flex-1"
              />
              <div className="flex items-center gap-2">
                <ToolbarSelect
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as BookCategory | 'all')}
                  wrapperClassName="flex-1 sm:w-44 sm:flex-none"
                >
                  <option value="all">All categories</option>
                  {BOOK_CATEGORIES.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </ToolbarSelect>
                {activeTab === 'discover' && (
                  <ToolbarSelect
                    aria-label="Sort books"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as DiscoverSort)}
                    wrapperClassName="flex-1 sm:w-36 sm:flex-none"
                  >
                    <option value="trending">Trending</option>
                    <option value="bestsellers">Bestsellers</option>
                    <option value="az">A to Z</option>
                  </ToolbarSelect>
                )}
              </div>
            </div>
          )}
        </div>

        {/* READING */}
        {activeTab === 'reading' &&
          (readingBooks.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Nothing in progress"
              description="Start a book from your library, pick one in Discover, or add your own."
              action={
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button type="button" onClick={() => openAdd('reading')} className="btn-primary text-xs py-1.5 px-3">
                    <Plus size={14} />
                    <span>Add book</span>
                  </button>
                  <button type="button" onClick={() => changeTab('discover')} className="btn-secondary text-xs py-1.5 px-3">
                    Discover books
                  </button>
                </div>
              }
            />
          ) : (
            <div className="grid-cards-lg gap-4">
              {readingBooks.map((book) => {
                const p = bookProgress(book);
                const target = targetLine(book);
                return (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    author={book.author}
                    category={book.category}
                    controls={
                      <>
                        <IconAction label="Edit book" onClick={() => openEdit(book)}>
                          <Pencil size={15} />
                        </IconAction>
                        <IconAction label="Remove book" danger onClick={() => setDeleteBookId(book.id)}>
                          <Trash2 size={15} />
                        </IconAction>
                      </>
                    }
                    footer={
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <UpdateProgressButton variant="primary" label="Log progress" onClick={() => setProgressBookId(book.id)} />
                          <button type="button" onClick={() => openFinish(book)} className="btn-secondary text-xs py-1.5 px-3">
                            <CheckCircle2 size={14} className="text-success-text" />
                            <span>Finish</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => store.updateUserBookStatus(book.id, 'to-read')}
                          className={cx('inline-flex items-center gap-1.5 text-xs font-medium text-content-muted hover:text-content-secondary', TAP_TARGET)}
                        >
                          <Pause size={13} />
                          <span>Move to library</span>
                        </button>
                      </>
                    }
                  >
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="figure text-sm text-content-secondary">
                          <span className="text-lg font-semibold text-content-primary">{p.current}</span> / {formatAmount(p.total, p.unit)}
                        </span>
                        <span className="figure text-xs text-warning-text">{p.percent}%</span>
                      </div>
                      <ProgressBar value={p.percent} label={`Reading progress: ${p.percent}%`} tone="warning" />
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="text-content-muted">{p.left > 0 ? `${formatAmount(p.left, p.unit)} left` : 'All read'}</span>
                        {target && <span className={TARGET_TONE[target.tone]}>{target.text}</span>}
                      </div>
                    </div>
                    <ClampedText text={book.description} />
                  </BookCard>
                );
              })}
            </div>
          ))}

        {/* LIBRARY */}
        {activeTab === 'library' &&
          (shownLibrary.length === 0 ? (
            libraryList.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="Your library is empty"
                description="Save books you want to read next, from Discover or your own."
                action={
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button type="button" onClick={() => openAdd('to-read')} className="btn-primary text-xs py-1.5 px-3">
                      <Plus size={14} />
                      <span>Add book</span>
                    </button>
                    <button type="button" onClick={() => changeTab('discover')} className="btn-secondary text-xs py-1.5 px-3">
                      Discover books
                    </button>
                  </div>
                }
              />
            ) : (
              <EmptyState size="sm" title="No books match" description="Try another search or category." />
            )
          ) : (
            <div className="grid-cards gap-4">
              {shownLibrary.map((book) => {
                const p = bookProgress(book);
                const started = p.current > 0;
                return (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    author={book.author}
                    category={book.category}
                    controls={
                      <>
                        <IconAction label="Edit book" onClick={() => openEdit(book)}>
                          <Pencil size={15} />
                        </IconAction>
                        <IconAction label="Remove book" danger onClick={() => setDeleteBookId(book.id)}>
                          <Trash2 size={15} />
                        </IconAction>
                      </>
                    }
                    footer={
                      <>
                        <span className="figure text-xs text-content-muted">
                          {started ? `Paused at ${p.current} / ${formatAmount(p.total, p.unit)}` : formatAmount(p.total, p.unit)}
                        </span>
                        <button
                          type="button"
                          onClick={() => (started ? store.updateUserBookStatus(book.id, 'reading') : openStart(book))}
                          className="btn-primary text-xs py-1.5 px-3"
                        >
                          <PlayCircle size={14} />
                          <span>{started ? 'Continue reading' : 'Start reading'}</span>
                        </button>
                      </>
                    }
                  >
                    {started && <ProgressBar value={p.percent} label={`Reading progress: ${p.percent}%`} tone="warning" />}
                    <ClampedText text={book.description} />
                  </BookCard>
                );
              })}
            </div>
          ))}

        {/* FINISHED */}
        {activeTab === 'finished' &&
          (shownFinished.length === 0 ? (
            finishedBooks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No finished books yet" description="Finish a book to save what you learned from it." />
            ) : (
              <EmptyState size="sm" title="No books match" description="Try another search or category." />
            )
          ) : (
            <div className="grid-cards-lg gap-4">
              {shownFinished.map((book) => {
                const p = bookProgress(book);
                const bonus = bookBonus(book, pointsHistory);
                return (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    author={book.author}
                    category={book.category}
                    tags={
                      bonus > 0 ? (
                        <Badge tone="purple" size="xs">
                          <span className="figure">+{bonus}</span> bonus
                        </Badge>
                      ) : undefined
                    }
                    controls={
                      <>
                        <IconAction label="Edit book" onClick={() => openEdit(book)}>
                          <Pencil size={15} />
                        </IconAction>
                        <IconAction label="Remove book" danger onClick={() => setDeleteBookId(book.id)}>
                          <Trash2 size={15} />
                        </IconAction>
                      </>
                    }
                    footer={
                      <>
                        <span className="text-xs text-content-muted">
                          {book.dateCompleted || book.completedAt
                            ? `Finished ${formatDateLong(book.dateCompleted || book.completedAt)}`
                            : 'Finished'}
                          {' · '}
                          <span className="figure">{formatAmount(p.total, p.unit)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            store.restartBook(book.id);
                            showSuccessToast('Reading again', `${book.title} is back in Reading.`, `book_reread_${book.id}`);
                          }}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          <RotateCcw size={14} />
                          <span>Read again</span>
                        </button>
                      </>
                    }
                  >
                    {book.reflection ? (
                      <div className="rounded-xl border border-overlay-subtle bg-overlay-subtle/40 p-3.5">
                        <span className="stat-label block mb-1">Key takeaway</span>
                        <ClampedText text={book.reflection} lines={3} />
                      </div>
                    ) : (
                      <p className="text-xs text-content-disabled">No takeaway saved.</p>
                    )}
                  </BookCard>
                );
              })}
            </div>
          ))}

        {/* DISCOVER: the curated list, never changed by what users add. */}
        {activeTab === 'discover' &&
          (shownCurated.length === 0 ? (
            <EmptyState size="sm" title="No books match" description="Try another search or category." />
          ) : (
            <div className="grid-cards gap-4">
              {shownCurated.map((curated) => {
                const owned = bookForCurated(curated);
                const statusLabel = owned
                  ? owned.status === 'completed'
                    ? 'Finished'
                    : owned.status === 'reading'
                      ? 'Reading'
                      : 'In library'
                  : null;
                return (
                  <BookCard
                    key={curated.id}
                    title={curated.title}
                    author={curated.author}
                    category={curated.category}
                    tags={
                      statusLabel ? (
                        <Badge tone={owned?.status === 'completed' ? 'emerald' : owned?.status === 'reading' ? 'warning' : 'neutral'} size="xs">
                          {statusLabel}
                        </Badge>
                      ) : undefined
                    }
                    footer={
                      <>
                        <span className="figure text-xs text-content-muted">{formatAmount(curated.totalPages || 250, 'pages')}</span>
                        {owned ? (
                          <button
                            type="button"
                            onClick={() => changeTab(owned.status === 'completed' ? 'finished' : owned.status === 'reading' ? 'reading' : 'library')}
                            className="text-xs font-medium text-content-tertiary hover:text-content-primary"
                          >
                            Open
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                store.addCuratedBookToLibrary(curated, 'to-read');
                                showSuccessToast('Saved to library', curated.title, `book_add_${curated.id}`);
                              }}
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              <Plus size={14} />
                              <span>Library</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                store.addCuratedBookToLibrary(curated, 'reading');
                                showSuccessToast('Started reading', curated.title, `book_add_${curated.id}`);
                              }}
                              className="btn-primary text-xs py-1.5 px-3"
                            >
                              <PlayCircle size={14} />
                              <span>Start</span>
                            </button>
                          </div>
                        )}
                      </>
                    }
                  >
                    <ClampedText text={curated.description} lines={3} />
                  </BookCard>
                );
              })}
            </div>
          ))}
      </PageColumns>

      <BookFormDialog
        key={`book-form-${bookForm.key}`}
        store={store}
        open={bookForm.open}
        book={formBook}
        initialStatus={bookForm.status}
        onClose={() => setBookForm((f) => ({ ...f, open: false }))}
      />

      <StartReadingDialog
        key={`start-${startBookId.key}`}
        store={store}
        book={startBook}
        open={Boolean(startBook)}
        onClose={() => setStartBookId((s) => ({ ...s, id: null }))}
      />

      <FinishBookDialog
        key={`finish-${finishBookId.key}`}
        store={store}
        book={finishBook}
        open={Boolean(finishBook) && finishBook?.status !== 'completed'}
        onClose={() => setFinishBookId((s) => ({ ...s, id: null }))}
      />

      <ProgressUpdateDialog
        open={Boolean(progressBook)}
        onClose={() => setProgressBookId(null)}
        title={progressBook ? `Log progress: ${progressBook.title}` : 'Log progress'}
        current={progressBook ? bookProgress(progressBook).current : 0}
        target={progressBook ? bookProgress(progressBook).total : 1}
        format={(n) => formatAmount(n, progressBook ? bookProgress(progressBook).unit : 'pages')}
        addLabel={progressBook && bookProgress(progressBook).unit === 'chapters' ? 'Chapters read' : 'Pages read'}
        setLabel={progressBook && bookProgress(progressBook).unit === 'chapters' ? 'Chapter you’re on' : 'Page you’re on'}
        onSave={handleProgressSave}
      />

      <Dialog
        open={unlinkConfirmOpen}
        onClose={() => setUnlinkConfirmOpen(false)}
        title="Stop the Reading habit?"
        description="This deletes the Reading habit and its ticks from your Habit Tracker. Your books and reading logs stay."
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
              Delete habit
            </button>
          </>
        }
      >
        {null}
      </Dialog>

      <ConfirmDeleteModal
        open={Boolean(deleteBook)}
        onClose={() => setDeleteBookId(null)}
        onConfirm={async () => {
          if (!deleteBook) return;
          const { id, title } = deleteBook;
          await store.deleteBook(id);
          setDeleteBookId(null);
          showSuccessToast('Book removed', `${title} was removed.`, `book_${id}`);
        }}
        title="Remove book?"
        itemName={deleteBook?.title}
        description={`${deletePointsLine}Its reading logs go too. Earlier days keep their page points, but the chart and your streak may drop.${
          linkedGoalsCount > 0
            ? ` ${linkedGoalsCount} linked weekly goal${linkedGoalsCount > 1 ? 's' : ''} from this week on ${linkedGoalsCount > 1 ? 'are' : 'is'} deleted too.`
            : ''
        }`}
        confirmText="Remove book"
      />
    </div>
  );
}
