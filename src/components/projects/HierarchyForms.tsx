import { useState } from 'react';
import { ListOrdered, Trash2 } from 'lucide-react';
import type { Goal, GoalStatus, Project, ProjectStatus, Task, TaskPriority, TaskSubtask } from '@/types';
import { Dialog, FieldRow, Form, Input, Select, Switch, Textarea, useFormController } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { earliestTargetDate, isNewPastDate, todayKey, uid } from '@/lib/dates';
import { trustedNow } from '@/lib/clock';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

/**
 * Create/edit dialogs for goals, projects and tasks. Each is mounted fresh for every open (the
 * parent keys it), so the form starts from the item being edited or from empty. onSave throws
 * with a user-facing message when the change can't be saved; the dialog shows it and stays open.
 */

const GOAL_CATEGORY_SUGGESTIONS = [
  'Career & Business',
  'Health & Fitness',
  'Finance & Wealth',
  'Skill Mastery',
  'Personal Growth',
  'Relationships',
  'Mindset & Focus',
];

/** Dates outside two years back to twenty years ahead are pulled to the nearest bound. */
function dateBounds() {
  const year = trustedNow().getFullYear();
  return { min: `${year - 2}-01-01`, max: `${year + 20}-12-31` };
}

function sanitizeDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const { min, max } = dateBounds();
  return trimmed < min ? min : trimmed > max ? max : trimmed;
}

/** A due/target date can't be new and in the past; an item's own old date may stay. */
const pastDateIssue = (value: string, saved: string | undefined, field: string) =>
  isNewPastDate(value, saved) ? { message: 'Pick a later date.', field } : null;

function FormFooter({ formId, saveLabel, onCancel }: { formId: string; saveLabel: string; onCancel: () => void }) {
  return (
    <>
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      <button type="submit" form={formId} className="btn-primary">
        {saveLabel}
      </button>
    </>
  );
}

// ----------------------------------------------------------------------------------------------
// Goal
// ----------------------------------------------------------------------------------------------

export type GoalPayload = Pick<Goal, 'title' | 'description' | 'category' | 'targetDate' | 'status' | 'sequentialMode'>;

