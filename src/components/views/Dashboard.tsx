import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ArrowRight,
  Brain,
  Calendar,
  CalendarDays,
  Activity,
  BookMarked,
  Zap,
  ShieldAlert,
  HeartPulse,
  Timer,
  Clock,
  RotateCw,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, PageColumns, Skeleton } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { AppStore } from '@/lib/store';
import { View } from '@/components/AppShell';
import { Habit, LeagueType } from '@/types';
import { habitPointsMeta } from '@/components/habits/habitPointsMeta';
import { formatDateLong, parseDate, startOfWeek } from '@/lib/dates';
import { ProgressRing } from '@/components/ui/charts';
import { LEAGUE_CONFIG, pointsText, ptsText } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { leaguePeriodKey } from '@/lib/leagueStandingsRefresh';
import { calculateBlockDurationMinutes, dayProgress, formatDurationHuman } from '@/lib/timeTracker';
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { AutoNum, CountUp, Reveal } from '@/components/ui/Motion';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { PushPromptCard } from '@/components/ui/PushPromptCard';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useLeaguePeriodRollover } from '@/lib/useLeaguePeriodRollover';
import { useLeagueStandingsRefresh } from '@/lib/useLeagueStandingsRefresh';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { useMinuteTick } from '@/lib/useMinuteTick';
import { useCompletionPop } from '@/lib/useCompletionPop';
import { pageLinkProps } from '@/lib/pageLink';
import { dailyHabitCompletions, dailyPoints, lastDayKeys } from '@/lib/weeklyActivity';
import { HabitCheck } from '@/components/habits/HabitCheck';
import { MoodBadge } from '@/components/journal/moods';
import { WeekActivityCard } from './WeekActivityCard';
import { AscentProfile } from './AscentProfile';
import { trustedNow } from '@/lib/clock';

const LEAGUE_ICONS: Record<string, LucideIcon> = {
  Calendar, CalendarDays, Brain,
};

const MODULE_TONE_CLASS = {
  emerald: 'badge-emerald',
  amber: 'badge-amber',
  purple: 'badge-purple',
  rose: 'badge-rose',
  red: 'badge-red',
  sky: 'badge-sky',
  cyan: 'badge-cyan',
  indigo: 'badge-indigo',
} as const;

/** Habits shown in the Today card; the rest are one link away. */
const TODAY_ROWS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

interface ModuleLinkProps {
  tone: keyof typeof MODULE_TONE_CLASS;
  icon: LucideIcon;
  title: string;
  view: View;
  navigate: (view: View) => void;
  /** The tile's number (or short text) and its unit. */
  value: React.ReactNode;
  unit?: string;
  /** Second line, tiles only (phones show one line per module). */
  sub: React.ReactNode;
}

