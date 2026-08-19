import { Flame, TrendingUp, Star, BookOpen, Check, ArrowRight, Sparkles, Trophy, Brain, Calendar, CalendarDays, Activity, BookMarked, Zap, ShieldAlert, HeartPulse, Timer } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { View } from '@/components/AppShell';
import { calculateStreak, todayKey, formatDateLong, parseDate } from '@/lib/dates';
import { calculateUnifiedStreak } from '@/lib/streakLogic';
import { getCurrentTier, getNextTier } from '@/lib/tiers';
import { TierBadge, TierProgress } from '@/components/ui/TierBadge';
import { LEAGUE_CONFIG, formatCountdown, getTimeUntilReset, getSeasonLabel } from '@/lib/leagues';
import { LeagueType } from '@/types';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';

const LEAGUE_ICONS: Record<string, typeof Trophy> = {
  Calendar, CalendarDays, Brain,
};

interface DashboardProps {
  store: AppStore;
  onViewChange: (view: View) => void;
  onOpenAuthModal?: () => void;
}

export function Dashboard({ store, onViewChange, onOpenAuthModal }: DashboardProps) {
  const habits = store.state.habits;
  const totalPoints = store.state.totalPoints;
  const tier = getCurrentTier(totalPoints);
  const nextTier = getNextTier(totalPoints);

  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const todayEntry = store.getTodayJournalEntry();
  const completedToday = habits.filter((h) => store.isHabitDone(h));
  const pendingToday = habits.filter((h) => !store.isHabitDone(h));

  const streakResult = calculateUnifiedStreak(store.state);

  const currentStreakLabel = 'Current Streak';
  const currentStreakValue = streakResult.formattedCurrentStreak;

  const completionRate = habits.length > 0 ? Math.round((completedToday.length / habits.length) * 100) : 0;

  // League data
  const weeklyData = store.getLeagueData('weekly');
  const monthlyData = store.getLeagueData('monthly');
  const ninetyDayData = store.getLeagueData('ninetyDay');

  // Summary Metrics from new modules
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(now.getDate() + diffToMon);
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyWorkouts = store.state.workouts.filter((w) => (parseDate(w.date) || new Date(0)) >= startOfWeek);
  const weeklyExerciseMins = weeklyWorkouts.reduce((sum, w) => sum + w.durationMinutes, 0);

  const activeBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'reading').length;
  const finishedBooks = (store.state.libraryBooks || []).filter((b) => b.status === 'completed').length;

  const totalSkillHours = (store.state.skillLogs.reduce((sum, l) => sum + l.durationMinutes, 0) / 60).toFixed(1);

  const weeklyFocusMins = store.state.focusLogs
    .filter((l) => (parseDate(l.date) || new Date(0)) >= startOfWeek)
    .reduce((sum, l) => sum + l.durationMinutes, 0);

  const badHabitCount = store.state.badHabits.length;
  const activeAddiction = store.state.addictionTracker;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-slate-500">{formatDateLong(todayKey())}</p>
        <h1 className="text-2xl font-display font-bold text-slate-100 mt-0.5">
          {greeting()}, let's ascend
        </h1>
      </div>

      {/* Guest Mode Banner on Dashboard */}
      {store.state.currentUser?.isAnonymous && onOpenAuthModal && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-primary-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                You are using a Guest Session ({store.state.currentUser.username})
              </p>
              <p className="text-[11px] text-slate-400">
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

      {/* Tier + Points hero */}
      <div className="card p-5 relative overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, ${tier.color}, transparent 70%)` }}
        />
        <div className="relative flex items-center gap-4">
          <TierBadge totalPoints={totalPoints} size="xl" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-display font-bold" style={{ color: tier.color }}>
                {tier.name}
              </h2>
              {nextTier && (
                <span className="text-xs text-slate-500">
                  → {nextTier.name}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-display font-bold text-slate-100">
                {totalPoints.toLocaleString()}
              </span>
              <span className="text-sm text-slate-500">total points</span>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <TierProgress totalPoints={totalPoints} />
        </div>
      </div>

      {/* League ranks */}
      <div className="grid grid-cols-3 gap-3">
        <LeagueRankCard
          type="weekly"
          rank={weeklyData.userRank}
          points={weeklyData.userPoints}
          countdown={formatCountdown(getTimeUntilReset('weekly'))}
        />
        <LeagueRankCard
          type="monthly"
          rank={monthlyData.userRank}
          points={monthlyData.userPoints}
          countdown={formatCountdown(getTimeUntilReset('monthly'))}
        />
        <LeagueRankCard
          type="ninetyDay"
          rank={ninetyDayData.userRank}
          points={ninetyDayData.userPoints}
          countdown={formatCountdown(getTimeUntilReset('ninetyDay'))}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Check size={18} />} label="Done Today" value={`${completedToday.length}/${habits.length}`} color="#34d399" />
        <StatCard icon={<TrendingUp size={18} />} label="Completion" value={`${completionRate}%`} color="#0ea5e9" />
        <StatCard icon={<Flame size={18} />} label={currentStreakLabel} value={currentStreakValue} color="#f59e0b" />
        <StatCard icon={<Star size={18} />} label="Habits" value={String(habits.length)} color="#6366f1" />
      </div>

      {/* Activity Summary Widgets Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Self-Improvement Activity Summary</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Exercise Summary Widget */}
          <button
            onClick={() => onViewChange('exercise')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Exercise Tracker</span>
              <Activity size={18} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{weeklyExerciseMins} <span className="text-xs font-normal text-slate-400">mins this week</span></div>
              <div className="text-[11px] text-slate-500">{weeklyWorkouts.length} sessions completed</div>
            </div>
          </button>

          {/* Reading Summary Widget */}
          <button
            onClick={() => onViewChange('reading')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-amber-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Reading Hub</span>
              <BookMarked size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{activeBooks} <span className="text-xs font-normal text-slate-400">books in progress</span></div>
              <div className="text-[11px] text-slate-500">{finishedBooks} finished total</div>
            </div>
          </button>

          {/* Skill Summary Widget */}
          <button
            onClick={() => onViewChange('skills')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-purple-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Skill Learning</span>
              <Zap size={18} className="text-purple-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{totalSkillHours} <span className="text-xs font-normal text-slate-400">hrs practice</span></div>
              <div className="text-[11px] text-slate-500">{store.state.skills.length} skills tracked</div>
            </div>
          </button>

          {/* Bad Habit Summary Widget */}
          <button
            onClick={() => onViewChange('bad-habits')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-rose-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Bad Habits Reduction</span>
              <ShieldAlert size={18} className="text-rose-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{badHabitCount} <span className="text-xs font-normal text-slate-400">habits reduced</span></div>
              <div className="text-[11px] text-slate-500">Escalating penalties enabled</div>
            </div>
          </button>

          {/* Addiction Recovery Summary Widget */}
          <button
            onClick={() => onViewChange('recovery')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Addiction Recovery</span>
              <HeartPulse size={18} className="text-red-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">
                {activeAddiction ? activeAddiction.title : 'Sobriety Tracker'}
              </div>
              <div className="text-[11px] text-slate-500">Includes emergency support & breathing</div>
            </div>
          </button>

          {/* Deep Focus Summary Widget */}
          <button
            onClick={() => onViewChange('prefrontal')}
            className="card p-4 card-hover text-left flex flex-col justify-between space-y-2 border-l-4 border-cyan-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Prefrontal / Focus</span>
              <Timer size={18} className="text-cyan-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-100">{weeklyFocusMins} <span className="text-xs font-normal text-slate-400">focus mins this week</span></div>
              <div className="text-[11px] text-slate-500">Pomodoro, decisions & emotions</div>
            </div>
          </button>
        </div>
      </div>

      {/* Today's habits quick-complete */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Today's Habits</h2>
          <button onClick={() => onViewChange('habits')} className="btn-ghost text-xs">
            View all <ArrowRight size={14} />
          </button>
        </div>

        {habits.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">No habits yet. Start building your routine!</p>
            <button onClick={() => onViewChange('habits')} className="btn-primary mx-auto">
              Add Your First Habit
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingToday.length > 0 ? (
              pendingToday.slice(0, 4).map((habit) => {
                const isToggling = isKeyLoading(habit.id);
                const isLinked = habit.isSystemLinked || habit.linkedModule === 'reading';
                return (
                  <div key={habit.id} className="card p-3 flex items-center gap-3 card-hover">
                    <button
                      disabled={isToggling || isLinked}
                      title={isLinked ? 'Log reading progress in Reading Hub' : undefined}
                      onClick={() => !isLinked && executeWithKey(habit.id, async () => { store.toggleHabit(habit.id); })}
                      className={`shrink-0 w-9 h-9 rounded-lg border border-white/5 flex items-center justify-center transition-all ${
                        isLinked
                          ? 'bg-bg-600/60 text-slate-600 cursor-default'
                          : 'bg-bg-600 text-slate-500 hover:bg-bg-500 hover:text-slate-300 active:scale-90'
                      }`}
                    >
                      {isToggling ? <AscendLoadingIndicator size="sm" /> : <Check size={18} />}
                    </button>
                    <span className="text-sm text-slate-300 flex-1 truncate flex items-center gap-1.5">
                      {isLinked && <BookOpen size={13} className="text-amber-400 shrink-0" />}
                      <span>{habit.name}</span>
                    </span>
                    {habit.isPreset ? (
                      <span className="text-xs text-primary-400">+{habit.points} pts</span>
                    ) : (
                      <span className="text-xs text-slate-600">No pts</span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="card p-5 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center mx-auto mb-2">
                  <Sparkles size={22} className="text-primary-400" />
                </div>
                <p className="text-sm font-medium text-primary-400">All habits done today!</p>
                <p className="text-xs text-slate-500 mt-0.5">Great work. See you tomorrow.</p>
              </div>
            )}
            {completedToday.length > 0 && pendingToday.length > 0 && (
              <p className="text-xs text-slate-600 px-1">
                {completedToday.length} already completed
              </p>
            )}
          </div>
        )}
      </div>

      {/* Journal snapshot */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Today's Journal</h2>
          <button onClick={() => onViewChange('journal')} className="btn-ghost text-xs">
            {todayEntry ? 'Edit' : 'Write'} <ArrowRight size={14} />
          </button>
        </div>
        <button
          onClick={() => onViewChange('journal')}
          className="card p-4 card-hover w-full text-left"
        >
          {todayEntry ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: moodColor(todayEntry.mood) }} />
                <span className="text-xs text-slate-400 capitalize">{todayEntry.mood}</span>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">
                {todayEntry.content || 'No content written'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-bg-600 flex items-center justify-center">
                <BookOpen size={18} className="text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">Write today's entry</p>
                <p className="text-xs text-slate-500">How was your day? (+5 pts)</p>
              </div>
            </div>
          )}
        </button>
      </div>
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

function LeagueRankCard({ type, rank, points, countdown }: { type: LeagueType; rank: number; points: number; countdown: string }) {
  const config = LEAGUE_CONFIG[type];
  const Icon = LEAGUE_ICONS[config.icon] ?? Calendar;
  const label = type === 'weekly' ? 'Weekly' : type === 'monthly' ? 'Monthly' : `${getSeasonLabel()} (90-Day)`;

  return (
    <div className="card p-3 text-center relative">
      {type === 'ninetyDay' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold">
          Active
        </span>
      )}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5"
        style={{ backgroundColor: `${config.color}15` }}
      >
        <Icon size={14} style={{ color: config.color }} />
      </div>
      <div className="text-xs text-slate-400 font-medium mb-0.5">{label}</div>
      <div className="text-lg font-display font-bold" style={{ color: config.color }}>
        #{rank}
      </div>
      <div className="text-[10px] text-slate-400">{points.toLocaleString()} pts</div>
      <div className="text-[10px] text-primary-400 mt-0.5 truncate font-mono font-medium">{countdown}</div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card p-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label mt-0.5">{label}</div>
    </div>
  );
}
