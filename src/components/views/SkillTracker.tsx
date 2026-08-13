import { useState, useMemo } from 'react';
import { Target, Zap, Plus, Trash2, Clock, Award, ChevronRight, Edit3 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Skill, SkillLevel, SkillSessionLog } from '@/types';
import { todayKey, formatDateLong } from '@/lib/dates';

export function SkillTracker({ store }: { store: AppStore }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [logModalSkill, setLogModalSkill] = useState<Skill | null>(null);
  const [editLevelSkill, setEditLevelSkill] = useState<Skill | null>(null);
  const [deleteModalSkill, setDeleteModalSkill] = useState<Skill | null>(null);
  const [deleteModalLog, setDeleteModalLog] = useState<SkillSessionLog | null>(null);

  // Form states
  const [skillName, setSkillName] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState('');
  const [manualLevel, setManualLevel] = useState<SkillLevel>('beginner');

  const skills = store.state.skills;
  const skillLogs = store.state.skillLogs;

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

  const getEffectiveSkillLevel = (skill: Skill): { level: SkillLevel; hours: number; isManual: boolean } => {
    const skillMinutes = skillLogs
      .filter((l) => l.skillId === skill.id)
      .reduce((sum, l) => sum + l.durationMinutes, 0);
    const hours = skillMinutes / 60;

    if (skill.manualLevel) {
      return { level: skill.manualLevel, hours, isManual: true };
    }

    if (hours < 10) return { level: 'beginner', hours, isManual: false };
    if (hours < 50) return { level: 'intermediate', hours, isManual: false };
    return { level: 'advanced', hours, isManual: false };
  };

  const getLevelBadgeStyle = (level: SkillLevel) => {
    switch (level) {
      case 'beginner':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'intermediate':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'advanced':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
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

  const handleLogPracticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logModalSkill || duration <= 0) return;
    store.logSkillPractice(logModalSkill.id, Number(duration), note);
    setLogModalSkill(null);
    setDuration(30);
    setNote('');
  };

  const handleLevelUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLevelSkill) return;
    store.updateSkillLevel(editLevelSkill.id, manualLevel);
    setEditLevelSkill(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <Zap className="text-purple-400" size={26} />
            Skill Learning Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
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
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
            <Target size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Skills Tracked</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {skills.length} <span className="text-xs font-normal text-slate-400">skills</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Practice</div>
            <div className="text-xl font-display font-bold text-slate-100">
              {totalPracticeHours} <span className="text-xs font-normal text-slate-400">hours</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <Award size={22} />
          </div>
          <div>
            <div className="text-xs text-slate-500">Practice Sessions</div>
            <div className="text-xl font-display font-bold text-emerald-400">
              {skillLogs.length} <span className="text-xs font-normal text-slate-400">sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      <div>
        <h2 className="section-title mb-3">Your Active Skills</h2>

        {skills.length === 0 ? (
          <div className="card p-8 text-center">
            <Target size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No skills added yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Add a skill (e.g. Coding, Spanish, Guitar, Design) to log practice sessions and earn points.</p>
            <button onClick={() => setAddModalOpen(true)} className="btn-primary mx-auto">
              Add Your First Skill
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skills.map((skill) => {
              const { level, hours, isManual } = getEffectiveSkillLevel(skill);
              return (
                <div key={skill.id} className="card p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-200 text-base">{skill.name}</h3>
                        {skill.category && <p className="text-xs text-slate-500">{skill.category}</p>}
                      </div>
                      <button
                        onClick={() => setDeleteModalSkill(skill)}
                        className="text-slate-600 hover:text-rose-400 p-1"
                        title="Delete Skill"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className={`badge border capitalize font-semibold px-2.5 py-0.5 text-xs ${getLevelBadgeStyle(level)}`}>
                        {level} {isManual ? '(Manual)' : ''}
                      </span>
                      <button
                        onClick={() => {
                          setEditLevelSkill(skill);
                          setManualLevel(level);
                        }}
                        className="text-slate-500 hover:text-slate-300 p-1"
                        title="Set level manually"
                      >
                        <Edit3 size={13} />
                      </button>
                      <span className="text-xs text-slate-500 ml-auto">{hours.toFixed(1)} hrs practiced</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setLogModalSkill(skill);
                      setDuration(30);
                      setNote('');
                    }}
                    className="btn-primary text-xs py-2 w-full flex items-center justify-center gap-1.5"
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
          <div className="space-y-2.5">
            {skillLogs.slice(0, 15).map((log) => {
              const skill = skills.find((s) => s.id === log.skillId);
              return (
                <div key={log.id} className="card p-3.5 flex items-start justify-between card-hover">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-sm">{skill?.name || 'Skill'}</span>
                        <span className="text-xs text-slate-500">({log.durationMinutes} mins)</span>
                      </div>
                      {log.note && <p className="text-xs text-slate-400 mt-0.5">{log.note}</p>}
                      <p className="text-[10px] text-slate-500 mt-1">{formatDateLong(log.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
                      +{log.pointsAwarded} pts
                    </span>
                    <button
                      onClick={() => setDeleteModalLog(log)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
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
      )}

      {/* Add Skill Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Skill">
        <form onSubmit={handleAddSkillSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Skill Name</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. Web Development, Guitar, Spanish"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Category (Optional)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Technology, Music, Language"
              className="input"
            />
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
      <Modal open={!!logModalSkill} onClose={() => setLogModalSkill(null)} title={`Log Practice: ${logModalSkill?.name}`}>
        <form onSubmit={handleLogPracticeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Practice Duration (Minutes)</label>
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Short Note / What did you practice?</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Practiced React hooks state management and custom components"
              className="input min-h-[80px]"
            />
          </div>

          <div className="card p-3 bg-bg-800 text-xs text-slate-400 flex items-center justify-between border border-white/5">
            <span>Points to earn:</span>
            <span className="font-bold text-purple-400">+{Math.min(duration, 60)} pts</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setLogModalSkill(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Session
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Level Modal */}
      <Modal open={!!editLevelSkill} onClose={() => setEditLevelSkill(null)} title={`Set Skill Level: ${editLevelSkill?.name}`}>
        <form onSubmit={handleLevelUpdateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Select Skill Level</label>
            <div className="grid grid-cols-3 gap-2">
              {(['beginner', 'intermediate', 'advanced'] as SkillLevel[]).map((lvl) => (
                <button
                  type="button"
                  key={lvl}
                  onClick={() => setManualLevel(lvl)}
                  className={`p-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                    manualLevel === lvl
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-bg-700 border-white/10 text-slate-400 hover:bg-bg-600'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setEditLevelSkill(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Update Level
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Skill Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalSkill}
        onClose={() => setDeleteModalSkill(null)}
        onConfirm={() => {
          if (deleteModalSkill) {
            store.deleteSkill(deleteModalSkill.id);
            setDeleteModalSkill(null);
          }
        }}
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
        onConfirm={() => {
          if (deleteModalLog) {
            store.deleteSkillLog(deleteModalLog.id);
            setDeleteModalLog(null);
          }
        }}
        title="Delete Practice Session Log?"
        itemName={skills.find((s) => s.id === deleteModalLog?.skillId)?.name}
        description={`Are you sure you want to delete this ${deleteModalLog?.durationMinutes}-minute practice log? Any points awarded (+${deleteModalLog?.pointsAwarded || 0} pts) will be reversed.`}
      />
    </div>
  );
}
