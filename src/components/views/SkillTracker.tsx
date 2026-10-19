import { useState, useMemo } from 'react';
import { Clock, Flame, Plus, Target, Trash2 } from 'lucide-react';
import { AppStore, CLEAR_SKILL_LOGS_MAX } from '@/lib/store';
import { ledgerPointsByDay } from '@/lib/ledgerDayPoints';
import { isRetiredAppSkillAward } from '@/lib/skillAwards';
import { ptsText } from '@/lib/leagues';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Skill, SkillLevel, SkillSessionLog } from '@/types';
import { todayKey, formatDateLong, getNow, startOfWeek, calculateStreak, weekKey, formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { SKILLS_POINTS, calculateSkillPoints } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, Form, Input, NumberField, PageColumns, ProgressBar, Select, Textarea, useFormController } from '@/components/ui/primitives';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { nameTaken } from '@/lib/uniqueNames';

const DAYS_PAGE = 7;
const QUICK_MINUTES = [45, 60, 120, 180];
const quickLabel = (m: number) => (m >= 120 && m % 60 === 0 ? `${m / 60} hrs` : `${m} min`);

/** Level thresholds in practice hours (beginner → intermediate → advanced → expert). */
const LEVELS: { level: SkillLevel; below: number | null; next: string | null }[] = [
  { level: 'beginner', below: 10, next: 'Intermediate' },
  { level: 'intermediate', below: 25, next: 'Advanced' },
  { level: 'advanced', below: 50, next: 'Expert' },
  { level: 'expert', below: null, next: null },
];

const LEVEL_BADGE: Record<SkillLevel, string> = {
  beginner: 'badge-emerald',
  intermediate: 'badge-blue',
  advanced: 'badge-purple',
  expert: 'badge-amber',
};

const minutesOf = (l: SkillSessionLog): number =>
  typeof l.durationMinutes === 'number' && Number.isFinite(l.durationMinutes) ? l.durationMinutes : 0;

const formatHours = (minutes: number): string => `${(Math.round(minutes / 6) / 10).toFixed(1)} hrs`;

function levelOf(minutes: number) {
  const hours = minutes / 60;
  const index = LEVELS.findIndex((l) => l.below === null || hours < l.below);
  const current = LEVELS[index];
  const from = index > 0 ? (LEVELS[index - 1].below as number) : 0;
  const progress = current.below === null ? 100 : Math.min(100, ((hours - from) / (current.below - from)) * 100);
  const text =
    current.below === null ? `${hours.toFixed(1)} hrs, top level` : `${hours.toFixed(1)}/${current.below} hrs to ${current.next}`;
  return { level: current.level, progress, text };
}

