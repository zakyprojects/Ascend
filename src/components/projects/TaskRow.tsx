import { useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, Edit3, FolderKanban, Lock, Pencil, Timer, Trash2 } from 'lucide-react';
import type { Task, TaskPriority, TaskSubtask } from '@/types';
import { formatDateShort } from '@/lib/time/dates';
import { cx, FieldErrorBubble, ProgressBar } from '@/components/ui/primitives';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { useCompletionPop } from '@/lib/ui/useCompletionPop';
import { Chip } from './ItemCard';
import { actionFeedback } from '@/lib/ui/actionFeedback';
import { nameTaken } from '@/lib/items/uniqueNames';
import { SUBTASK_TITLE_MAX, subtaskTitleProblem } from '@/lib/items/itemEdits';
import { toUserMessage } from '@/lib/app/userMessage';
import { LazyReorderList, ReorderButton } from '@/components/ui/Reorder';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-warning-text',
  low: 'bg-content-disabled',
};

/**
 * One task: tick, title, where it leads (project, then goal), due date, and its subtasks.
 * A task with subtasks ticks itself when the last one is done. Tasks in a locked project wait.
 */
export function TaskRow({
  task,
  today,
  lockedBy,
  projectName,
  goalName,
  onToggle,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onRenameSubtask,
  onReorderSubtasks,
  onOpenProject,
  onFocus,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
  /** The earlier project this task's project waits on, when it is locked. */
  lockedBy?: string;
  projectName: string | null;
  goalName: string | null;
  onToggle: () => void;
  onToggleSubtask: (subtaskId: string) => void;
  onAddSubtask: (title: string) => void;
  onDeleteSubtask: (subtask: TaskSubtask) => void;
  /** Renames a subtask; throws with the message to show (empty or taken title). */
  onRenameSubtask?: (subtaskId: string, title: string) => void;
  /** Saves the subtasks in a new order (Reorder). */
  onReorderSubtasks?: (ids: string[]) => void;
  onOpenProject: () => void;
  onFocus?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const locked = Boolean(lockedBy);
  const subtasks = task.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const completedSubtasks = subtasks.filter((st) => st.completed).length;
  const overdue = !task.completed && Boolean(task.dueDate) && task.dueDate! < today;
  const dueToday = !task.completed && task.dueDate === today;
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const newSubtaskRef = useRef<HTMLInputElement>(null);
  const newSubtaskId = `task-${task.id}-new-subtask`;
  // Armed by the tick and by subtask clicks: ticking the last subtask completes the task.
  const { arm: armCompletionPop, popClass } = useCompletionPop(task.completed);

  // One subtask's title being edited in place (Enter or Save keeps it, Esc or Cancel drops it).
  const [renaming, setRenaming] = useState<{ id: string; text: string; error: string | null } | null>(null);
  // Reorder mode of the subtasks (the task's own list; done ones stay where they are put).
  const [reorderingSubtasks, setReorderingSubtasks] = useState(false);
  const renameInputId = renaming ? `task-${task.id}-subtask-${renaming.id}-title` : '';
  const saveRename = () => {
    if (!renaming || !onRenameSubtask) return;
    const problem = subtaskTitleProblem(renaming.text, task, renaming.id);
    if (problem) {
      setRenaming({ ...renaming, error: problem });
      document.getElementById(renameInputId)?.focus();
      return;
    }
    try {
      onRenameSubtask(renaming.id, renaming.text);
      setRenaming(null);
    } catch (err) {
      setRenaming({ ...renaming, error: toUserMessage(err, "Couldn't save. Try again.") });
    }
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    if (nameTaken(title, subtasks, { nameOf: (st) => st.title })) {
      setSubtaskError('This task already has a subtask with this name.');
      newSubtaskRef.current?.focus();
      return;
    }
    onAddSubtask(title);
    setNewSubtask('');
  };

  return (
    <div className={cx('enter-item space-y-2.5 p-4 transition-colors', task.completed ? 'opacity-75' : 'hover:bg-overlay-subtle')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => {
            if (!task.completed) armCompletionPop();
            onToggle();
          }}
          disabled={hasSubtasks || locked}
          aria-label={
            locked ? `"${task.title}" is locked` : task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`
          }
          title={locked ? `Unlocks when "${lockedBy}" is done` : hasSubtasks ? 'Ticks itself when every subtask is done' : undefined}
          className={cx('-m-1.5 shrink-0 p-1.5 disabled:cursor-not-allowed', TAP_TARGET)}
        >
          <span
            className={cx(
              'flex h-5 w-5 items-center justify-center rounded-lg border transition-colors',
              task.completed
                ? 'border-emerald-400 bg-emerald-500 text-on-brand'
                : locked
                  ? 'border-overlay-default bg-overlay-subtle text-content-muted'
                  : 'border-overlay-strong hover:border-emerald-400'
            )}
          >
            {locked && !task.completed ? (
              <Lock size={11} aria-hidden="true" />
            ) : (
              <Check size={13} strokeWidth={3} className={cx(task.completed ? 'block' : 'hidden', popClass)} />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className={cx('item-name text-sm leading-snug break-words', task.completed ? 'text-content-muted line-through' : 'text-content-primary')}>
              {task.title}
            </span>
            <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
              {onFocus && !task.completed && !locked && (
                <button
                  type="button"
                  onClick={onFocus}
                  className={`p-1.5 text-cyan-hierarchy transition-colors hover:text-content-primary ${TAP_TARGET_Y}`}
                  aria-label={`Start a focus session on "${task.title}"`}
                  title="Focus on this"
                >
                  <Timer size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                className={`p-1.5 text-content-muted transition-colors hover:text-content-secondary ${TAP_TARGET_Y}`}
                aria-label={`Edit task "${task.title}"`}
                title="Edit"
              >
                <Edit3 size={15} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className={`p-1.5 text-content-muted transition-colors hover:text-rose-theme ${TAP_TARGET_Y}`}
                aria-label={`Delete task "${task.title}"`}
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-content-muted">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              {task.priority}
            </span>
            {projectName && (
              <Chip
                tone={locked ? 'neutral' : 'cyan'}
                icon={locked ? <Lock size={10} className="shrink-0" /> : <FolderKanban size={10} className="shrink-0" />}
                onClick={onOpenProject}
                title={goalName ? `${projectName}, part of the goal "${goalName}"` : projectName}
              >
                {goalName ? `${projectName} · ${goalName}` : projectName}
              </Chip>
            )}
            {task.dueDate && (
              <Chip tone={overdue ? 'danger' : dueToday ? 'warning' : 'neutral'} icon={<Calendar size={10} className="shrink-0" />}>
                {overdue ? 'Overdue' : dueToday ? 'Today' : 'Due'} {formatDateShort(task.dueDate)}
              </Chip>
            )}
          </div>

          {task.description && <p className="whitespace-pre-wrap text-xs leading-relaxed text-content-muted">{task.description}</p>}

          {locked && lockedBy && <p className="text-xs text-content-muted">Unlocks when "{lockedBy}" is done.</p>}

          <div>
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className={cx('flex w-full items-center gap-2 text-xs text-content-muted transition-colors hover:text-content-secondary', TAP_TARGET_Y)}
            >
              {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              <span>{hasSubtasks ? `Subtasks ${completedSubtasks}/${subtasks.length}` : 'Add subtasks'}</span>
              {hasSubtasks && (
                <ProgressBar
                  value={completedSubtasks}
                  max={subtasks.length}
                  label="Subtask progress"
                  tone={completedSubtasks === subtasks.length ? 'success' : 'cyan'}
                  size="sm"
                  className="ml-1 max-w-[8rem] flex-1"
                />
              )}
            </button>

            {expanded && (
              <div className="mt-2 space-y-1.5 border-l-2 border-overlay-default pl-3 animate-fade-in">
                {reorderingSubtasks && !locked && onReorderSubtasks ? (
                  <LazyReorderList
                    label={`subtasks of "${task.title}"`}
                    items={subtasks.map((st) => ({ id: st.id, title: st.title }))}
                    onCancel={() => setReorderingSubtasks(false)}
                    onDone={(ids) => {
                      onReorderSubtasks(ids);
                      setReorderingSubtasks(false);
                    }}
                  />
                ) : (
                <>
                {!locked && onReorderSubtasks && subtasks.length >= 2 && (
                  <div className="flex justify-end">
                    <ReorderButton
                      label={`subtasks of "${task.title}"`}
                      onClick={() => {
                        setRenaming(null);
                        setReorderingSubtasks(true);
                      }}
                    />
                  </div>
                )}
                {subtasks.map((st) =>
                  renaming?.id === st.id && !locked ? (
                    <div key={st.id}>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveRename();
                        }}
                      >
                        <input
                          id={renameInputId}
                          type="text"
                          aria-label={`Subtask title, was "${st.title}"`}
                          aria-invalid={renaming.error ? true : undefined}
                          aria-describedby={renaming.error ? `${renameInputId}-error` : undefined}
                          value={renaming.text}
                          onChange={(e) => setRenaming({ ...renaming, text: e.target.value, error: null })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              setRenaming(null);
                            }
                          }}
                          maxLength={SUBTASK_TITLE_MAX}
                          enterKeyHint="done"
                          autoFocus
                          className="min-h-9 w-full rounded-lg border border-overlay-default bg-bg-900 px-2.5 py-1 text-base text-content-secondary placeholder:text-content-subtle focus:border-emerald-500/50 focus:outline-none sm:text-xs"
                        />
                        <button type="submit" className="btn-secondary shrink-0 px-3 py-1 text-xs">
                          Save
                        </button>
                        <button type="button" onClick={() => setRenaming(null)} className="btn-ghost shrink-0 px-2 py-1 text-xs">
                          Cancel
                        </button>
                      </form>
                      {renaming.error && <FieldErrorBubble id={`${renameInputId}-error`} message={renaming.error} />}
                    </div>
                  ) : (
                  <div key={st.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!st.completed) {
                          armCompletionPop();
                          // The last open subtask completes the task, whose pop plays the tick itself.
                          if (subtasks.some((other) => other.id !== st.id && !other.completed)) actionFeedback('tick');
                        }
                        onToggleSubtask(st.id);
                      }}
                      disabled={locked}
                      aria-label={st.completed ? `Mark subtask "${st.title}" not done` : `Mark subtask "${st.title}" done`}
                      className={cx('flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed', TAP_TARGET_Y)}
                    >
                      <span
                        className={cx(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          st.completed ? 'border-emerald-400 bg-emerald-500 text-on-brand' : 'border-overlay-strong'
                        )}
                      >
                        {st.completed && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className={cx('truncate text-xs', st.completed ? 'text-content-disabled line-through' : 'text-content-tertiary')}>
                        {st.title}
                      </span>
                    </button>
                    {!locked && onRenameSubtask && (
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: st.id, text: st.title, error: null })}
                        className={`p-1 text-content-disabled transition-colors hover:text-content-secondary ${TAP_TARGET}`}
                        aria-label={`Rename subtask "${st.title}"`}
                        title="Rename"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => onDeleteSubtask(st)}
                        className={`p-1 text-content-disabled transition-colors hover:text-rose-theme ${TAP_TARGET}`}
                        aria-label={`Delete subtask "${st.title}"`}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  )
                )}

                {!locked && (
                  <form
                    className="flex items-center gap-2 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addSubtask();
                    }}
                  >
                    <input
                      ref={newSubtaskRef}
                      id={newSubtaskId}
                      type="text"
                      aria-label={`New subtask for "${task.title}"`}
                      aria-invalid={subtaskError ? true : undefined}
                      aria-describedby={subtaskError ? `${newSubtaskId}-error` : undefined}
                      placeholder="Add a subtask"
                      value={newSubtask}
                      onChange={(e) => {
                        setNewSubtask(e.target.value);
                        setSubtaskError(null);
                      }}
                      maxLength={120}
                      enterKeyHint="enter"
                      className="min-h-9 w-full rounded-lg border border-overlay-default bg-bg-900 px-2.5 py-1 text-base text-content-secondary placeholder:text-content-subtle focus:border-emerald-500/50 focus:outline-none sm:text-xs"
                    />
                    <button type="submit" disabled={!newSubtask.trim()} className="btn-secondary shrink-0 px-3 py-1 text-xs disabled:opacity-50">
                      Add
                    </button>
                  </form>
                )}
                {!locked && subtaskError && <FieldErrorBubble id={`${newSubtaskId}-error`} message={subtaskError} />}
                </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
