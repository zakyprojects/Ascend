import { useState, useEffect } from 'react';
import { Compass, Plus, Globe, Lock, Copy, CheckCircle2, Circle, Trash2, Award, Sparkles, User, Layers, Edit3, RefreshCw } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ImprovementPlan, UserPlanFollow } from '@/types';
import { getCurrentTier } from '@/lib/tiers';
import { TierBadge } from '@/components/ui/TierBadge';
import { fetchPublicPlansFromSupabase, mapRowToImprovementPlan, supabase, syncBroadcaster } from '@/lib/supabase';
import { getProfilePointsByUsername } from '@/lib/auth';

export function ImprovementPlans({ store }: { store: AppStore }) {
  const [activeTab, setActiveTab] = useState<'my_plans' | 'discover'>('my_plans');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal Growth');
  const [isPublic, setIsPublic] = useState(true);
  const [steps, setSteps] = useState<string[]>(['Step 1: ', 'Step 2: ', 'Step 3: ']);

  // Edit Form states
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('Personal Growth');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editSteps, setEditSteps] = useState<string[]>([]);

  const improvementPlans = store.state.improvementPlans;
  const followedPlans = store.state.followedPlans;
  const currentUsername = store.state.username;

  // Remote public plans fetched & updated via Supabase Realtime & syncBroadcaster
  const [remotePublicPlans, setRemotePublicPlans] = useState<ImprovementPlan[]>([]);

  const loadPlans = async () => {
    setIsRefreshing(true);
    try {
      const plans = await fetchPublicPlansFromSupabase();
      if (plans) {
        setRemotePublicPlans(plans);
        plans.forEach((p) => {
          if (p.copyCount !== undefined) {
            store.updatePlanCopyCount(p.id, p.copyCount);
          }
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Initial fetch on mount / tab switch
    const fetchInitialPlans = async () => {
      const plans = await fetchPublicPlansFromSupabase();
      if (mounted && plans) {
        setRemotePublicPlans(plans);
        plans.forEach((p) => {
          if (p.copyCount !== undefined) {
            store.updatePlanCopyCount(p.id, p.copyCount);
          }
        });
      }
    };

    fetchInitialPlans();

    // 1. Supabase Realtime postgres_changes listener for improvement_plans
    const plansChannel = supabase
      .channel('public_plans_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'improvement_plans' },
        (payload) => {
          if (!mounted) return;
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            if (newRow && newRow.is_public) {
              const newPlan = mapRowToImprovementPlan(newRow);
              setRemotePublicPlans((prev) => {
                if (prev.some((p) => p.id === newPlan.id)) return prev;
                return [newPlan, ...prev];
              });
            }
          } else if (eventType === 'UPDATE') {
            if (newRow) {
              const updatedPlan = mapRowToImprovementPlan(newRow);
              if (newRow.copy_count !== undefined) {
                store.updatePlanCopyCount(newRow.id, newRow.copy_count);
              }
              setRemotePublicPlans((prev) => {
                if (!newRow.is_public) {
                  return prev.filter((p) => p.id !== updatedPlan.id);
                }
                const exists = prev.some((p) => p.id === updatedPlan.id);
                if (exists) {
                  return prev.map((p) => (p.id === updatedPlan.id ? { ...p, ...updatedPlan } : p));
                } else {
                  return [updatedPlan, ...prev];
                }
              });
            }
          } else if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              setRemotePublicPlans((prev) => prev.filter((p) => p.id !== oldRow.id));
            }
          }
        }
      )
      .subscribe();

    // 2. Supabase Realtime listener for user_plan_follows (fires when ANY user copies a plan)
    const followsChannel = supabase
      .channel('public_follows_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_plan_follows' },
        (payload) => {
          if (!mounted) return;
          const newFollow = payload.new;
          if (newFollow && newFollow.original_plan_id) {
            const targetId = newFollow.original_plan_id;
            setRemotePublicPlans((prev) =>
              prev.map((p) => (p.id === targetId ? { ...p, copyCount: (p.copyCount || 0) + 1 } : p))
            );
            const currentLocal = store.state.improvementPlans.find((p) => p.id === targetId);
            if (currentLocal) {
              store.updatePlanCopyCount(targetId, (currentLocal.copyCount || 0) + 1);
            }
          }
        }
      )
      .subscribe();

    // 3. Tab-to-tab syncBroadcaster listener for local multi-tab sync
    const unsubscribeBroadcast = syncBroadcaster.subscribe((event) => {
      if (!mounted) return;
      if (event.type === 'PLAN_DELETED' && event.data?.planId) {
        const deletedId = event.data.planId;
        setRemotePublicPlans((prev) => prev.filter((p) => p.id !== deletedId));
      } else if (event.type === 'PLAN_UPDATED' && event.data) {
        const updated = event.data;
        if (updated.id) {
          setRemotePublicPlans((prev) => {
            if (updated.isPublic === false) {
              return prev.filter((p) => p.id !== updated.id);
            }
            return prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
          });
        }
      }
    });

    // Cleanup subscriptions on unmount
    return () => {
      mounted = false;
      supabase.removeChannel(plansChannel);
      supabase.removeChannel(followsChannel);
      unsubscribeBroadcast();
    };
  }, [activeTab]);

  // Merge public plans from store and remote database
  const publicDiscoverPlans = (() => {
    const localPublic = store.getPublicImprovementPlans();
    const map = new Map<string, ImprovementPlan>();

    // Add local public plans first
    localPublic.forEach((p) => map.set(p.id, p));

    // Merge remote public plans (remote plans take precedence for copyCount)
    remotePublicPlans.forEach((p) => {
      const existing = map.get(p.id);
      if (existing) {
        map.set(p.id, {
          ...existing,
          ...p,
          copyCount: Math.max(existing.copyCount || 0, p.copyCount || 0),
        });
      } else {
        map.set(p.id, p);
      }
    });

    // Filter out deleted or non-public plans from local state
    return Array.from(map.values())
      .filter((p) => {
        const isMyPlan = (p.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase() || (p.creatorId && store.state.currentUser?.id && p.creatorId === store.state.currentUser.id);
        const localMatch = improvementPlans.find((lp) => lp.id === p.id);
        if (localMatch) {
          return localMatch.isPublic;
        }
        if (isMyPlan) {
          return false;
        }
        return p.isPublic;
      })
      .map((p) => {
        const localMatch = improvementPlans.find((lp) => lp.id === p.id);
        if (localMatch) {
          return {
            ...localMatch,
            ...p,
            copyCount: Math.max(localMatch.copyCount || 0, p.copyCount || 0),
          };
        }
        return p;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  })();

  const myCreatedPlans = improvementPlans.filter((p) => (p.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase());

  // Create Step handlers
  const handleAddStepField = () => {
    setSteps([...steps, `Step ${steps.length + 1}: `]);
  };

  const handleStepChange = (index: number, val: string) => {
    const updated = [...steps];
    updated[index] = val;
    setSteps(updated);
  };

  const handleRemoveStepField = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, idx) => idx !== index));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    store.createImprovementPlan(title, description, isPublic, steps, category);
    setCreateModalOpen(false);
    setTitle('');
    setDescription('');
    setSteps(['Step 1: ', 'Step 2: ', 'Step 3: ']);
  };

  // Edit Step handlers
  const handleOpenEdit = (plan: ImprovementPlan) => {
    setEditingPlanId(plan.id);
    setEditTitle(plan.title);
    setEditDescription(plan.description);
    setEditCategory(plan.category || 'Personal Growth');
    setEditIsPublic(plan.isPublic);
    setEditSteps(plan.steps.map((s) => s.title));
    setEditModalOpen(true);
  };

  const handleAddEditStepField = () => {
    setEditSteps([...editSteps, `Step ${editSteps.length + 1}: `]);
  };

  const handleEditStepChange = (index: number, val: string) => {
    const updated = [...editSteps];
    updated[index] = val;
    setEditSteps(updated);
  };

  const handleRemoveEditStepField = (index: number) => {
    if (editSteps.length <= 1) return;
    setEditSteps(editSteps.filter((_, idx) => idx !== index));
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId || !editTitle.trim() || !editDescription.trim()) return;
    store.updateImprovementPlan(editingPlanId, editTitle, editDescription, editCategory, editIsPublic, editSteps);
    setEditModalOpen(false);
    setEditingPlanId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <Compass className="text-blue-400" size={26} />
            Personal Improvement Plans
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Build step-by-step goals, discover public plans from top rankers, and copy plans to track your progress
          </p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span>Create Plan</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 gap-2">
        <button
          onClick={() => setActiveTab('my_plans')}
          className={`px-4 py-2.5 font-medium text-xs rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'my_plans'
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Layers size={16} />
          <span>My Plans & Following ({followedPlans.length + myCreatedPlans.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('discover');
            loadPlans();
          }}
          className={`px-4 py-2.5 font-medium text-xs rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'discover'
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Globe size={16} />
          <span>Discover Public Plans ({publicDiscoverPlans.length})</span>
        </button>
      </div>

      {/* MY PLANS TAB */}
      {activeTab === 'my_plans' && (
        <div className="space-y-6">
          {/* Active Followed Plans */}
          <div>
            <h2 className="section-title mb-3">Plans You Are Following</h2>
            {followedPlans.length === 0 ? (
              <div className="card p-6 text-center text-xs text-slate-500">
                You are not following any plans yet. Discover public community plans or copy one of your own!
              </div>
            ) : (
              <div className="space-y-3">
                {followedPlans.map((fp) => {
                  const completedSteps = fp.steps.filter((s) => s.completed).length;
                  const totalSteps = fp.steps.length;
                  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

                  return (
                    <div key={fp.id} className="card p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                            {fp.title}
                            {fp.isCompleted && (
                              <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px]">
                                Completed 🎉
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">{fp.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-blue-400">{progressPct}%</span>
                          <button
                            onClick={() => store.deleteFollowedPlan(fp.id)}
                            className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                            title="Delete Copied Plan"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-bg-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      {/* Steps List */}
                      <div className="space-y-1.5 pt-1">
                        {fp.steps.map((step) => (
                          <div
                            key={step.id}
                            onClick={() => store.completePlanStep(fp.id, step.id)}
                            className={`card p-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                              step.completed
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-400 line-through'
                                : 'bg-bg-800/80 hover:bg-bg-700 text-slate-200 border-white/5'
                            }`}
                          >
                            {step.completed ? (
                              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                            ) : (
                              <Circle size={16} className="text-slate-500 shrink-0" />
                            )}
                            <span className="text-xs flex-1">{step.title}</span>
                            <span className="text-[10px] text-blue-400 font-bold">+10 pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Created Plans */}
          <div>
            <h2 className="section-title mb-3">Plans Created by You</h2>
            {myCreatedPlans.length === 0 ? (
              <div className="card p-6 text-center text-xs text-slate-500">
                You haven't created any plans yet. Click "Create Plan" above to design a shareable roadmap!
              </div>
            ) : (
              <div className="space-y-3">
                {myCreatedPlans.map((plan) => {
                  const remoteMatch = remotePublicPlans.find((r) => r.id === plan.id);
                  const displayCopyCount = remoteMatch
                    ? Math.max(plan.copyCount || 0, remoteMatch.copyCount || 0)
                    : (plan.copyCount || 0);

                  return (
                    <div key={plan.id} className="card p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-200 text-sm">{plan.title}</h3>
                          <span className={`badge text-[10px] font-bold ${plan.isPublic ? 'bg-blue-500/15 text-blue-300' : 'bg-bg-700 text-slate-500'}`}>
                            {plan.isPublic ? <Globe size={11} className="inline mr-1" /> : <Lock size={11} className="inline mr-1" />}
                            {plan.isPublic ? 'Public' : 'Private'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-bold text-blue-400">
                            <Copy size={13} /> {displayCopyCount} copies
                          </span>
                          <button
                            onClick={async () => {
                              console.log(`[UI Click] Visibility toggle clicked for plan: ${plan.id}, current isPublic: ${plan.isPublic}`);
                              await store.togglePlanVisibility(plan.id, !plan.isPublic);
                            }}
                            className="btn-ghost text-xs text-slate-400 hover:text-blue-300"
                          >
                            Make {plan.isPublic ? 'Private' : 'Public'}
                          </button>
                          <button
                            onClick={() => handleOpenEdit(plan)}
                            className="text-slate-600 hover:text-blue-400 p-1 transition-colors"
                            title="Edit Plan"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={async () => {
                              console.log(`[UI Click] Delete button clicked for plan: ${plan.id}`);
                              await store.deletePlan(plan.id);
                            }}
                            className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                            title="Delete Plan"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{plan.description}</p>
                      <div className="text-[11px] text-slate-500">{plan.steps.length} steps/milestones</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCOVER PUBLIC PLANS TAB */}
      {activeTab === 'discover' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Public Community Plans</h2>
            <button
              onClick={loadPlans}
              disabled={isRefreshing}
              className="btn-ghost text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {publicDiscoverPlans.length === 0 ? (
            <div className="card p-8 text-center text-xs text-slate-500">
              No public plans discovered yet. Be the first to create a public improvement plan!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {publicDiscoverPlans.map((plan) => {
                const isMyPlan = (plan.creatorUsername || '').toLowerCase() === (currentUsername || '').toLowerCase() || (plan.creatorId && store.state.currentUser?.id && plan.creatorId === store.state.currentUser.id);
                const alreadyCopied = followedPlans.some((f) => f.originalPlanId === plan.id);
                const creatorPts = isMyPlan
                  ? store.state.totalPoints
                  : (plan.creatorPoints ?? getProfilePointsByUsername(plan.creatorUsername || ''));
                const creatorTier = getCurrentTier(creatorPts);

                return (
                  <div key={plan.id} className="card p-4 flex flex-col justify-between space-y-3 card-hover">
                    <div>
                      {/* Creator Credibility Signal & Actions */}
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold">
                            {plan.creatorAvatar || '🧑'}
                          </span>
                          <span className="font-bold text-slate-200">{plan.creatorUsername}</span>
                          <span className="badge bg-purple-500/15 text-purple-300 text-[10px]">
                            {creatorTier.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">{plan.category}</span>
                          {isMyPlan && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(plan)}
                                className="text-slate-600 hover:text-blue-400 p-1 transition-colors"
                                title="Edit My Public Plan"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={async () => {
                                  console.log(`[UI Click] Delete button clicked for plan: ${plan.id}`);
                                  await store.deletePlan(plan.id);
                                }}
                                className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                                title="Delete My Public Plan"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-100 text-base">{plan.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plan.description}</p>

                      <div className="mt-3 text-xs text-slate-500 flex items-center gap-3">
                        <span>{plan.steps.length} Milestones/Steps</span>
                        <span>•</span>
                        <span className="text-blue-400 font-medium">{plan.copyCount || 0} users following</span>
                      </div>
                    </div>

                    {isMyPlan ? (
                      <button disabled className="btn-secondary text-xs w-full py-2 flex items-center justify-center gap-1.5 opacity-60 cursor-not-allowed">
                        <span>Your Plan</span>
                      </button>
                    ) : alreadyCopied ? (
                      <button disabled className="btn-secondary text-xs w-full py-2 flex items-center justify-center gap-1.5 opacity-70 cursor-not-allowed">
                        <CheckCircle2 size={14} className="text-emerald-400" />
                        <span>Already Copied</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          store.copyPublicPlan(plan);
                          setActiveTab('my_plans');
                        }}
                        className="btn-primary text-xs w-full py-2 flex items-center justify-center gap-1.5"
                      >
                        <Copy size={14} />
                        <span>Copy Plan to My Account</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Plan Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Improvement Plan">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Plan Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 30-Day Morning Mastery Blueprint"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Goal & Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the objective and core outcome of this plan..."
              className="input min-h-[70px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Health, Productivity"
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Visibility</label>
              <select
                value={isPublic ? 'public' : 'private'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
                className="input"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* Dynamic Steps List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-400">Steps & Milestones</label>
              <button type="button" onClick={handleAddStepField} className="text-xs text-blue-400 hover:underline">
                + Add Step
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleStepChange(idx, e.target.value)}
                    placeholder={`Step #${idx + 1}...`}
                    className="input text-xs flex-1"
                    required
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStepField(idx)}
                      className="text-slate-600 hover:text-rose-400 p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Create Plan
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Plan Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Improvement Plan">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Plan Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="e.g. 30-Day Morning Mastery Blueprint"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Goal & Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Describe the objective and core outcome of this plan..."
              className="input min-h-[70px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="e.g. Health, Productivity"
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Visibility</label>
              <select
                value={editIsPublic ? 'public' : 'private'}
                onChange={(e) => setEditIsPublic(e.target.value === 'public')}
                className="input"
              >
                <option value="public">Public (Shareable in Discover)</option>
                <option value="private">Private (Only for me)</option>
              </select>
            </div>
          </div>

          {/* Dynamic Steps List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-400">Steps & Milestones</label>
              <button type="button" onClick={handleAddEditStepField} className="text-xs text-blue-400 hover:underline">
                + Add Step
              </button>
            </div>
            <div className="space-y-2">
              {editSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleEditStepChange(idx, e.target.value)}
                    placeholder={`Step #${idx + 1}...`}
                    className="input text-xs flex-1"
                    required
                  />
                  {editSteps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEditStepField(idx)}
                      className="text-slate-600 hover:text-rose-400 p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
