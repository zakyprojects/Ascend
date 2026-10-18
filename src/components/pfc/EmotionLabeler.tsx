import { useMemo, useState } from 'react';
import { HeartHandshake, Plus, Trash2 } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { EmotionLog } from '@/types';
import { addDays, formatDateLong } from '@/lib/dates';
import { EmptyState } from '@/components/ui/primitives';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { EmotionFormDialog } from './EmotionFormDialog';
import { byNewest, COMMON_EMOTIONS, DAYS_PAGE, emotionSummary, groupByDay, localDayOf, timeOfDay } from './pfcLists';

const SUMMARY_DAYS = 30;

/** Emotions tab: quick labels, a 30-day summary, and every entry by day. No points. */
export function EmotionLabeler({ store, today }: { store: AppStore; today: string }) {
  const { showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [formEmotion, setFormEmotion] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<EmotionLog | null>(null);
  const [daysShown, setDaysShown] = useState(DAYS_PAGE);

  const logs = store.state.emotionLogs;
  const sorted = useMemo(() => [...logs].sort(byNewest((l) => localDayOf(l.date), (l) => l.date)), [logs]);
  const todayLogs = sorted.filter((l) => localDayOf(l.date) === today);
  const earlierDays = useMemo(
    () => groupByDay(sorted.filter((l) => localDayOf(l.date) !== today), (l) => localDayOf(l.date)),
    [sorted, today]
  );
  const summary = useMemo(() => emotionSummary(logs, addDays(today, -(SUMMARY_DAYS - 1))), [logs, today]);

  const row = (l: EmotionLog) => (
    <div key={l.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
      <div className="min-w-0">
        <div className="item-name text-sm !text-content-secondary flex flex-wrap items-baseline gap-x-2">
          <span className="break-words [overflow-wrap:anywhere]">{l.emotion}</span>
          <span className="figure text-xs text-rose-theme">{l.intensity}/10</span>
          <span className="text-2xs font-normal text-content-muted">{timeOfDay(l.date)}</span>
        </div>
        {l.context && <p className="text-content-muted mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{l.context}</p>}
      </div>
      <button
        type="button"
        onClick={() => setToDelete(l)}
        aria-label={`Delete emotion ${l.emotion}`}
        title="Delete emotion"
        className={`p-1.5 rounded-lg text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 transition-colors shrink-0 ${TAP_TARGET}`}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-title">Emotion labeling</h2>
            <p className="text-xs text-content-muted">Naming a feeling helps it settle. Tap one to log it.</p>
          </div>
          <button type="button" onClick={() => setFormEmotion('')} className="btn-primary min-h-11">
            <Plus size={16} aria-hidden="true" />
            <span>Label emotion</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick labels">
          {COMMON_EMOTIONS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setFormEmotion(name)}
              className="min-h-10 px-3 rounded-full border border-rose-500/25 text-xs font-medium text-content-secondary hover:bg-rose-500/10 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {summary.total > 0 && (
        <section className="card p-4 space-y-3" aria-label="Last 30 days">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="section-title">Last 30 days</h3>
            <span className="text-xs text-content-muted">
              <span className="figure">{summary.total}</span> labeled · average intensity{' '}
              <span className="figure text-rose-theme">{summary.average.toFixed(1)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.top.map(({ name, count }) => (
              <span key={name.toLowerCase()} className="badge badge-rose px-3 py-1.5 text-xs font-medium flex items-center gap-2 max-w-full">
                <span className="truncate">{name}</span>
                <span className="figure text-2xs">{count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {logs.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          iconClassName="bg-rose-500/15 text-rose-theme"
          title="No emotions labeled yet"
          description="When a strong feeling hits, name it here. It helps you calm down."
        />
      ) : (
        <>
          <div>
            <h3 className="section-title mb-3">Today</h3>
            {todayLogs.length === 0 ? (
              <p className="card p-4 text-sm text-content-muted">Nothing labeled today yet.</p>
            ) : (
              <div className="card overflow-hidden divide-y divide-overlay-subtle">{todayLogs.map(row)}</div>
            )}
          </div>
          {earlierDays.length > 0 && (
            <div className="space-y-4">
              <h3 className="section-title">Earlier</h3>
              {earlierDays.slice(0, daysShown).map(([day, list]) => (
                <div key={day || 'unknown'}>
                  <div className={cx('mb-1.5 px-1 text-xs text-content-muted')}>{day ? formatDateLong(day) : 'Date unknown'}</div>
                  <div className="card overflow-hidden divide-y divide-overlay-subtle">{list.map(row)}</div>
                </div>
              ))}
              {earlierDays.length > daysShown && (
                <button type="button" onClick={() => setDaysShown((n) => n + DAYS_PAGE)} className="btn-secondary w-full min-h-11">
                  Show older days
                </button>
              )}
            </div>
          )}
        </>
      )}

      <EmotionFormDialog
        initialEmotion={formEmotion}
        onClose={() => setFormEmotion(null)}
        onSave={(emotion, intensity, context) => {
          store.logEmotion(emotion, intensity, context);
          setFormEmotion(null);
          showSuccessToast('Emotion labeled', emotion);
        }}
      />

      <ConfirmDeleteModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const id = toDelete.id;
          await executeWithKey(`delete_emotion_${id}`, async () => {
            await store.deleteEmotionLog(id);
            setToDelete(null);
            showSuccessToast('Emotion deleted', 'Entry removed.', `emotion_${id}`);
          });
        }}
        isDeleting={toDelete ? isKeyLoading(`delete_emotion_${toDelete.id}`) : false}
        title="Delete emotion?"
        itemName={toDelete?.emotion}
        description="This entry is deleted for good."
      />
    </div>
  );
}
