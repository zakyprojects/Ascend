import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Smile,
  Meh,
  Frown,
  Zap,
  Save,
  Calendar,
  Info,
  Trash2,
  Award,
  ChevronRight,
  Edit3,
  X,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  BookOpen,
  TrendingUp,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Mood, JournalEntry } from '@/types';
import { formatDateLong, todayKey, parseDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { getDailyPrompt, JournalPrompt } from '@/data/journalPrompts';

// Minimum required non-whitespace characters to save an entry
const MIN_JOURNAL_CONTENT_LENGTH = 10;
const PROMPT_PREF_STORAGE_KEY = 'ascend_journal_prompt_mode';

export interface MoodMeta {
  value: Mood;
  label: string;
  score: number; // 1 to 4 numeric scale for trend charting
  icon: typeof Smile;
  color: string; // Hex for inline styles and SVG
  bgClass: string;
  textClass: string;
  borderClass: string;
  borderLeftClass: string;
}

export const MOODS: MoodMeta[] = [
  {
    value: 'sad',
    label: 'Sad',
    score: 1,
    icon: Frown,
    color: '#38bdf8', // Sky blue
    bgClass: 'bg-sky-500/15',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/30',
    borderLeftClass: 'border-l-sky-400',
  },
  {
    value: 'neutral',
    label: 'Neutral',
    score: 2,
    icon: Meh,
    color: '#94a3b8', // Slate grey
    bgClass: 'bg-slate-500/15',
    textClass: 'text-slate-400',
    borderClass: 'border-slate-500/30',
    borderLeftClass: 'border-l-slate-400',
  },
  {
    value: 'happy',
    label: 'Happy',
    score: 3,
    icon: Smile,
    color: '#10b981', // Emerald green
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
    borderLeftClass: 'border-l-emerald-400',
  },
  {
    value: 'motivated',
    label: 'Motivated',
    score: 4,
    icon: Zap,
    color: '#f59e0b', // Amber
    bgClass: 'bg-amber-500/15',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    borderLeftClass: 'border-l-amber-400',
  },
];

export const MOOD_MAP: Record<Mood, MoodMeta> = MOODS.reduce((acc, m) => {
  acc[m.value] = m;
  return acc;
}, {} as Record<Mood, MoodMeta>);

type ChartRange = '7d' | '30d';

export function Journal({ store }: { store: AppStore }) {
  const existingToday = store.getTodayJournalEntry();

  const [mood, setMood] = useState<Mood>('happy');
  const [content, setContent] = useState('');
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [justCelebrated, setJustCelebrated] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [deleteModalEntry, setDeleteModalEntry] = useState<JournalEntry | null>(null);

  // Guided prompt preferences
  const [showGuidedPrompt, setShowGuidedPrompt] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PROMPT_PREF_STORAGE_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [promptOffset, setPromptOffset] = useState<number>(0);
  const [chartRange, setChartRange] = useState<ChartRange>('7d');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 600,
    height: 144,
  });

  // Track real container pixel dimensions using ResizeObserver
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [hoveredChartPoint, setHoveredChartPoint] = useState<{
    date: string;
    label: string;
    entry?: JournalEntry;
    moodMeta?: MoodMeta;
    x: number;
    y: number;
  } | null>(null);

  // Update prompt preference
  const toggleGuidedPrompt = (enabled: boolean) => {
    setShowGuidedPrompt(enabled);
    try {
      localStorage.setItem(PROMPT_PREF_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore local storage errors
    }
  };

  // Synchronize state with today's existing entry when present
  useEffect(() => {
    if (existingToday) {
      setMood(existingToday.mood);
      setContent(existingToday.content || '');
      setIsEditingToday(false);
    } else {
      setIsEditingToday(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingToday?.id, existingToday?.createdAt, existingToday?.content, existingToday?.mood]);

  const { showErrorToast, showSuccessToast } = useToast();
  const { isLoading: isSaving, executeFn: executeSave } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const trimmedContent = content.trim();
  const hasEnoughContent = trimmedContent.length >= MIN_JOURNAL_CONTENT_LENGTH;
  const charsNeeded = Math.max(0, MIN_JOURNAL_CONTENT_LENGTH - trimmedContent.length);

  const handleSave = async () => {
    if (!hasEnoughContent) {
      showErrorToast(
        'More Content Needed',
        `Please write at least ${MIN_JOURNAL_CONTENT_LENGTH} characters before saving (even a sentence helps).`
      );
      return;
    }

    try {
      await executeSave(async () => {
        const wasAwarded = existingToday?.pointsAwarded ?? false;
        await store.saveJournalEntry(mood, content);

        if (!wasAwarded) {
          setJustCelebrated(true);
          showSuccessToast('Journal Saved', 'Earned +5 points for today\'s reflection! 🎉');
          setTimeout(() => setJustCelebrated(false), 4500);
        } else {
          showSuccessToast('Journal Updated', 'Your reflection has been updated.');
        }
      });
      setIsEditingToday(false);
    } catch (err: any) {
      showErrorToast('Save Failed', err?.message || 'Could not save journal entry. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    if (existingToday) {
      setMood(existingToday.mood);
      setContent(existingToday.content || '');
    }
    setIsEditingToday(false);
  };

  const entries = store.state.journalEntries;
  const currentDailyPrompt: JournalPrompt = getDailyPrompt(todayKey(), promptOffset);
  const todayMoodConfig = MOOD_MAP[existingToday?.mood || mood] || MOOD_MAP.happy;
  const TodayMoodIcon = todayMoodConfig.icon;

  // -------------------------------------------------------------------------
  // MOOD TREND CHART CALCULATIONS (7D & 30D)
  // -------------------------------------------------------------------------
  const chartDaysCount = chartRange === '7d' ? 7 : 30;

  const chartData = useMemo(() => {
    const days: Array<{
      dateKey: string;
      label: string;
      shortLabel: string;
      entry?: JournalEntry;
      score: number | null;
      moodMeta?: MoodMeta;
      isToday: boolean;
    }> = [];

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    for (let i = chartDaysCount - 1; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - i);
      const k = todayKey(d);
      const isToday = i === 0;

      const entry = entries.find((e) => e.date === k);
      const moodMeta = entry ? MOOD_MAP[entry.mood] : undefined;
      const score = moodMeta ? moodMeta.score : null;

      // Labels
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const shortLabel = chartRange === '7d' ? dayNames[d.getDay()] : `${d.getDate()}`;
      const label = `${monthNames[d.getMonth()]} ${d.getDate()}`;

      days.push({
        dateKey: k,
        label,
        shortLabel,
        entry,
        score,
        moodMeta,
        isToday,
      });
    }

    return days;
  }, [chartRange, chartDaysCount, entries]);

  // Statistics for selected range
  const recordedPointsInRange = chartData.filter((d) => d.score !== null);
  const totalEntriesCount = entries.length;
  const hasEnoughDataForTrend = totalEntriesCount >= 2;

  const averageScore = recordedPointsInRange.length > 0
    ? (recordedPointsInRange.reduce((sum, p) => sum + (p.score || 0), 0) / recordedPointsInRange.length).toFixed(1)
    : null;

  const moodCountsInRange = recordedPointsInRange.reduce((acc, p) => {
    if (p.entry) {
      acc[p.entry.mood] = (acc[p.entry.mood] || 0) + 1;
    }
    return acc;
  }, {} as Record<Mood, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Journal</h1>
        <p className="text-sm text-slate-500 mt-1">
          Reflect daily, build emotional awareness, and track your mood trends
        </p>
      </div>

      {/* TODAY'S ENTRY CARD (TWO-STATE FLOW) */}
      <div className="card p-5 border border-white/5 relative overflow-hidden">
        {/* Subtle background glow when celebrated */}
        {justCelebrated && (
          <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none animate-pulse-glow" />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary-400" />
            <h2 className="section-title">Today's Journal Entry</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium bg-bg-800 px-3 py-1 rounded-lg border border-white/5">
            {formatDateLong(todayKey())}
          </span>
        </div>

        {/* STATE 2: ENTRY ALREADY SAVED (CONFIRMATION & READ-ONLY VIEW) */}
        {existingToday && !isEditingToday ? (
          <div className="space-y-4 animate-fade-in">
            {/* Success Celebration Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                justCelebrated
                  ? 'bg-emerald-500/20 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'bg-emerald-500/10 border-emerald-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 size={18} className={justCelebrated ? 'animate-celebrate' : ''} />
                </div>
                <div>
                  <p className="text-xs text-emerald-300 font-bold">
                    {justCelebrated ? "Reflection saved! Great work today." : "Today's entry saved and confirmed"}
                  </p>
                  <p className="text-[11px] text-emerald-400/80">
                    Your mood and daily notes have been recorded in history.
                  </p>
                </div>
              </div>

              {existingToday.pointsAwarded && (
                <span className="text-xs font-bold text-emerald-300 bg-emerald-500/25 px-3 py-1 rounded-full border border-emerald-500/40 flex items-center gap-1.5 shrink-0 shadow-sm animate-scale-in">
                  <Award size={14} className="text-emerald-300" />
                  <span>+5 pts earned</span>
                </span>
              )}
            </div>

            {/* Saved Read-Only Details */}
            <div className={`p-4 bg-bg-800 rounded-xl border border-white/5 border-l-4 ${todayMoodConfig.borderLeftClass} space-y-3.5`}>
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
                    style={{ backgroundColor: `${todayMoodConfig.color}20` }}
                  >
                    <TodayMoodIcon size={20} style={{ color: todayMoodConfig.color }} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                      Recorded Mood
                    </span>
                    <span
                      className="text-sm font-bold flex items-center gap-1.5"
                      style={{ color: todayMoodConfig.color }}
                    >
                      {todayMoodConfig.label}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditingToday(true)}
                  className="px-3 py-1.5 bg-primary-500/15 hover:bg-primary-500/25 border border-primary-500/30 text-primary-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <Edit3 size={14} />
                  <span>Edit Entry</span>
                </button>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1.5">
                  Your Daily Notes
                </span>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[60px] p-3 rounded-lg bg-bg-900/60 border border-white/5">
                  {existingToday.content ? (
                    existingToday.content
                  ) : (
                    <span className="italic text-slate-500 flex items-center gap-1.5">
                      <Info size={14} /> Mood recorded, no notes added
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* STATE 1: WRITING / EDITING MODE */
          <div className="space-y-5 animate-fade-in">
            {/* Status notice */}
            <div className="p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl flex items-center justify-between gap-2 text-xs text-primary-300 font-medium">
              <div className="flex items-center gap-2">
                <Info size={16} className="shrink-0 text-primary-400" />
                <span>
                  {existingToday
                    ? "Editing today's entry. Update your notes and save."
                    : "Write at least a sentence (10+ characters) to earn +5 points."}
                </span>
              </div>
              <span className="text-[11px] font-bold bg-primary-500/20 px-2 py-0.5 rounded text-primary-300 border border-primary-500/30 shrink-0">
                +5 pts
              </span>
            </div>

            {/* Mood selector */}
            <div>
              <label className="label mb-2">How are you feeling today?</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const selected = mood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMood(m.value)}
                      className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl transition-all duration-200 ${
                        selected
                          ? 'bg-bg-600 border-2 shadow-lg scale-[1.02]'
                          : 'bg-bg-700/80 border border-white/5 hover:bg-bg-600 hover:border-white/10'
                      }`}
                      style={selected ? { borderColor: m.color, backgroundColor: `${m.color}15` } : {}}
                    >
                      <Icon
                        size={26}
                        style={{ color: selected ? m.color : '#64748b' }}
                        className={`transition-transform ${selected ? 'scale-110' : ''}`}
                      />
                      <span
                        className="text-xs font-bold transition-colors"
                        style={{ color: selected ? m.color : '#94a3b8' }}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Guided Prompt Toggle & Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="label mb-0 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-slate-400" />
                  <span>Your Journal Notes</span>
                </label>

                {/* Prompt / Free Write Toggle */}
                <div className="flex items-center gap-1 bg-bg-700 p-0.5 rounded-lg border border-white/5">
                  <button
                    type="button"
                    onClick={() => toggleGuidedPrompt(true)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                      showGuidedPrompt
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles size={12} />
                    <span>Guided Prompt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGuidedPrompt(false)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      !showGuidedPrompt
                        ? 'bg-bg-500 text-slate-100 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>Free Write</span>
                  </button>
                </div>
              </div>

              {/* GUIDED PROMPT CARD (Visible when toggle is ON) */}
              {showGuidedPrompt && (
                <div className="p-3.5 bg-bg-800/90 rounded-xl border border-primary-500/20 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${currentDailyPrompt.categoryColor}`}>
                      {currentDailyPrompt.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPromptOffset((prev) => prev + 1)}
                      className="text-xs text-slate-400 hover:text-primary-400 flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-white/5 transition-all"
                      title="Show another prompt"
                    >
                      <RotateCcw size={12} />
                      <span>Shuffle Prompt</span>
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-slate-200 leading-snug">
                    "{currentDailyPrompt.prompt}"
                  </p>
                </div>
              )}

              {/* Textarea Input */}
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    showGuidedPrompt
                      ? "Write your answer or thoughts to the prompt above..."
                      : "What happened today? What are you grateful for? What could be better?"
                  }
                  className="input min-h-[140px] resize-y leading-relaxed text-slate-100 placeholder:text-slate-500 font-sans"
                />
              </div>

              {/* Inline Validation Helper */}
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <div className="flex items-center gap-1.5">
                  {trimmedContent.length === 0 ? (
                    <span className="text-slate-400 flex items-center gap-1">
                      <HelpCircle size={13} className="text-slate-400" />
                      Write at least {MIN_JOURNAL_CONTENT_LENGTH} characters to save today's reflection.
                    </span>
                  ) : !hasEnoughContent ? (
                    <span className="text-amber-400 flex items-center gap-1 font-medium animate-fade-in">
                      <AlertCircle size={13} className="text-amber-400" />
                      Write a bit more before saving — {charsNeeded} more {charsNeeded === 1 ? 'character' : 'characters'} needed.
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold animate-fade-in">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      Ready to save ({trimmedContent.length} characters) • +5 pts
                    </span>
                  )}
                </div>

                <span className={`text-[11px] font-mono ${hasEnoughContent ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                  {trimmedContent.length}/{MIN_JOURNAL_CONTENT_LENGTH} min
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !hasEnoughContent}
                className={`btn flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-md ${
                  hasEnoughContent
                    ? 'btn-primary'
                    : 'bg-bg-600 text-slate-500 border border-white/5 cursor-not-allowed opacity-70'
                }`}
                title={!hasEnoughContent ? `Write at least ${MIN_JOURNAL_CONTENT_LENGTH} characters to enable saving` : ''}
              >
                {isSaving ? (
                  <AscendLoadingIndicator size="sm" />
                ) : (
                  <Save size={16} className={hasEnoughContent ? 'text-white' : 'text-slate-500'} />
                )}
                <span>
                  {isSaving
                    ? 'Saving...'
                    : existingToday
                    ? 'Update Entry'
                    : 'Save Today\'s Entry (+5 pts)'}
                </span>
              </button>

              {existingToday && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-secondary px-4 py-3 text-xs flex items-center gap-1.5 rounded-xl"
                >
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MOOD OVERVIEW — TREND GRAPH & STATS */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <TrendingUp size={18} className="text-primary-400" />
              Mood Trend & Overview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Emotional awareness trajectory mapped across your reflections
            </p>
          </div>

          {/* 7D vs 30D Time Range Switcher */}
          <div className="flex items-center bg-bg-700 p-0.5 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => setChartRange('7d')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                chartRange === '7d'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setChartRange('30d')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                chartRange === '30d'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Empty State vs Active Trend Chart */}
        {!hasEnoughDataForTrend ? (
          <div className="p-8 text-center bg-bg-800/60 rounded-xl border border-white/5 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-400">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200">
                Not enough data yet
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Keep journaling for a couple of days to unlock your interactive mood trend graph and emotional awareness insights.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {/* Interactive SVG Trend Chart */}
            <div className="relative pt-2 pb-2">
              {/* Y-Axis scale indicators & subtle horizontal gridlines */}
              <div className="relative h-44 bg-bg-900/80 rounded-2xl p-4 border border-white/5 flex flex-col justify-between overflow-hidden">
                {/* 4 horizontal gridlines */}
                {[
                  { level: 4, label: 'Motivated', color: MOOD_MAP.motivated.color, icon: Zap },
                  { level: 3, label: 'Happy', color: MOOD_MAP.happy.color, icon: Smile },
                  { level: 2, label: 'Neutral', color: MOOD_MAP.neutral.color, icon: Meh },
                  { level: 1, label: 'Sad', color: MOOD_MAP.sad.color, icon: Frown },
                ].map((row) => (
                  <div key={row.level} className="flex items-center gap-2 w-full">
                    <div className="flex items-center gap-1 w-20 shrink-0">
                      <row.icon size={13} style={{ color: row.color }} />
                      <span className="text-[10px] font-semibold text-slate-400 truncate">
                        {row.label}
                      </span>
                    </div>
                    <div className="flex-1 border-b border-white/5 border-dashed" />
                  </div>
                ))}

                {/* SVG Trend Line & Native SVG Node Elements (100% Single-Coordinate System) */}
                {(() => {
                  const totalCount = chartData.length;
                  const w = Math.max(10, containerDimensions.width);
                  const h = Math.max(10, containerDimensions.height);

                  const mappedPoints = chartData.map((d, index) => {
                    const pixelX = totalCount > 1 ? (index / (totalCount - 1)) * w : w / 2;
                    const pixelY = d.score !== null ? (1 - (d.score - 1) / 3) * h : null;

                    return { ...d, pixelX, pixelY, index };
                  });

                  const recordedPoints = mappedPoints.filter(
                    (pt): pt is typeof pt & { pixelY: number } => pt.pixelY !== null && pt.score !== null
                  );

                  const pathD =
                    recordedPoints.length >= 2
                      ? recordedPoints.reduce((acc, pt, idx) => {
                          return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.pixelX.toFixed(1)} ${pt.pixelY.toFixed(1)}`;
                        }, '')
                      : '';

                  return (
                    <div ref={chartContainerRef} className="absolute inset-0 left-24 right-4 top-4 bottom-4">
                      <svg
                        className="w-full h-full overflow-visible"
                        viewBox={`0 0 ${w} ${h}`}
                        width={w}
                        height={h}
                      >
                        {/* 1. Trend Line Path */}
                        {pathD && (
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="drop-shadow-md pointer-events-none"
                          />
                        )}

                        {/* 2. Unified Native SVG Data Points (cx/cy matching pixelX/pixelY directly) */}
                        {mappedPoints.map((pt) => {
                          const hasEntry = pt.pixelY !== null && pt.score !== null && !!pt.moodMeta;
                          const cx = pt.pixelX;
                          const cy = pt.pixelY !== null ? pt.pixelY : h - 6;
                          const radius = chartRange === '7d' ? 8 : 6.5;

                          return (
                            <g
                              key={pt.dateKey}
                              className="cursor-pointer group"
                              onMouseEnter={() => {
                                if (hasEntry) {
                                  setHoveredChartPoint({
                                    date: pt.dateKey,
                                    label: pt.label,
                                    entry: pt.entry,
                                    moodMeta: pt.moodMeta,
                                    x: pt.index,
                                    y: pt.score || 1,
                                  });
                                }
                              }}
                              onMouseLeave={() => setHoveredChartPoint(null)}
                              onClick={() => {
                                if (pt.entry) setSelectedEntry(pt.entry);
                              }}
                            >
                              {/* Transparent larger hit target (20px radius) for effortless hovering & mobile tapping */}
                              <circle cx={cx} cy={cy} r="20" fill="transparent" />

                              {/* Visible Circle Node */}
                              {hasEntry ? (
                                <>
                                  {/* Outer 2px dark border */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={radius + 1.5}
                                    fill="#0f172a"
                                    className="transition-all duration-150 group-hover:scale-125 origin-center"
                                    style={{
                                      transformOrigin: `${cx}px ${cy}px`,
                                    }}
                                  />
                                  {/* Inner Mood Color Fill */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={radius}
                                    fill={pt.moodMeta?.color || '#10b981'}
                                    className="transition-all duration-150 group-hover:scale-125 origin-center drop-shadow-md"
                                    style={{
                                      transformOrigin: `${cx}px ${cy}px`,
                                    }}
                                  />
                                </>
                              ) : (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r="2.5"
                                  fill="rgba(255,255,255,0.18)"
                                  className="group-hover:fill-white/50 transition-colors"
                                />
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* Hover Tooltip Card */}
              {hoveredChartPoint && hoveredChartPoint.moodMeta && (
                <div
                  className="p-2.5 bg-bg-800 border border-white/10 rounded-xl shadow-2xl space-y-1 mt-2 animate-fade-in"
                  style={{ borderColor: `${hoveredChartPoint.moodMeta.color}40` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      {formatDateLong(hoveredChartPoint.date)}
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-md"
                      style={{
                        backgroundColor: `${hoveredChartPoint.moodMeta.color}20`,
                        color: hoveredChartPoint.moodMeta.color,
                      }}
                    >
                      {hoveredChartPoint.moodMeta.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {hoveredChartPoint.entry?.content || (
                      <span className="italic text-slate-500">Mood recorded, no notes added</span>
                    )}
                  </p>
                </div>
              )}

              {/* X-Axis Day Labels */}
              <div className="flex justify-between items-center px-4 pl-24 text-[10px] text-slate-400 mt-2 font-medium">
                {chartRange === '7d' ? (
                  chartData.map((d) => (
                    <span
                      key={d.dateKey}
                      className={d.isToday ? 'text-primary-400 font-bold' : 'text-slate-400'}
                    >
                      {d.shortLabel}
                    </span>
                  ))
                ) : (
                  <>
                    <span>{chartData[0]?.label}</span>
                    <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
                    <span className="text-primary-400 font-bold">Today</span>
                  </>
                )}
              </div>
            </div>

            {/* Summary Insights in Selected Period */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-white/5">
              {MOODS.map((m) => {
                const count = moodCountsInRange[m.value] || 0;
                const Icon = m.icon;
                return (
                  <div
                    key={m.value}
                    className="p-3 bg-bg-800 rounded-xl border border-white/5 flex items-center gap-2.5"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${m.color}15` }}
                    >
                      <Icon size={16} style={{ color: m.color }} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        {m.label}
                      </span>
                      <span className="text-sm font-bold text-slate-100">
                        {count} <span className="text-[10px] text-slate-400 font-normal">days</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Average & Consistency Footer */}
            {averageScore && (
              <div className="p-3 bg-bg-800/50 rounded-xl border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-medium">Journaling Consistency:</span>
                  <span className="text-slate-200 font-bold">
                    {recordedPointsInRange.length} of {chartDaysCount} days ({Math.round((recordedPointsInRange.length / chartDaysCount) * 100)}%)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-medium">Average Mood Score:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {averageScore} / 4.0
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* JOURNAL HISTORY LIST (REDESIGNED ENTRY CARDS) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Calendar size={18} className="text-slate-400" />
            <span>Journal History ({entries.length})</span>
          </h2>
          <span className="text-xs text-slate-500">
            Click any entry to view full reflection
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-400">
              No journal entries saved yet. Write your thoughts above to start your journal history!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => {
              const isToday = entry.date === todayKey();
              const moodMeta = MOOD_MAP[entry.mood] || MOOD_MAP.neutral;
              const Icon = moodMeta.icon;
              const hasNotes = Boolean(entry.content && entry.content.trim().length > 0);

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`card p-4 card-hover w-full text-left flex items-center gap-3.5 transition-all group cursor-pointer border border-white/5 border-l-4 ${moodMeta.borderLeftClass}`}
                >
                  {/* Mood icon container with colored background tint */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/5"
                    style={{ backgroundColor: `${moodMeta.color}18` }}
                  >
                    <Icon size={20} style={{ color: moodMeta.color }} />
                  </div>

                  {/* Entry Header & Snippet */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-200">
                        {formatDateLong(entry.date)}
                      </span>

                      {isToday && (
                        <span className="text-[10px] bg-primary-500/20 text-primary-300 border border-primary-500/30 px-2 py-0.5 rounded-full font-bold">
                          Today
                        </span>
                      )}

                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md border"
                        style={{
                          backgroundColor: `${moodMeta.color}15`,
                          borderColor: `${moodMeta.color}30`,
                          color: moodMeta.color,
                        }}
                      >
                        {moodMeta.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {hasNotes ? (
                        entry.content
                      ) : (
                        <span className="italic text-slate-400 flex items-center gap-1">
                          <Info size={12} className="text-slate-400" />
                          Mood recorded, no notes added
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Points & Action Buttons */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {entry.pointsAwarded && (
                      <span className="text-xs text-emerald-400 font-display font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 flex items-center gap-1">
                        <Award size={13} /> +5 pts
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteModalEntry(entry);
                      }}
                      className="text-slate-600 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                      title="Delete Journal Entry"
                    >
                      <Trash2 size={16} />
                    </button>

                    <ChevronRight
                      size={16}
                      className="text-slate-600 group-hover:text-slate-300 transition-colors"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ENTRY DETAIL MODAL */}
      <Modal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry ? `Journal Entry — ${formatDateLong(selectedEntry.date)}` : ''}
        maxWidth="max-w-lg"
      >
        {selectedEntry && (() => {
          const moodMeta = MOOD_MAP[selectedEntry.mood] || MOOD_MAP.neutral;
          const Icon = moodMeta.icon;
          const hasNotes = Boolean(selectedEntry.content && selectedEntry.content.trim().length > 0);

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-bg-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
                    style={{ backgroundColor: `${moodMeta.color}20` }}
                  >
                    <Icon size={20} style={{ color: moodMeta.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      Recorded Mood
                    </p>
                    <p className="text-sm font-bold" style={{ color: moodMeta.color }}>
                      {moodMeta.label}
                    </p>
                  </div>
                </div>

                {selectedEntry.pointsAwarded ? (
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
                    <Award size={14} /> +5 pts Earned
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 bg-bg-700 px-2.5 py-1 rounded-lg">
                    No points
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Daily Notes
                </h4>
                <div className="p-4 bg-bg-800 rounded-xl border border-white/5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {hasNotes ? (
                    selectedEntry.content
                  ) : (
                    <span className="italic text-slate-500 flex items-center gap-1.5">
                      <Info size={15} /> Mood recorded, no notes added
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedEntry;
                    setSelectedEntry(null);
                    setDeleteModalEntry(target);
                  }}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Trash2 size={14} />
                  <span>Delete Entry</span>
                </button>

                <button
                  onClick={() => setSelectedEntry(null)}
                  className="btn-secondary text-xs px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        open={!!deleteModalEntry}
        onClose={() => setDeleteModalEntry(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (deleteModalEntry) {
            await executeDelete(async () => {
              store.deleteJournalEntry(deleteModalEntry.id);
              setDeleteModalEntry(null);
            });
          }
        }}
        title="Delete Journal Entry?"
        itemName={`Journal Entry (${deleteModalEntry?.date})`}
        description={
          deleteModalEntry?.pointsAwarded
            ? `Are you sure you want to delete your journal entry for ${deleteModalEntry.date}? This will reverse the +5 points awarded.`
            : `Are you sure you want to delete your journal entry for ${deleteModalEntry?.date}?`
        }
      />
    </div>
  );
}
