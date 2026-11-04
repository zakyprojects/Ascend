import { useState, useMemo } from 'react';
import { Clock, Flame, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { AppStore, CLEAR_SKILL_LOGS_MAX } from '@/lib/store';
import { ledgerPointsByDay } from '@/lib/ledgerDayPoints';
import { isRetiredAppSkillAward } from '@/lib/skillAwards';
import { ptsText } from '@/lib/leagues';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { pointsResumeText, useTimezoneWait } from '@/lib/useTimezoneWait';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Skill, SkillDrill, SkillLevel, SkillSessionLog, WeeklyGoalItem } from '@/types';
import { todayKey, formatDateLong, getNow, startOfWeek, calculateStreak, weekKey, formatWeekdayDate, formatWeekdayShort, parseDate, uid } from '@/lib/dates';
import { SKILLS_POINTS, calculateSkillPoints } from '@/lib/pointsConfig';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { PageHero } from '@/components/ui/PageHero';
import { Dialog, Disclosure, EmptyState, FieldRow, Form, Input, NumberField, PageColumns, ProgressBar, Select, Textarea, useFormController } from '@/components/ui/primitives';
import { TAP_TARGET, TAP_TARGET_Y, cx } from '@/components/ui/primitives/shared';
import { BarChart } from '@/components/ui/charts';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { nameTaken } from '@/lib/uniqueNames';
import { SKILL_LEVELS } from '@/lib/skillLevels';
import {
  DRILL_COUNT_MAX,
  DRILL_NAME_MAX_LENGTH,
  DRILL_UNIT_DEFAULT,
  DRILL_UNIT_MAX_LENGTH,
  cleanDrillCounts,
  drillCountInLogs,
  drillMetricKey,
  drillNameProblem,
  drillTotal,
  findDrill,
  formatDrillCount,
  isDrillGoal,
  liveDrills,
} from '@/lib/skillDrills';
import { GoalFormDialog, type GoalPayload } from '@/components/weekly/GoalFormDialog';
import { toUserMessage } from '@/lib/userMessage';
import type { View } from '@/lib/views';

const DAYS_PAGE = 7;
const QUICK_MINUTES = [45, 60, 120, 180];
const quickLabel = (m: number) => (m >= 120 && m % 60 === 0 ? `${m / 60} hrs` : `${m} min`);

const LEVEL_BADGE: Record<SkillLevel, string> = {
  beginner: 'badge-emerald',
  intermediate: 'badge-blue',
  advanced: 'badge-purple',
  expert: 'badge-amber',
};

const minutesOf = (l: SkillSessionLog): number =>
  typeof l.durationMinutes === 'number' && Number.isFinite(l.durationMinutes) ? l.durationMinutes : 0;

const formatHours = (minutes: number): string => `${(Math.round(minutes / 6) / 10).toFixed(1)} hrs`;

/** A drill row's icon buttons sit side by side, so their tap areas grow in height only. */
const DRILL_ICON_BUTTON = cx(
  'inline-flex h-8 w-8 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-overlay-subtle',
  TAP_TARGET_Y
);

/** One drill row of the Log practice form; an empty count is not logged. */
type CountRow = { key: string; drillId: string; count: string };

/** The rows a log of this skill starts with: its first drill, no count yet (none for a skill without drills). */
const startRows = (skill: Skill | undefined): CountRow[] => {
  const first = liveDrills(skill)[0];
  return first ? [{ key: uid(), drillId: first.id, count: '' }] : [];
};

/** "Scales 50 reps · Chords 20 reps": a log's drill counts (a drill this device doesn't know is left out). */
const countsText = (log: SkillSessionLog, skill: Skill | undefined): string =>
  (Array.isArray(log.counts) ? log.counts : [])
    .map((c) => {
      const drill = c ? findDrill(skill, c.drillId) : undefined;
      return drill && c.count > 0 ? `${drill.name} ${formatDrillCount(c.count, drill.unit)}` : '';
    })
    .filter(Boolean)
    .join(' · ');

function levelOf(minutes: number) {
  const hours = minutes / 60;
  const index = SKILL_LEVELS.findIndex((l) => l.below === null || hours < l.below);
  const current = SKILL_LEVELS[index];
  const from = index > 0 ? (SKILL_LEVELS[index - 1].below as number) : 0;
  const progress = current.below === null ? 100 : Math.min(100, ((hours - from) / (current.below - from)) * 100);
  const text =
    current.below === null ? `${hours.toFixed(1)} hrs, top level` : `${hours.toFixed(1)}/${current.below} hrs to ${current.next}`;
  return { level: current.level, progress, text };
}

