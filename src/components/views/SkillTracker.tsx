import { useState, useMemo } from 'react';
import { Target, Zap, Plus, Trash2, Clock, Award, Flame } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { Skill, SkillLevel, SkillSessionLog } from '@/types';
import { todayKey, formatDateLong, formatDateShort, getNow, getWeekDates, isYesterdayLocal, calculateStreak } from '@/lib/dates';
import { SKILLS_POINTS } from '@/lib/pointsConfig';

export function SkillTracker({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [logModalSkill, setLogModalSkill] = useState<Skill | null>(null);
  const [deleteModalSkill, setDeleteModalSkill] = useState<Skill | null>(null);
  const [deleteModalLog, setDeleteModalLog] = useState<SkillSessionLog | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);

  // Form states
  const [skillName, setSkillName] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);

  const skills = store.state.skills;
  const skillLogs = store.state.skillLogs;

  const rawCategories = useMemo(() => {
    return Array.from(
      new Set(skills.map((s) => s.category?.trim()).filter((c): c is string => Boolean(c)))
    );
  }, [skills]);

  const categories = useMemo(() => {
    return ['All', ...rawCategories];
  }, [rawCategories]);

  const categorySuggestions = useMemo(() => {
    if (!category.trim()) return rawCategories;
    return rawCategories.filter((c) =>
      c.toLowerCase().includes(category.trim().toLowerCase())
    );
  }, [rawCategories, category]);

  const filteredSkills = useMemo(() => {
    if (selectedCategory === 'All') return skills;
    return skills.filter((s) => s.category?.trim() === selectedCategory);
  }, [skills, selectedCategory]);

  const linkedSkillGoalsCount = useMemo(() => {
    if (!deleteModalSkill) return 0;
    let count = 0;
    store.state.weeklyGoals.forEach((doc) => {
      doc.goals.forEach((g) => {
        if (g.linkedModule === 'skill' && g.linkedItemId === deleteModalSkill.id) {
          count++;
        }
      });
    });
    return count;
  }, [deleteModalSkill, store.state.weeklyGoals]);

  const totalPracticeMinutes = skillLogs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const totalPracticeHours = (totalPracticeMinutes / 60).toFixed(1);

  const getEffectiveSkillLevel = (skill: Skill): {
    level: SkillLevel;
    hours: number;
    nextLevelLabel: string | null;
    targetHours: number | null;
    progressPercent: number;
    progressText: string;
  } => {
    const skillMinutes = skillLogs
      .filter((l) => l.skillId === skill.id)
      .reduce((sum, l) => sum + l.durationMinutes, 0);
    const hours = skillMinutes / 60;

    if (hours < 10) {
      const targetHours = 10;
      const progressPercent = Math.min(100, Math.max(0, (hours / targetHours) * 100));
      return {
        level: 'beginner',
        hours,
        nextLevelLabel: 'Intermediate',
        targetHours,
        progressPercent,
        progressText: `${hours.toFixed(1)}/10 hrs to Intermediate`,
      };
    }

    if (hours < 25) {
      const targetHours = 25;
      const progressPercent = Math.min(100, Math.max(0, (hours / targetHours) * 100));
      return {
        level: 'intermediate',
        hours,
        nextLevelLabel: 'Advanced',
        targetHours,
        progressPercent,
        progressText: `${hours.toFixed(1)}/25 hrs to Advanced`,
      };
    }

    if (hours < 50) {
      const targetHours = 50;
      const progressPercent = Math.min(100, Math.max(0, (hours / targetHours) * 100));
      return {
        level: 'advanced',
        hours,
        nextLevelLabel: 'Expert',
        targetHours,
        progressPercent,
        progressText: `${hours.toFixed(1)}/50 hrs to Expert`,
      };
    }

    return {
      level: 'expert',
      hours,
      nextLevelLabel: null,
      targetHours: null,
      progressPercent: 100,
      progressText: `${hours.toFixed(1)} hrs logged • Top Tier`,
    };
  };

  const getLastPracticedText = (skillId: string): string => {
    const latestLog = skillLogs.find((l) => l.skillId === skillId);
    if (!latestLog) return 'Never';

    const today = todayKey();
    if (latestLog.date === today) return 'Today';
    if (isYesterdayLocal(latestLog.date)) return 'Yesterday';

    const [tY, tM, tD] = today.split('-').map(Number);
    const todayMidnight = new Date(tY, tM - 1, tD).getTime();
    const [lY, lM, lD] = latestLog.date.split('-').map(Number);
    const logMidnight = new Date(lY, lM - 1, lD).getTime();
    const diffDays = Math.round((todayMidnight - logMidnight) / 86400000);

    if (diffDays > 1 && diffDays < 30) return `${diffDays} days ago`;
    if (diffDays >= 30 && diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} mo ago`;
    }
    return formatDateShort(latestLog.date);
  };

  const groupedHistoryLogs = useMemo(() => {
    const sliced = skillLogs.slice(0, 15);
    const today = todayKey();
    const yesterday = todayKey(new Date(getNow().getTime() - 86400000));
    const { dateStrings: thisWeekDates } = getWeekDates();

    const groups: { title: string; logs: SkillSessionLog[] }[] = [
      { title: 'Today', logs: [] },
      { title: 'Yesterday', logs: [] },
      { title: 'This Week', logs: [] },
      { title: 'Older', logs: [] },
    ];

    sliced.forEach((log) => {
      if (log.date === today) {
        groups[0].logs.push(log);
      } else if (log.date === yesterday) {
        groups[1].logs.push(log);
      } else if (thisWeekDates.includes(log.date)) {
        groups[2].logs.push(log);
      } else {
        groups[3].logs.push(log);
      }
    });

    return groups.filter((g) => g.logs.length > 0);
  }, [skillLogs]);

  const getLevelBadgeStyle = (level: SkillLevel) => {
    switch (level) {
      case 'beginner':
        return 'bg-emerald-500/15 text-success-text border-emerald-500/30';
      case 'intermediate':
        return 'badge-blue';
      case 'advanced':
        return 'badge-purple';
      case 'expert':
        return 'badge-amber';
    }
  };

  const handleAddSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    store.addSkill(skillName, category);
    setAddModalOpen(false);
    setSkillName('');
    setCategory('');
  };

  const today = todayKey();
  const skillPointsToday = useMemo(() => {
    return skillLogs
      .filter((l) => l.date === today)
      .reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
  }, [skillLogs, today]);

  const remainingSkillCap = Math.max(0, SKILLS_POINTS.dailyCap - skillPointsToday);
  const skillPreviewPoints = Math.min(
    Math.max(0, duration) * SKILLS_POINTS.pointsPerMinute,
    remainingSkillCap
  );

  const handleLogPracticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logModalSkill || duration <= 0 || !note.trim()) {
      setNoteTouched(true);
      return;
    }
    store.logSkillPractice(logModalSkill.id, Number(duration), note.trim());
    setLogModalSkill(null);
    setDuration(30);
    setNote('');
    setNoteTouched(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <Zap className="text-purple-hierarchy" size={26} />
            Skill Learning Tracker
          </h1>
          <p className="text-sm text-content-disabled mt-1">
            Build deliberate practice habits, log learning notes, and advance your skill levels
          </p>
        </div>
        <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span>Add Skill</span>
        </button>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-hierarchy shrink-0">
            <Target size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Skills Tracked</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {skills.length} <span className="text-xs font-normal text-content-muted">skills</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-theme shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Total Practice</div>
            <div className="text-xl font-display font-bold text-content-primary">
              {totalPracticeHours} <span className="text-xs font-normal text-content-muted">hours</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-success-text shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-content-disabled">Practice Sessions</div>
            <div className="text-xl font-display font-bold text-success-text">
              {skillLogs.length} <span className="text-xs font-normal text-content-muted">sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 className="section-title">Your Active Skills</h2>

          {/* Category Filter Chips */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                    selectedCategory === cat
                      ? 'bg-purple-500/20 text-purple-hierarchy border border-purple-500/40 font-semibold'
                      : 'bg-bg-800 text-content-disabled hover:text-content-muted border border-overlay-subtle'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {skills.length === 0 ? (
          <div className="card p-8 text-center">
            <Target size={32} className="mx-auto text-content-subtle mb-2" />
            <p className="text-sm font-medium text-content-muted">No skills added yet</p>
            <p className="text-xs text-content-disabled mt-1 mb-4">
              Add a skill (e.g. Coding, Spanish, Guitar, Design) to log practice sessions and earn points.
            </p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add Your First Skill
            </button>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-content-disabled">No skills found in category &ldquo;{selectedCategory}&rdquo;</p>
            <button
              onClick={() => setSelectedCategory('All')}
              className="text-xs text-purple-hierarchy hover:underline mt-2 inline-block font-medium"
            >
              Show all skills
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSkills.map((skill) => {
              const { level, hours, progressPercent, progressText } = getEffectiveSkillLevel(skill);
              const lastPracticed = getLastPracticedText(skill.id);
              const skillDates = skillLogs.filter((l) => l.skillId === skill.id).map((l) => l.date);
              const streak = calculateStreak(skillDates, 'daily');
              return (
                <div key={skill.id} className="card p-4 flex flex-col justify-between space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-content-secondary text-base">{skill.name}</h3>
                        {skill.category && <p className="text-xs text-content-disabled">{skill.category}</p>}
                      </div>
                      <button
                        onClick={() => setDeleteModalSkill(skill)}
                        className="text-content-subtle hover:text-rose-theme p-1"
                        title="Delete Skill"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className={`badge border capitalize font-semibold px-2.5 py-0.5 text-xs ${getLevelBadgeStyle(level)}`}>
                        {level}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-content-disabled">
                        {streak > 0 && (
                          <>
                            <span className="flex items-center gap-1 text-secondary-400 font-medium">
                              <Flame size={13} className="text-secondary-500" />
                              {streak} day{streak !== 1 ? 's' : ''}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{hours.toFixed(1)} hrs</span>
                        <span>•</span>
                        <span>Last: {lastPracticed}</span>
                      </div>
                    </div>

                    {/* Level Progress Bar */}
                    <div className="space-y-1 pt-0.5">
                      <div className="flex justify-between items-center text-[11px] text-content-disabled">
                        <span>{progressText}</span>
                        <span>{Math.round(progressPercent)}%</span>
                      </div>
                      <div className="w-full bg-bg-800 rounded-full h-1.5 overflow-hidden border border-overlay-subtle">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setLogModalSkill(skill);
                      setDuration(30);
                      setNote('');
                    }}
                    className="btn-primary text-xs py-2 w-full flex items-center justify-center gap-1.5 mt-1"
                  >
                    <Plus size={14} />
                    <span>Log Practice Session</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Practice Log History */}
      {skillLogs.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Practice History Log</h2>
          <div className="space-y-4">
            {groupedHistoryLogs.map((group) => (
              <div key={group.title} className="space-y-2">
                <div className="text-xs font-semibold text-content-disabled uppercase tracking-wider px-1">
                  {group.title}
                </div>
                <div className="space-y-2">
                  {group.logs.map((log) => {
                    const skill = skills.find((s) => s.id === log.skillId);
                    return (
                      <div key={log.id} className="card p-3.5 flex items-start justify-between card-hover">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-hierarchy shrink-0 mt-0.5">
                            <Clock size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-content-secondary text-sm">{skill?.name || 'Skill'}</span>
                              <span className="text-xs text-content-disabled">({log.durationMinutes} mins)</span>
                            </div>
                            {log.note && <p className="text-xs text-content-muted mt-0.5">{log.note}</p>}
                            <p className="text-[10px] text-content-disabled mt-1">{formatDateLong(log.date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="badge-purple text-xs font-bold px-2.5 py-1 rounded-full">
                            +{log.pointsAwarded} pts
                          </span>
                          <button
                            onClick={() => setDeleteModalLog(log)}
                            className="text-content-subtle hover:text-rose-theme p-1 transition-colors"
                            title="Delete Practice Session Log"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Skill Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Skill">
        <form onSubmit={handleAddSkillSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Skill Name</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. Web Development, Guitar, Spanish"
              className="input"
              required
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-content-muted mb-1">Category (Optional)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCategorySuggestionsOpen(true);
              }}
              onFocus={() => setCategorySuggestionsOpen(true)}
              onBlur={() => {
                // Short delay to allow clicking a suggestion item
                setTimeout(() => setCategorySuggestionsOpen(false), 200);
              }}
              placeholder="e.g. Technology, Music, Language"
              className="input"
            />
            {categorySuggestionsOpen && categorySuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-bg-750 border border-overlay-medium rounded-xl shadow-lg max-h-36 overflow-y-auto p-1 space-y-0.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-content-disabled px-2.5 py-1">
                  Existing Categories
                </div>
                {categorySuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCategory(sug);
                      setCategorySuggestionsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-content-secondary hover:bg-bg-600 transition-colors flex items-center justify-between"
                  >
                    <span>{sug}</span>
                    <span className="text-[10px] text-content-disabled">Select</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Add Skill
            </button>
          </div>
        </form>
      </Modal>

      {/* Log Practice Session Modal */}
      <Modal
        open={!!logModalSkill}
        onClose={() => {
          setLogModalSkill(null);
          setNoteTouched(false);
        }}
        title={`Log Practice: ${logModalSkill?.name}`}
      >
        <form onSubmit={handleLogPracticeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Practice Duration (Minutes)</label>
            <input
              type="number"
              min="1"
              max="300"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Short Note / What did you practice?</label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (noteTouched && e.target.value.trim()) setNoteTouched(false);
              }}
              placeholder="e.g. Practiced React hooks state management and custom components"
              className={`input min-h-[80px] ${noteTouched && !note.trim() ? 'border-rose-500 focus:border-rose-500' : ''}`}
            />
            {noteTouched && !note.trim() && (
              <p className="text-xs text-rose-400 mt-1">Please enter a note describing what you practiced.</p>
            )}
          </div>

          <div className="card p-3 bg-bg-800 text-xs text-content-muted flex items-center justify-between border border-overlay-subtle">
            <span>Points to earn:</span>
            <span className="font-bold text-purple-hierarchy">+{skillPreviewPoints} pts</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setLogModalSkill(null);
                setNoteTouched(false);
              }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!note.trim()}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Session
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Skill Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalSkill}
        onClose={() => setDeleteModalSkill(null)}
        onConfirm={async () => {
          if (deleteModalSkill) {
            const skillId = deleteModalSkill.id;
            await executeWithKey(`delete_skill_${skillId}`, async () => {
              store.deleteSkill(skillId);
              setDeleteModalSkill(null);
              showSuccessToast('Skill Deleted', 'Skill removed successfully.', `skill_${skillId}`);
            });
          }
        }}
        isDeleting={deleteModalSkill ? isKeyLoading(`delete_skill_${deleteModalSkill.id}`) : false}
        title="Delete Skill?"
        itemName={deleteModalSkill?.name}
        description={`Are you sure you want to delete "${deleteModalSkill?.name}"? This will remove the skill and its recorded practice history.${
          linkedSkillGoalsCount > 0
            ? ` Deleting this skill will also delete ${linkedSkillGoalsCount} linked Weekly Goal${linkedSkillGoalsCount > 1 ? 's' : ''}.`
            : ''
        }`}
      />

      {/* Confirm Delete Skill Log Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalLog}
        onClose={() => setDeleteModalLog(null)}
        onConfirm={async () => {
          if (deleteModalLog) {
            const logId = deleteModalLog.id;
            await executeWithKey(`delete_skill_log_${logId}`, async () => {
              try {
                await store.deleteSkillLog(logId);
                setDeleteModalLog(null);
                showSuccessToast('Log Deleted', 'Practice session log removed.', `skill_log_${logId}`);
              } catch (err: any) {
                showErrorToast('Delete Failed', err?.message || 'Failed to delete practice log.');
              }
            });
          }
        }}
        isDeleting={deleteModalLog ? isKeyLoading(`delete_skill_log_${deleteModalLog.id}`) : false}
        title="Delete Practice Session Log?"
        itemName={skills.find((s) => s.id === deleteModalLog?.skillId)?.name}
        description={`Are you sure you want to delete this ${deleteModalLog?.durationMinutes}-minute practice log? Any points awarded (+${deleteModalLog?.pointsAwarded || 0} pts) will be reversed.`}
      />
    </div>
  );
}
