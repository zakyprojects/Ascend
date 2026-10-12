import {
  Flame,
  BookOpen,
  Check,
  ArrowRight,
  Save,
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
  type LucideIcon,
} from 'lucide-react';
import { Card, EmptyState, Button, PageColumns } from '@/components/ui/primitives';
import { TAP_TARGET, FOCUS_RING } from '@/components/ui/primitives/shared';
import { AppStore } from '@/lib/store';
import { View } from '@/components/AppShell';
import { calculateStreak, todayKey, formatDateLong, parseDate } from '@/lib/dates';
import { calculateUnifiedStreak } from '@/lib/streakLogic';
import { ProgressRing } from '@/components/ui/charts';
import { LEAGUE_CONFIG, getSeasonLabel } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { LeagueType } from '@/types';
import { calculateBlockDurationMinutes, formatDurationHuman } from '@/lib/timeTracker';
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { AutoNum, CountUp, Reveal } from '@/components/ui/Motion';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { useLeaguePeriodRollover } from '@/lib/useLeaguePeriodRollover';
import { dailyHabitCompletions, dailyPoints, lastDayKeys } from '@/lib/weeklyActivity';
import { WeekActivityCard } from './WeekActivityCard';
import { AscentProfile } from './AscentProfile';

const LEAGUE_ICONS: Record<string, LucideIcon> = {
  Calendar, CalendarDays, Brain,
};

interface ModuleCardProps {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ModuleCard({ icon: Icon, title, onClick, children }: ModuleCardProps) {
  return (
    <Card
      variant="interactive"
      padding="md"
      onClick={onClick}
      className="flex flex-col justify-between space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="stat-label">{title}</span>
        <Icon size={16} className="text-content-subtle" aria-hidden="true" />
      </div>
      {children}
    </Card>
  );
}

interface DashboardProps {
  store: AppStore;
  onViewChange: (view: View) => void;
  onOpenAuthModal?: () => void;
}

export function Dashboard({ store, onViewChange, onOpenAuthModal }: DashboardProps) {
  const habits = store.state.habits;
  const ninetyDayData = store.getLeagueData('ninetyDay');
  const seasonPoints = ninetyDayData.userPoints;

  const todayEntry = store.getTodayJournalEntry();
  const completedToday = habits.filter((h) => store.isHabitDone(h));
  const pendingToday = habits.filter((h) => !store.isHabitDone(h));

  const streakResult = calculateUnifiedStreak(store.state);

  const currentStreakValue = streakResult.formattedCurrentStreak;

  // Last 7 local days, today last: drives the week chart and the hero's "today" delta.
  const weekDays = lastDayKeys(7);
  const weekPoints = dailyPoints(store.state.pointsHistory || [], weekDays);
  const weekHabits = dailyHabitCompletions(habits, weekDays);
  const today = weekPoints.days[weekPoints.days.length - 1];
  const todayNet = today.earned - today.lost;

  // Re-render when a league period rolls over, so ranks and the season label never go stale.
  // The per-second countdowns tick inside LeagueCountdown and never re-render the page.
  useLeaguePeriodRollover();

  const weeklyData = store.getLeagueData('weekly');
  const monthlyData = store.getLeagueData('monthly');

  // Summary Metrics from new modules (personal features use plain local Date)
  const personalNow = new Date();
  const startOfWeek = new Date(personalNow);
  const dayOfWeek = personalNow.getDay();
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(personalNow.getDate() + diffToMon);
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyWorkouts = store.state.workouts.filter((w) => (parseDate(w.date) || new Date(0)) >= startOfWeek);
  const weeklyExerciseMins = weeklyWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);

