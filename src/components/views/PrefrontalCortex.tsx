import { useState, useEffect } from 'react';
import { Timer, BrainCircuit, Scale, HeartHandshake, Target, Play, Pause, RotateCcw, Plus, CheckCircle2, Award, Calendar, Sparkles, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { todayKey, formatDateLong } from '@/lib/dates';
import { WeeklyGoalItem } from '@/types';

type PFCTab = 'focus' | 'decision' | 'emotion' | 'goals';

export function PrefrontalCortex({ store }: { store: AppStore }) {
  const [activeTab, setActiveTab] = useState<PFCTab>('focus');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
          <BrainCircuit className="text-cyan-400" size={26} />
          Prefrontal Cortex Module
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Train executive functions: deep focus sessions, decision journaling, emotion labeling, and weekly reviews
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('focus')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'focus'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Timer size={16} />
          <span>Deep Focus Timer</span>
        </button>

        <button
          onClick={() => setActiveTab('decision')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'decision'
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Scale size={16} />
          <span>Decision Journal</span>
        </button>

        <button
          onClick={() => setActiveTab('emotion')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'emotion'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <HeartHandshake size={16} />
          <span>Emotion Labeler</span>
        </button>

        <button
          onClick={() => setActiveTab('goals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'goals'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Target size={16} />
          <span>Weekly Goals & Review</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'focus' && <FocusTimerSubmodule store={store} />}
      {activeTab === 'decision' && <DecisionJournalSubmodule store={store} />}
      {activeTab === 'emotion' && <EmotionLabelerSubmodule store={store} />}
      {activeTab === 'goals' && <WeeklyGoalsSubmodule store={store} />}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. DEEP FOCUS POMODORO TIMER SUBMODULE
// ----------------------------------------------------------------------
function FocusTimerSubmodule({ store }: { store: AppStore }) {
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [taskName, setTaskName] = useState('Deep Work');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');

  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  const focusLogs = store.state.focusLogs;
  const skills = store.state.skills;

  // Weekly focus minutes
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(now.getDate() + diffToMon);
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyFocusLogs = focusLogs.filter((l) => new Date(l.date) >= startOfWeek);
  const weeklyFocusMinutes = weeklyFocusLogs.reduce((sum, l) => sum + l.durationMinutes, 0);

  // Timer Effect
  useEffect(() => {
    let timer: number | null = null;
    if (isRunning) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev > 1) return prev - 1;

          // Session Complete!
          setIsRunning(false);
          if (mode === 'focus') {
            store.logFocusSession(taskName, focusMinutes, selectedSkillId || undefined);
            setMode('break');
            return breakMinutes * 60;
          } else {
            setMode('focus');
            return focusMinutes * 60;
          }
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, mode, focusMinutes, breakMinutes, taskName, selectedSkillId, store]);

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft((mode === 'focus' ? focusMinutes : breakMinutes) * 60);
  };

  const handlePresetSelect = (focusMins: number, breakMins: number) => {
    setFocusMinutes(focusMins);
    setBreakMinutes(breakMins);
    setTimeLeft(focusMins * 60);
    setMode('focus');
    setIsRunning(false);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 shrink-0">
            <Timer size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Weekly Focus Minutes</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {weeklyFocusMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Completed Sessions</div>
            <div className="text-xl font-display font-bold text-purple-400">
              {weeklyFocusLogs.length} <span className="text-xs font-normal text-slate-400">sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Focus Timer Card */}
      <div className="card p-6 text-center space-y-6 bg-bg-800 border border-cyan-500/30 relative">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-bold text-slate-200 uppercase tracking-widest">
            {mode === 'focus' ? '🎯 Focus Session' : '☕ Rest Break'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => handlePresetSelect(25, 5)} className={`badge px-2.5 py-1 ${focusMinutes === 25 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-bg-700 text-slate-400'}`}>
              25 / 5 min
            </button>
            <button onClick={() => handlePresetSelect(50, 10)} className={`badge px-2.5 py-1 ${focusMinutes === 50 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-bg-700 text-slate-400'}`}>
              50 / 10 min
            </button>
          </div>
        </div>

        {/* Big Timer Display */}
        <div className="text-6xl sm:text-7xl font-display font-bold text-slate-100 tracking-tight my-4">
          {formatTime(timeLeft)}
        </div>

        {/* Task Tagging Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto text-left">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Task Name</label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What are you working on?"
              className="input text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Tag Skill (Optional)</label>
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className="input text-xs"
            >
              <option value="">-- Select Skill --</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Timer Control Buttons */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center gap-2 hover:from-cyan-600 hover:to-blue-700"
          >
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
            <span>{isRunning ? 'Pause' : 'Start Focus Session'}</span>
          </button>
          <button onClick={handleReset} className="btn-ghost text-xs text-slate-400 flex items-center gap-1.5 py-3">
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>

      {/* Focus History */}
      {focusLogs.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Recent Focus Sessions</h2>
          <div className="space-y-2">
            {focusLogs.slice(0, 10).map((log) => {
              const skill = skills.find((s) => s.id === log.skillId);
              return (
                <div key={log.id} className="card p-3 flex items-center justify-between card-hover text-xs">
                  <div>
                    <div className="font-semibold text-slate-200">{log.taskName}</div>
                    <div className="text-[10px] text-slate-500">
                      {formatDateLong(log.date)} • {log.durationMinutes} mins {skill ? `• ${skill.name}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                      +{log.pointsAwarded} pts
                    </span>
                    <button
                      onClick={() => store.deleteFocusLog(log.id)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                      title="Delete Focus Session Log"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. DECISION JOURNAL SUBMODULE
// ----------------------------------------------------------------------
function DecisionJournalSubmodule({ store }: { store: AppStore }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reflectModalDecision, setReflectModalDecision] = useState<any | null>(null);

  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [revisitDate, setRevisitDate] = useState(todayKey());

  const [reflectionText, setReflectionText] = useState('');

  const decisionLogs = store.state.decisionLogs;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rationale.trim()) return;
    store.addDecision(title, rationale, expectedOutcome, revisitDate);
    setModalOpen(false);
    setTitle('');
    setRationale('');
    setExpectedOutcome('');
  };

  const handleReflectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reflectModalDecision || !reflectionText.trim()) return;
    store.reflectDecision(reflectModalDecision.id, reflectionText);
    setReflectModalDecision(null);
    setReflectionText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Decision Journal</h2>
          <p className="text-xs text-slate-500">Log major decisions and revisit them to eliminate cognitive bias (+15 pts per reflection)</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus size={16} />
          <span>Log Decision</span>
        </button>
      </div>

      {decisionLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <Scale size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-400">No decisions logged yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">Log key choices, your rationale, and set a future date to review how it played out.</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            Log Your First Decision
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {decisionLogs.map((d) => (
            <div key={d.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    {d.title}
                    {d.isReflected ? (
                      <span className="badge bg-purple-500/15 text-purple-400 text-[10px]">Reflected (+15 pts)</span>
                    ) : (
                      <span className="badge bg-amber-500/15 text-amber-300 text-[10px]">Revisit: {d.revisitDate}</span>
                    )}
                  </h3>
                </div>
                <button
                  onClick={() => store.deleteDecisionLog(d.id)}
                  className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                  title="Delete Decision Journal Entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300 bg-bg-800/80 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-500 font-medium block">Why / Rationale:</span>
                  <p>{d.rationale}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Expected Outcome:</span>
                  <p>{d.expectedOutcome || 'None specified'}</p>
                </div>
              </div>

              {d.reflection ? (
                <div className="p-3 bg-purple-500/10 rounded-xl text-xs text-purple-200 border border-purple-500/20">
                  <span className="font-bold text-purple-300 block mb-1">Reflection & Learnings:</span>
                  "{d.reflection}"
                </div>
              ) : (
                <button
                  onClick={() => setReflectModalDecision(d)}
                  className="btn-secondary text-xs w-full py-1.5 flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14} className="text-purple-400" />
                  <span>Revisit & Add Reflection (+15 pts)</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log Decision Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Log New Decision">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Decision Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Switch to a new project framework"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Rationale / Why are you deciding this?</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What context, data, or assumptions led to this decision?"
              className="input min-h-[80px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Expected Outcome</label>
            <input
              type="text"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              placeholder="What do you expect will happen?"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Date to Revisit</label>
            <input
              type="date"
              value={revisitDate}
              onChange={(e) => setRevisitDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Decision
            </button>
          </div>
        </form>
      </Modal>

      {/* Reflect Modal */}
      <Modal open={!!reflectModalDecision} onClose={() => setReflectModalDecision(null)} title={`Reflect: ${reflectModalDecision?.title}`}>
        <form onSubmit={handleReflectionSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">What actually happened? What did you learn?</label>
            <textarea
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Compare the actual outcome to your expected outcome..."
              className="input min-h-[100px]"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setReflectModalDecision(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Reflection (+15 pts)
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. EMOTION LABELING TOOL SUBMODULE
// ----------------------------------------------------------------------
function EmotionLabelerSubmodule({ store }: { store: AppStore }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [emotion, setEmotion] = useState('Anxiety');
  const [customEmotion, setCustomEmotion] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [context, setContext] = useState('');

  const emotionLogs = store.state.emotionLogs;

  const COMMON_EMOTIONS = ['Anxiety', 'Frustration', 'Joy', 'Overwhelm', 'Anger', 'Pride', 'Sadness', 'Calm'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalEmotion = emotion === 'Other' ? customEmotion : emotion;
    if (!finalEmotion.trim()) return;
    store.logEmotion(finalEmotion, Number(intensity), context);
    setModalOpen(false);
    setContext('');
  };

  // Compute emotion frequency breakdown
  const emotionCounts: Record<string, number> = {};
  emotionLogs.forEach((l) => {
    emotionCounts[l.emotion] = (emotionCounts[l.emotion] || 0) + 1;
  });

  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Affect & Emotion Labeling Tool</h2>
          <p className="text-xs text-slate-500">Name feelings explicitly ("Name it to tame it") to reduce amygdala reactivity (+5 pts per entry)</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus size={16} />
          <span>Label Emotion</span>
        </button>
      </div>

      {/* Emotion Frequency Summary */}
      {sortedEmotions.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-bold text-slate-300 mb-3">Most Frequently Labeled Emotions</h3>
          <div className="flex flex-wrap gap-2">
            {sortedEmotions.map(([name, count]) => (
              <div key={name} className="badge bg-rose-500/15 text-rose-300 border border-rose-500/30 px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                <span>{name}</span>
                <span className="bg-rose-500/30 px-1.5 py-0.5 rounded-full font-bold text-[10px]">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emotion Logs List */}
      {emotionLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <HeartHandshake size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-400">No emotions labeled yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">When experiencing a strong feeling, label it explicitly to calm prefrontal reactivity.</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            Label Your First Emotion
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {emotionLogs.slice(0, 15).map((l) => (
            <div key={l.id} className="card p-3.5 flex items-center justify-between card-hover text-xs">
              <div>
                <div className="font-bold text-slate-200 flex items-center gap-2">
                  {l.emotion}
                  <span className="text-rose-400 font-mono">({l.intensity}/10)</span>
                </div>
                {l.context && <p className="text-slate-400 mt-0.5">{l.context}</p>}
                <p className="text-[10px] text-slate-500 mt-1">{formatDateLong(l.date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                  +5 pts
                </span>
                <button
                  onClick={() => store.deleteEmotionLog(l.id)}
                  className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                  title="Delete Emotion Log"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Label Strong Emotion">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Emotion</label>
            <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="input mb-2">
              {COMMON_EMOTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
              <option value="Other">Custom...</option>
            </select>
            {emotion === 'Other' && (
              <input
                type="text"
                value={customEmotion}
                onChange={(e) => setCustomEmotion(e.target.value)}
                placeholder="Enter emotion name..."
                className="input"
                required
              />
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Intensity</span>
              <span className="font-bold text-rose-400">{intensity} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Context / What triggered it?</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Work deadline pressure, argument with a peer"
              className="input min-h-[70px]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save & Label (+5 pts)
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. WEEKLY GOAL PLANNING & REVIEW SUBMODULE
// ----------------------------------------------------------------------
function WeeklyGoalsSubmodule({ store }: { store: AppStore }) {
  const currentWeekKey = '2026-W31'; // active week
  const weeklyGoals = store.state.weeklyGoals;

  const currentGoalDoc = weeklyGoals.find((w) => w.weekKey === currentWeekKey) || {
    id: '',
    weekKey: currentWeekKey,
    goals: [
      { id: '1', text: '', done: false },
      { id: '2', text: '', done: false },
      { id: '3', text: '', done: false },
    ],
    insights: '',
    isReviewed: false,
    createdAt: new Date().toISOString(),
  };

  const [goals, setGoals] = useState<WeeklyGoalItem[]>(currentGoalDoc.goals);
  const [insights, setInsights] = useState(currentGoalDoc.insights || '');
  const [isReviewed, setIsReviewed] = useState(currentGoalDoc.isReviewed);

  const handleGoalChange = (idx: number, text: string) => {
    const updated = [...goals];
    updated[idx] = { ...updated[idx], text };
    setGoals(updated);
  };

  const handleGoalToggle = (idx: number) => {
    const updated = [...goals];
    updated[idx] = { ...updated[idx], done: !updated[idx].done };
    setGoals(updated);
  };

  const handleSave = (reviewed: boolean) => {
    const validGoals = goals.filter((g) => g.text.trim().length > 0);
    store.saveWeeklyGoal(currentWeekKey, validGoals, insights, reviewed);
    if (reviewed) setIsReviewed(true);
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h2 className="section-title">Weekly Goal Planning & Sunday Review</h2>
            <p className="text-xs text-slate-500">Set 1-3 high-leverage goals for this week, review progress, and carry insights forward (+20 pts)</p>
          </div>
          <div className="flex items-center gap-2">
            {isReviewed && (
              <span className="badge bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center gap-1">
                <CheckCircle2 size={14} /> Weekly Review Completed (+20 pts)
              </span>
            )}
            {(isReviewed || goals.some((g) => g.text.trim().length > 0)) && (
              <button
                onClick={() => {
                  store.deleteWeeklyGoalDoc(currentWeekKey);
                  setGoals([
                    { id: '1', text: '', done: false },
                    { id: '2', text: '', done: false },
                    { id: '3', text: '', done: false },
                  ]);
                  setInsights('');
                  setIsReviewed(false);
                }}
                className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                title="Reset / Delete Weekly Goals & Review"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* 1-3 Weekly Goals Input */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-300">Target Priorities (1-3 Goals)</h3>
          {goals.map((g, idx) => (
            <div key={g.id || idx} className="flex items-center gap-3">
              <button
                onClick={() => handleGoalToggle(idx)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all border ${
                  g.done ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-bg-700 border-white/10 text-slate-500 hover:border-white/20'
                }`}
              >
                {g.done ? '✓' : idx + 1}
              </button>
              <input
                type="text"
                value={g.text}
                onChange={(e) => handleGoalChange(idx, e.target.value)}
                placeholder={`Weekly Goal #${idx + 1}...`}
                className={`input flex-1 text-xs ${g.done ? 'line-through text-slate-500' : ''}`}
              />
            </div>
          ))}
        </div>

        {/* Insights / Review Text */}
        <div className="pt-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">Weekly Review Insights & Reflection</label>
          <textarea
            value={insights}
            onChange={(e) => setInsights(e.target.value)}
            placeholder="What went well? What got in the way? What will you carry forward?"
            className="input min-h-[90px] text-xs"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={() => handleSave(false)} className="btn-secondary text-xs flex-1">
            Save Goals Draft
          </button>
          <button onClick={() => handleSave(true)} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1.5">
            <Sparkles size={16} />
            <span>Complete Weekly Review (+20 pts)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
