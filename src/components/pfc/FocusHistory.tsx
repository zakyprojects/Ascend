import { useMemo, useState } from 'react';
import { Timer, Trash2 } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { FocusSessionLog } from '@/types';
import { formatDateLong } from '@/lib/dates';
import { trustedNowMs } from '@/lib/clock';
import { computeFocusAwards } from '@/lib/focusAwards';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { byNewest, groupByDay, timeOfDay, DAYS_PAGE } from './pfcLists';

/** Today's points from these sessions (same rule as the server), for the delete message. */
function todaysFocusPoints(logs: FocusSessionLog[], today: string): number {
  return computeFocusAwards(logs, today, new Date(`${today}T00:00:00`).getTime(), trustedNowMs()).entry?.amount ?? 0;
}

/** Sessions, newest first: Today, then earlier days a week at a time. */
export function FocusHistory({ store, today }: { store: AppStore; today: string }) {
  const { showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [daysShown, setDaysShown] = useState(DAYS_PAGE);
  const [toDelete, setToDelete] = useState<FocusSessionLog | null>(null);

  const logs = store.state.focusLogs;
  const skills = store.state.skills;
  const sorted = useMemo(() => [...logs].sort(byNewest((l) => l.date, (l) => l.createdAt)), [logs]);
  const todayLogs = sorted.filter((l) => l.date === today);
  const earlierDays = useMemo(() => groupByDay(sorted.filter((l) => l.date !== today), (l) => l.date), [sorted, today]);

  const deleteDescription = (() => {
    if (!toDelete) return '';
    if (toDelete.date !== today) return 'Points already earned for that day stay.';
    const before = todaysFocusPoints(logs, today);
    const after = todaysFocusPoints(logs.filter((l) => l.id !== toDelete.id), today);
    return before > after
      ? `Today's focus points go down by ${before - after} (from ${before} to ${after}).`
      : "Today's focus points don't change.";
  })();

  const row = (log: FocusSessionLog) => {
    const skill = skills.find((s) => s.id === log.skillId);
    const at = timeOfDay(log.createdAt);
    return (
      <div key={log.id} className="p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-hierarchy shrink-0" aria-hidden="true">
              <Timer size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="item-name text-sm text-content-secondary truncate">{log.taskName}</h3>
              <p className="text-xs text-content-muted truncate">
                <span className="figure">{log.durationMinutes} min</span>
                {at ? ` · ${at}` : ''}
                {skill ? ` · ${skill.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {log.pointsAwarded > 0 && <span className="figure text-xs text-cyan-hierarchy whitespace-nowrap">+{log.pointsAwarded} pts</span>}
            <button
              type="button"
              onClick={() => setToDelete(log)}
              aria-label={`Delete focus session ${log.taskName}`}
              title="Delete focus session"
              className={`p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {log.reflection && (
          <p className="ml-12 p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-xs text-content-tertiary break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            {log.reflection}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title mb-3">Today</h2>
        {todayLogs.length === 0 ? (
          <p className="card p-4 text-sm text-content-muted">No focus sessions today yet.</p>
        ) : (
          <div className="card overflow-hidden divide-y divide-overlay-subtle">{todayLogs.map(row)}</div>
        )}
      </div>

      {earlierDays.length > 0 && (
        <div className="space-y-4">
          <h2 className="section-title">Earlier</h2>
          {earlierDays.slice(0, daysShown).map(([day, list]) => {
            const minutes = list.reduce((sum, l) => sum + l.durationMinutes, 0);
            return (
              <div key={day}>
                <div className="flex items-center justify-between mb-1.5 px-1 text-xs text-content-muted">
                  <span>{formatDateLong(day)}</span>
                  <span className="figure">{minutes} min</span>
                </div>
                <div className="card overflow-hidden divide-y divide-overlay-subtle">{list.map(row)}</div>
              </div>
            );
          })}
          {earlierDays.length > daysShown && (
            <button type="button" onClick={() => setDaysShown((n) => n + DAYS_PAGE)} className="btn-secondary w-full min-h-11">
              Show older days
            </button>
          )}
        </div>
      )}

      <ConfirmDeleteModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const id = toDelete.id;
          await executeWithKey(`delete_focus_log_${id}`, async () => {
            await store.deleteFocusLog(id);
            setToDelete(null);
            showSuccessToast('Session deleted', 'Focus session removed.', `focus_log_${id}`);
          });
        }}
        isDeleting={toDelete ? isKeyLoading(`delete_focus_log_${toDelete.id}`) : false}
        title="Delete focus session?"
        itemName={toDelete?.taskName}
        description={deleteDescription}
      />
    </div>
  );
}
