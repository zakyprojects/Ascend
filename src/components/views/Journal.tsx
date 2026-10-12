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
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { useToast } from '@/components/ui/Toast';
import { Dialog, EmptyState, PageColumns, Tabs } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { CountUp } from '@/components/ui/Motion';
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

const MOODS: MoodMeta[] = [
  {
    value: 'sad',
    label: 'Sad',
    score: 1,
    icon: Frown,
    color: '#fb7185', // Soft rose (low end of the mood scale)
    bgClass: 'bg-warning/15',
    textClass: 'text-warning-text',
    borderClass: 'border-warning/30',
    borderLeftClass: 'border-l-warning',
  },
  {
    value: 'neutral',
    label: 'Neutral',
    score: 2,
    icon: Meh,
    color: '#94a3b8', // Slate grey
    bgClass: 'bg-overlay-subtle',
    textClass: 'text-content-muted',
    borderClass: 'border-overlay-default',
    borderLeftClass: 'border-l-slate-400',
  },
  {
    value: 'happy',
    label: 'Happy',
    score: 3,
    icon: Smile,
    color: '#34d399', // Light emerald
    bgClass: 'bg-primary-300/10',
    textClass: 'text-brand-text',
    borderClass: 'border-primary-300/30',
    borderLeftClass: 'border-l-primary-300',
  },
  {
    value: 'motivated',
    label: 'Motivated',
    score: 4,
    icon: Zap,
    color: '#10b981', // Emerald (top of the mood scale)
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-success-text',
    borderClass: 'border-emerald-500/30',
    borderLeftClass: 'border-l-emerald-400',
  },
];