  const activeBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'reading').length;
  const finishedBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'completed').length;

  const totalSkillHours = Math.round(store.state.skillLogs.reduce((sum, l) => sum + l.durationMinutes, 0) / 6) / 10;

  const weeklyFocusMins = store.state.focusLogs
    .filter((l) => (parseDate(l.date) || new Date(0)) >= startOfWeek)
    .reduce((sum, l) => sum + l.durationMinutes, 0);

  const badHabitCount = store.state.badHabits.length;
  const activeAddiction = store.state.addictionTracker;

  const todayBlocks = store.state.timeTracker?.dailyLogs?.[todayKey()] || [];
  const todayScheduledMins = todayBlocks.reduce(
    (sum, b) => sum + calculateBlockDurationMinutes(b.startTime, b.endTime),
    0
  );
  const todayCompletedBlocksCount = todayBlocks.filter((b) => b.completed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          {greeting()}
        </h1>
        <p className="page-subtitle">{formatDateLong(todayKey())}</p>
      </div>

      {/* Guest Mode Banner on Dashboard */}
      {store.state.currentUser?.isAnonymous && onOpenAuthModal && (
        <div className="p-4 rounded-xl border border-overlay-default flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Save size={18} className="shrink-0 text-content-muted" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-content-secondary">
                You're in a guest session ({store.state.currentUser.username})
              </p>
              <p className="text-micro text-content-muted">
                Create an account to keep your habits, points, and league rank.
              </p>
            </div>
          </div>
          <button onClick={onOpenAuthModal} className="btn-primary text-xs shrink-0 w-full sm:w-auto">
            Save Progress / Create Account
          </button>
        </div>
      )}

      {/* Hero: today, the season, and where you stand on the climb */}
      <Reveal index={0}>
        <section className="card p-5 sm:p-6 relative overflow-hidden" aria-label="Today and your season">
          <div className="relative grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div className="flex items-center gap-5">
              <ProgressRing
                value={completedToday.length}
                max={Math.max(habits.length, 1)}
                label={`Habits done today: ${completedToday.length} of ${habits.length}`}
                size={116}
                thickness={9}
              >
                <span className="text-4xl font-medium text-content-primary tabular-nums leading-none">
                  {completedToday.length}
                  <span className="text-lg text-content-muted">/{habits.length}</span>
                </span>
                <span className="mt-1 text-2xs text-content-muted">habits today</span>
              </ProgressRing>

              <div className="min-w-0">
                <div className="stat-label">Season points</div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <CountUp
                    value={seasonPoints}
                    className="font-serif text-5xl text-content-primary tabular-nums leading-none"
                  />
                  {todayNet !== 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 figure text-xs ${
                        todayNet > 0 ? 'bg-primary-500/15 text-brand-text' : 'bg-warning-soft text-warning-text'
                      }`}
                    >
                      {todayNet > 0 ? '+' : '−'}
                      {Math.abs(todayNet).toLocaleString()} today
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-sm text-content-secondary">
                  <Flame size={15} className="text-brand-text" aria-hidden="true" />
                  <AutoNum text={currentStreakValue} className="figure text-content-primary" />
                  <span className="text-content-muted">streak</span>
                </div>
              </div>
            </div>

            <AscentProfile totalPoints={seasonPoints} />
          </div>
        </section>
      </Reveal>

      <PageColumns
        lead={
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            {/* Today's habits quick-complete: the thing checked every day comes first */}
            <Reveal index={1}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Today's Habits</h2>
                <button onClick={() => onViewChange('habits')} className="btn-ghost text-xs">
                  View all <ArrowRight size={14} />
                </button>
              </div>

              {habits.length === 0 ? (
                <EmptyState
                  surface
                  size="md"
                  title="No habits yet. Add one to get started."
                  action={
                    <Button variant="primary" onClick={() => onViewChange('habits')}>
                      Add Your First Habit
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {pendingToday.length > 0 ? (
                    pendingToday.slice(0, 4).map((habit) => {
                      const isLinked = habit.isSystemLinked || habit.linkedModule === 'reading';
                      return (
                        <div key={habit.id} className="card p-3 flex items-center gap-3 card-hover">
                          <button
                            disabled={isLinked}
                            title={isLinked ? 'Log reading progress in Reading Hub' : undefined}
                            aria-label={isLinked ? `${habit.name} (log in Reading Hub)` : `Mark ${habit.name} done`}
                            onClick={() => !isLinked && store.toggleHabit(habit.id)}
                            className={`shrink-0 w-9 h-9 rounded-lg border border-overlay-subtle flex items-center justify-center transition-all ${
                              isLinked
                                ? 'bg-bg-600/60 text-content-subtle cursor-default'
                                : 'bg-bg-600 text-content-disabled hover:bg-bg-500 hover:text-content-tertiary active:scale-90'
                            } ${TAP_TARGET} ${FOCUS_RING}`}
                          >
                            <Check size={18} />
                          </button>
                          <span className="item-name text-sm text-content-tertiary flex-1 truncate flex items-center gap-1.5">
                            {isLinked && <BookOpen size={13} className="text-brand-text shrink-0" />}
                            <span>{habit.name}</span>
                          </span>
                          {isLinked && habit.points === 0 ? (
                            <span className="text-xs text-content-subtle">For habit tracking</span>
                          ) : habit.isPreset ? (
                            <span className="figure text-xs text-brand-text">+{habit.points} pts</span>
                          ) : (
                            <span className="text-xs text-content-subtle">No pts</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="card p-5 text-center">
                      <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center mx-auto mb-2">
                        <Check size={22} className="text-brand-text" />
                      </div>
                      <p className="text-sm font-medium text-brand-text">All habits done today!</p>
                      <p className="text-xs text-content-disabled mt-0.5">Great work. See you tomorrow.</p>
                    </div>
                  )}
                  {completedToday.length > 0 && pendingToday.length > 0 && (
                    <p className="text-xs text-content-subtle px-1">
                      {completedToday.length} already completed
                    </p>
                  )}
                </div>
              )}
            </Reveal>

            <Reveal index={2}>
              <WeekActivityCard points={weekPoints.days} pointsPartial={weekPoints.partial} habits={weekHabits} />
            </Reveal>
          </div>
        }
        aside={
          <>
            {/* League ranks: one list instead of three boxes */}
            <Reveal index={3}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Leagues</h2>
                <button onClick={() => onViewChange('leagues')} className="btn-ghost text-xs">
                  Standings <ArrowRight size={14} />
                </button>
              </div>
              <div className="card divide-y divide-overlay-subtle">
                <LeagueRow type="weekly" rank={weeklyData.userRank} points={weeklyData.userPoints} />
                <LeagueRow type="monthly" rank={monthlyData.userRank} points={monthlyData.userPoints} />
                <LeagueRow type="ninetyDay" rank={ninetyDayData.userRank} points={ninetyDayData.userPoints} />
              </div>
            </Reveal>

            {/* Journal snapshot */}
            <Reveal index={4}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Today's Journal</h2>
                <button onClick={() => onViewChange('journal')} className="btn-ghost text-xs">
                  {todayEntry ? 'Edit' : 'Write'} <ArrowRight size={14} />
                </button>
              </div>
              <Card
                variant="interactive"
                padding="md"
                onClick={() => onViewChange('journal')}
              >
                {todayEntry ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: moodColor(todayEntry.mood) }} />
                      <span className="text-xs text-content-muted capitalize">{todayEntry.mood}</span>
                    </div>
                    <p className="text-sm text-content-tertiary line-clamp-2">
                      {todayEntry.content || 'No content written'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <BookOpen size={18} className="shrink-0 text-content-subtle" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-content-tertiary">Write today's entry</p>
                      <p className="text-xs text-content-disabled">How was your day? (+{JOURNAL_POINTS.entryCompleted} pts)</p>
                    </div>
                  </div>
                )}
              </Card>
            </Reveal>
          </>
        }
        footer={
          <>
            {/* Every module at a glance, one quiet tile each */}
            <Reveal index={5}>
              <h2 className="section-title mb-3">Your Modules</h2>
              <div className="grid-cards gap-3">
                <ModuleCard icon={Activity} title="Exercise" onClick={() => onViewChange('exercise')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums"><CountUp value={weeklyExerciseMins} /> <span className="font-sans text-xs text-content-muted">mins this week</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={weeklyWorkouts.length} /> sessions completed</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={BookMarked} title="Reading" onClick={() => onViewChange('reading')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums"><CountUp value={activeBooks} /> <span className="font-sans text-xs text-content-muted">books in progress</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={finishedBooks} /> finished total</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={Zap} title="Skills" onClick={() => onViewChange('skills')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums"><CountUp value={totalSkillHours} decimals={1} /> <span className="font-sans text-xs text-content-muted">hrs practice</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={store.state.skills.length} /> skills tracked</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={ShieldAlert} title="Bad Habits" onClick={() => onViewChange('bad-habits')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums"><CountUp value={badHabitCount} /> <span className="font-sans text-xs text-content-muted">habits reduced</span></div>
                    <div className="text-micro text-content-disabled">Escalating penalties enabled</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={HeartPulse} title="Recovery" onClick={() => onViewChange('recovery')}>
                  <div>
                    <div className="item-name text-base leading-snug">
                      {activeAddiction ? activeAddiction.title : 'Sobriety Tracker'}
                    </div>
                    <div className="text-micro text-content-disabled">Includes emergency support & breathing</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={Timer} title="Focus" onClick={() => onViewChange('prefrontal')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums"><CountUp value={weeklyFocusMins} /> <span className="font-sans text-xs text-content-muted">focus mins this week</span></div>
                    <div className="text-micro text-content-disabled">Pomodoro, decisions & emotions</div>
                  </div>
                </ModuleCard>

                <ModuleCard icon={Clock} title="Time Tracker" onClick={() => onViewChange('time-tracker')}>
                  <div>
                    <div className="text-2xl font-medium leading-tight text-content-primary tabular-nums">
                      <AutoNum text={todayScheduledMins > 0 ? formatDurationHuman(todayScheduledMins) : '0h 0m'} />{' '}
                      <span className="font-sans text-xs text-content-muted">planned today</span>
                    </div>
                    <div className="text-micro text-content-disabled">
                      {todayBlocks.length > 0 ? (
                        <AutoNum text={`${todayCompletedBlocksCount}/${todayBlocks.length} blocks completed`} />
                      ) : (
                        'No scheduled blocks yet'
                      )}
                    </div>
                  </div>
                </ModuleCard>
              </div>
            </Reveal>
          </>
        }
      />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function moodColor(mood: string): string {
  const colors: Record<string, string> = {
    happy: '#34d399',
    neutral: '#94a3b8',
    sad: '#fb7185',
    motivated: '#10b981',
  };
  return colors[mood] ?? '#94a3b8';
}

function LeagueRow({ type, rank, points }: { type: LeagueType; rank: number; points: number }) {
  const config = LEAGUE_CONFIG[type];
  const Icon = LEAGUE_ICONS[config.icon] ?? Calendar;
  const label = type === 'weekly' ? 'Weekly' : type === 'monthly' ? 'Monthly' : `${getSeasonLabel(leagueNow())} (90-Day)`;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className="shrink-0 text-content-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="item-name truncate text-sm text-content-secondary">{label}</div>
        <LeagueCountdown type={type} className="block truncate font-mono text-2xs text-content-disabled" />
      </div>
      <div className="text-right">
        <div className="figure text-lg text-content-primary leading-none">
          #<CountUp value={rank} />
        </div>
        <div className="mt-1 figure text-2xs text-content-muted"><CountUp value={points} /> pts</div>
      </div>
    </div>
  );
}
