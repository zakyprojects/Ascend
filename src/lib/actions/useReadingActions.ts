// Reading actions of useAppState (pages read, finish, delete, add a curated or custom book, status, details,
// restart), moved out of store.ts unchanged. useAppState calls this hook once, at the same place, and
// destructures the members (their places in its return object are not side by side).
import { useCallback } from 'react';
import type { AppState, ReadingLog, UserBook, UserBookStatus, CuratedBook, BookCategory } from '@/types';
import { periodKey, todayKey, weekKey } from '../time/dates';
import type { LinkedPactTick } from '../partners/pactLifecycle';
import { tickPactsLinkedTo } from '../partners/pactLifecycle';
import { stampLogUnits, switchBookUnit, takeBackTodaysReading, unitSwitchDefaults } from '../reading/bookUnits';
import { isChapterBook, meetsReadingBonusGates, readingBonusCooldown, readingBonusAlreadyGiven, readingBonusId } from '../points/readingAwards';
import { removeLinkedWeeklyGoals, reconcileLinkedWeeklyGoals } from '../points/weeklyGoalPoints';
import { excisePointsEntriesInternal, applyReadingAwardsInternal } from '../points/stateAwards';
import { addPointsInternal } from '../points/pointsLedger';
import { trustedNow, trustedNowMs } from '../time/clock';
import { READING_POINTS } from '../points/pointsConfig';
import type { StoreSetState } from '../store/storeSetState';

