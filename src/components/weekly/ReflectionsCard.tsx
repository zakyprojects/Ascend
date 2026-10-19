import { useState } from 'react';
import { Check, Edit3, PenLine, Plus, Trash2 } from 'lucide-react';
import type { WeeklyGoalReflection } from '@/types';
import { AppStore, getWeeklyReflectionNetPoints, isWeeklyReflectionAwarded, weeklyReflectionAwardedToday } from '@/lib/store';
import { WEEKLY_REFLECTION_POINTS } from '@/lib/pointsConfig';
import { reflectionWindow } from '@/lib/weeklyAwards';
import { getNow, parseDate } from '@/lib/dates';
import { EmptyState, Form, Textarea, useFocusOnRender, useFormController } from '@/components/ui/primitives';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

/** Where the week's Reflection Window stands, with the time left while it is open. */
function windowStatus(targetWeekKey: string, now: Date): { open: boolean; text: string } {
  const { opensAt, closesAt } = reflectionWindow(targetWeekKey);
  if (now < opensAt) {
    const when = opensAt.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    return { open: false, text: `Opens ${when}.` };
  }
  if (now >= closesAt) return { open: false, text: 'Closed for this week.' };
  const hoursLeft = Math.ceil((closesAt.getTime() - now.getTime()) / 3600000);
  const left = hoursLeft > 24 ? `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h` : `${hoursLeft}h`;
  return { open: true, text: `Open now, closes in ${left}.` };
}