const MOOD_MAP: Record<Mood, MoodMeta> = MOODS.reduce((acc, m) => {
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
  // The trend line draws in once the mood card scrolls into view (instant without intro motion).
  const moodCardRef = useRef<HTMLDivElement>(null);
  const moodChartSeen = useSeen(moodCardRef, useIntroMotion());
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
          showSuccessToast('Journal Saved', `Earned +${JOURNAL_POINTS.entryCompleted} points for today's reflection! 🎉`);
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
        <h1 className="page-title">Journal</h1>
        <p className="page-subtitle">Reflect daily and see how your mood moves.</p>
      </div>

      <PageColumns
        lead={
          <>
            <CapMeterConnected state={store.state} capId="journal" />

            {/* TODAY'S ENTRY CARD (TWO-STATE FLOW) */}
            <div className="card p-5 relative overflow-hidden">
              {/* Subtle background tint when celebrated */}

              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-content-subtle" />
                  <h2 className="section-title">Today's Journal Entry</h2>
                </div>
                <span className="font-mono text-xs text-content-muted">
                  {formatDateLong(todayKey())}
                </span>
              </div>

              {/* STATE 2: ENTRY ALREADY SAVED (CONFIRMATION & READ-ONLY VIEW) */}
              {existingToday && !isEditingToday ? (
                <div className="space-y-4 animate-fade-in">
                  {/* Success Celebration Banner */}
                  <div
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={18} className={`text-success-text shrink-0 ${justCelebrated ? 'animate-celebrate' : ''}`} />
                      <div>
                        <p className="text-xs text-content-primary font-medium">
                          {justCelebrated ? "Reflection saved! Great work today." : "Today's entry saved and confirmed"}
                        </p>
                        <p className="text-micro text-content-muted">
                          Your mood and daily notes have been recorded in history.
                        </p>
                      </div>
                    </div>

                    {existingToday.pointsAwarded && (
                      <span className="figure text-xs text-success-text flex items-center gap-1.5 shrink-0 animate-scale-in">
                        <Award size={14} className="text-content-subtle" />
                        <span>+{JOURNAL_POINTS.entryCompleted} pts earned</span>
                      </span>
                    )}
                  </div>

                  {/* Saved Read-Only Details */}
                  <div className="pt-4 border-t border-overlay-subtle space-y-3.5">
                    <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
                      <div className="flex items-center gap-3">
                        <TodayMoodIcon size={18} style={{ color: todayMoodConfig.color }} className="shrink-0" />
                        <div>
                          <span className="stat-label block">
                            Recorded Mood
                          </span>
                          <span
                            className="text-sm font-medium flex items-center gap-1.5"
                            style={{ color: todayMoodConfig.color }}
                          >
                            {todayMoodConfig.label}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setIsEditingToday(true)}
                        className="btn-secondary text-xs flex items-center gap-1.5"
                      >
                        <Edit3 size={14} />
                        <span>Edit Entry</span>
                      </button>
                    </div>

                    <div>
                      <span className="stat-label block mb-1.5">
                        Your Daily Notes
                      </span>
                      <div className="text-xs text-content-secondary leading-relaxed whitespace-pre-wrap min-h-[60px]">
                        {existingToday.content ? (
                          existingToday.content
                        ) : (
                          <span className="italic text-content-disabled flex items-center gap-1.5">
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
                  <div className="flex items-center justify-between gap-2 text-xs text-content-muted">
                    <div className="flex items-center gap-2">
                      <Info size={16} className="shrink-0 text-content-subtle" />
                      <span>
                        {existingToday
                          ? "Editing today's entry. Update your notes and save."
                          : `Write at least a sentence (10+ characters) to earn +${JOURNAL_POINTS.entryCompleted} points.`}
                      </span>
                    </div>
                    <span className="figure text-micro text-content-muted shrink-0">
                      +{JOURNAL_POINTS.entryCompleted} pts
                    </span>
                  </div>

                  {/* Mood selector */}
                  <div>
                    <p className="label mb-2">How are you feeling today?</p>
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
                                ? 'bg-overlay-default border border-overlay-strong'
                                : 'border border-overlay-subtle hover:bg-overlay-subtle'
                            }`}
                          >
                            <Icon
                              size={26}
                              style={{ color: selected ? m.color : 'var(--color-content-muted)' }}
                              className="transition-colors"
                            />
                            <span
                              className={`text-xs font-medium transition-colors ${selected ? 'text-content-primary' : 'text-content-muted'}`}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="journal-notes" className="label mb-0 flex items-center gap-1.5 whitespace-nowrap">
                        <BookOpen size={14} className="text-content-muted" />
                        <span>Your Journal Notes</span>
                      </label>

                      {/* Prompt / Free Write Toggle */}
                      <Tabs
                        ariaLabel="Journal writing mode"
                        variant="segmented"
                        size="sm"
                        value={showGuidedPrompt ? 'guided' : 'free'}
                        onChange={(id) => toggleGuidedPrompt(id === 'guided')}
                        items={[
                          { id: 'guided', label: 'Guided Prompt', icon: Sparkles },
                          { id: 'free', label: 'Free Write' },
                        ]}
                      />
                    </div>

                    {/* GUIDED PROMPT CARD (Visible when toggle is ON) */}
                    {showGuidedPrompt && (
                      <div className="p-3.5 rounded-xl border border-overlay-default space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-content-muted">
                            {currentDailyPrompt.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPromptOffset((prev) => prev + 1)}
                            className={`text-xs text-content-muted hover:text-content-primary flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-overlay-subtle transition-all ${TAP_TARGET}`}
                            title="Show another prompt"
                          >
                            <RotateCcw size={12} />
                            <span>Shuffle Prompt</span>
                          </button>
                        </div>
                        <p className="font-serif italic text-base sm:text-lg text-content-primary leading-snug">
                          "{currentDailyPrompt.prompt}"
                        </p>
                      </div>
                    )}

                    {/* Textarea Input */}
                    <div className="relative">
                      <textarea
                        id="journal-notes"
                        dir="auto"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={
                          showGuidedPrompt
                            ? "Write your answer or thoughts to the prompt above..."
                            : "What happened today? What are you grateful for? What could be better?"
                        }
                        className="input min-h-[140px] resize-y leading-relaxed text-content-primary placeholder:text-content-disabled font-sans caret-primary-500"
                      />
                    </div>

                    {/* Inline Validation Helper */}
                    <div className="flex items-center justify-between text-xs pt-1 px-1">
                      <div className="flex items-center gap-1.5">
                        {trimmedContent.length === 0 ? (
                          <span className="text-content-muted flex items-center gap-1">
                            <HelpCircle size={13} className="text-content-muted" />
                            Write at least {MIN_JOURNAL_CONTENT_LENGTH} characters to save today's reflection.
                          </span>
                        ) : !hasEnoughContent ? (
                          <span className="text-warning-text flex items-center gap-1 font-medium animate-fade-in">
                            <AlertCircle size={13} className="text-warning-text" />
                            Write a bit more before saving — {charsNeeded} more {charsNeeded === 1 ? 'character' : 'characters'} needed.
                          </span>
                        ) : (
                          <span className="text-content-secondary flex items-center gap-1 font-medium animate-fade-in">
                            <CheckCircle2 size={13} className="text-success-text" />
                            Ready to save ({trimmedContent.length} characters) • +{JOURNAL_POINTS.entryCompleted} pts
                          </span>
                        )}
                      </div>

                      <span className={`text-micro figure ${hasEnoughContent ? 'text-success-text' : 'text-content-muted'}`}>
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
                      className={`btn flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all shadow-sm ${
                        hasEnoughContent
                          ? 'btn-primary'
                          : 'bg-overlay-subtle text-content-disabled cursor-not-allowed'
                      }`}
                      title={!hasEnoughContent ? `Write at least ${MIN_JOURNAL_CONTENT_LENGTH} characters to enable saving` : ''}
                    >
                      {isSaving ? (
                        <AscendLoadingIndicator size="sm" />
                      ) : (
                        <Save size={16} className={hasEnoughContent ? 'text-on-brand' : 'text-content-disabled'} />
                      )}
                      <span>
                        {isSaving
                          ? 'Saving...'
                          : existingToday
                          ? 'Update Entry'
                          : `Save Today's Entry (+${JOURNAL_POINTS.entryCompleted} pts)`}
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
            <div ref={moodCardRef} className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="section-title flex items-center gap-2">
                    <TrendingUp size={16} className="text-content-subtle" />
                    Mood Trend & Overview
                  </h2>
                  <p className="text-xs text-content-disabled mt-0.5">
                    Emotional awareness trajectory mapped across your reflections
                  </p>
                </div>

                {/* 7D vs 30D Time Range Switcher */}
                <Tabs
                  ariaLabel="Mood chart range"
                  variant="segmented"
                  size="sm"
                  value={chartRange}
                  onChange={(id) => setChartRange(id as typeof chartRange)}
                  items={[
                    { id: '7d', label: 'Last 7 Days' },
                    { id: '30d', label: 'Last 30 Days' },
                  ]}
                />
              </div>

              {/* Empty State vs Active Trend Chart */}
              {!hasEnoughDataForTrend ? (
                <EmptyState
                  surface={false}
                  icon={TrendingUp}
                  title="Not enough data yet"
                  description="Keep journaling for a couple of days to unlock your interactive mood trend graph and emotional awareness insights."
                />
              ) : (
                <div className="space-y-4 animate-fade-in">
                  {/* Interactive SVG Trend Chart */}
                  <div className="relative pt-2 pb-2">
                    {/* Y-Axis scale indicators & subtle horizontal gridlines */}
                    <div className="relative h-44 p-4 flex flex-col justify-between overflow-hidden">
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
                            <span className="text-2xs text-content-muted truncate">
                              {row.label}
                            </span>
                          </div>
                          <div className="flex-1 border-b border-overlay-subtle border-dashed" />
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
                        const firstPoint = recordedPoints[0];
                        const lastPoint = recordedPoints[recordedPoints.length - 1];
                        const areaD = pathD
                          ? `${pathD} L ${lastPoint.pixelX.toFixed(1)} ${h} L ${firstPoint.pixelX.toFixed(1)} ${h} Z`
                          : '';

                        return (
                          <div ref={chartContainerRef} className="absolute inset-0 left-24 right-4 top-4 bottom-4">
                            <svg
                              className="w-full h-full overflow-visible transition-[clip-path] duration-[900ms] ease-emphasized motion-reduce:transition-none"
                              style={{ clipPath: moodChartSeen ? 'inset(-24px)' : 'inset(-24px 100% -24px -24px)' }}
                              viewBox={`0 0 ${w} ${h}`}
                              width={w}
                              height={h}
                            >
                              {/* 0. Soft area under the trend line */}
                              {areaD && (
                                <>
                                  <defs>
                                    <linearGradient id="journal-mood-area" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                    </linearGradient>
                                  </defs>
                                  <path d={areaD} fill="url(#journal-mood-area)" className="pointer-events-none" />
                                </>
                              )}

                              {/* 1. Trend Line Path */}
                              {pathD && (
                                <path
                                  d={pathD}
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="pointer-events-none"
                                />
                              )}

                              {/* 2. Unified Native SVG Data Points (cx/cy matching pixelX/pixelY directly) */}
                              {mappedPoints.map((pt) => {
                                const hasEntry = pt.pixelY !== null && pt.score !== null && !!pt.moodMeta;
                                const cx = pt.pixelX;
                                const cy = pt.pixelY !== null ? pt.pixelY : h - 6;
                                const radius = chartRange === '7d' ? 8 : 6.5;

                                const showPoint = () => {
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
                                };

                                return (
                                  <g
                                    key={pt.dateKey}
                                    className="cursor-pointer group outline-none"
                                    tabIndex={hasEntry ? 0 : undefined}
                                    role={hasEntry ? 'button' : undefined}
                                    aria-label={hasEntry ? `${formatDateLong(pt.dateKey)}: ${pt.moodMeta?.label}` : undefined}
                                    onMouseEnter={showPoint}
                                    onFocus={showPoint}
                                    onMouseLeave={() => setHoveredChartPoint(null)}
                                    onBlur={() => setHoveredChartPoint(null)}
                                    onKeyDown={(e) => {
                                      if ((e.key === 'Enter' || e.key === ' ') && pt.entry) {
                                        e.preventDefault();
                                        setSelectedEntry(pt.entry);
                                      }
                                    }}
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
                                          fill="var(--color-bg-800)"
                                          className="transition-all duration-150 group-hover:scale-125 group-focus-visible:scale-125 origin-center"
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
                                          className="transition-all duration-150 group-hover:scale-125 group-focus-visible:scale-125 origin-center"
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
                                        fill="var(--color-content-disabled)"
                                        className="group-hover:fill-content-muted transition-colors"
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

                    {/* X-Axis Day Labels */}
                    <div className="flex justify-between items-center px-4 pl-24 font-mono text-2xs text-content-muted mt-2">
                      {chartRange === '7d' ? (
                        chartData.map((d) => (
                          <span
                            key={d.dateKey}
                            className={d.isToday ? 'text-content-primary font-medium' : 'text-content-muted'}
                          >
                            {d.shortLabel}
                          </span>
                        ))
                      ) : (
                        <>
                          <span>{chartData[0]?.label}</span>
                          <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
                          <span className="text-content-primary font-medium">Today</span>
                        </>
                      )}
                    </div>

                    {/* Hover Tooltip Card — a fixed slot, so hovering never shifts the layout */}
                    <div className="mt-2 min-h-[4.25rem]">
                    {hoveredChartPoint && hoveredChartPoint.moodMeta ? (
                      <div
                        className="p-2.5 border border-overlay-default rounded-xl space-y-1 animate-fade-in"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-content-secondary">
                            {formatDateLong(hoveredChartPoint.date)}
                          </span>
                          <span
                            className="text-xs font-medium"
                            style={{ color: hoveredChartPoint.moodMeta.color }}
                          >
                            {hoveredChartPoint.moodMeta.label}
                          </span>
                        </div>
                        <p className="text-xs text-content-muted line-clamp-2">
                          {hoveredChartPoint.entry?.content || (
                            <span className="italic text-content-disabled">Mood recorded, no notes added</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-2xs text-content-disabled pt-1">Hover, tap or tab to a day to see its entry.</p>
                    )}
                    </div>
                  </div>

                  {/* Summary Insights in Selected Period */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-overlay-subtle">
                    {MOODS.map((m) => {
                      const count = moodCountsInRange[m.value] || 0;
                      const Icon = m.icon;
                      return (
                        <div
                          key={m.value}
                          className="py-3 flex items-center gap-2.5"
                        >
                          <Icon size={16} style={{ color: m.color }} className="shrink-0" />
                          <div>
                            <span className="stat-label block">
                              {m.label}
                            </span>
                            <span className="figure text-sm text-content-primary">
                              <CountUp value={count} /> <span className="font-sans text-2xs text-content-muted font-normal">days</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Average & Consistency Footer */}
                  {averageScore && (
                    <div className="pt-3 border-t border-overlay-subtle flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-content-muted">
                        <span>Journaling Consistency:</span>
                        <span className="figure text-content-secondary">
                          {recordedPointsInRange.length} of {chartDaysCount} days ({Math.round((recordedPointsInRange.length / chartDaysCount) * 100)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-content-muted">
                        <span>Average Mood Score:</span>
                        <span className="figure text-content-secondary">
                          {averageScore} / 4.0
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        }
        aside={
          <>
            {/* JOURNAL HISTORY LIST (REDESIGNED ENTRY CARDS) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className="section-title flex items-center gap-2">
                  <Calendar size={16} className="text-content-subtle" />
                  <span>Journal History ({entries.length})</span>
                </h2>
                <span className="text-xs text-content-disabled">
                  Click any entry to view full reflection
                </span>
              </div>

              {entries.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No journal entries yet"
                  description="Write today's entry to start your journal history!"
                />
              ) : (
                <div className="card divide-y divide-overlay-subtle overflow-hidden">
                  {entries.map((entry) => {
                    const isToday = entry.date === todayKey();
                    const moodMeta = MOOD_MAP[entry.mood] || MOOD_MAP.neutral;
                    const Icon = moodMeta.icon;
                    const hasNotes = Boolean(entry.content && entry.content.trim().length > 0);

                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="enter-item p-4 w-full text-left flex items-center gap-3.5 transition-colors group cursor-pointer hover:bg-overlay-subtle"
                      >
                        <Icon size={18} style={{ color: moodMeta.color }} className="shrink-0" />

                        {/* Entry Header & Snippet */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="item-name text-sm">
                              {formatDateLong(entry.date)}
                            </span>

                            {isToday && (
                              <span className="text-2xs text-content-muted">
                                Today
                              </span>
                            )}

                            <span
                              className="text-xs font-medium"
                              style={{ color: moodMeta.color }}
                            >
                              {moodMeta.label}
                            </span>
                          </div>

                          <p className="text-xs text-content-muted mt-1 truncate">
                            {hasNotes ? (
                              entry.content
                            ) : (
                              <span className="italic text-content-muted flex items-center gap-1">
                                <Info size={12} className="text-content-muted" />
                                Mood recorded, no notes added
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Points & Action Buttons */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          {entry.pointsAwarded && (
                            <span className="figure text-xs text-success-text flex items-center gap-1">
                              <Award size={13} /> +{JOURNAL_POINTS.entryCompleted} pts
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModalEntry(entry);
                            }}
                            className={`text-content-subtle hover:text-rose-theme p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
                            title="Delete Journal Entry"
                            aria-label="Delete journal entry"
                          >
                            <Trash2 size={16} />
                          </button>

                          <ChevronRight
                            size={16}
                            className="text-content-subtle group-hover:text-content-tertiary transition-colors"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        }
      />

      {/* ENTRY DETAIL MODAL */}
      <Dialog
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
              <div className="flex items-center justify-between pb-3.5 border-b border-overlay-subtle">
                <div className="flex items-center gap-3">
                  <Icon size={18} style={{ color: moodMeta.color }} className="shrink-0" />
                  <div>
                    <p className="stat-label">
                      Recorded Mood
                    </p>
                    <p className="text-sm font-medium" style={{ color: moodMeta.color }}>
                      {moodMeta.label}
                    </p>
                  </div>
                </div>

                {selectedEntry.pointsAwarded ? (
                  <span className="figure text-xs text-success-text flex items-center gap-1.5">
                    <Award size={14} /> +{JOURNAL_POINTS.entryCompleted} pts Earned
                  </span>
                ) : (
                  <span className="text-xs text-content-disabled">
                    No points
                  </span>
                )}
              </div>

              <div>
                <h4 className="stat-label mb-2">
                  Daily Notes
                </h4>
                <div className="text-sm text-content-secondary leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {hasNotes ? (
                    selectedEntry.content
                  ) : (
                    <span className="italic text-content-disabled flex items-center gap-1.5">
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
                  className="btn-ghost text-xs text-rose-theme flex items-center gap-1.5"
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
      </Dialog>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        open={!!deleteModalEntry}
        onClose={() => setDeleteModalEntry(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (deleteModalEntry) {
            await executeDelete(async () => {
              await store.deleteJournalEntry(deleteModalEntry.id);
              setDeleteModalEntry(null);
              showSuccessToast('Entry Deleted', 'Journal entry removed successfully.', `journal_${deleteModalEntry.id}`);
            });
          }
        }}
        title="Delete Journal Entry?"
        itemName={`Journal Entry (${deleteModalEntry?.date})`}
        description={
          deleteModalEntry?.pointsAwarded
            ? `Are you sure you want to delete your journal entry for ${deleteModalEntry.date}? This will reverse the +${JOURNAL_POINTS.entryCompleted} points awarded.`
            : `Are you sure you want to delete your journal entry for ${deleteModalEntry?.date}?`
        }
      />
    </div>
  );
}
