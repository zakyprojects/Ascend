import { useMemo, useState } from 'react';
import { Plus, Scale } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { DecisionLog } from '@/types';
import { EmptyState } from '@/components/ui/primitives';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { DecisionCard } from './DecisionCard';
import { DecisionFormDialog } from './DecisionFormDialog';
import { DecisionReflectDialog } from './DecisionReflectDialog';
import { dueDecisions } from './pfcLists';

const REFLECTED_PAGE = 10;

/** Decisions tab: To revisit, Coming up, Reflected. Decisions earn no points. */
export function DecisionJournal({ store, today }: { store: AppStore; today: string }) {
  const { showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [formOpen, setFormOpen] = useState(false);
  const [reflecting, setReflecting] = useState<DecisionLog | null>(null);
  const [toDelete, setToDelete] = useState<DecisionLog | null>(null);
  const [showReflected, setShowReflected] = useState(false);
  const [reflectedShown, setReflectedShown] = useState(REFLECTED_PAGE);

  const logs = store.state.decisionLogs;
  const due = useMemo(() => dueDecisions(logs, today), [logs, today]);
  const upcoming = useMemo(
    () => logs.filter((d) => !d.isReflected && d.revisitDate > today).sort((a, b) => a.revisitDate.localeCompare(b.revisitDate)),
    [logs, today]
  );
  const reflected = useMemo(
    () => logs.filter((d) => d.isReflected).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [logs]
  );

  const card = (d: DecisionLog) => (
    <DecisionCard key={d.id} decision={d} today={today} onReflect={() => setReflecting(d)} onDelete={() => setToDelete(d)} />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">Decision journal</h2>
          <p className="text-xs text-content-muted">Write down a big choice and why, then check later how it went.</p>
        </div>
        {logs.length > 0 && (
          <button type="button" onClick={() => setFormOpen(true)} className="btn-primary min-h-11">
            <Plus size={16} aria-hidden="true" />
            <span>Log decision</span>
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={Scale}
          iconClassName="bg-purple-500/15 text-purple-hierarchy"
          title="No decisions logged yet"
          description="Log a choice, why you made it, and a day to check how it went."
          action={
            <button type="button" onClick={() => setFormOpen(true)} className="btn-primary mx-auto">
              <Plus size={16} aria-hidden="true" /> Log your first decision
            </button>
          }
        />
      ) : (
        <>
          <section className="space-y-3" aria-label="To revisit">
            <h3 className="section-title">To revisit</h3>
            {due.length === 0 ? (
              <p className="card p-4 text-sm text-content-muted">Nothing to revisit today.</p>
            ) : (
              <div className="space-y-3">{due.map(card)}</div>
            )}
          </section>

          {upcoming.length > 0 && (
            <section className="space-y-3" aria-label="Coming up">
              <h3 className="section-title">Coming up</h3>
              <div className="space-y-3">{upcoming.map(card)}</div>
            </section>
          )}

          {reflected.length > 0 && (
            <section className="space-y-3" aria-label="Reflected">
              <div className="flex items-center justify-between gap-3">
                <h3 className="section-title">Reflected</h3>
                <button
                  type="button"
                  onClick={() => setShowReflected((v) => !v)}
                  aria-expanded={showReflected}
                  className="btn-ghost min-h-10 text-xs"
                >
                  {showReflected ? 'Hide' : `Show ${reflected.length}`}
                </button>
              </div>
              {showReflected && (
                <>
                  <div className="space-y-3">{reflected.slice(0, reflectedShown).map(card)}</div>
                  {reflected.length > reflectedShown && (
                    <button
                      type="button"
                      onClick={() => setReflectedShown((n) => n + REFLECTED_PAGE)}
                      className="btn-secondary w-full min-h-11"
                    >
                      Show more
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      <DecisionFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(title, rationale, outcome, revisit) => {
          store.addDecision(title, rationale, outcome, revisit);
          setFormOpen(false);
          showSuccessToast('Decision logged', 'It shows up again on its revisit day.');
        }}
      />

      <DecisionReflectDialog
        decision={reflecting}
        onClose={() => setReflecting(null)}
        onSave={(id, text) => {
          store.reflectDecision(id, text);
          setReflecting(null);
        }}
      />

      <ConfirmDeleteModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const id = toDelete.id;
          await executeWithKey(`delete_decision_${id}`, async () => {
            await store.deleteDecisionLog(id);
            setToDelete(null);
            showSuccessToast('Decision deleted', 'Decision entry removed.', `decision_${id}`);
          });
        }}
        isDeleting={toDelete ? isKeyLoading(`delete_decision_${toDelete.id}`) : false}
        title="Delete decision?"
        itemName={toDelete?.title}
        description="The decision and its reflection are deleted for good."
      />
    </div>
  );
}