function formatWhen(iso: string): string {
  const d = parseDate(iso);
  return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

export function ReflectionsCard({
  store,
  weekKey,
  weekText,
  lastWeekWindowOpen,
  onOpenLastWeek,
}: {
  store: AppStore;
  weekKey: string;
  /** "this week", "last week", or the dates. */
  weekText: string;
  /** Viewing this week while last week's window is still open (Mondays). */
  lastWeekWindowOpen: boolean;
  onOpenLastWeek: () => void;
}) {
  const { showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const status = windowStatus(weekKey, getNow());
  const reflections = store.state.weeklyGoals.find((w) => w.weekKey === weekKey)?.reflections || [];
  const notYetRewarded = getWeeklyReflectionNetPoints(store.state, weekKey) <= 0;

  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editing, setEditing] = useState<WeeklyGoalReflection | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleting, setDeleting] = useState<WeeklyGoalReflection | null>(null);
  // Write / Edit replace their button with the editor: its text field takes focus (caret at the end).
  // Cancel/Save close it and focus returns to that button (Write only while the window is open).
  const focusNext = useFocusOnRender();
  const newForm = useUnsavedChanges(adding, newContent, { key: `weekly-reflection:${weekKey}`, restore: setNewContent });
  const editForm = useUnsavedChanges(editing?.id ?? null, editContent, { key: 'weekly-reflection-edit', restore: setEditContent });
  const newIssues = useFormController();
  const editIssues = useFormController();

  const handleCreate = () => {
    if (!newContent.trim()) return;
    try {
      store.addWeeklyReflection(weekKey, newContent.trim());
      setNewContent('');
      setAdding(false);
      focusNext('write-reflection');
    } catch (err) {
      newIssues.showError(toUserMessage(err, "Couldn't add the reflection. Try again."));
    }
  };

  const handleUpdate = () => {
    if (!editing || !editContent.trim()) return;
    try {
      store.updateWeeklyReflection(weekKey, editing.id, editContent.trim());
      focusNext(`edit-reflection-${editing.id}`);
      setEditing(null);
      setEditContent('');
    } catch (err) {
      editIssues.showError(toUserMessage(err, "Couldn't save the reflection. Try again."));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    await executeWithKey(`delete_weekly_reflection_${id}`, async () => {
      await store.deleteWeeklyReflection(weekKey, id);
      setDeleting(null);
      showSuccessToast('Reflection deleted', undefined, `weekly_reflection_${id}`);
    });
  };

  // Removing the week's last reflection takes the award back only when it was earned today (server
  // weekly_review_rev_); an award from an earlier day stays.
  const isLastReflection = !notYetRewarded && reflections.length === 1;
  const deleteTakesPoints = isLastReflection && weeklyReflectionAwardedToday(store.state, weekKey);

  return (
    <section className="card space-y-4 p-5" aria-label="Weekly reflection">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">Reflection</h2>
          <p className="mt-0.5 text-xs text-content-muted">
            Written from Friday 6 AM to the end of Monday. The first one earns +{WEEKLY_REFLECTION_POINTS.awarded} pts.
          </p>
          <p className={`mt-1 text-xs ${status.open ? 'text-success-text' : 'text-content-tertiary'}`}>{status.text}</p>
        </div>
        {!adding && status.open && (
          <button
            id="write-reflection"
            type="button"
            onClick={() => {
              setNewContent('');
              setAdding(true);
              focusNext('new-reflection-content');
            }}
            className="btn-primary shrink-0 px-3 py-1.5 text-xs"
          >
            <Plus size={14} />
            <span>Write{notYetRewarded ? ` (+${WEEKLY_REFLECTION_POINTS.awarded})` : ''}</span>
          </button>
        )}
      </div>

      {lastWeekWindowOpen && (
        <button type="button" onClick={onOpenLastWeek} className="text-left text-xs font-medium text-brand-text hover:underline">
          Last week's reflection is open until the end of today. Write it now
        </button>
      )}

      {adding && (
        <Form onSubmit={handleCreate} controller={newIssues} className="space-y-3 rounded-xl border border-overlay-default p-3.5">
          <Textarea
            id="new-reflection-content"
            label="Your reflection"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What went well? What got in the way? What will you change next week?"
            className="min-h-[90px] leading-relaxed"
            maxLength={2000}
            required
          />
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() =>
                newForm.confirmDiscard(() => {
                  setAdding(false);
                  focusNext('write-reflection');
                })
              }
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={!status.open} className="btn-primary">
              <Check size={16} />
              <span>Save</span>
            </button>
          </div>
        </Form>
      )}

      {reflections.length === 0 && !adding ? (
        <EmptyState icon={PenLine} title={`No reflection for ${weekText}`} size="sm" surface={false} />
      ) : (
        <div className="divide-y divide-overlay-subtle">
          {reflections.map((ref) =>
            editing?.id === ref.id ? (
              <Form key={ref.id} onSubmit={handleUpdate} controller={editIssues} className="space-y-3 py-3.5 first:pt-0">
                <Textarea
                  id="edit-reflection-content"
                  label="Edit reflection"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[90px] leading-relaxed"
                  maxLength={2000}
                  required
                />
                <div className="dialog-actions">
                  <button
                    type="button"
                    onClick={() =>
                      editForm.confirmDiscard(() => {
                        focusNext(`edit-reflection-${ref.id}`);
                        setEditing(null);
                      })
                    }
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={!status.open} className="btn-primary">
                    Save changes
                  </button>
                </div>
              </Form>
            ) : (
              <article key={ref.id} className="space-y-1.5 py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <span className="figure">{formatWhen(ref.createdAt)}</span>
                    {isWeeklyReflectionAwarded(weekKey, ref.id, store.state) && (
                      <span className="figure font-medium text-success-text">+{WEEKLY_REFLECTION_POINTS.awarded} pts</span>
                    )}
                  </div>
                  {status.open && (
                    <div className="-mr-2 flex items-center">
                      <button
                        id={`edit-reflection-${ref.id}`}
                        type="button"
                        onClick={() =>
                          editForm.confirmDiscard(() => {
                            setEditing(ref);
                            setEditContent(ref.content);
                            focusNext('edit-reflection-content');
                          })
                        }
                        className={`p-1.5 text-content-muted transition-colors hover:text-content-secondary ${TAP_TARGET_Y}`}
                        aria-label="Edit reflection"
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(ref)}
                        className={`p-1.5 text-content-muted transition-colors hover:text-rose-theme ${TAP_TARGET_Y}`}
                        aria-label="Delete reflection"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-content-secondary whitespace-pre-wrap break-words">{ref.content}</p>
              </article>
            )
          )}
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isDeleting={deleting ? isKeyLoading(`delete_weekly_reflection_${deleting.id}`) : false}
        title="Delete reflection?"
        itemName={deleting ? (deleting.content.length > 30 ? `${deleting.content.slice(0, 30)}…` : deleting.content) : ''}
        description={
          deleteTakesPoints
            ? `It earned +${WEEKLY_REFLECTION_POINTS.awarded} pts today, so they come off. Your goals stay as they are.`
            : isLastReflection
              ? `The +${WEEKLY_REFLECTION_POINTS.awarded} pts it earned on an earlier day stay. Your goals stay as they are.`
              : 'Your goals stay as they are.'
        }
        confirmText="Delete reflection"
      />
    </section>
  );
}
