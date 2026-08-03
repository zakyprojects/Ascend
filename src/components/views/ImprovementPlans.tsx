import { useState, useEffect } from 'react';
import { Compass, Plus, Globe, Lock, Copy, CheckCircle2, Circle, Trash2, Award, Sparkles, User, Layers } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ImprovementPlan, UserPlanFollow } from '@/types';
import { getCurrentTier } from '@/lib/tiers';
import { TierBadge } from '@/components/ui/TierBadge';
import { fetchPublicPlansFromSupabase, supabase } from '@/lib/supabase';

export function ImprovementPlans({ store }: { store: AppStore }) {
  const [activeTab, setActiveTab] = useState<'my_plans' | 'discover'>('my_plans');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal Growth');
  const [isPublic, setIsPublic] = useState(true);
  const [steps, setSteps] = useState<string[]>(['Step 1: ', 'Step 2: ', 'Step 3: ']);

  const improvementPlans = store.state.improvementPlans;
  const followedPlans = store.state.followedPlans;
  const currentUsername = store.state.username;

  // Remote public plans fetched from Supabase
  const [remotePublicPlans, setRemotePublicPlans] = useState<ImprovementPlan[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadPlans = async () => {
      const plans = await fetchPublicPlansFromSupabase();
      if (mounted && plans) {
        setRemotePublicPlans(plans);
      }
    };

    loadPlans();

    // Subscribe to Supabase Realtime changes for public plans across all browsers/devices
    const channel = supabase
      .channel('public_plans_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'improvement_plans' },
        () => {
          if (mounted) loadPlans();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  // Merge public plans from store and remote database
  const publicDiscoverPlans = (() => {
    const localPublic = store.getPublicImprovementPlans();
    const map = new Map<string, ImprovementPlan>();
    remotePublicPlans.forEach((p) => map.set(p.id, p));
    localPublic.forEach((p) => map.set(p.id, p));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  })();

  const myCreatedPlans = improvementPlans.filter((p) => p.creatorUsername.toLowerCase() === currentUsername.toLowerCase());

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
          onClick={() => setActiveTab('discover')}
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
                        <span className="text-xs font-bold text-blue-400">{progressPct}%</span>
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
                {myCreatedPlans.map((plan) => (
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
                        <span className="flex items-center gap-1">
                          <Copy size={13} /> {plan.copyCount} copies
                        </span>
                        <button
                          onClick={() => store.togglePlanVisibility(plan.id)}
                          className="btn-ghost text-xs text-slate-400 hover:text-blue-300"
                        >
                          Make {plan.isPublic ? 'Private' : 'Public'}
                        </button>
                        <button
                          onClick={() => store.deletePlan(plan.id)}
                          className="text-slate-600 hover:text-rose-400 p-1"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">{plan.description}</p>
                    <div className="text-[11px] text-slate-500">{plan.steps.length} steps/milestones</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCOVER PUBLIC PLANS TAB */}
      {activeTab === 'discover' && (
        <div className="space-y-3">
          <h2 className="section-title">Public Community Plans</h2>

          {publicDiscoverPlans.length === 0 ? (
            <div className="card p-8 text-center text-xs text-slate-500">
              No public plans discovered yet. Be the first to create a public improvement plan!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {publicDiscoverPlans.map((plan) => {
                const creatorTier = getCurrentTier(1000); // Credibility signal
                return (
                  <div key={plan.id} className="card p-4 flex flex-col justify-between space-y-3 card-hover">
                    <div>
                      {/* Creator Credibility Signal */}
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
                        <span className="text-[10px] text-slate-500">{plan.category}</span>
                      </div>

                      <h3 className="font-bold text-slate-100 text-base">{plan.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plan.description}</p>

                      <div className="mt-3 text-xs text-slate-500 flex items-center gap-3">
                        <span>{plan.steps.length} Milestones/Steps</span>
                        <span>•</span>
                        <span className="text-blue-400 font-medium">{plan.copyCount} users following</span>
                      </div>
                    </div>

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
    </div>
  );
}
