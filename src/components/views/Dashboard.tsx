import {
  Flame,
  TrendingUp,
  Star,
  BookOpen,
  Check,
  ArrowRight,
  Sparkles,
  Trophy,
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
import { getCurrentTier, getNextTier } from '@/lib/tiers';
import { TierBadge, TierProgress } from '@/components/ui/TierBadge';
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

const LEAGUE_ICONS: Record<string, typeof Trophy> = {
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

interface ModuleCardProps {
  tone: keyof typeof MODULE_TONE_CLASS;
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ModuleCard({ tone, icon: Icon, title, onClick, children }: ModuleCardProps) {
  return (
    <Card
      variant="interactive"
      padding="md"
      onClick={onClick}
      className="flex flex-col justify-between space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-content-muted font-medium">{title}</span>
        <span className={`${MODULE_TONE_CLASS[tone]} w-8 h-8 rounded-lg flex items-center justify-center`}>
          <Icon size={18} aria-hidden="true" />
        </span>
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
  const tier = getCurrentTier(seasonPoints);
  const nextTier = getNextTier(seasonPoints);


  const todayEntry = store.getTodayJournalEntry();
  const completedToday = habits.filter((h) => store.isHabitDone(h));
  const pendingToday = habits.filter((h) => !store.isHabitDone(h));

  const streakResult = calculateUnifiedStreak(store.state);

  const currentStreakLabel = 'Current Streak';
  const currentStreakValue = streakResult.formattedCurrentStreak;

  // Last 7 local days, today last: drives the week chart and the hero's "today" delta.
  const weekDays = lastDayKeys(7);
  const weekPoints = dailyPoints(store.state.pointsHistory || [], weekDays);
  const weekHabits = dailyHabitCompletions(habits, weekDays);
  const today = weekPoints.days[weekPoints.days.length - 1];
  const todayNet = today.earned - today.lost;

  const completionRate = habits.length > 0 ? Math.round((completedToday.length / habits.length) * 100) : 0;

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
      {/* Header */}
      <div>
        <p className="text-sm text-content-disabled">{formatDateLong(todayKey())}</p>
        <h1 className="page-title mt-0.5">
          {greeting()}, let's ascend
        </h1>
      </div>

      {/* Guest Mode Banner on Dashboard */}
      {store.state.currentUser?.isAnonymous && onOpenAuthModal && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-primary-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 text-warning-text">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-secondary">
                You are using a Guest Session ({store.state.currentUser.username})
              </p>
              <p className="text-micro text-content-muted">
                Save your progress — convert to a permanent account so you never lose your habits, points, and league rank.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenAuthModal}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all shrink-0 w-full sm:w-auto"
          >
            Save Progress / Create Account
          </button>
        </div>
      )}

      <PageColumns
        lead={
          <>
            {/* Tier + Points hero */}
            <Reveal index={0}>
            <div className="card p-5 relative overflow-hidden">
              <div
                className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-15 dark:opacity-10 pointer-events-none"
                style={{ background: `radial-gradient(circle, var(--rank-${tier.name.toLowerCase()}-text), transparent 70%)` }}
              />
              <div className="relative flex items-center gap-4">
                <TierBadge totalPoints={seasonPoints} size="xl" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-display font-bold" style={{ color: `var(--rank-${tier.name.toLowerCase()}-text)` }}>
                      {tier.name}
                    </h2>
                    {nextTier && (
                      <span className="text-xs text-content-disabled">
                        → {nextTier.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <CountUp
                      value={ninetyDayData.userPoints}
                      className="text-3xl font-display font-bold text-content-primary tabular-nums"
                    />
                    <span className="text-sm text-content-disabled">points</span>
                    {todayNet !== 0 && (
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          todayNet > 0 ? 'bg-primary-500/15 text-brand-text' : 'bg-warning-soft text-warning-text'
                        }`}
                      >
                        {todayNet > 0 ? '+' : '−'}
                        {Math.abs(todayNet).toLocaleString()} today
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <TierProgress totalPoints={seasonPoints} />
              </div>
            </div>
            </Reveal>

            {/* Stats grid */}
            <Reveal index={1} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<Check size={18} />} label="Done Today" value={`${completedToday.length}/${habits.length}`} tone="emerald" />
              <StatCard icon={<TrendingUp size={18} />} label="Completion" value={`${completionRate}%`} tone="sky" />
              <StatCard icon={<Flame size={18} />} label={currentStreakLabel} value={currentStreakValue} tone="amber" />
              <StatCard icon={<Star size={18} />} label="Habits" value={String(habits.length)} tone="indigo" />
            </Reveal>

            {/* Last 7 days + today's habits: the two things checked daily */}
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <Reveal index={2}>
                <WeekActivityCard points={weekPoints.days} pointsPartial={weekPoints.partial} habits={weekHabits} />
              </Reveal>

              {/* Today's habits quick-complete */}
              <Reveal index={3}>
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
                    title="No habits yet. Start building your routine!"
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
                            <span className="text-sm text-content-tertiary flex-1 truncate flex items-center gap-1.5">
                              {isLinked && <BookOpen size={13} className="text-warning-text shrink-0" />}
                              <span>{habit.name}</span>
                            </span>
                            {isLinked && habit.points === 0 ? (
                              <span className="text-xs text-content-subtle">For habit tracking</span>
                            ) : habit.isPreset ? (
                              <span className="text-xs text-brand-text font-medium">+{habit.points} pts</span>
                            ) : (
                              <span className="text-xs text-content-subtle">No pts</span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="card p-5 text-center">
                        <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center mx-auto mb-2">
                          <Sparkles size={22} className="text-brand-text" />
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
            </div>
          </>
        }
        aside={
          <>
            {/* League ranks */}
            <Reveal index={4} className="grid grid-cols-3 gap-3">
              <LeagueRankCard type="weekly" rank={weeklyData.userRank} points={weeklyData.userPoints} />
              <LeagueRankCard type="monthly" rank={monthlyData.userRank} points={monthlyData.userPoints} />
              <LeagueRankCard type="ninetyDay" rank={ninetyDayData.userRank} points={ninetyDayData.userPoints} />
            </Reveal>

            {/* Journal snapshot */}
            <Reveal index={5}>
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
                    <div className="w-10 h-10 rounded-xl bg-bg-600 flex items-center justify-center">
                      <BookOpen size={18} className="text-content-disabled" />
                    </div>
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
            {/* Activity Summary Widgets Grid */}
            <Reveal index={6}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Self-Improvement Activity Summary</h2>
              </div>
              <div className="grid-cards gap-3">
                {/* Exercise Summary Widget */}
                <ModuleCard
                  tone="emerald"
                  icon={Activity}
                  title="Exercise Tracker"
                  onClick={() => onViewChange('exercise')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary"><CountUp value={weeklyExerciseMins} /> <span className="text-xs font-normal text-content-muted">mins this week</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={weeklyWorkouts.length} /> sessions completed</div>
                  </div>
                </ModuleCard>

                {/* Reading Summary Widget */}
                <ModuleCard
                  tone="amber"
                  icon={BookMarked}
                  title="Reading Hub"
                  onClick={() => onViewChange('reading')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary"><CountUp value={activeBooks} /> <span className="text-xs font-normal text-content-muted">books in progress</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={finishedBooks} /> finished total</div>
                  </div>
                </ModuleCard>

                {/* Skill Summary Widget */}
                <ModuleCard
                  tone="purple"
                  icon={Zap}
                  title="Skill Learning"
                  onClick={() => onViewChange('skills')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary"><CountUp value={totalSkillHours} decimals={1} /> <span className="text-xs font-normal text-content-muted">hrs practice</span></div>
                    <div className="text-micro text-content-disabled"><CountUp value={store.state.skills.length} /> skills tracked</div>
                  </div>
                </ModuleCard>

                {/* Bad Habit Summary Widget */}
                <ModuleCard
                  tone="rose"
                  icon={ShieldAlert}
                  title="Bad Habits Reduction"
                  onClick={() => onViewChange('bad-habits')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary"><CountUp value={badHabitCount} /> <span className="text-xs font-normal text-content-muted">habits reduced</span></div>
                    <div className="text-micro text-content-disabled">Escalating penalties enabled</div>
                  </div>
                </ModuleCard>

                {/* Addiction Recovery Summary Widget */}
                <ModuleCard
                  tone="red"
                  icon={HeartPulse}
                  title="Addiction Recovery"
                  onClick={() => onViewChange('recovery')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary">
                      {activeAddiction ? activeAddiction.title : 'Sobriety Tracker'}
                    </div>
                    <div className="text-micro text-content-disabled">Includes emergency support & breathing</div>
                  </div>
                </ModuleCard>

                {/* Deep Focus Summary Widget */}
                <ModuleCard
                  tone="cyan"
                  icon={Timer}
                  title="Prefrontal / Focus"
                  onClick={() => onViewChange('prefrontal')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary"><CountUp value={weeklyFocusMins} /> <span className="text-xs font-normal text-content-muted">focus mins this week</span></div>
                    <div className="text-micro text-content-disabled">Pomodoro, decisions & emotions</div>
                  </div>
                </ModuleCard>

                {/* Time Tracker Blueprint Widget */}
                <ModuleCard
                  tone="indigo"
                  icon={Clock}
                  title="Time Tracker"
                  onClick={() => onViewChange('time-tracker')}
                >
                  <div>
                    <div className="text-xl font-bold text-content-primary">
                      <AutoNum text={todayScheduledMins > 0 ? formatDurationHuman(todayScheduledMins) : '0h 0m'} />{' '}
                      <span className="text-xs font-normal text-content-muted">planned today</span>
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
    happy: '#fbbf24',
    neutral: '#94a3b8',
    sad: '#60a5fa',
    motivated: '#34d399',
  };
  return colors[mood] ?? '#94a3b8';
}

const LEAGUE_TONE: Record<LeagueType, keyof typeof MODULE_TONE_CLASS> = {
  weekly: 'emerald',
  monthly: 'sky',
  ninetyDay: 'purple',
};

function LeagueRankCard({ type, rank, points }: { type: LeagueType; rank: number; points: number }) {
  const config = LEAGUE_CONFIG[type];
  const tone = LEAGUE_TONE[type];
  const Icon = LEAGUE_ICONS[config.icon] ?? Calendar;
  const label = type === 'weekly' ? 'Weekly' : type === 'monthly' ? 'Monthly' : `${getSeasonLabel(leagueNow())} (90-Day)`;

  return (
    <div className="card p-3 text-center relative">
      <div
        className={`${MODULE_TONE_CLASS[tone]} w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5`}
      >
        <Icon size={14} aria-hidden="true" />
      </div>
      <div className="text-xs text-content-muted font-medium mb-0.5">{label}</div>
      <div className="text-lg font-display font-bold tabular-nums" style={{ color: `var(--badge-${tone}-text)` }}>
        #<CountUp value={rank} />
      </div>
      <div className="text-2xs text-content-muted tabular-nums"><CountUp value={points} /> pts</div>
      <LeagueCountdown type={type} className="block text-2xs text-brand-text mt-0.5 truncate font-mono font-medium" />
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: keyof typeof MODULE_TONE_CLASS }) {
  return (
    <div className="card p-4">
      <div className={`${MODULE_TONE_CLASS[tone]} w-9 h-9 rounded-lg flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <AutoNum text={value} className="stat-value tabular-nums block" />
      <div className="stat-label mt-0.5">{label}</div>
    </div>
  );
}
