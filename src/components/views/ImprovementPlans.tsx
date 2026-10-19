import { useMemo, useState } from 'react';
import { Edit3, Globe, Lock, Plus, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { ProgressUpdateDialog } from '@/components/ui/ProgressUpdateDialog';
import { PageHero } from '@/components/ui/PageHero';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { Badge, Dialog, EmptyState, Form, NumberField, TabPanel, Tabs } from '@/components/ui/primitives';
import { ImprovementPlan, UserPlanFollow } from '@/types';
import { toUserMessage } from '@/lib/userMessage';
import { PlanCard } from '@/components/plans/PlanCard';
import { PlanIconButton } from '@/components/plans/PlanIconButton';
import type { PlanActions } from '@/components/plans/PlanBody';
import { CreatePlanDialog } from '@/components/plans/CreatePlanDialog';
import { EditPlanDialog } from '@/components/plans/EditPlanDialog';
import { DiscoverPanel } from '@/components/plans/DiscoverPanel';
import { useDiscoverPlans } from '@/components/plans/useDiscoverPlans';
import { type AnyPlan, finishLineShare, isReviewDue, journeyState, ownPlans, planTypeOf, targetProgress } from '@/components/plans/planMeta';
import { useLocalDayKey } from '@/lib/useLocalDayKey';

type Owner = 'own' | 'copy';
type PlansTab = 'my_plans' | 'discover';
const PLAN_TABS: PlansTab[] = ['my_plans', 'discover'];

export function ImprovementPlans({ store }: { store: AppStore }) {
  const { showSuccessToast, showErrorToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  // Re-renders at local midnight: journeys' "done this period" and day counts roll over (C5).
  useLocalDayKey();

  const [activeTab, setActiveTab] = useState<PlansTab>('my_plans');
  const changeTab = (id: string) => setActiveTab(id as PlansTab);
  // Bumped on every open so the create dialog always starts fresh.
  const [createKey, setCreateKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ owner: Owner; id: string } | null>(null);
  const [progressFor, setProgressFor] = useState<{ owner: Owner; id: string } | null>(null);
  const [newTargetFor, setNewTargetFor] = useState<{ owner: Owner; id: string } | null>(null);
  const [newTargetValue, setNewTargetValue] = useState(10);
  const [planToDelete, setPlanToDelete] = useState<ImprovementPlan | null>(null);
  const [followToDelete, setFollowToDelete] = useState<UserPlanFollow | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{ owner: Owner; id: string; noteKey: string } | null>(null);

  const currentUserId = store.state.currentUser?.id;
  const followedPlans = store.state.followedPlans;
  const myPlans = ownPlans(store.state.improvementPlans, currentUserId);

  const discover = useDiscoverPlans(store, activeTab === 'discover');
  const remoteById = useMemo(() => new Map(discover.plans.map((p) => [p.id, p])), [discover.plans]);
  const copiedPlanIds = useMemo(() => new Set(followedPlans.map((f) => f.originalPlanId).filter(Boolean)), [followedPlans]);

  const findPlan = (owner: Owner, id: string): AnyPlan | undefined =>
    owner === 'own' ? myPlans.find((p) => p.id === id) : followedPlans.find((f) => f.id === id);
  const editingPlan = editing ? findPlan(editing.owner, editing.id) : undefined;
  const progressPlan = progressFor ? findPlan(progressFor.owner, progressFor.id) : undefined;

  // ---- Hero numbers (live from the plans each render) ----
  const allPlans: AnyPlan[] = [...myPlans, ...followedPlans];
  const journeys = allPlans.filter((p) => planTypeOf(p) === 'habit_journey').map(journeyState).filter((j) => j.phase === 'active');
  const journeysDone = journeys.filter((j) => j.doneThisPeriod).length;
  const reviewsDue = allPlans.filter(isReviewDue).length;
  const shares = allPlans.map(finishLineShare).filter((s): s is number => s !== null);
  const averagePct = shares.length > 0 ? Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100) : null;

  // ---- Actions for one card ----
  const actionsFor = (owner: Owner, plan: AnyPlan): PlanActions => {
    const own = owner === 'own';
    return {
      toggleStep: (stepId) => (own ? store.completePlanStep(plan.id, stepId) : store.completeFollowedPlanStep(plan.id, stepId)),
      openProgress: () => setProgressFor({ owner, id: plan.id }),
      openNewTarget: () => {
        setNewTargetValue(targetProgress(plan).target);
        setNewTargetFor({ owner, id: plan.id });
      },
      markJourney: () => (own ? store.markHabitJourneyDone(plan.id) : store.markFollowedHabitJourneyDone(plan.id)),
      undoJourney: () => (own ? store.undoHabitJourneyDone(plan.id) : store.undoFollowedHabitJourneyDone(plan.id)),
      addNote: (text) => (own ? store.addVisionReflectionNote(plan.id, text) : store.addFollowedVisionReflectionNote(plan.id, text)),
      editNote: (noteKey, text) =>
        own ? store.editVisionReflectionNote(plan.id, noteKey, text) : store.editFollowedVisionReflectionNote(plan.id, noteKey, text),
      requestDeleteNote: (noteKey) => setNoteToDelete({ owner, id: plan.id, noteKey }),
    };
  };

  const toggleVisibility = async (plan: ImprovementPlan) => {
    await executeWithKey(`toggle_vis_${plan.id}`, async () => {
      try {
        await store.togglePlanVisibility(plan.id, !plan.isPublic);
      } catch (err: any) {
        showErrorToast("Couldn't change who can see it", toUserMessage(err, 'Try again in a moment.'));
      }
    });
  };

  const copyPlan = async (plan: ImprovementPlan) => {
    await executeWithKey(`copy_plan_${plan.id}`, async () => {
      try {
        const added = await store.copyPublicPlan(plan);
        if (added) showSuccessToast('Plan copied', `"${plan.title}" is in your plans.`);
      } catch (err: any) {
        showErrorToast("Couldn't copy plan", toUserMessage(err, 'Try again in a moment.'));
      }
    });
  };

  const ownControls = (plan: ImprovementPlan) => {
    const busy = isKeyLoading(`toggle_vis_${plan.id}`);
    return (
      <>
        <PlanIconButton
          disabled={busy}
          active={plan.isPublic}
          onClick={() => toggleVisibility(plan)}
          title={plan.isPublic ? 'Public in Discover. Make it only yours' : 'Only you. Share in Discover'}
          label={plan.isPublic ? `Make "${plan.title}" private` : `Share "${plan.title}" in Discover`}
        >
          {busy ? <AscendLoadingIndicator size="sm" /> : plan.isPublic ? <Globe size={16} /> : <Lock size={16} />}
        </PlanIconButton>
        <PlanIconButton onClick={() => setEditing({ owner: 'own', id: plan.id })} title="Edit" label={`Edit "${plan.title}"`}>
          <Edit3 size={16} />
        </PlanIconButton>
        <PlanIconButton tone="danger" onClick={() => setPlanToDelete(plan)} title="Delete" label={`Delete "${plan.title}"`}>
          <Trash2 size={16} />
        </PlanIconButton>
      </>
    );
  };

  const copySource = (follow: UserPlanFollow) => {
    const creator = follow.sourceUsername || remoteById.get(follow.originalPlanId)?.creatorUsername;
    if (creator) return <>Copied from @{creator}</>;
    return follow.originalPlanId ? 'Copied plan' : 'Copied plan (the original was removed)';
  };

  const hasAnyPlan = myPlans.length + followedPlans.length > 0;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans</h1>
          <p className="page-subtitle">Milestones, targets, habit journeys and visions. Yours or copied.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateKey((k) => k + 1);
            setCreateOpen(true);
          }}
          className="btn-primary flex items-center gap-2 sm:shrink-0"
        >
          <Plus size={18} />
          <span>New plan</span>
        </button>
      </div>

      {hasAnyPlan && (
        <Reveal>
          <PageHero
            ariaLabel="Your plans"
            ring={
              averagePct !== null
                ? { value: averagePct, max: 100, label: 'Average progress of milestone and target plans', center: `${averagePct}%`, caption: 'done' }
                : undefined
            }
            lead={{ label: 'Active plans', value: <CountUp value={allPlans.length} />, hint: `${myPlans.length} yours, ${followedPlans.length} copied` }}
            stats={[
              {
                label: 'Journeys done',
                value: journeys.length > 0 ? `${journeysDone}/${journeys.length}` : '0',
                hint: journeys.length > 0 ? 'this day or week' : 'none running',
                valueClassName: journeys.length > 0 && journeysDone === journeys.length ? 'text-success-text' : undefined,
              },
              {
                label: 'Check-ins due',
                value: <CountUp value={reviewsDue} />,
                valueClassName: reviewsDue > 0 ? 'text-purple-hierarchy' : undefined,
              },
            ]}
          />
        </Reveal>
      )}

      <Tabs
        idBase="plans"
        ariaLabel="Plans"
        variant="underline"
        value={activeTab}
        onChange={changeTab}
        items={[
          { id: 'my_plans', label: 'My plans', badge: myPlans.length + followedPlans.length },
          { id: 'discover', label: 'Discover' },
        ]}
      />

      <TabPanel idBase="plans" ids={PLAN_TABS} value={activeTab} onChange={changeTab}>
        {activeTab === 'my_plans' && (
          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className="section-title">Created by me</h2>
              {myPlans.length === 0 ? (
                <EmptyState title="No plans yet" description="Start one from a template or from scratch with New plan." />
              ) : (
                <div className="grid-cards-lg gap-4">
                  {myPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      category={plan.category}
                      tags={
                        <Badge tone="neutral" size="xs">
                          {plan.isPublic ? <Globe size={11} /> : <Lock size={11} />} {plan.isPublic ? 'Public' : 'Only me'}
                        </Badge>
                      }
                      controls={ownControls(plan)}
                      actions={actionsFor('own', plan)}
                      footer={
                        plan.isPublic ? (
                          <span className="text-xs text-content-muted">
                            {plan.copyCount === 1 ? 'Copied once' : `Copied ${plan.copyCount || 0} times`}
                          </span>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="section-title">Copied plans</h2>
              {followedPlans.length === 0 ? (
                <EmptyState title="No copied plans" description="Copy a plan from Discover. The copy is yours: change it and track your own progress." />
              ) : (
                <div className="grid-cards-lg gap-4">
                  {followedPlans.map((follow) => (
                    <PlanCard
                      key={follow.id}
                      plan={follow}
                      source={copySource(follow)}
                      controls={
                        <>
                          <PlanIconButton
                            onClick={() => setEditing({ owner: 'copy', id: follow.id })}
                            title="Edit your copy"
                            label={`Edit your copy "${follow.title}"`}
                          >
                            <Edit3 size={16} />
                          </PlanIconButton>
                          <PlanIconButton
                            tone="danger"
                            onClick={() => setFollowToDelete(follow)}
                            title="Remove copy"
                            label={`Remove copy "${follow.title}"`}
                          >
                            <Trash2 size={16} />
                          </PlanIconButton>
                        </>
                      }
                      actions={actionsFor('copy', follow)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'discover' && (
          <DiscoverPanel
            discover={discover}
            ownPlans={myPlans}
            currentUserId={currentUserId}
            copiedPlanIds={copiedPlanIds}
            isCopying={(id) => isKeyLoading(`copy_plan_${id}`)}
            onCopy={copyPlan}
            ownControls={ownControls}
          />
        )}
      </TabPanel>

      <CreatePlanDialog key={createKey} store={store} open={createOpen} onClose={() => setCreateOpen(false)} />

      {editing && editingPlan && (
        <EditPlanDialog
          key={editingPlan.id}
          store={store}
          plan={editingPlan}
          owner={editing.owner}
          onClose={() => setEditing(null)}
        />
      )}

      <ProgressUpdateDialog
        open={Boolean(progressPlan)}
        onClose={() => setProgressFor(null)}
        title={progressPlan ? `Update progress: ${progressPlan.title}` : 'Update progress'}
        current={progressPlan?.currentProgress ?? 0}
        target={progressPlan ? targetProgress(progressPlan).target : 1}
        format={(n) => `${n} ${progressPlan?.targetUnit ?? ''}`.trim()}
        addLabel="Amount to add"
        setLabel="New total"
        decimal
        tone="cyan"
        onSave={(next) => {
          if (!progressFor) return;
          if (progressFor.owner === 'own') store.updateTargetGoalProgress(progressFor.id, next);
          else store.updateFollowedTargetGoalProgress(progressFor.id, next);
        }}
      />

      <Dialog
        open={newTargetFor !== null}
        onClose={() => setNewTargetFor(null)}
        title="Set a new target"
        maxWidth="max-w-sm"
        footer={
          <>
            <button type="button" onClick={() => setNewTargetFor(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="plan-new-target-form" className="btn-primary">
              Set target
            </button>
          </>
        }
      >
        <Form
          id="plan-new-target-form"
          onSubmit={() => {
            if (!newTargetFor) return;
            if (newTargetFor.owner === 'own') store.setNewTargetGoal(newTargetFor.id, newTargetValue);
            else store.setNewFollowedTargetGoal(newTargetFor.id, newTargetValue);
            setNewTargetFor(null);
          }}
        >
          <NumberField
            id="plan-new-target"
            label="New target"
            hint="Progress starts again from 0."
            decimal
            min={1}
            value={newTargetValue}
            onValueChange={setNewTargetValue}
            required
          />
        </Form>
      </Dialog>

      <ConfirmDeleteModal
        open={Boolean(planToDelete)}
        onClose={() => setPlanToDelete(null)}
        onConfirm={async () => {
          if (!planToDelete) return;
          const planId = planToDelete.id;
          await executeWithKey(`delete_plan_${planId}`, async () => {
            await store.deletePlan(planId);
            setPlanToDelete(null);
            showSuccessToast('Plan deleted', undefined, `plan_${planId}`);
          });
        }}
        isDeleting={planToDelete ? isKeyLoading(`delete_plan_${planToDelete.id}`) : false}
        title="Delete plan?"
        itemName={planToDelete?.title}
        description={`"${planToDelete?.title}" and its check-ins will be deleted. People who copied it keep their copies.`}
      />

      <ConfirmDeleteModal
        open={Boolean(followToDelete)}
        onClose={() => setFollowToDelete(null)}
        onConfirm={async () => {
          if (!followToDelete) return;
          const followId = followToDelete.id;
          await store.deleteFollowedPlan(followId);
          setFollowToDelete(null);
          showSuccessToast('Copy removed', undefined, `follow_${followId}`);
        }}
        title="Remove this copy?"
        itemName={followToDelete?.title}
        description={`Your progress on "${followToDelete?.title}" will be deleted. The original plan is not affected.`}
        confirmText="Remove"
      />

      <ConfirmDeleteModal
        open={Boolean(noteToDelete)}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (!noteToDelete) return;
          if (noteToDelete.owner === 'own') store.deleteVisionReflectionNote(noteToDelete.id, noteToDelete.noteKey);
          else store.deleteFollowedVisionReflectionNote(noteToDelete.id, noteToDelete.noteKey);
          showSuccessToast('Check-in deleted', undefined, `note_${noteToDelete.id}_${noteToDelete.noteKey}`);
          setNoteToDelete(null);
        }}
        title="Delete this check-in?"
        description="This check-in note will be deleted."
      />
    </div>
  );
}