export function SkillTracker({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [deleteModalSkill, setDeleteModalSkill] = useState<Skill | null>(null);
  const [deleteModalLog, setDeleteModalLog] = useState<SkillSessionLog | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [daysShown, setDaysShown] = useState(DAYS_PAGE);

  // Form states
  const [skillName, setSkillName] = useState('');
  const [category, setCategory] = useState('');
  const [logSkillId, setLogSkillId] = useState('');
  const [duration, setDuration] = useState(QUICK_MINUTES[0]);
  const [note, setNote] = useState('');
  const addForm = useUnsavedChanges(addModalOpen, [skillName, category]);
  const logForm = useUnsavedChanges(logModalOpen, [logSkillId, duration, note] as const, {
    key: 'skill-log',
    restore: ([s, d, n]) => {
      setLogSkillId(s);
      setDuration(d);
      setNote(n);
    },
  });
  const addIssues = useFormController();
  const logIssues = useFormController();

  const { isLoading: isLogging, executeFn: executeLog } = useAsyncAction();
  const { isLoading: isDeleting, executeFn: executeDelete } = useAsyncAction();

  const skills = store.state.skills;
  const skillLogs = store.state.skillLogs;
  // Day points come from the ledger, so deleting or clearing an earlier day's practice never
  // shows that day's points going down (they stay on the server).
  const pointsHistory = store.state.pointsHistory;
  const ledgerDayPoints = useMemo(() => ledgerPointsByDay(pointsHistory, 'skill', isRetiredAppSkillAward), [pointsHistory]);
  const today = useLocalDayKey();

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(skills.map((s) => s.category?.trim()).filter((c): c is string => Boolean(c))))],
    [skills]
  );
  // A picked category that no longer exists (its last skill deleted) or whose chips are hidden
  // (2 or fewer categories) falls back to All, so skills never hide behind a filter you can't see.
  const activeCategory = categories.length > 2 && categories.includes(selectedCategory) ? selectedCategory : 'All';
  const filteredSkills = activeCategory === 'All' ? skills : skills.filter((s) => s.category?.trim() === activeCategory);
  const nameOf = (id: string) => skills.find((s) => s.id === id)?.name || 'Skill';

  // Newest first, then grouped by day.
  const sorted = useMemo(
    () => [...skillLogs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [skillLogs]
  );
  const todayLogs = sorted.filter((l) => l.date === today);
  const earlierDays = useMemo(() => {
    const byDay = new Map<string, SkillSessionLog[]>();
    for (const l of sorted) {
      if (l.date === today) continue;
      byDay.set(l.date, [...(byDay.get(l.date) || []), l]);
    }
    return Array.from(byDay.entries());
  }, [sorted, today]);

  // Per-skill totals: logged minutes plus minutes of cleared logs, so hours and level never drop.
  const minutesBySkill = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of skills) map.set(s.id, s.clearedMinutes || 0);
    for (const l of skillLogs) if (map.has(l.skillId)) map.set(l.skillId, map.get(l.skillId)! + minutesOf(l));
    return map;
  }, [skills, skillLogs]);
  const totalMinutes = Array.from(minutesBySkill.values()).reduce((sum, m) => sum + m, 0);

  const practiceDays = lastDayKeys(7);
  const practiceMinutes = sumPerDay(skillLogs, practiceDays, (l) => l.durationMinutes);
  const practiceWeekTotal = practiceMinutes.reduce((sum, m) => sum + m, 0);

  // This week (Mon–Sun); "Clear older logs" removes everything before it, so weekly goals keep counting.
  const weekStartKey = todayKey(startOfWeek());
  const weekLogs = skillLogs.filter((l) => l.date >= weekStartKey && l.date <= today);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + minutesOf(l), 0);
  const weekActiveDays = new Set(weekLogs.map((l) => l.date)).size;
  const olderLogCount = skillLogs.filter((l) => l.date < weekStartKey).length;

  const pointsToday = todayLogs.reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
  const remainingCap = Math.max(0, SKILLS_POINTS.dailyCap - pointsToday);
  const { rawPoints: previewRaw, pointsToAward: previewPoints } = calculateSkillPoints(Math.max(0, Number(duration) || 0), remainingCap);

  const linkedSkillGoalsCount = useMemo(() => {
    if (!deleteModalSkill) return 0;
    const currentWeekKey = weekKey(getNow());
    return store.state.weeklyGoals
      .filter((doc) => doc.weekKey >= currentWeekKey)
      .reduce((n, doc) => n + doc.goals.filter((g) => g.linkedModule === 'skill' && g.linkedItemId === deleteModalSkill.id).length, 0);
  }, [deleteModalSkill, store.state.weeklyGoals]);

  // Every open starts clean.
  const openAddModal = () => {
    setSkillName('');
    setCategory('');
    setAddModalOpen(true);
  };
  const openLogModal = (skillId?: string) => {
    setLogSkillId(skillId || (skills.length === 1 ? skills[0].id : ''));
    setDuration(QUICK_MINUTES[0]);
    setNote('');
    setLogModalOpen(true);
  };

  const handleAddSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) {
      addIssues.showError('Fill in this field.', 'skill-name-input');
      return;
    }
    if (nameTaken(skillName, skills)) {
      addIssues.showError('You already have a skill with this name.', 'skill-name-input');
      return;
    }
    store.addSkill(skillName, category);
    setAddModalOpen(false);
    showSuccessToast('Skill added', skillName.trim());
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logSkillId) {
      logIssues.showError('Choose an option.', 'skill-log-skill');
      return;
    }
    if (!(duration > 0)) {
      logIssues.showError('Enter 1 or more.', 'skill-duration-input');
      return;
    }
    await executeLog(async () => {
      await store.logSkillPractice(logSkillId, Number(duration), note.trim());
      setLogModalOpen(false);
      showSuccessToast('Practice logged', previewPoints > 0 ? ptsText(previewPoints, true) : `${nameOf(logSkillId)} saved.`);
    });
  };

  const renderRow = (log: SkillSessionLog) => (
    <div key={log.id} className="enter-item p-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-overlay-subtle">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-hierarchy shrink-0">
          <Clock size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="item-name text-sm text-content-secondary truncate">
            {nameOf(log.skillId)} <span className="figure text-xs font-normal text-content-muted">{minutesOf(log)} min</span>
          </h3>
          {log.note && <p className="text-xs text-content-muted truncate">{log.note}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(log.pointsAwarded || 0) > 0 && (
          <span className="figure text-xs text-purple-hierarchy whitespace-nowrap">{ptsText(log.pointsAwarded, true)}</span>
        )}
        <button
          onClick={() => setDeleteModalLog(log)}
          aria-label="Delete practice log"
          title="Delete practice log"
          className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  const deletingTodayLog = deleteModalLog?.date === today;
  const skillHasToday = !!deleteModalSkill && todayLogs.some((l) => l.skillId === deleteModalSkill.id);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Skills</h1>
          <p className="page-subtitle">Practice what you're learning. Your hours build each skill's level.</p>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <button onClick={openAddModal} className={skills.length > 0 ? 'btn-secondary' : 'btn-primary'}>
            <Plus size={18} />
            <span>Add skill</span>
          </button>
          {skills.length > 0 && (
            <button onClick={() => openLogModal()} className="btn-primary">
              <Plus size={18} />
              <span>Log practice</span>
            </button>
          )}
        </div>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your practice today"
          ring={{
            value: pointsToday,
            max: SKILLS_POINTS.dailyCap,
            label: `Points today: ${pointsToday} of ${SKILLS_POINTS.dailyCap}`,
            center: (
              <>
                {pointsToday}
                <span className="text-sm font-medium text-content-muted">/{SKILLS_POINTS.dailyCap}</span>
              </>
            ),
            caption: 'points today',
          }}
          lead={{
            label: 'Practice this week',
            value: formatHours(weekMinutes),
            hint: `${weekActiveDays} of 7 days active`,
            valueClassName: 'text-purple-hierarchy',
          }}
          stats={[
            { label: 'Total practice', value: formatHours(totalMinutes), valueClassName: 'text-blue-theme' },
            { label: 'Skills', value: <CountUp value={skills.length} />, valueClassName: 'text-success-text' },
          ]}
          side={<CapMeterConnected state={store.state} capId="skills" bare />}
        />
      </Reveal>

      <PageColumns
        stickyAside
        aside={
          <>
            {skillLogs.length > 0 && (
              <Reveal index={1} className="card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">Last 7 days</h2>
                  <span className="figure text-xs text-content-muted">
                    <CountUp value={practiceWeekTotal} /> min
                  </span>
                </div>
                <BarChart
                  data={practiceDays.map((day, i) => ({ label: formatWeekdayShort(day), value: practiceMinutes[i] }))}
                  label={`Skill practice minutes per day, last 7 days: ${practiceWeekTotal} total`}
                  tone="purple"
                  highlightIndex={practiceDays.length - 1}
                  formatTooltip={(datum, i) => `${formatWeekdayDate(practiceDays[i])}: ${datum.value} min`}
                />
              </Reveal>
            )}
            <Disclosure title="How points work">
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  Every <span className="figure">{SKILLS_POINTS.minutesPerPoint}</span> minutes of practice ={' '}
                  <span className="figure text-success-text">1 pt</span>, up to <span className="figure">{SKILLS_POINTS.dailyCap}</span> pts a day.
                </li>
                <li>Levels: 10 hrs Intermediate, 25 hrs Advanced, 50 hrs Expert.</li>
                <li>You can only log today's practice.</li>
                <li>Deleting today's practice takes its points back. Earlier days keep their points and hours.</li>
                <li>Deleting old logs can break a skill's streak.</li>
              </ul>
            </Disclosure>
          </>
        }
      >
        {skills.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No skills yet"
            description="Add something you're learning, like coding, Spanish or guitar, then log practice to earn points."
            action={
              <button onClick={openAddModal} className="btn-primary mx-auto">
                <Plus size={18} /> Add your first skill
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <h2 className="section-title">Your skills</h2>
                {categories.length > 2 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        aria-pressed={activeCategory === cat}
                        className={cx(
                          'min-h-9 sm:min-h-0 px-2.5 py-1 rounded-lg text-xs border transition-colors',
                          activeCategory === cat
                            ? 'bg-purple-500/15 text-purple-hierarchy border-purple-500/40 font-medium'
                            : 'text-content-muted border-transparent hover:text-content-secondary hover:bg-overlay-subtle'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid-cards-lg gap-3">
                {filteredSkills.map((skill) => {
                  const minutes = minutesBySkill.get(skill.id) || 0;
                  const { level, progress, text } = levelOf(minutes);
                  const streak = calculateStreak(
                    skillLogs.filter((l) => l.skillId === skill.id).map((l) => l.date),
                    'daily'
                  );
                  const practicedToday = todayLogs.some((l) => l.skillId === skill.id);
                  return (
                    <div key={skill.id} className="card enter-item p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="item-name text-base text-content-secondary truncate">{skill.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-content-muted">
                            <span className={`badge capitalize text-2xs px-2 py-0.5 ${LEVEL_BADGE[level]}`}>{level}</span>
                            {skill.category && <span className="truncate">{skill.category}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteModalSkill(skill)}
                          aria-label={`Delete ${skill.name}`}
                          title="Delete skill"
                          className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs text-content-muted">
                          <span>{text}</span>
                          {streak > 0 && (
                            <span className="figure flex items-center gap-1 text-brand-text">
                              <Flame size={13} />
                              {streak} {streak === 1 ? 'day' : 'days'}
                            </span>
                          )}
                        </div>
                        <ProgressBar value={progress} label={`${skill.name} level progress`} tone="purple" size="sm" />
                      </div>

                      <button
                        onClick={() => openLogModal(skill.id)}
                        className={cx('w-full text-sm', practicedToday ? 'btn-secondary' : 'btn-primary')}
                      >
                        <Plus size={16} />
                        <span>{practicedToday ? 'Log more' : 'Log practice'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="section-title mb-3">Today</h2>
              {todayLogs.length === 0 ? (
                <p className="card p-4 text-sm text-content-muted">No practice logged today yet.</p>
              ) : (
                <div className="card overflow-hidden divide-y divide-overlay-subtle">{todayLogs.map(renderRow)}</div>
              )}
            </div>

            {earlierDays.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="section-title">Earlier</h2>
                  {olderLogCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setClearOpen(true)}
                      className="btn-ghost text-xs text-content-muted hover:text-rose-theme flex items-center gap-1.5 max-sm:px-2 max-sm:py-1"
                    >
                      <Trash2 size={14} /> Clear older logs
                    </button>
                  )}
                </div>
                {earlierDays.slice(0, daysShown).map(([day, list]) => {
                  const dayPoints = ledgerDayPoints.get(day) || 0;
                  return (
                    <div key={day}>
                      <div className="flex items-center justify-between mb-1.5 px-1 text-xs text-content-muted">
                        <span>{formatDateLong(day)}</span>
                        {dayPoints > 0 && <span className="figure">{ptsText(dayPoints, true)}</span>}
                      </div>
                      <div className="card overflow-hidden divide-y divide-overlay-subtle">{list.map(renderRow)}</div>
                    </div>
                  );
                })}
                {earlierDays.length > daysShown && (
                  <button type="button" onClick={() => setDaysShown((n) => n + DAYS_PAGE)} className="btn-secondary w-full">
                    Show older days
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </PageColumns>

      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        dirty={addForm.dirty}
        title="Add skill"
        footer={
          <>
            <button type="button" onClick={() => addForm.confirmDiscard(() => setAddModalOpen(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="skill-add-form" className="btn-primary">
              Add skill
            </button>
          </>
        }
      >
        <Form id="skill-add-form" onSubmit={handleAddSkillSubmit} controller={addIssues} className="space-y-4">
          <Input
            id="skill-name-input"
            label="Skill name"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            placeholder="e.g. Web development, Guitar, Spanish"
            maxLength={80}
            autoComplete="off"
          />
          <div className="space-y-2">
            <Input
              id="skill-category-input"
              label="Category"
              optional
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Technology, Music, Language"
              maxLength={40}
              autoComplete="off"
              enterKeyHint="done"
            />
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {categories.slice(1).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    aria-pressed={category.trim() === cat}
                    className={cx(
                      'min-h-9 sm:min-h-0 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                      category.trim() === cat
                        ? 'bg-purple-500/15 text-purple-hierarchy border-purple-500/40'
                        : 'text-content-muted border-overlay-subtle hover:border-overlay-strong hover:text-content-secondary'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Form>
      </Dialog>

      <Dialog
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        dirty={logForm.dirty}
        title="Log practice"
        initialFocus={logSkillId ? 'skill-duration-input' : undefined}
        preventClose={isLogging}
        footer={
          <>
            <button type="button" disabled={isLogging} onClick={() => logForm.confirmDiscard(() => setLogModalOpen(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="skill-log-form" disabled={isLogging} className="btn-primary">
              {isLogging ? <AscendLoadingIndicator size="sm" /> : null}
              <span>{isLogging ? 'Saving…' : 'Save practice'}</span>
            </button>
          </>
        }
      >
        <Form id="skill-log-form" onSubmit={handleLogSubmit} controller={logIssues} className="space-y-5">
          <Select id="skill-log-skill" label="Skill" value={logSkillId} onChange={(e) => setLogSkillId(e.target.value)}>
            <option value="" disabled>
              Choose a skill
            </option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>

          <div className="space-y-2">
            <NumberField
              id="skill-duration-input"
              label="How many minutes?"
              min={1}
              max={300}
              value={duration}
              onValueChange={setDuration}
              enterKeyHint="done"
            />
            <div className="grid grid-cols-4 gap-2">
              {QUICK_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  aria-pressed={duration === m}
                  className={cx(
                    'min-h-10 rounded-xl border text-sm font-medium transition-colors figure',
                    duration === m
                      ? 'bg-purple-500/15 border-purple-500/50 text-purple-hierarchy'
                      : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                  )}
                >
                  {quickLabel(m)}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            id="skill-note-input"
            label="What did you practice?"
            optional
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. React hooks and custom components"
            maxLength={1000}
          />

          <div className="rounded-xl p-3 text-xs text-content-muted flex items-center justify-between gap-3 border border-overlay-default">
            <span>
              {remainingCap === 0
                ? `${SKILLS_POINTS.dailyCap} pts reached today. It still saves.`
                : previewRaw > previewPoints
                  ? `Only ${ptsText(remainingCap)} left today.`
                  : 'Points to earn'}
            </span>
            <span className="figure text-purple-hierarchy shrink-0">{ptsText(previewPoints, true)}</span>
          </div>
        </Form>
      </Dialog>

      <ConfirmDeleteModal
        open={!!deleteModalSkill}
        onClose={() => setDeleteModalSkill(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteModalSkill) return;
          const target = deleteModalSkill;
          await executeDelete(async () => {
            await store.deleteSkill(target.id);
            setDeleteModalSkill(null);
            showSuccessToast('Skill deleted', `${target.name} removed.`, `skill_${target.id}`);
          });
        }}
        title="Delete skill?"
        itemName={deleteModalSkill?.name}
        description={[
          'This removes the skill and all its practice logs.',
          skillHasToday
            ? "Points from today's practice come off today's total. Earlier days keep their points."
            : 'The points you already earned stay.',
          linkedSkillGoalsCount > 0
            ? `${linkedSkillGoalsCount} linked weekly goal${linkedSkillGoalsCount > 1 ? 's' : ''} for this week and later go too.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      <ConfirmDeleteModal
        open={!!deleteModalLog}
        onClose={() => setDeleteModalLog(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteModalLog) return;
          const target = deleteModalLog;
          await executeDelete(async () => {
            await store.deleteSkillLog(target.id);
            setDeleteModalLog(null);
            showSuccessToast('Log deleted', `${nameOf(target.skillId)} practice removed.`, `skill_log_${target.id}`);
          });
        }}
        title="Delete practice log?"
        itemName={deleteModalLog ? `${nameOf(deleteModalLog.skillId)} (${minutesOf(deleteModalLog)} min)` : ''}
        description={
          deletingTodayLog
            ? "Its points and minutes come off today's total. The skill's streak may go down."
            : "The points and practice hours you earned that day stay. The skill's streak may go down."
        }
      />

      <ConfirmDeleteModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          await executeDelete(async () => {
            await store.clearSkillLogsBefore(weekStartKey);
            setClearOpen(false);
            showSuccessToast(
              'Older logs cleared',
              olderLogCount > CLEAR_SKILL_LOGS_MAX
                ? `${CLEAR_SKILL_LOGS_MAX} cleared. Tap Clear older logs again for the rest. Points, hours and levels stay.`
                : 'Your points, hours and levels stay as they were.',
              'skill_logs_cleared'
            );
          });
        }}
        title="Clear older logs?"
        itemName={
          olderLogCount > CLEAR_SKILL_LOGS_MAX
            ? `${CLEAR_SKILL_LOGS_MAX} of the ${olderLogCount} practice logs before this week`
            : `${olderLogCount} practice ${olderLogCount === 1 ? 'log' : 'logs'} before this week`
        }
        description={`The points you earned stay, and each skill keeps its hours and level. Skill streaks can break, and your session count goes down. This week's logs are kept.${
          olderLogCount > CLEAR_SKILL_LOGS_MAX ? ` Up to ${CLEAR_SKILL_LOGS_MAX} go at a time: tap again for the rest.` : ''
        }`}
        confirmText="Clear logs"
      />
    </div>
  );
}