export function useReadingActions(setState: StoreSetState, afterCommit: (fn: () => void) => void, sendLinkedPactTicks: (ticks: readonly LinkedPactTick[], saved: string) => void) {
  // --- MODULE 2: UNIFIED READING HUB & LIBRARY ACTIONS ---
  const updateReadingProgress = useCallback((bookId: string, pagesDelta: number, newCurrentPage: number) => {
    const date = todayKey();
    const nowIso = trustedNow().toISOString();
    // Pacts linked to the Reading habit, ticked when the habit's today flips.
    let pactTicks: LinkedPactTick[] = [];
    setState((prev) => {
      pactTicks = [];
      const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
      if (!targetUserBook) return prev;

      const existingPage = targetUserBook.currentAmount ?? targetUserBook.currentPage ?? 0;
      const maxPages = targetUserBook.totalAmount ?? targetUserBook.totalPages ?? 250;
      const clampedPage = Math.min(maxPages, Math.max(0, newCurrentPage));
      const pageDelta = clampedPage - existingPage;

      const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');

      let updatedReadingLogs = prev.readingLogs || [];
      let removedLogIds: string[] = [];
      if (pageDelta > 0) {
        const readingLog: ReadingLog = {
          id: `reading-log-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
          bookId: targetUserBook.id,
          date,
          pagesRead: pageDelta,
          unit: isChapterBook(targetUserBook) ? 'chapters' : 'pages',
          pointsAwarded: 0,
          createdAt: trustedNow().toISOString(),
        };
        updatedReadingLogs = [readingLog, ...updatedReadingLogs];
      } else if (pageDelta < 0) {
        // Takes back today's reading of this book only, in pages, whatever unit each log is in.
        const taken = takeBackTodaysReading(
          updatedReadingLogs,
          targetUserBook,
          date,
          -pageDelta,
          trustedNow().toISOString(),
          () => `reading-log-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`
        );
        updatedReadingLogs = taken.logs;
        removedLogIds = taken.removedIds;
      }

      // The server writes the day's page award (applyReadingAwardsInternal shows the same row now).
      const awards = applyReadingAwardsInternal(prev, updatedReadingLogs, prev.libraryBooks, date);
      updatedReadingLogs = awards.readingLogs;

      // Calculate total pages read today across ALL books
      const totalPagesToday = updatedReadingLogs
        .filter((l) => l.date === date)
        .reduce((sum, l) => sum + (l.pagesRead || 0), 0);

      const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
        if (lb.id === bookId || lb.linkedBookId === bookId || lb.id === targetUserBook.id) {
          return {
            ...lb,
            currentAmount: clampedPage,
            currentPage: clampedPage,
            status: (clampedPage >= maxPages && lb.status !== 'completed' ? 'reading' : lb.status) as UserBookStatus,
            updatedAt: nowIso,
          };
        }
        return lb;
      });

      let updatedHabits = prev.habits;
      let updatedChallenges = prev.sharedChallenges;
      let updatedDeletedEntityIds = prev.deletedEntityIds || [];
      if (removedLogIds.length > 0) {
        updatedDeletedEntityIds = Array.from(new Set([...updatedDeletedEntityIds, ...removedLogIds])).slice(-500);
      }

      // Auto-Check / Un-Check linked reading habit (presence tracking)
      if (readingHabit) {
        const key = periodKey(readingHabit.frequency || 'daily');
        const currentCompletions = Array.isArray(readingHabit.completions)
          ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || trustedNow().toISOString() }]))
          : (readingHabit.completions || {});
        const isCheckedToday = currentCompletions[key]?.done === true;

        const nowIso = trustedNow().toISOString();
        if (totalPagesToday > 0 && !isCheckedToday) {
          ({ challenges: updatedChallenges, ticks: pactTicks } = tickPactsLinkedTo(prev, readingHabit, true));
          // Auto-check habit (linked reading habit is zero-point system indicator or tracks completions)
          updatedHabits = prev.habits.map((h) =>
            h.id === readingHabit.id
              ? {
                  ...h,
                  completions: {
                    ...(Array.isArray(h.completions)
                      ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                      : (h.completions || {})),
                    [key]: { done: true, updatedAt: nowIso },
                  },
                  updatedAt: nowIso,
                }
              : h
          );
        } else if (totalPagesToday <= 0 && isCheckedToday) {
          ({ challenges: updatedChallenges, ticks: pactTicks } = tickPactsLinkedTo(prev, readingHabit, false));
          // Auto-uncheck habit
          updatedHabits = prev.habits.map((h) =>
            h.id === readingHabit.id
              ? {
                  ...h,
                  completions: {
                    ...(Array.isArray(h.completions)
                      ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                      : (h.completions || {})),
                    [key]: { done: false, updatedAt: nowIso },
                  },
                  updatedAt: nowIso,
                }
              : h
          );
        }
      }

      return reconcileLinkedWeeklyGoals({
        ...prev,
        libraryBooks: updatedLibraryBooks,
        books: [],
        readingLogs: updatedReadingLogs,
        habits: updatedHabits,
        sharedChallenges: updatedChallenges,
        deletedEntityIds: updatedDeletedEntityIds,
        ...awards.points,
      });
    },
    { immediate: true }
  );
    afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your reading is saved.'));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishBook = useCallback((bookId: string, reflection: string) => {
    let pactTicks: LinkedPactTick[] = [];
    setState(
      (prev) => {
        pactTicks = [];
        const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
        if (!targetUserBook) return prev;

        const title = targetUserBook.title || 'Book';
        const now = trustedNow().toISOString();
        const maxPages = targetUserBook.totalAmount ?? targetUserBook.totalPages ?? 250;

        const today = todayKey(trustedNow());
        const currentPage = targetUserBook.currentAmount ?? targetUserBook.currentPage ?? 0;
        const unreadDelta = Math.max(0, maxPages - currentPage);

        let updatedReadingLogs = prev.readingLogs || [];
        if (unreadDelta > 0) {
          const finishLog: ReadingLog = {
            id: `reading-log-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
            bookId: targetUserBook.id,
            date: today,
            pagesRead: unreadDelta,
            unit: isChapterBook(targetUserBook) ? 'chapters' : 'pages',
            pointsAwarded: 0,
            finish: true,
            createdAt: now,
          };
          updatedReadingLogs = [finishLog, ...updatedReadingLogs];
        }

        const completedBook: UserBook = {
          ...targetUserBook,
          status: 'completed',
          currentAmount: maxPages,
          currentPage: maxPages,
          isFinished: true,
          reflection: reflection.trim() || targetUserBook.reflection,
          dateCompleted: now,
          completedAt: now,
          updatedAt: now,
        };

        // The server gives the finish bonus once (ascend_recompute_reading_bonus); the same check here shows it now.
        const alreadyAwarded = readingBonusAlreadyGiven(targetUserBook, prev.pointsHistory || []);
        const pointsToAward =
          !alreadyAwarded &&
          meetsReadingBonusGates(completedBook, updatedReadingLogs, today) &&
          !readingBonusCooldown(targetUserBook.id, prev.pointsHistory || [], today).active
            ? READING_POINTS.completionBonus
            : 0;

        const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
          if (lb.id === bookId || lb.linkedBookId === bookId || lb.id === targetUserBook.id) {
            return {
              ...lb,
              status: 'completed' as UserBookStatus,
              currentAmount: maxPages,
              currentPage: maxPages,
              isFinished: true,
              reflection: reflection.trim() || lb.reflection,
              dateCompleted: now,
              completedAt: now,
              updatedAt: now,
              pointsAwarded: (lb.pointsAwarded || 0) + pointsToAward,
            };
          }
          return lb;
        });

        // The finish log is a reading day, so it ticks the linked Reading habit (and its pacts) like
        // logging pages does.
        let updatedHabits = prev.habits;
        let updatedChallenges = prev.sharedChallenges;
        const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');
        if (readingHabit && unreadDelta > 0) {
          const key = periodKey(readingHabit.frequency || 'daily');
          const completions = Array.isArray(readingHabit.completions)
            ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || now }]))
            : readingHabit.completions || {};
          if (completions[key]?.done !== true) {
            updatedHabits = prev.habits.map((h) =>
              h.id === readingHabit.id
                ? { ...h, completions: { ...completions, [key]: { done: true, updatedAt: now } }, updatedAt: now }
                : h
            );
            ({ challenges: updatedChallenges, ticks: pactTicks } = tickPactsLinkedTo(prev, readingHabit, true));
          }
        }

        // Recompute today: the finish log earns no page points (finish: true), as on the server.
        const awards = applyReadingAwardsInternal(prev, updatedReadingLogs, updatedLibraryBooks, today);
        const points =
          pointsToAward > 0
            ? addPointsInternal(
                { ...prev, ...awards.points },
                pointsToAward,
                `Book finished: ${title}`,
                'reading_bonus',
                { bookId: targetUserBook.id },
                now,
                readingBonusId(targetUserBook.id)
              )
            : awards.points;

        return reconcileLinkedWeeklyGoals({
          ...prev,
          libraryBooks: updatedLibraryBooks,
          readingLogs: awards.readingLogs,
          habits: updatedHabits,
          sharedChallenges: updatedChallenges,
          books: [],
          ...points,
        });
      },
      { immediate: true }
    );
    afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your reading is saved.'));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteBook = useCallback((bookId: string) => {
    const currentWeekKey = weekKey(trustedNow());
    let pactTicks: LinkedPactTick[] = [];
    void (
      setState(
        (prev) => {
          pactTicks = [];
          const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
          if (!targetUserBook) return prev;

        const allMatchingIds = new Set<string>([bookId]);
        if (targetUserBook.id) allMatchingIds.add(targetUserBook.id);
        if (targetUserBook.linkedBookId) allMatchingIds.add(targetUserBook.linkedBookId);

        const bookLogs = prev.readingLogs.filter((l) => Boolean(l.bookId && allMatchingIds.has(l.bookId)));
        const remainingReadingLogs = prev.readingLogs.filter((l) => !l.bookId || !allMatchingIds.has(l.bookId));
        const remainingBooks = prev.libraryBooks.filter((lb) => !allMatchingIds.has(lb.id));

        // Only today's page award follows the logs; earlier days' points stay. The book's finish
        // bonus goes with it, as on the server: its server row is removed, and a bonus the app gave
        // before server bonuses (book.pointsAwarded, no server row) is taken back with a minus row.
        const bonusIds = new Set(Array.from(allMatchingIds).map(readingBonusId));
        const serverBonusIds = new Set((prev.pointsHistory || []).filter((e) => bonusIds.has(e.id)).map((e) => e.id));
        const { excisedEntryIds: _bonusExcised, ...withoutBonus } = excisePointsEntriesInternal(prev, (e) => bonusIds.has(e.id));
        let afterBonus: AppState = { ...prev, ...withoutBonus };
        for (const lb of prev.libraryBooks) {
          const legacyBonus = lb.pointsAwarded ?? 0;
          if (!allMatchingIds.has(lb.id) || legacyBonus <= 0 || serverBonusIds.has(readingBonusId(lb.id))) continue;
          afterBonus = {
            ...afterBonus,
            ...addPointsInternal(
              afterBonus,
              -legacyBonus,
              `Book deleted: ${lb.title || 'Book'}`,
              'reading_bonus',
              { bookId: lb.id, legacyMarker: true, legacyAmount: legacyBonus },
              trustedNow().toISOString(),
              readingBonusId(lb.id)
            ),
          };
        }
        const awards = applyReadingAwardsInternal(afterBonus, remainingReadingLogs, remainingBooks, todayKey());
        const updatedReadingLogs = awards.readingLogs;

        const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');
        let updatedHabits = prev.habits;
        let updatedChallenges = prev.sharedChallenges;
        let habitExcisedIds: string[] = [];

        if (readingHabit) {
          const today = todayKey();
          const key = periodKey(readingHabit.frequency || 'daily');
          const currentCompletions = Array.isArray(readingHabit.completions)
            ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || trustedNow().toISOString() }]))
            : (readingHabit.completions || {});
          const isCheckedToday = currentCompletions[key]?.done === true;
          const remainingPagesToday = updatedReadingLogs
            .filter((l) => l.date === today)
            .reduce((sum, l) => sum + (l.pagesRead || 0), 0);

          if (remainingPagesToday <= 0 && isCheckedToday) {
            ({ challenges: updatedChallenges, ticks: pactTicks } = tickPactsLinkedTo(prev, readingHabit, false));
            const nowIso = trustedNow().toISOString();
            updatedHabits = prev.habits.map((h) =>
              h.id === readingHabit.id
                ? {
                    ...h,
                    completions: {
                      ...(Array.isArray(h.completions)
                        ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                        : (h.completions || {})),
                      [key]: { done: false, updatedAt: nowIso },
                    },
                    updatedAt: nowIso,
                  }
                : h
            );
          }
        }

        const idsArray = Array.from(allMatchingIds);
        const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'reading', idsArray, currentWeekKey);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...idsArray,
          ...bookLogs.map((l) => l.id),
          ...habitExcisedIds,
          ...linkedRemoval.removedGoalIds,
        ].slice(-500);

        return {
          ...prev,
          books: [],
          libraryBooks: remainingBooks,
          readingLogs: updatedReadingLogs,
          habits: updatedHabits,
          sharedChallenges: updatedChallenges,
          weeklyGoals: linkedRemoval.weeklyGoals,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        };
      },
      { immediate: true, actionLabel: 'Book deletion', entityId: bookId }
    )
  );
  afterCommit(() => sendLinkedPactTicks(pactTicks, 'Your reading is saved.'));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // --- SELF IMPROVEMENT BOOKS / CURATED ACTIONS ---
  const addCuratedBookToLibrary = useCallback((
    curatedBook: CuratedBook,
    initialStatus: UserBookStatus = 'to-read',
    customTotalAmount?: number,
    customUnit?: 'pages' | 'chapters',
    customTargetDate?: string
  ) => {
    setState((prev) => {
      // Prevent duplicates
      if (prev.libraryBooks.some((b) => b.curatedBookId === curatedBook.id)) return prev;

      const numPages = customTotalAmount || curatedBook.totalPages || curatedBook.totalAmount || 250;
      const now = trustedNow().toISOString();
      const unit = customUnit || 'pages';
      const newBook: UserBook = {
        id: `library-book-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
        curatedBookId: curatedBook.id,
        title: curatedBook.title,
        author: curatedBook.author,
        description: curatedBook.description,
        category: curatedBook.category,
        coverImageUrl: curatedBook.coverImageUrl,
        isCurated: true,
        isCustom: false,
        pointsReward: READING_POINTS.completionBonus,
        pointsAwarded: 0,
        status: initialStatus,
        totalAmount: numPages,
        totalPages: numPages,
        currentAmount: initialStatus === 'completed' ? numPages : 0,
        currentPage: initialStatus === 'completed' ? numPages : 0,
        unit,
        targetFinishDate: customTargetDate?.trim() || undefined,
        addedAt: now,
        updatedAt: now,
        dateStarted: initialStatus === 'reading' || initialStatus === 'completed' ? now : undefined,
        startedAt: initialStatus === 'reading' || initialStatus === 'completed' ? now : undefined,
        completedAt: initialStatus === 'completed' ? now : undefined,
        dateCompleted: initialStatus === 'completed' ? now : undefined,
      };


      return {
        ...prev,
        libraryBooks: [newBook, ...prev.libraryBooks],
        books: [],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCustomBookToLibrary = useCallback((
    title: string,
    author: string,
    description?: string,
    category?: BookCategory | string,
    totalAmount: number = 250,
    unit: 'pages' | 'chapters' = 'pages',
    status: UserBookStatus = 'reading',
    targetFinishDate?: string,
    reflection?: string
  ) => {
    setState((prev) => {
      const now = trustedNow().toISOString();
      // A book added as already finished is read in full; no log is written, so it earns no points.
      const finished = status === 'completed';
      const newBook: UserBook = {
        id: `custom-book-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        description: description?.trim(),
        category,
        isCurated: false,
        isCustom: true,
        pointsReward: 0,
        pointsAwarded: 0,
        status,
        totalAmount,
        totalPages: totalAmount,
        currentAmount: finished ? totalAmount : 0,
        currentPage: finished ? totalAmount : 0,
        unit,
        targetFinishDate: finished ? undefined : targetFinishDate?.trim() || undefined,
        reflection: finished ? reflection?.trim() || undefined : undefined,
        isFinished: finished,
        addedAt: now,
        updatedAt: now,
        dateStarted: status === 'reading' || finished ? now : undefined,
        startedAt: status === 'reading' || finished ? now : undefined,
        dateCompleted: finished ? now : undefined,
        completedAt: finished ? now : undefined,
      };


      return {
        ...prev,
        libraryBooks: [newBook, ...prev.libraryBooks],
        books: [],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUserBookStatus = useCallback(
    (
      bookId: string,
      status: UserBookStatus,
      options?: { totalAmount?: number; unit?: 'pages' | 'chapters'; current?: number; targetFinishDate?: string }
    ) => {
      setState((prev) => {
        const now = trustedNow().toISOString();
        let readingLogs = prev.readingLogs || [];
        return {
          ...prev,
          libraryBooks: prev.libraryBooks.map((original) => {
            if (original.id === bookId || original.linkedBookId === bookId) {
              // A unit change converts the place too (switchBookUnit); it writes no log.
              let b = original;
              if (options?.unit && options.unit !== (isChapterBook(original) ? 'chapters' : 'pages') && original.status !== 'completed') {
                const defaults = unitSwitchDefaults(original, options.unit);
                readingLogs = stampLogUnits(readingLogs, original);
                b = switchBookUnit(
                  original,
                  { unit: options.unit, current: options.current ?? defaults.current, total: options.totalAmount ?? defaults.total },
                  now,
                  todayKey()
                );
              }
              const maxPages = options?.totalAmount ?? b.totalAmount ?? b.totalPages ?? 250;
              const unit = b.unit ?? 'pages';
              const targetFinishDate = options?.targetFinishDate !== undefined ? options.targetFinishDate : b.targetFinishDate;
              return {
                ...b,
                status,
                totalAmount: maxPages,
                totalPages: maxPages,
                unit,
                targetFinishDate,
                currentAmount: status === 'completed' ? maxPages : b.currentAmount,
                currentPage: status === 'completed' ? maxPages : b.currentPage,
                isFinished: status === 'completed',
                updatedAt: now,
                dateStarted: status === 'reading' && !b.dateStarted ? now : b.dateStarted,
                startedAt: status === 'reading' && !b.startedAt ? now : b.startedAt,
                completedAt: status === 'completed' ? (b.completedAt || now) : undefined,
                dateCompleted: status === 'completed' ? (b.dateCompleted || now) : undefined,
              };
            }
            return original;
          }),
          readingLogs,
          books: [],
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateBookDetails = useCallback(
    (
      bookId: string,
      details: {
        title: string;
        author: string;
        category?: BookCategory | string;
        description?: string;
        totalAmount: number;
        unit: 'pages' | 'chapters';
        /** The place in the new unit when the unit changes (switchBookUnit); the converted place when left out. */
        current?: number;
        targetFinishDate?: string;
        reflection?: string;
      }
    ) => {
      setState((prev) => {
        const now = trustedNow().toISOString();
        let readingLogs = prev.readingLogs || [];
        return {
          ...prev,
          libraryBooks: prev.libraryBooks.map((original) => {
            if (original.id !== bookId) return original;
            // A unit change converts the place too and writes no log; a finished book keeps its unit.
            let b = original;
            if (details.unit !== (isChapterBook(original) ? 'chapters' : 'pages') && original.status !== 'completed') {
              readingLogs = stampLogUnits(readingLogs, original);
              b = switchBookUnit(
                original,
                { unit: details.unit, current: details.current ?? unitSwitchDefaults(original, details.unit).current, total: details.totalAmount },
                now,
                todayKey()
              );
            }
            const current = b.currentAmount ?? b.currentPage ?? 0;
            const finished = b.status === 'completed';
            // The form keeps the length at or above the progress; a finished book stays read in full.
            const total = Math.max(1, Math.round(details.totalAmount), finished ? 0 : current);
            const nextCurrent = finished ? total : current;
            return {
              ...b,
              title: details.title.trim() || b.title,
              author: details.author.trim() || 'Unknown Author',
              category: details.category || undefined,
              description: details.description?.trim() || undefined,
              totalAmount: total,
              totalPages: total,
              currentAmount: nextCurrent,
              currentPage: nextCurrent,
              targetFinishDate: finished ? b.targetFinishDate : details.targetFinishDate?.trim() || undefined,
              reflection: finished ? details.reflection?.trim() || b.reflection : b.reflection,
              updatedAt: now,
            };
          }),
          readingLogs,
          books: [],
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const restartBook = useCallback((bookId: string) => {
    setState(
      (prev) => {
        const now = trustedNow().toISOString();
        const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
          if (lb.id === bookId || lb.linkedBookId === bookId) {
            return {
              ...lb,
              currentAmount: 0,
              currentPage: 0,
              status: 'reading' as UserBookStatus,
              isFinished: false,
              updatedAt: now,
              dateStarted: now,
              startedAt: now,
              dateCompleted: undefined,
              completedAt: undefined,
              // The last takeaway stays until the book is finished again.
            };
          }
          return lb;
        });

        return {
          ...prev,
          libraryBooks: updatedLibraryBooks,
          books: [],
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    updateReadingProgress,
    finishBook,
    deleteBook,
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    updateBookDetails,
    restartBook,
  };
}