export function SkillTracker({ store, onNavigate }: { store: AppStore; onNavigate: (view: View) => void }) {
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
  const [countRows, setCountRows] = useState<CountRow[]>([]);
  const addForm = useUnsavedChanges(addModalOpen, [skillName, category]);
  const logForm = useUnsavedChanges(logModalOpen, [logSkillId, duration, note, JSON.stringify(countRows)] as const, {
    key: 'skill-log',
    restore: ([s, d, n, rows]) => {
      setLogSkillId(s);
      setDuration(d);
      setNote(n);
      setCountRows(JSON.parse(rows) as CountRow[]);
    },
  });
  const addIssues = useFormController();
  const logIssues = useFormController();

  // Add / edit drill dialog (drill null = a new one).
  const [drillDialog, setDrillDialog] = useState<{ skillId: string; drill: SkillDrill | null } | null>(null);
  const [drillName, setDrillName] = useState('');
  const [drillUnit, setDrillUnit] = useState(DRILL_UNIT_DEFAULT);
  const drillForm = useUnsavedChanges(Boolean(drillDialog), [drillName, drillUnit]);
  const drillIssues = useFormController();
  const [deleteDrillTarget, setDeleteDrillTarget] = useState<{ skill: Skill; drill: SkillDrill } | null>(null);

  // "Make it a weekly goal": the Weekly goals form, opened here for this week.
  const [goalForm, setGoalForm] = useState<{ key: number; editing: WeeklyGoalItem | null; initial?: Partial<GoalPayload> } | null>(null);

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

  // This week's goals (Weekly goals' week: Monday local), for each drill's "Make it a weekly goal".
  const currentWeekKey = weekKey(parseDate(today) ?? undefined);
  const currentWeekGoals = store.state.weeklyGoals.find((w) => w.weekKey === currentWeekKey)?.goals ?? [];
  const drillGoal = (skillId: string, drillId: string) => currentWeekGoals.find((g) => !g.archived && isDrillGoal(g, skillId, drillId));

  const pointsToday = todayLogs.reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
  // No points preview while a timezone change waits: the server awards 0 today.
  const timezoneWait = useTimezoneWait();
  const remainingCap = Math.max(0, SKILLS_POINTS.dailyCap - pointsToday);
  const { rawPoints: previewRaw, pointsToAward: previewPoints } = calculateSkillPoints(Math.max(0, Number(duration) || 0), remainingCap);

  const linkedSkillGoalsCount = useMemo(() => {
    if (!deleteModalSkill) return 0;
    const currentWeekKey = weekKey(getNow());
    return store.state.weeklyGoals
      .filter((doc) => doc.weekKey >= currentWeekKey)
      .reduce((n, doc) => n + doc.goals.filter((g) => g.linkedModule === 'skill' && g.linkedItemId === deleteModalSkill.id).length, 0);
  }, [deleteModalSkill, store.state.weeklyGoals]);

  // Same rule as deleteSkillDrill: this week's and later goals on the drill go.
  const linkedDrillGoalsCount = useMemo(() => {
    if (!deleteDrillTarget) return 0;
    const currentKey = weekKey(getNow());
    const { skill, drill } = deleteDrillTarget;
    return store.state.weeklyGoals
      .filter((doc) => doc.weekKey >= currentKey)
      .reduce((n, doc) => n + doc.goals.filter((g) => isDrillGoal(g, skill.id, drill.id)).length, 0);
  }, [deleteDrillTarget, store.state.weeklyGoals]);

  // Every open starts clean.
  const openAddModal = () => {
    setSkillName('');
    setCategory('');
    setAddModalOpen(true);
  };
  const openLogModal = (skillId?: string) => {
    const id = skillId || (skills.length === 1 ? skills[0].id : '');
    setLogSkillId(id);
    setDuration(QUICK_MINUTES[0]);
    setNote('');
    setCountRows(startRows(skills.find((s) => s.id === id)));
    setLogModalOpen(true);
  };
  const chooseLogSkill = (id: string) => {
    setLogSkillId(id);
    setCountRows(startRows(skills.find((s) => s.id === id)));
  };
  const logSkill = skills.find((s) => s.id === logSkillId);
  const logDrills = liveDrills(logSkill);
  const setRow = (key: string, patch: Partial<CountRow>) => setCountRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    const free = logDrills.find((d) => !countRows.some((r) => r.drillId === d.id));
    if (free) setCountRows((rows) => [...rows, { key: uid(), drillId: free.id, count: '' }]);
  };

  const openDrillDialog = (skillId: string, drill: SkillDrill | null) => {
    setDrillName(drill?.name ?? '');
    setDrillUnit(drill?.unit ?? DRILL_UNIT_DEFAULT);
    setDrillDialog({ skillId, drill });
  };
  const drillSkill = drillDialog ? skills.find((s) => s.id === drillDialog.skillId) : undefined;

  const handleDrillSubmit = () => {
    if (!drillDialog || !drillSkill) return;
    const problem = drillNameProblem(drillName, drillSkill, drillDialog.drill?.id);
    if (problem) {
      drillIssues.showError(problem, 'drill-name-input');
      return;
    }
    try {
      if (drillDialog.drill) {
        store.updateSkillDrill(drillSkill.id, drillDialog.drill.id, drillName, drillUnit);
        showSuccessToast('Drill saved', drillName.trim());
      } else {
        store.addSkillDrill(drillSkill.id, drillName, drillUnit);
        showSuccessToast('Drill added', drillName.trim());
      }
      setDrillDialog(null);
    } catch (err) {
      drillIssues.showError(toUserMessage(err, "Couldn't save the drill. Try again."));
    }
  };

  const openDrillGoal = (skill: Skill, drill: SkillDrill) => {
    const existing = drillGoal(skill.id, drill.id) ?? null;
    setGoalForm((prev) => ({
      key: (prev?.key ?? 0) + 1,
      editing: existing,
      initial: existing
        ? undefined
        : {
            title: `${skill.name}: ${drill.name}`,
            priority: 'medium',
            linkedModule: 'skill',
            linkedItemId: skill.id,
            linkedMetricKey: drillMetricKey(drill.id),
            targetValue: 50,
          },
    }));
  };
  const saveDrillGoal = (payload: GoalPayload) => {
    if (goalForm?.editing) store.updateWeeklyGoalItem(currentWeekKey, goalForm.editing.id, payload);
    else store.addWeeklyGoalItem(currentWeekKey, payload);
    // Ticks it at once when this week's counts already reach the target.
    store.syncLinkedWeeklyGoals();
    showSuccessToast(goalForm?.editing ? 'Goal saved' : 'Weekly goal added', 'It counts this week in Weekly goals.');
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
    // Counts are optional: a row left empty is not logged. Minutes stay required.
    const filled = countRows.filter((r) => r.count.trim() !== '');
    const cleaned = cleanDrillCounts(
      filled.map((r) => ({ drillId: r.drillId, count: Number(r.count) })),
      logSkill ?? {}
    );
    if (cleaned.problem) {
      const row = filled[cleaned.problem.index];
      logIssues.showError(cleaned.problem.message, `skill-count-${cleaned.problem.field}-${row.key}`);
      return;
    }
    await executeLog(async () => {
      await store.logSkillPractice(logSkillId, Number(duration), note.trim(), cleaned.counts);
      setLogModalOpen(false);
      showSuccessToast('Practice logged', previewPoints > 0 && !timezoneWait ? ptsText(previewPoints, true) : `${nameOf(logSkillId)} saved.`);
    });
  };

  const renderRow = (log: SkillSessionLog) => {
    const counts = countsText(log, skills.find((s) => s.id === log.skillId));
    return (
      <div key={log.id} className="enter-item p-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-overlay-subtle">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center text-brand-text shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="item-name text-sm text-content-secondary truncate">
              {nameOf(log.skillId)} <span className="figure text-xs font-normal text-content-muted">{minutesOf(log)} min</span>
            </h3>
            {counts && <p className="figure text-xs text-content-muted truncate">{counts}</p>}
            {log.note && <p className="text-xs text-content-muted truncate">{log.note}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(log.pointsAwarded || 0) > 0 && (
            <span className="figure text-xs text-brand-text whitespace-nowrap">{ptsText(log.pointsAwarded, true)}</span>
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
  };

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
            { label: 'Total practice', value: formatHours(totalMinutes), valueClassName: 'text-brand-text' },
            { label: 'Skills', value: <CountUp value={skills.length} />, valueClassName: 'text-brand-text' },
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
                <li>Drills count one part of a skill, like scales, in reps or your own unit. Counts don't earn points; minutes do. A drill can be a weekly goal.</li>
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
                            ? 'bg-primary-500/15 text-brand-text border-primary-500/40 font-medium'
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
                  const drills = liveDrills(skill);
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
                        <ProgressBar value={progress} label={`${skill.name} level progress`} size="sm" />
                      </div>

                      {drills.length > 0 && (
                        <ul className="space-y-1 border-t border-overlay-subtle pt-2" aria-label={`${skill.name} drills`}>
                          {drills.map((drill) => {
                            const week = drillCountInLogs(weekLogs, skill.id, drill.id);
                            const goal = drillGoal(skill.id, drill.id);
                            const target = goal?.targetValue && goal.targetValue > 0 ? goal.targetValue : null;
                            return (
                              <li key={drill.id} className="flex items-center gap-1">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-content-secondary truncate">{drill.name}</p>
                                  <p className="figure text-xs text-content-muted truncate">
                                    <span className={target !== null ? 'text-brand-text' : undefined}>
                                      {target !== null
                                        ? `${week.toLocaleString('en-US')}/${formatDrillCount(target, drill.unit)}`
                                        : formatDrillCount(week, drill.unit)}
                                    </span>{' '}
                                    this week · {drillTotal(skill, skillLogs, drill.id).toLocaleString('en-US')} total
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openDrillGoal(skill, drill)}
                                  aria-label={goal ? `Edit the weekly goal for ${drill.name}` : `Make ${drill.name} a weekly goal`}
                                  title={goal ? 'Edit weekly goal' : 'Make it a weekly goal'}
                                  className={cx(
                                    DRILL_ICON_BUTTON,
                                    goal ? 'text-brand-text' : 'text-content-muted hover:text-content-secondary'
                                  )}
                                >
                                  <Target size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDrillDialog(skill.id, drill)}
                                  aria-label={`Edit ${drill.name}`}
                                  title="Edit drill"
                                  className={cx(DRILL_ICON_BUTTON, 'text-content-muted hover:text-content-secondary')}
                                >
                                  <Pencil size={16} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <button
                        type="button"
                        onClick={() => openDrillDialog(skill.id, null)}
                        className="btn-ghost self-start text-xs text-content-muted hover:text-content-secondary flex items-center gap-1.5 max-sm:px-2 max-sm:py-1"
                      >
                        <Plus size={14} /> Add drill
                      </button>

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
                        ? 'bg-primary-500/15 text-brand-text border-primary-500/40'
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
          <Select id="skill-log-skill" label="Skill" value={logSkillId} onChange={(e) => chooseLogSkill(e.target.value)}>
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
                      ? 'bg-primary-500/15 border-primary-500/50 text-brand-text'
                      : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                  )}
                >
                  {quickLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {logDrills.length > 0 && (
            <div className="space-y-2">
              {countRows.map((row, index) => (
                <div key={row.key} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      id={`skill-count-drill-${row.key}`}
                      label={index === 0 ? 'Drill' : undefined}
                      aria-label={index === 0 ? undefined : `Drill ${index + 1}`}
                      value={row.drillId}
                      onChange={(e) => setRow(row.key, { drillId: e.target.value })}
                    >
                      {logDrills.map((d) => (
                        <option key={d.id} value={d.id} disabled={d.id !== row.drillId && countRows.some((r) => r.drillId === d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-28 shrink-0">
                    <Input
                      id={`skill-count-count-${row.key}`}
                      label={index === 0 ? 'How many?' : undefined}
                      aria-label={index === 0 ? undefined : `How many ${logDrills.find((d) => d.id === row.drillId)?.unit ?? DRILL_UNIT_DEFAULT}, drill ${index + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={DRILL_COUNT_MAX}
                      step={1}
                      value={row.count}
                      onChange={(e) => setRow(row.key, { count: e.target.value })}
                      placeholder={logDrills.find((d) => d.id === row.drillId)?.unit ?? DRILL_UNIT_DEFAULT}
                      enterKeyHint="done"
                    />
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => setCountRows((rows) => rows.filter((r) => r.key !== row.key))}
                      aria-label={`Remove drill ${index + 1}`}
                      title="Remove"
                      className={`mt-2 p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-content-muted">Optional. Counts don't earn points; minutes do.</p>
                {countRows.length < logDrills.length && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="btn-ghost text-xs text-content-muted hover:text-content-secondary flex items-center gap-1.5 max-sm:px-2 max-sm:py-1"
                  >
                    <Plus size={14} /> Add drill
                  </button>
                )}
              </div>
            </div>
          )}

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
              {timezoneWait
                ? `${pointsResumeText(timezoneWait)} It still saves.`
                : remainingCap === 0
                  ? `${SKILLS_POINTS.dailyCap} pts reached today. It still saves.`
                  : previewRaw > previewPoints
                    ? `Only ${ptsText(remainingCap)} left today.`
                    : 'Points to earn'}
            </span>
            {!timezoneWait && <span className="figure text-brand-text shrink-0">{ptsText(previewPoints, true)}</span>}
          </div>
        </Form>
      </Dialog>

      <Dialog
        open={Boolean(drillDialog)}
        onClose={() => setDrillDialog(null)}
        dirty={drillForm.dirty}
        title={drillDialog?.drill ? 'Edit drill' : 'Add drill'}
        description={drillSkill ? `Something in ${drillSkill.name} you count, not time. Counts don't earn points.` : undefined}
        footer={
          <>
            {drillDialog?.drill && drillSkill && (
              <button
                type="button"
                onClick={() => {
                  const target = { skill: drillSkill, drill: drillDialog.drill! };
                  setDrillDialog(null);
                  setDeleteDrillTarget(target);
                }}
                className="btn-danger sm:mr-auto"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            )}
            <button type="button" onClick={() => drillForm.confirmDiscard(() => setDrillDialog(null))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="skill-drill-form" className="btn-primary">
              {drillDialog?.drill ? 'Save drill' : 'Add drill'}
            </button>
          </>
        }
      >
        <Form id="skill-drill-form" onSubmit={handleDrillSubmit} controller={drillIssues} className="space-y-4">
          <FieldRow>
            <Input
              id="drill-name-input"
              label="Drill"
              value={drillName}
              onChange={(e) => setDrillName(e.target.value)}
              placeholder="e.g. Scales, Chords"
              maxLength={DRILL_NAME_MAX_LENGTH}
              autoComplete="off"
              required
            />
            <Input
              id="drill-unit-input"
              label="Unit"
              value={drillUnit}
              onChange={(e) => setDrillUnit(e.target.value)}
              placeholder={DRILL_UNIT_DEFAULT}
              hint="What you count, like reps or times."
              maxLength={DRILL_UNIT_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="done"
            />
          </FieldRow>
        </Form>
      </Dialog>

      {goalForm && (
        <GoalFormDialog
          key={goalForm.key}
          open
          editing={goalForm.editing}
          initial={goalForm.initial}
          state={store.state}
          weekGoals={currentWeekGoals}
          weekText="this week"
          onClose={() => setGoalForm(null)}
          onSave={saveDrillGoal}
          onNavigate={onNavigate}
        />
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteDrillTarget)}
        onClose={() => setDeleteDrillTarget(null)}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteDrillTarget) return;
          const { skill, drill } = deleteDrillTarget;
          await executeDelete(async () => {
            await store.deleteSkillDrill(skill.id, drill.id);
            setDeleteDrillTarget(null);
            showSuccessToast('Drill deleted', `${drill.name} removed.`, `skill_drill_${drill.id}`);
          });
        }}
        title="Delete drill?"
        itemName={deleteDrillTarget?.drill.name}
        description={[
          'It leaves the skill card. Practice logs keep their minutes, points and counts.',
          linkedDrillGoalsCount > 0
            ? `${linkedDrillGoalsCount} linked weekly goal${linkedDrillGoalsCount > 1 ? 's' : ''} for this week and later go too.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

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
          liveDrills(deleteModalSkill).length > 0
            ? 'This removes the skill, its drills and all its practice logs.'
            : 'This removes the skill and all its practice logs.',
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
            ? `Its points and minutes${deleteModalLog?.counts?.length ? ' and drill counts' : ''} come off today's total. The skill's streak may go down.`
            : `The points and practice hours you earned that day stay${deleteModalLog?.counts?.length ? ', and so do drill totals' : ''}. The skill's streak may go down.`
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
                ? `${CLEAR_SKILL_LOGS_MAX} cleared. Tap Clear older logs again for the rest. Points, hours, levels and drill totals stay.`
                : 'Your points, hours, levels and drill totals stay as they were.',
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
        description={`The points you earned stay, and each skill keeps its hours, level and drill totals. Skill streaks can break, and your session count goes down. This week's logs are kept.${
          olderLogCount > CLEAR_SKILL_LOGS_MAX ? ` Up to ${CLEAR_SKILL_LOGS_MAX} go at a time: tap again for the rest.` : ''
        }`}
        confirmText="Clear logs"
      />
    </div>
  );
}