export function GoalFormDialog({
  open,
  editing,
  hasProjects,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Goal | null;
  /** A goal with projects is achieved when they are all done, not by choice. */
  hasProjects: boolean;
  onClose: () => void;
  onSave: (payload: GoalPayload) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [targetDate, setTargetDate] = useState(editing?.targetDate ?? '');
  const [status, setStatus] = useState<GoalStatus>(editing?.status ?? 'active');
  const [sequentialMode, setSequentialMode] = useState(editing?.sequentialMode ?? false);
  const issues = useFormController();
  const form = useUnsavedChanges(open, [title, description, category, targetDate, status, sequentialMode]);
  const achievedLocked = hasProjects && editing?.status !== 'achieved';

  const handleSubmit = () => {
    if (!title.trim()) return;
    try {
      onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        targetDate: sanitizeDate(targetDate),
        status,
        sequentialMode,
      });
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, "Couldn't save this goal. Try again."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editing ? 'Edit goal' : 'New goal'}
      description={editing ? undefined : 'Something you want your life to look like. Projects will turn it into steps.'}
      footer={<FormFooter formId="pg-goal-form" saveLabel={editing ? 'Save goal' : 'Create goal'} onCancel={() => form.confirmDiscard(onClose)} />}
    >
      <Form
        id="pg-goal-form"
        onSubmit={handleSubmit}
        controller={issues}
        validate={() => pastDateIssue(targetDate, editing?.targetDate, 'pg-goal-target-date')}
        className="space-y-4"
      >
        <Input
          id="pg-goal-title"
          label="Goal"
          placeholder="e.g. Financial freedom, run a marathon, speak Spanish"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
        <Textarea
          id="pg-goal-description"
          label="Why it matters"
          optional
          rows={2}
          placeholder="What will be different when you get there?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-0"
          maxLength={1000}
        />
        <div>
          <Input
            id="pg-goal-category"
            label="Category"
            optional
            placeholder="e.g. Career, Health, Finance"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={40}
            autoComplete="off"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GOAL_CATEGORY_SUGGESTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={`min-h-9 rounded-full border px-2.5 py-1 text-xs transition-colors sm:min-h-0 ${
                  category === cat
                    ? 'border-primary-500/40 bg-primary-500/15 text-brand-text'
                    : 'border-overlay-subtle bg-overlay-subtle text-content-muted hover:text-content-secondary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-overlay-default p-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-content-secondary">
              <ListOrdered size={14} className="text-content-muted" aria-hidden="true" />
              <span>Projects in order</span>
            </p>
            <p className="text-xs text-content-muted">One project at a time. The next unlocks when the one before it is done.</p>
          </div>
          <Switch checked={sequentialMode} onChange={() => setSequentialMode(!sequentialMode)} label="Projects in order" />
        </div>
        <FieldRow>
          <Input
            id="pg-goal-target-date"
            label="Target date"
            optional
            type="date"
            min={earliestTargetDate(editing?.targetDate)}
            max={dateBounds().max}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <Select id="pg-goal-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            <option value="active">Active</option>
            <option value="achieved" disabled={achievedLocked}>
              {achievedLocked ? 'Achieved (when projects are done)' : 'Achieved'}
            </option>
            <option value="abandoned">Abandoned</option>
          </Select>
        </FieldRow>
      </Form>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------------------------
// Project
// ----------------------------------------------------------------------------------------------

export type ProjectPayload = Pick<Project, 'title' | 'description' | 'goalId' | 'startDate' | 'dueDate' | 'status'>;

export function ProjectFormDialog({
  open,
  editing,
  goals,
  defaultGoalId,
  hasTasks,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Project | null;
  goals: Goal[];
  defaultGoalId?: string;
  /** A project with tasks completes when they are all done, not by choice. */
  hasTasks: boolean;
  onClose: () => void;
  onSave: (payload: ProjectPayload) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [goalId, setGoalId] = useState(editing ? editing.goalId ?? '' : defaultGoalId ?? '');
  const [startDate, setStartDate] = useState(editing ? editing.startDate ?? '' : todayKey());
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [status, setStatus] = useState<ProjectStatus>(editing?.status ?? 'not_started');
  const issues = useFormController();
  const form = useUnsavedChanges(open, [title, description, goalId, startDate, dueDate, status]);
  const completedLocked = hasTasks && editing?.status !== 'completed';
  const earliestDue = earliestTargetDate(editing?.dueDate);
  const { min, max } = dateBounds();

  const handleSubmit = () => {
    if (!title.trim()) return;
    try {
      onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        goalId: goalId || undefined,
        startDate: sanitizeDate(startDate),
        dueDate: sanitizeDate(dueDate),
        status,
      });
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, "Couldn't save this project. Try again."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editing ? 'Edit project' : 'New project'}
      description={editing ? undefined : 'One phase of a goal, with a clear finish line. Tasks will be its steps.'}
      footer={<FormFooter formId="pg-project-form" saveLabel={editing ? 'Save project' : 'Create project'} onCancel={() => form.confirmDiscard(onClose)} />}
    >
      <Form
        id="pg-project-form"
        onSubmit={handleSubmit}
        controller={issues}
        validate={() => pastDateIssue(dueDate, editing?.dueDate, 'pg-project-due-date')}
        className="space-y-4"
      >
        <Input
          id="pg-project-title"
          label="Project"
          placeholder="e.g. 90-day gym plan, launch the store"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
        <Textarea
          id="pg-project-description"
          label="Notes"
          optional
          rows={2}
          placeholder="What does done look like?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-0"
          maxLength={1000}
        />
        <Select id="pg-project-goal-id" label="Goal it moves forward" optional value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">No goal</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
        <FieldRow>
          <Input
            id="pg-project-start-date"
            label="Start date"
            optional
            type="date"
            min={min}
            max={dueDate || max}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            id="pg-project-due-date"
            label="Due date"
            optional
            type="date"
            min={startDate > earliestDue ? startDate : earliestDue}
            max={max}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </FieldRow>
        <Select id="pg-project-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="on_hold">On hold</option>
          <option value="completed" disabled={completedLocked}>
            {completedLocked ? 'Completed (when tasks are done)' : 'Completed'}
          </option>
        </Select>
      </Form>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------------------------
// Task
// ----------------------------------------------------------------------------------------------

export type TaskPayload = Pick<Task, 'title' | 'description' | 'projectId' | 'dueDate' | 'priority' | 'subtasks'>;

export function TaskFormDialog({
  open,
  editing,
  projects,
  defaultProjectId,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Task | null;
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onSave: (payload: TaskPayload) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [projectId, setProjectId] = useState(editing ? editing.projectId ?? '' : defaultProjectId ?? '');
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? 'medium');
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>(() => [...(editing?.subtasks || [])]);
  const [newSubtask, setNewSubtask] = useState('');
  const issues = useFormController();
  const form = useUnsavedChanges(open, [title, description, projectId, dueDate, priority, subtasks, newSubtask]);

  const addSubtask = () => {
    const subtaskTitle = newSubtask.trim();
    if (!subtaskTitle) return;
    setSubtasks((prev) => [...prev, { id: uid(), title: subtaskTitle, completed: false }]);
    setNewSubtask('');
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    try {
      onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        projectId: projectId || undefined,
        dueDate: sanitizeDate(dueDate),
        priority,
        subtasks,
      });
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, "Couldn't save this task. Try again."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editing ? 'Edit task' : 'New task'}
      footer={<FormFooter formId="pg-task-form" saveLabel={editing ? 'Save task' : 'Add task'} onCancel={() => form.confirmDiscard(onClose)} />}
    >
      <Form
        id="pg-task-form"
        onSubmit={handleSubmit}
        controller={issues}
        validate={() => pastDateIssue(dueDate, editing?.dueDate, 'pg-task-due-date')}
        className="space-y-4"
      >
        <Input
          id="pg-task-title"
          label="Task"
          placeholder="e.g. Read 10 pages, list 5 products"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
        <Textarea
          id="pg-task-description"
          label="Notes"
          optional
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-0"
          maxLength={1000}
        />
        <FieldRow>
          <Select id="pg-task-project-id" label="Project" optional value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          <Select id="pg-task-priority" label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </FieldRow>
        <Input
          id="pg-task-due-date"
          label="Due date"
          optional
          type="date"
          min={earliestTargetDate(editing?.dueDate)}
          max={dateBounds().max}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <div role="group" aria-labelledby="pg-task-subtasks-label">
          <p id="pg-task-subtasks-label" className="label mb-1.5 block">
            Subtasks <span className="font-normal text-content-muted">(the task ticks itself when all are done)</span>
          </p>
          {subtasks.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-2 rounded-lg border border-overlay-subtle py-1.5 pl-3 pr-1.5">
                  <span className={`truncate text-sm ${st.completed ? 'text-content-muted line-through' : 'text-content-secondary'}`}>{st.title}</span>
                  <button
                    type="button"
                    onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== st.id))}
                    className={`p-1 text-content-muted hover:text-rose-theme ${TAP_TARGET}`}
                    aria-label={`Remove subtask "${st.title}"`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              aria-label="New subtask"
              placeholder="Add a subtask"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              maxLength={120}
              autoComplete="off"
              enterKeyHint="enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSubtask();
                }
              }}
            />
            <button type="button" onClick={addSubtask} className="btn-secondary min-h-11 shrink-0 sm:min-h-10">
              Add
            </button>
          </div>
        </div>
      </Form>
    </Dialog>
  );
}
