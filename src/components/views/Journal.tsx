import { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, Edit3, CheckCircle2, Sparkles, RotateCcw, BookOpen, PenLine } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Mood, JournalEntry } from '@/types';
import { formatDateLong, todayKey, calculateStreak, formatWeekdayShort, formatWeekdayDate } from '@/lib/dates';
import { JOURNAL_POINTS } from '@/lib/pointsConfig';
import { isRetiredAppJournalAward } from '@/lib/journalAwards';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { useToast } from '@/components/ui/Toast';
import { Dialog, Disclosure, EmptyState, Form, FormAlert, PageColumns, Tabs, Textarea, useFormController } from '@/components/ui/primitives';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { lastDayKeys } from '@/lib/weeklyActivity';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { getDailyPrompt } from '@/data/journalPrompts';
import { MOODS, MOOD_MAP, MoodBadge } from '@/components/journal/moods';

// Minimum non-whitespace characters to save an entry
const MIN_JOURNAL_CONTENT_LENGTH = 10;
const PROMPT_PREF_STORAGE_KEY = 'ascend_journal_prompt_mode';
const ENTRIES_PAGE = 10;

type ChartRange = '7d' | '30d';

export function Journal({ store }: { store: AppStore }) {
  const existingToday = store.getTodayJournalEntry();
  const today = todayKey();

  const [mood, setMood] = useState<Mood>('happy');
  const [content, setContent] = useState('');
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [deleteModalEntry, setDeleteModalEntry] = useState<JournalEntry | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>('7d');
  const [entriesShown, setEntriesShown] = useState(ENTRIES_PAGE);
  const [promptOffset, setPromptOffset] = useState(0);
  const [showGuidedPrompt, setShowGuidedPrompt] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PROMPT_PREF_STORAGE_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const entryForm = useUnsavedChanges(isEditingToday, [mood, content]);
  const entryIssues = useFormController();

  const toggleGuidedPrompt = (enabled: boolean) => {
    setShowGuidedPrompt(enabled);
    try {
      localStorage.setItem(PROMPT_PREF_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore local storage errors
    }
  };

  // Keep the editor in step with today's saved entry. Unsaved typing is kept when a sync lands
  // mid-edit (saving then wins); a different entry for today (another device) closes the editor.
  const entryDirtyRef = useRef(false);
  entryDirtyRef.current = entryForm.dirty;
  const shownEntryIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (entryDirtyRef.current) return;
    const sameEntry = shownEntryIdRef.current === existingToday?.id;
    shownEntryIdRef.current = existingToday?.id;
    if (existingToday) {
      setMood(existingToday.mood);
      setContent(existingToday.content || '');
      if (!sameEntry) setIsEditingToday(false);
    } else {
      setIsEditingToday(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingToday?.id, existingToday?.createdAt, existingToday?.content, existingToday?.mood]);

  const { showSuccessToast } = useToast();
  const { isLoading: isSaving, executeFn: executeSave } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const trimmedContent = content.trim();
  const hasEnoughContent = trimmedContent.length >= MIN_JOURNAL_CONTENT_LENGTH;
  const prompt = getDailyPrompt(today, promptOffset);

  const handleSave = async () => {
    if (!hasEnoughContent) return; // validate() shows why at the notes field
    try {
      await executeSave(async () => {
        const wasAwarded = existingToday?.pointsAwarded ?? false;
        await store.saveJournalEntry(mood, content);
        showSuccessToast(
          wasAwarded ? 'Journal updated' : 'Journal saved',
          wasAwarded ? 'Your entry has been updated.' : `+${JOURNAL_POINTS.entryCompleted} points for today's entry.`
        );
      });
      setIsEditingToday(false);
    } catch (err: unknown) {
      entryIssues.showError(toUserMessage(err, "Couldn't save your entry. Try again."));
    }
  };

  const handleCancelEdit = () =>
    entryForm.confirmDiscard(() => {
      if (existingToday) {
        setMood(existingToday.mood);
        setContent(existingToday.content || '');
      }
      setIsEditingToday(false);
    });

  const entries = store.state.journalEntries;
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [entries]
  );
  const earlier = sorted.filter((e) => e.date !== today);
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);

  // Hero numbers (live). Points come from the points ledger, so deleting an older entry never
  // lowers them: that day's points stay on the server.
  const entryDates = entries.map((e) => e.date);
  const journalStreak = calculateStreak(entryDates, 'daily');
  const last7Keys = lastDayKeys(7);
  const writtenLast7 = last7Keys.filter((k) => byDate.has(k)).length;
  const journalPoints = useMemo(
    () =>
      store.state.pointsHistory
        .filter((e) => e.source === 'journal' && !isRetiredAppJournalAward(e))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [store.state.pointsHistory]
  );

  // Mood over the chosen range: one cell per day.
  const rangeKeys = lastDayKeys(chartRange === '7d' ? 7 : 30);
  const rangeEntries = rangeKeys.map((k) => byDate.get(k)).filter((e): e is JournalEntry => !!e);
  const moodCounts = rangeEntries.reduce((acc, e) => {
    acc[e.mood] = (acc[e.mood] || 0) + 1;
    return acc;
  }, {} as Partial<Record<Mood, number>>);
  const averageScore =
    rangeEntries.length > 0
      ? (rangeEntries.reduce((sum, e) => sum + (MOOD_MAP[e.mood]?.score || 0), 0) / rangeEntries.length).toFixed(1)
      : null;

  const renderRow = (entry: JournalEntry) => {
    const hasNotes = Boolean(entry.content && entry.content.trim().length > 0);
    return (
      <div key={entry.id} className="enter-item flex items-center gap-1 transition-colors hover:bg-overlay-subtle">
        <button
          type="button"
          onClick={() => setSelectedEntry(entry)}
          className="flex-1 min-w-0 p-3.5 pr-1 text-left flex items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="item-name text-sm text-content-secondary">{formatDateLong(entry.date)}</span>
              <MoodBadge mood={entry.mood} />
            </div>
            <p className="text-xs text-content-muted mt-1 truncate">{hasNotes ? entry.content : 'Mood only, no notes'}</p>
          </div>
          {entry.pointsAwarded && (
            <span className="figure text-xs text-purple-hierarchy whitespace-nowrap shrink-0">+{JOURNAL_POINTS.entryCompleted} pts</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDeleteModalEntry(entry)}
          aria-label="Delete journal entry"
          title="Delete journal entry"
          className={`mr-2.5 p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-colors shrink-0 ${TAP_TARGET}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  };

  const deletingToday = deleteModalEntry?.date === today;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal</h1>
          <p className="page-subtitle">Write a few lines each day and see how your mood moves.</p>
        </div>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your journal"
          ring={{ value: writtenLast7, max: 7, label: `Written on ${writtenLast7} of the last 7 days`, center: writtenLast7, caption: 'of 7 days' }}
          lead={{ label: 'Journal streak', value: <CountUp value={journalStreak} />, hint: journalStreak === 1 ? 'day in a row' : 'days in a row', valueClassName: 'text-warning-text' }}
          stats={[
            { label: 'Entries', value: <CountUp value={entries.length} />, valueClassName: 'text-brand-text' },
            { label: 'Points earned', value: <>+<CountUp value={Math.max(0, journalPoints)} /></>, valueClassName: 'text-purple-hierarchy' },
          ]}
          side={<CapMeterConnected state={store.state} capId="journal" bare />}
        />
      </Reveal>

      <PageColumns
        stickyAside
        aside={
          <>
            <Reveal index={1} className="card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">Mood</h2>
                <Tabs
                  ariaLabel="Mood range"
                  variant="segmented"
                  size="sm"
                  value={chartRange}
                  onChange={(id) => setChartRange(id as ChartRange)}
                  items={[
                    { id: '7d', label: '7 days' },
                    { id: '30d', label: '30 days' },
                  ]}
                />
              </div>

              <div
                className={cx('grid gap-1.5', chartRange === '7d' ? 'grid-cols-7' : 'grid-cols-10')}
                role="list"
                aria-label={`Mood per day, last ${rangeKeys.length} days`}
              >
                {rangeKeys.map((k) => {
                  const entry = byDate.get(k);
                  const meta = entry ? MOOD_MAP[entry.mood] || MOOD_MAP.neutral : null;
                  const Icon = meta?.icon;
                  const name = `${formatWeekdayDate(k)}: ${meta ? meta.label : 'no entry'}`;
                  return (
                    <div key={k} role="listitem" className="flex flex-col items-center gap-1" title={name} aria-label={name}>
                      <button
                        type="button"
                        disabled={!entry}
                        onClick={() => entry && setSelectedEntry(entry)}
                        className={cx(
                          'w-full aspect-square rounded-lg flex items-center justify-center border transition-colors',
                          meta ? 'hover:brightness-110' : 'border-dashed border-overlay-default',
                          k === today && 'ring-1 ring-primary-500/50'
                        )}
                        style={meta ? { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}40`, color: meta.color } : undefined}
                        aria-label={name}
                      >
                        {Icon && <Icon size={chartRange === '7d' ? 16 : 13} />}
                      </button>
                      {chartRange === '7d' && <span className="text-2xs text-content-muted">{formatWeekdayShort(k)}</span>}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-3 border-t border-overlay-subtle">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const count = moodCounts[m.value] || 0;
                  return (
                    <div key={m.value} className="flex items-center gap-2 text-xs">
                      <Icon size={14} style={{ color: m.color }} />
                      <span className="text-content-muted">{m.label}</span>
                      <span className="figure ml-auto text-content-secondary">
                        {count} {count === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-content-muted pt-3 border-t border-overlay-subtle">
                <span>
                  Written <span className="figure text-content-secondary">{rangeEntries.length}</span> of {rangeKeys.length} days
                </span>
                {averageScore && (
                  <span>
                    Average <span className="figure text-content-secondary">{averageScore}</span> / 4
                  </span>
                )}
              </div>
            </Reveal>

            <Disclosure title="How points work">
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  Today's entry with at least {MIN_JOURNAL_CONTENT_LENGTH} characters ={' '}
                  <span className="figure text-success-text">+{JOURNAL_POINTS.entryCompleted} pts</span>, once a day.
                </li>
                <li>You can write and edit only today's entry.</li>
                <li>Deleting today's entry takes its points back. Earlier days keep their points.</li>
                <li>Deleting an entry can break your streak and removes that day from your mood.</li>
              </ul>
            </Disclosure>
          </>
        }
      >
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="section-title">Today</h2>
              <span className="text-xs text-content-muted">{formatDateLong(today)}</span>
            </div>

            {existingToday && !isEditingToday ? (
              <div className="space-y-4 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-success-text" />
                    <span className="text-sm text-content-secondary">Today's entry is saved</span>
                    <MoodBadge mood={existingToday.mood} />
                  </div>
                  <div className="flex items-center gap-2">
                    {existingToday.pointsAwarded && (
                      <span className="figure text-xs text-purple-hierarchy">+{JOURNAL_POINTS.entryCompleted} pts</span>
                    )}
                    <button type="button" onClick={() => setIsEditingToday(true)} className="btn-secondary text-xs px-3 py-1.5">
                      <Edit3 size={14} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-content-secondary leading-relaxed whitespace-pre-wrap" dir="auto">
                  {existingToday.content || <span className="text-content-muted">Mood only, no notes</span>}
                </p>
              </div>
            ) : (
              <Form
                onSubmit={handleSave}
                controller={entryIssues}
                alert="manual"
                validate={() =>
                  hasEnoughContent
                    ? null
                    : { message: `Write at least ${MIN_JOURNAL_CONTENT_LENGTH} characters. One sentence is enough.`, field: 'journal-notes' }
                }
                className="space-y-5 animate-fade-in"
              >
                <div>
                  <p className="label mb-2">How are you feeling?</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MOODS.map((m) => {
                      const Icon = m.icon;
                      const selected = mood === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMood(m.value)}
                          aria-pressed={selected}
                          className={cx(
                            'flex items-center justify-center gap-2 min-h-11 px-2 rounded-xl border text-sm font-medium transition-colors',
                            !selected && 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                          )}
                          style={selected ? { borderColor: m.color, backgroundColor: `${m.color}15`, color: m.color } : undefined}
                        >
                          <Icon size={18} />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Tabs
                    ariaLabel="Journal writing mode"
                    variant="segmented"
                    size="sm"
                    value={showGuidedPrompt ? 'guided' : 'free'}
                    onChange={(id) => toggleGuidedPrompt(id === 'guided')}
                    items={[
                      { id: 'guided', label: 'Guided prompt', icon: Sparkles },
                      { id: 'free', label: 'Free write' },
                    ]}
                  />
                  {showGuidedPrompt && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-overlay-default p-3.5 animate-fade-in">
                      <div className="space-y-1.5 min-w-0">
                        <span className={`badge text-2xs px-2 py-0.5 ${prompt.categoryColor}`}>{prompt.category}</span>
                        <p className="text-sm font-medium text-content-primary leading-snug">{prompt.prompt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPromptOffset((n) => n + 1)}
                        className={`shrink-0 text-xs text-content-muted hover:text-brand-text flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-overlay-subtle transition-colors ${TAP_TARGET}`}
                        title="Show another prompt"
                      >
                        <RotateCcw size={12} />
                        <span>Shuffle</span>
                      </button>
                    </div>
                  )}
                  <Textarea
                    id="journal-notes"
                    label="Notes"
                    dir="auto"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={showGuidedPrompt ? 'Write your answer to the prompt…' : 'What happened today? What went well? What could be better?'}
                    className="min-h-[160px] resize-y leading-relaxed"
                  />
                  <div className="flex justify-end text-xs">
                    <span className={cx('figure', hasEnoughContent ? 'text-success-text' : 'text-content-muted')}>
                      {hasEnoughContent
                        ? `${trimmedContent.length} characters`
                        : `${MIN_JOURNAL_CONTENT_LENGTH - trimmedContent.length} more to save`}
                    </span>
                  </div>
                </div>

                <FormAlert />

                <div className="flex items-center gap-2.5">
                  {existingToday && (
                    <button type="button" onClick={handleCancelEdit} disabled={isSaving} className="btn-secondary">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={isSaving} className="btn-primary flex-1">
                    {isSaving ? <AscendLoadingIndicator size="sm" /> : <PenLine size={16} />}
                    <span>
                      {isSaving
                        ? 'Saving…'
                        : existingToday
                          ? 'Save changes'
                          : `Save entry (+${JOURNAL_POINTS.entryCompleted} pts)`}
                    </span>
                  </button>
                </div>
              </Form>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="section-title">Earlier</h2>
            {earlier.length === 0 ? (
              <EmptyState icon={BookOpen} title="No earlier entries yet" description="Your past entries show here, newest first." />
            ) : (
              <>
                <div className="card overflow-hidden divide-y divide-overlay-subtle">{earlier.slice(0, entriesShown).map(renderRow)}</div>
                {earlier.length > entriesShown && (
                  <button type="button" onClick={() => setEntriesShown((n) => n + ENTRIES_PAGE)} className="btn-secondary w-full">
                    Show older entries
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </PageColumns>

      <Dialog
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry ? formatDateLong(selectedEntry.date) : ''}
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                const target = selectedEntry;
                setSelectedEntry(null);
                setDeleteModalEntry(target);
              }}
              className="btn-danger sm:mr-auto"
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
            <button type="button" onClick={() => setSelectedEntry(null)} className="btn-secondary">
              Close
            </button>
          </>
        }
      >
        {selectedEntry && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-overlay-subtle">
              <MoodBadge mood={selectedEntry.mood} />
              <span className="figure text-xs text-content-muted">
                {selectedEntry.pointsAwarded ? (
                  <span className="text-purple-hierarchy">+{JOURNAL_POINTS.entryCompleted} pts</span>
                ) : (
                  'No points'
                )}
              </span>
            </div>
            <p className="text-sm text-content-secondary leading-relaxed whitespace-pre-wrap min-h-[100px]" dir="auto">
              {selectedEntry.content?.trim() ? selectedEntry.content : <span className="text-content-muted">Mood only, no notes</span>}
            </p>
          </div>
        )}
      </Dialog>

      <ConfirmDeleteModal
        open={!!deleteModalEntry}
        onClose={() => setDeleteModalEntry(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteModalEntry) return;
          const target = deleteModalEntry;
          await executeDelete(async () => {
            await store.deleteJournalEntry(target.id);
            setDeleteModalEntry(null);
            showSuccessToast('Entry deleted', formatDateLong(target.date), `journal_${target.id}`);
          });
        }}
        title="Delete journal entry?"
        itemName={deleteModalEntry ? formatDateLong(deleteModalEntry.date) : ''}
        description={[
          'Your writing for this day is deleted for good.',
          deleteModalEntry?.pointsAwarded
            ? deletingToday
              ? `Today's +${JOURNAL_POINTS.entryCompleted} points come off.`
              : 'The points you earned that day stay.'
            : '',
          deletingToday
            ? 'Your journal streak may go down.'
            : 'Your journal streak can break, and the day leaves your mood chart.',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  );
}
