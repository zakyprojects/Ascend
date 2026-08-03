import { useState, useEffect } from 'react';
import { Smile, Meh, Frown, Zap, Save, Calendar, Info, Trash2, Award, ChevronRight, Edit3, X, CheckCircle2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Mood, JournalEntry } from '@/types';
import { formatDateLong, todayKey } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';

const MOODS: { value: Mood; label: string; icon: typeof Smile; color: string }[] = [
  { value: 'happy', label: 'Happy', icon: Smile, color: '#fbbf24' },
  { value: 'neutral', label: 'Neutral', icon: Meh, color: '#94a3b8' },
  { value: 'sad', label: 'Sad', icon: Frown, color: '#60a5fa' },
  { value: 'motivated', label: 'Motivated', icon: Zap, color: '#34d399' },
];

export function Journal({ store }: { store: AppStore }) {
  const existingToday = store.getTodayJournalEntry();

  const [mood, setMood] = useState<Mood>('neutral');
  const [content, setContent] = useState('');
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // Synchronize state with today's existing entry when present
  useEffect(() => {
    if (existingToday) {
      setMood(existingToday.mood);
      setContent(existingToday.content || '');
      // Default to read-only confirmation mode if an entry exists
      setIsEditingToday(false);
    } else {
      setIsEditingToday(true);
    }
  }, [existingToday?.id]);

  const handleSave = () => {
    const trimmed = content.trim();
    const wasAwarded = existingToday?.pointsAwarded ?? false;
    const willBeAwarded = trimmed.length > 0;

    store.saveJournalEntry(mood, content);

    if (willBeAwarded && !wasAwarded) {
      setSavedMessage('Entry saved! +5 points awarded 🎉');
    } else if (!willBeAwarded && wasAwarded) {
      setSavedMessage('Content cleared. Points deducted.');
    } else {
      setSavedMessage('Entry updated successfully!');
    }

    // Immediately switch back to Read-Only Confirmation View (State 2)
    setIsEditingToday(false);

    setTimeout(() => setSavedMessage(null), 3000);
  };

  const handleCancelEdit = () => {
    if (existingToday) {
      setMood(existingToday.mood);
      setContent(existingToday.content || '');
    }
    setIsEditingToday(false);
  };

  const entries = store.state.journalEntries;

  // Mood distribution counts
  const moodCounts = entries.reduce((acc, e) => {
    if (e.content) {
      acc[e.mood] = (acc[e.mood] ?? 0) + 1;
    }
    return acc;
  }, {} as Record<Mood, number>);

  const todayMoodConfig = MOODS.find((m) => m.value === (existingToday?.mood || mood)) || MOODS[1];
  const TodayMoodIcon = todayMoodConfig.icon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Journal</h1>
        <p className="text-sm text-slate-500 mt-1">Reflect on your day, build emotional awareness, and track your history</p>
      </div>

      {/* TODAY'S ENTRY CARD (TWO-STATE FLOW) */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary-400" />
            <h2 className="section-title">Today's Journal Entry</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium bg-bg-800 px-3 py-1 rounded-lg border border-white/5">
            {formatDateLong(todayKey())}
          </span>
        </div>

        {/* STATE 2: ENTRY ALREADY SAVED (READ-ONLY CONFIRMATION VIEW) */}
        {existingToday && !isEditingToday ? (
          <div className="space-y-4 animate-fade-in">
            {/* Success / Status Banner */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <CheckCircle2 size={16} />
                <span>Today's entry saved and confirmed!</span>
              </div>
              {existingToday.pointsAwarded && (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <Award size={13} /> +5 pts
                </span>
              )}
            </div>

            {/* Saved Read-Only Details */}
            <div className="p-4 bg-bg-800 rounded-xl border border-white/5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${todayMoodConfig.color}20` }}
                  >
                    <TodayMoodIcon size={18} style={{ color: todayMoodConfig.color }} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Recorded Mood</span>
                    <span className="text-xs font-bold text-slate-200">{todayMoodConfig.label}</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditingToday(true)}
                  className="px-3 py-1.5 bg-primary-500/15 hover:bg-primary-500/25 border border-primary-500/30 text-primary-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Edit3 size={14} />
                  <span>Edit Entry</span>
                </button>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">Your Journal Notes</span>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[60px]">
                  {existingToday.content || <span className="italic text-slate-500">No content recorded.</span>}
                </div>
              </div>
            </div>

            {savedMessage && (
              <p className="text-center text-xs font-semibold text-emerald-400 animate-fade-in py-1">
                {savedMessage}
              </p>
            )}
          </div>
        ) : (
          /* STATE 1: WRITING / EDITING MODE */
          <div className="space-y-4 animate-fade-in">
            {/* Status notice */}
            <div className="p-2.5 bg-primary-500/10 border border-primary-500/20 rounded-xl flex items-center gap-2 text-xs text-primary-300 font-medium">
              <Info size={14} />
              <span>
                {existingToday
                  ? 'Editing today\'s entry. Make your changes and click Update.'
                  : 'Write your thoughts for today to earn +5 points!'}
              </span>
            </div>

            {/* Mood selector */}
            <div>
              <label className="label mb-2">How are you feeling today?</label>
              <div className="grid grid-cols-4 gap-2">
                {MOODS.map((m) => {
                  const Icon = m.icon;
                  const selected = mood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMood(m.value)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all duration-200 ${
                        selected ? 'bg-bg-600 border-2 shadow-md' : 'bg-bg-700 border border-transparent hover:bg-bg-600'
                      }`}
                      style={selected ? { borderColor: m.color } : {}}
                    >
                      <Icon
                        size={24}
                        style={{ color: selected ? m.color : '#64748b' }}
                        className={selected ? 'animate-scale-in' : ''}
                      />
                      <span
                        className="text-xs font-bold"
                        style={{ color: selected ? m.color : '#64748b' }}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content input */}
            <div>
              <label className="label mb-1.5">Your Journal Notes</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What happened today? What are you grateful for? What could be better?"
                className="input min-h-[130px] resize-y leading-relaxed text-slate-100 placeholder:text-slate-500"
              />
              {existingToday?.pointsAwarded && content && !content.trim() && (
                <p className="text-[11px] text-rose-400 mt-1 font-medium">
                  Note: Erasing all text will deduct the 5 points earned for today upon saving.
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Save size={16} />
                <span>
                  {existingToday ? 'Update Entry' : 'Save Today\'s Entry (+5 pts)'}
                </span>
              </button>

              {existingToday && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-secondary px-4 py-2 text-xs flex items-center gap-1"
                >
                  <X size={14} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mood Overview */}
      {entries.length > 0 && (
        <div className="card p-5">
          <h2 className="section-title mb-3">Mood Overview</h2>
          <div className="flex items-center gap-2 h-3 rounded-full overflow-hidden bg-bg-600">
            {MOODS.map((m) => {
              const count = moodCounts[m.value] ?? 0;
              const total = entries.length;
              if (count === 0) return null;
              return (
                <div
                  key={m.value}
                  className="h-full transition-all duration-500"
                  style={{ width: `${(count / total) * 100}%`, backgroundColor: m.color }}
                  title={`${m.label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {MOODS.map((m) => {
              const count = moodCounts[m.value] ?? 0;
              if (count === 0) return null;
              const Icon = m.icon;
              return (
                <div key={m.value} className="flex items-center gap-1.5 text-xs">
                  <Icon size={14} style={{ color: m.color }} />
                  <span className="text-slate-400">{m.label}:</span>
                  <span className="text-slate-200 font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Journal History List (Always visible) */}
      <div className="space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <Calendar size={18} className="text-slate-400" />
          Journal History ({entries.length})
        </h2>

        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-400">No journal entries saved yet. Write your thoughts above to start your journal history!</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => {
              const isToday = entry.date === todayKey();
              const moodConfig = MOODS.find((m) => m.value === entry.mood) || MOODS[1];
              const Icon = moodConfig.icon;

              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="card p-4 card-hover w-full text-left flex items-center gap-3.5 transition-all group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/5"
                    style={{ backgroundColor: `${moodConfig.color}15` }}
                  >
                    <Icon size={20} style={{ color: moodConfig.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-200">
                        {formatDateLong(entry.date)}
                      </span>
                      {isToday && (
                        <span className="text-[10px] bg-primary-500/20 text-primary-300 border border-primary-500/30 px-2 py-0.5 rounded-full font-bold">
                          Today
                        </span>
                      )}
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-bg-800 text-slate-400 border border-white/5">
                        {moodConfig.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {entry.content || <span className="italic text-slate-600">No text content</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.pointsAwarded && (
                      <span className="text-xs text-emerald-400 font-display font-bold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                        +5 pts
                      </span>
                    )}
                    <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Entry Detail Modal */}
      <Modal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry ? `Journal Entry — ${formatDateLong(selectedEntry.date)}` : ''}
        maxWidth="max-w-lg"
      >
        {selectedEntry && (() => {
          const moodConfig = MOODS.find((m) => m.value === selectedEntry.mood) || MOODS[1];
          const Icon = moodConfig.icon;

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-bg-800 rounded-xl border border-white/5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${moodConfig.color}20` }}
                  >
                    <Icon size={18} style={{ color: moodConfig.color }} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Recorded Mood</p>
                    <p className="text-sm font-bold text-slate-200">{moodConfig.label}</p>
                  </div>
                </div>

                {selectedEntry.pointsAwarded ? (
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                    <Award size={14} /> +5 pts Earned
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 bg-bg-700 px-2.5 py-1 rounded-lg">
                    No points
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Content</h4>
                <div className="p-4 bg-bg-800 rounded-xl border border-white/5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {selectedEntry.content || <span className="italic text-slate-500">No content recorded for this day.</span>}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this journal entry?')) {
                      store.deleteJournalEntry(selectedEntry.id);
                      setSelectedEntry(null);
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Trash2 size={14} />
                  <span>Delete Entry</span>
                </button>

                <button
                  onClick={() => setSelectedEntry(null)}
                  className="btn-secondary text-xs px-4 py-1.5"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