/** One module: a compact one-line row on phones, a tile from `sm`. A real link to its page. */
function ModuleLink({ tone, icon: Icon, title, view, navigate, value, unit, sub }: ModuleLinkProps) {
  const iconTile = (
    <span className={cx(MODULE_TONE_CLASS[tone], 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg')}>
      <Icon size={16} aria-hidden="true" />
    </span>
  );
  return (
    <a {...pageLinkProps(view, navigate)} className={cx('card card-hover block p-3 sm:p-5', FOCUS_RING)}>
      <span className="flex items-center gap-3 sm:hidden">
        {iconTile}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-secondary">{title}</span>
        <span className="shrink-0 text-right">
          <span className="figure text-sm font-medium text-content-primary">{value}</span>
          {unit && <span className="ml-1 text-xs text-content-muted">{unit}</span>}
        </span>
      </span>
      <span className="hidden h-full flex-col justify-between gap-2 sm:flex">
        <span className="flex items-center justify-between">
          <span className="stat-label">{title}</span>
          {iconTile}
        </span>
        <span>
          <span className="block text-2xl font-medium leading-tight text-content-primary tabular-nums">
            {value}
            {unit && <span className="ml-1 font-sans text-xs text-content-muted">{unit}</span>}
          </span>
          <span className="block text-micro text-content-muted">{sub}</span>
        </span>
      </span>
    </a>
  );
}

function SectionHeader({ id, title, link }: { id: string; title: string; link?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="section-title">{title}</h2>
      {link}
    </div>
  );
}

function HeaderLink({ view, navigate, children }: { view: View; navigate: (view: View) => void; children: React.ReactNode }) {
  return (
    <a {...pageLinkProps(view, navigate)} className={cx('btn-ghost text-xs', FOCUS_RING)}>
      {children} <ArrowRight size={14} aria-hidden="true" />
    </a>
  );
}

interface DashboardProps {
  store: AppStore;
  onViewChange: (view: View) => void;
  onOpenAuth?: () => void;
}

export function Dashboard({ store, onViewChange, onOpenAuth }: DashboardProps) {
  // Re-render when a league period rolls over, so ranks and the season label never go stale.
  // The per-second countdowns tick inside LeagueCountdown and never re-render the page.
  useLeaguePeriodRollover();
  // League card ranks: other members' points refetched on open and on return to the tab (no poll).
  useLeagueStandingsRefresh(store, { poll: false });
  // Today's habits, week chart and time-tracker summary roll over at local midnight.
  const today = useLocalDayKey();
  // Greeting and days clean move with the clock.
  useMinuteTick();

  const habits = store.state.habits;
  const { getLeagueData } = store;
  const periodKeyNow = leaguePeriodKey(leagueNow());
  // Each board rebuilds every member, so all three once per state change, never per row.
  const boards = useMemo(
    () => ({
      weekly: getLeagueData('weekly'),
      monthly: getLeagueData('monthly'),
      ninetyDay: getLeagueData('ninetyDay'),
    }),
    // periodKeyNow: a new week, month or season starts the tables again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getLeagueData, periodKeyNow]
  );
  const seasonPoints = boards.ninetyDay.userPoints;

  const [retrying, setRetrying] = useState(false);
  const standings = store.getLeagueStandingsStatus();
  const standingsState = standings === 'failed' && retrying ? 'loading' : standings;
  const retryStandings = async () => {
    setRetrying(true);
    try {
      await store.refreshLeagueStandings({ full: true });
    } finally {
      setRetrying(false);
    }
  };

  const todayEntry = store.getTodayJournalEntry();
  const isDone = (h: Habit) => store.isHabitDone(h);
  const doneCount = habits.filter(isDone).length;
  const pendingCount = habits.length - doneCount;

  // Today card: pending first, then done. A habit ticked or unticked here keeps its place until
  // the next visit, so it never jumps or slips out of view under the tap.
  const [heldSlots, setHeldSlots] = useState<ReadonlyMap<string, number>>(() => new Map());
  const slotOf = (h: Habit) => heldSlots.get(h.id) ?? (isDone(h) ? 1 : 0);
  const todayRows = [...habits].sort((a, b) => slotOf(a) - slotOf(b)).slice(0, TODAY_ROWS);
  const moreCount = habits.length - todayRows.length;
  const toggleFromToday = (habit: Habit) => {
    if (!heldSlots.has(habit.id)) {
      const slot = slotOf(habit);
      setHeldSlots((prev) => new Map(prev).set(habit.id, slot));
    }
    store.toggleHabit(habit.id);
  };

  // Last 7 local days, today last: drives the week chart.
  const weekDays = lastDayKeys(7, today);
  const weekPoints = dailyPoints(store.state.pointsHistory || [], weekDays);
  const weekHabits = dailyHabitCompletions(habits, weekDays);

  // Module summaries (personal features use the local week from Monday).
  const weekStart = startOfWeek(trustedNow());
  const thisWeek = (date: string) => (parseDate(date) || new Date(0)) >= weekStart;

  const weeklyWorkouts = store.state.workouts.filter((w) => thisWeek(w.date));
  const weeklyExerciseMins = weeklyWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);

  const activeBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'reading').length;
  const finishedBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'completed').length;

  const totalSkillHours =
    Math.round(
      (store.state.skillLogs.reduce((sum, l) => sum + l.durationMinutes, 0) +
        store.state.skills.reduce((sum, s) => sum + (s.clearedMinutes || 0), 0)) /
        6
    ) / 10;

  const weeklyFocusLogs = store.state.focusLogs.filter((l) => thisWeek(l.date));
  const weeklyFocusMins = weeklyFocusLogs.reduce((sum, l) => sum + l.durationMinutes, 0);

  // Bad habits: how many of the active ones were reported resisted today (date keys are local).
  const activeBadHabits = store.state.badHabits.filter((h) => !h.isCompleted);
  const resistedTodayCount = activeBadHabits.filter((h) =>
    (store.state.badHabitLogs || []).some((l) => l.badHabitId === h.id && l.date === today && l.status === 'resisted')
  ).length;

  // Recovery: whole days since the clean streak started (same count as the Recovery page hero).
  const tracker = store.state.addictionTracker;
  const trackerStartMs = tracker ? new Date(tracker.startDate).getTime() : NaN;
  const daysClean = Number.isNaN(trackerStartMs) ? null : Math.floor(Math.max(0, trustedNow().getTime() - trackerStartMs) / DAY_MS);

  const todayBlocks = store.state.timeTracker?.dailyLogs?.[today] || [];
  const todayScheduledMins = todayBlocks.reduce(
    (sum, b) => sum + calculateBlockDurationMinutes(b.startTime, b.endTime),
    0
  );
  const todayProgress = dayProgress(todayBlocks);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{greeting()}</h1>
        <p className="page-subtitle">{formatDateLong(today)}</p>
      </div>

      {store.state.currentUser?.isAnonymous && onOpenAuth && (
        <GuestSaveBanner
          title={`You're using AscendDay as a guest (${store.state.currentUser.username})`}
          description="Create an account to keep your habits, points, and league rank."
          onCreateAccount={onOpenAuth}
        />
      )}

      {/* Push is opt-in per device: a one-time offer for a signed-in account (a guest gets the
          save-progress banner above instead). */}
      {isSupabaseConfigured && store.state.currentUser && !store.state.currentUser.isAnonymous && (
        <PushPromptCard userId={store.state.currentUser.id} />
      )}

      {/* Hero: today, the season, and where you stand on the climb */}
      <Reveal index={0}>
        <section className="card p-5 sm:p-6 relative overflow-hidden" aria-label="Today and your season">
          <div aria-hidden="true" className="hero-glow hero-glow-corner" />
          <div className="relative grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div className="flex items-center gap-5">
              <ProgressRing
                value={doneCount}
                max={Math.max(habits.length, 1)}
                label={`Habits done: ${doneCount} of ${habits.length}`}
                size={116}
                thickness={9}
              >
                <span className="text-4xl font-medium text-content-primary tabular-nums leading-none">
                  {doneCount}
                  <span className="text-lg text-content-muted">/{habits.length}</span>
                </span>
                <span className="mt-1 text-2xs text-content-muted">habits done</span>
              </ProgressRing>

              <div className="min-w-0">
                <div className="stat-label">Season points</div>
                <CountUp
                  value={seasonPoints}
                  className="mt-0.5 block font-serif text-5xl text-content-primary tabular-nums leading-none"
                />
              </div>
            </div>

            <AscentProfile totalPoints={seasonPoints} />
          </div>
        </section>
      </Reveal>

      <PageColumns
        lead={
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            {/* Today's habits: the thing checked every day comes first */}
            <Reveal index={1}>
              <section aria-labelledby="dash-today">
                <SectionHeader
                  id="dash-today"
                  title="Today"
                  link={habits.length > 0 && <HeaderLink view="habits" navigate={onViewChange}>All habits</HeaderLink>}
                />

                {habits.length === 0 ? (
                  <EmptyState
                    surface
                    size="md"
                    title="No habits yet"
                    description="Add one to get started."
                    action={
                      <a {...pageLinkProps('habits', onViewChange)} className={cx('btn-primary mx-auto', FOCUS_RING)}>
                        Add a habit
                      </a>
                    }
                  />
                ) : (
                  <div className="card overflow-hidden">
                    {pendingCount === 0 && (
                      <p className="flex items-center gap-2 border-b border-overlay-subtle px-4 py-3 text-sm font-medium text-brand-text">
                        <Check size={16} aria-hidden="true" /> All done for today.
                      </p>
                    )}
                    <ul className="divide-y divide-overlay-subtle">
                      {todayRows.map((habit) => (
                        <TodayHabitRow key={habit.id} habit={habit} done={isDone(habit)} onToggle={() => toggleFromToday(habit)} />
                      ))}
                    </ul>
                    {moreCount > 0 && (
                      <a
                        {...pageLinkProps('habits', onViewChange)}
                        className={cx(
                          'flex items-center justify-between gap-2 border-t border-overlay-subtle px-4 py-3 text-sm text-content-muted hover:bg-overlay-subtle hover:text-content-primary',
                          FOCUS_RING,
                          TRANSITION
                        )}
                      >
                        <span>
                          +<span className="figure">{moreCount}</span> more in Habits
                        </span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal index={2}>
              <WeekActivityCard points={weekPoints} habits={weekHabits} />
            </Reveal>
          </div>
        }
        aside={
          <>
            {/* League places: one list instead of three boxes */}
            <Reveal index={3}>
              <section aria-labelledby="dash-leagues">
                <SectionHeader id="dash-leagues" title="Leagues" link={<HeaderLink view="leagues" navigate={onViewChange}>Standings</HeaderLink>} />
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-overlay-subtle">
                    {(['weekly', 'monthly', 'ninetyDay'] as LeagueType[]).map((type) => (
                      <LeagueRow
                        key={type}
                        type={type}
                        rank={boards[type].userRank}
                        points={boards[type].userPoints}
                        status={standingsState}
                        navigate={onViewChange}
                      />
                    ))}
                  </ul>
                  {standingsState === 'failed' && (
                    <div className="flex items-center justify-between gap-3 border-t border-overlay-subtle px-4 py-3">
                      <p className="text-xs text-content-muted">Couldn't load the standings.</p>
                      <button
                        type="button"
                        onClick={retryStandings}
                        className={cx('btn-secondary shrink-0 text-xs', FOCUS_RING)}
                      >
                        <RotateCw size={14} aria-hidden="true" /> Retry
                      </button>
                    </div>
                  )}
                  {standingsState === 'loading' && <span className="sr-only" role="status">Loading league places</span>}
                </div>
              </section>
            </Reveal>

            {/* Journal snapshot: one link */}
            <Reveal index={4}>
              <section aria-labelledby="dash-journal">
                <SectionHeader id="dash-journal" title="Journal" />
                <a
                  {...pageLinkProps('journal', onViewChange)}
                  className={cx('card card-hover block p-4', FOCUS_RING)}
                >
                  {todayEntry ? (
                    <span className="block">
                      <span className="sr-only">Today's journal: </span>
                      <span className="mb-1.5 flex items-center justify-between gap-2">
                        <MoodBadge mood={todayEntry.mood} />
                        <span className="text-xs text-content-muted">Edit</span>
                      </span>
                      <span className="block text-sm text-content-tertiary line-clamp-2">
                        {todayEntry.content || 'No content written'}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <BookOpen size={18} className="shrink-0 text-content-muted" aria-hidden="true" />
                      <span className="block">
                        <span className="block text-sm font-medium text-content-secondary">Write today's entry</span>
                        <span className="block text-xs text-content-muted">
                          How was your day? <span className="figure text-brand-text">{ptsText(JOURNAL_POINTS.entryCompleted, true)}</span>
                        </span>
                      </span>
                    </span>
                  )}
                </a>
              </section>
            </Reveal>
          </>
        }
        footer={
          <Reveal index={5}>
            <section aria-labelledby="dash-modules">
              <h2 id="dash-modules" className="section-title mb-3">Modules</h2>
              <div className="grid gap-2 sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
                <ModuleLink
                  tone="emerald"
                  icon={Activity}
                  title="Exercise"
                  view="exercise"
                  navigate={onViewChange}
                  value={<CountUp value={weeklyExerciseMins} />}
                  unit="mins this week"
                  sub={<><CountUp value={weeklyWorkouts.length} /> {plural(weeklyWorkouts.length, 'session')} this week</>}
                />
                <ModuleLink
                  tone="amber"
                  icon={BookMarked}
                  title="Reading"
                  view="reading"
                  navigate={onViewChange}
                  value={<CountUp value={activeBooks} />}
                  unit={`${plural(activeBooks, 'book')} in progress`}
                  sub={<><CountUp value={finishedBooks} /> finished</>}
                />
                <ModuleLink
                  tone="purple"
                  icon={Zap}
                  title="Skills"
                  view="skills"
                  navigate={onViewChange}
                  value={<CountUp value={totalSkillHours} decimals={1} />}
                  unit="hrs practice"
                  sub={<><CountUp value={store.state.skills.length} /> {plural(store.state.skills.length, 'skill')} tracked</>}
                />
                <ModuleLink
                  tone="rose"
                  icon={ShieldAlert}
                  title="Bad habits"
                  view="bad-habits"
                  navigate={onViewChange}
                  value={<CountUp value={resistedTodayCount} />}
                  unit="resisted today"
                  sub={<>of <CountUp value={activeBadHabits.length} /> active {plural(activeBadHabits.length, 'habit')}</>}
                />
                <ModuleLink
                  tone="red"
                  icon={HeartPulse}
                  title="Recovery"
                  view="recovery"
                  navigate={onViewChange}
                  value={daysClean === null ? 'Not started' : <CountUp value={daysClean} />}
                  unit={daysClean === null ? undefined : `${plural(daysClean, 'day')} clean`}
                  sub={tracker ? tracker.title : 'Start a clean streak'}
                />
                <ModuleLink
                  tone="cyan"
                  icon={Timer}
                  title="Focus"
                  view="prefrontal"
                  navigate={onViewChange}
                  value={<CountUp value={weeklyFocusMins} />}
                  unit="focus mins this week"
                  sub={<><CountUp value={weeklyFocusLogs.length} /> {plural(weeklyFocusLogs.length, 'session')} this week</>}
                />
                <ModuleLink
                  tone="indigo"
                  icon={Clock}
                  title="Time Tracker"
                  view="time-tracker"
                  navigate={onViewChange}
                  value={<AutoNum text={todayScheduledMins > 0 ? formatDurationHuman(todayScheduledMins) : '0h 0m'} />}
                  unit="planned today"
                  sub={
                    todayBlocks.length > 0 ? (
                      <AutoNum text={`${todayProgress.done} done${todayProgress.skipped > 0 ? `, ${todayProgress.skipped} skipped` : ''} of ${todayProgress.total}`} />
                    ) : (
                      'No scheduled blocks yet'
                    )
                  }
                />
              </div>
            </section>
          </Reveal>
        }
      />
    </div>
  );
}

/** One habit in the Today card: tick or untick in place, with its points. */
function TodayHabitRow({ habit, done, onToggle }: { habit: Habit; done: boolean; onToggle: () => void }) {
  const { arm, popClass } = useCompletionPop(done);
  const { text: meta, earns } = habitPointsMeta(habit, done);

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <HabitCheck
        habit={habit}
        done={done}
        size="sm"
        iconClassName={popClass}
        onToggle={() => {
          if (!done) arm();
          onToggle();
        }}
      />
      <span
        className={cx(
          'min-w-0 flex-1 truncate text-sm',
          done ? 'text-content-tertiary line-through decoration-overlay-strong' : 'text-content-secondary'
        )}
      >
        {habit.name}
        {habit.frequency === 'weekly' && <span className="text-content-muted"> · this week</span>}
      </span>
      <span className={cx('figure shrink-0 text-xs', earns ? 'text-brand-text' : 'text-content-muted')}>{meta}</span>
    </li>
  );
}

function greeting(): string {
  const h = trustedNow().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const LEAGUE_TONE: Record<LeagueType, keyof typeof MODULE_TONE_CLASS> = {
  weekly: 'emerald',
  monthly: 'sky',
  ninetyDay: 'purple',
};

const LEAGUE_LABEL: Record<LeagueType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  ninetyDay: 'Season',
};

interface LeagueRowProps {
  type: LeagueType;
  rank: number;
  points: number;
  status: 'loading' | 'ready' | 'failed';
  navigate: (view: View) => void;
}

/**
 * Your place in one league. The place needs the other members' standings: a skeleton while they
 * load, "—" when they failed or you have no points yet (an empty place is never "#1").
 */
function LeagueRow({ type, rank, points, status, navigate }: LeagueRowProps) {
  const tone = LEAGUE_TONE[type];
  const Icon = LEAGUE_ICONS[LEAGUE_CONFIG[type].icon] ?? Calendar;
  const label = LEAGUE_LABEL[type];
  const hasPlace = status === 'ready' && points > 0;
  const placeText =
    points <= 0 ? 'no points yet' : status === 'ready' ? `place ${rank}` : status === 'failed' ? 'place not loaded' : 'loading place';

  return (
    <li>
      <a
        {...pageLinkProps('leagues', navigate)}
        aria-label={`${label} league: ${placeText}, ${pointsText(points)}`}
        className={cx('flex items-center gap-3 px-4 py-3 hover:bg-overlay-subtle', FOCUS_RING, TRANSITION)}
      >
        <span className={cx(MODULE_TONE_CLASS[tone], 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg')}>
          <Icon size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-content-secondary">{label}</span>
          <span className="block truncate text-2xs text-content-muted">
            {type === 'ninetyDay' ? 'Ends in ' : 'Resets in '}
            <LeagueCountdown type={type} className="font-mono" />
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-right">
          {status === 'loading' && points > 0 ? (
            <Skeleton className="ml-auto h-5 w-9" />
          ) : (
            <span
              className={cx('figure block text-lg leading-none', !hasPlace && 'text-content-muted')}
              style={hasPlace ? { color: `var(--badge-${tone}-text)` } : undefined}
            >
              {hasPlace ? <>#<CountUp value={rank} /></> : '—'}
            </span>
          )}
          <span className="mt-1 block figure text-2xs text-content-muted">
            {points > 0 ? <><CountUp value={points} /> {points === 1 ? 'pt' : 'pts'}</> : 'No points yet'}
          </span>
        </span>
      </a>
    </li>
  );
}
