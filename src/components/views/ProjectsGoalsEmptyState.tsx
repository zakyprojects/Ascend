import { Target, FolderKanban, CheckSquare, Plus, ArrowRight } from 'lucide-react';

export type HierarchyTier = 'goals' | 'projects' | 'tasks';

interface EmptyStateProps {
  tier: HierarchyTier;
  onCreate: () => void;
  isFiltered?: boolean;
  onTabSwitch?: (tier: HierarchyTier) => void;
}

const TIER_CONFIG = {
  goals: {
    icon: Target,
    title: 'Define Your Vision',
    text: 'Goals are your ultimate long-term targets. Set a north star to align your daily actions.',
    quote: '“Dreams without goals are just dreams.” – Denzel Washington',
    buttonText: 'Create Your First Goal',
    iconBg: 'bg-purple-500/10 border-purple-500/25 text-purple-400',
    btnClass: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30',
    hierarchyBadge: 'Tier 3 • North Star',
    hierarchyBadgeColor: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    cardBorderHover: 'hover:border-purple-500/30',
  },
  projects: {
    icon: FolderKanban,
    title: 'Bridge the Gap',
    text: 'Projects group related tasks together to achieve your broader goals. Break down your vision into actionable phases.',
    buttonText: 'Create Your First Project',
    iconBg: 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400',
    btnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30',
    hierarchyBadge: 'Tier 2 • Action Phases',
    hierarchyBadgeColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    cardBorderHover: 'hover:border-cyan-500/30',
  },
  tasks: {
    icon: CheckSquare,
    title: 'Start the Engine',
    text: 'Tasks are the atomic, daily actions that move the needle. Link them to projects to maintain focus.',
    buttonText: 'Create Your First Task',
    iconBg: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    btnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    hierarchyBadge: 'Tier 1 • Atomic Execution',
    hierarchyBadgeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    cardBorderHover: 'hover:border-emerald-500/30',
  },
};

export function EmptyState({ tier, onCreate, isFiltered = false, onTabSwitch }: EmptyStateProps) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  if (isFiltered) {
    return (
      <div className="card p-10 text-center border border-dashed border-white/10 bg-bg-800/40 rounded-2xl space-y-3">
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto ${config.iconBg}`}>
          <Icon size={24} />
        </div>
        <div className="max-w-sm mx-auto space-y-1">
          <h3 className="text-sm font-bold text-slate-200">No {tier.charAt(0).toUpperCase() + tier.slice(1)} Found</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            No items match your active search or filter criteria.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={`btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 shadow-lg ${config.btnClass}`}
        >
          <Plus size={14} />
          <span>{config.buttonText}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`card p-10 sm:p-12 text-center border border-white/10 bg-gradient-to-b ${
        tier === 'goals'
          ? 'from-purple-950/20'
          : tier === 'projects'
          ? 'from-cyan-950/20'
          : 'from-emerald-950/20'
      } via-bg-800/80 to-bg-900/90 rounded-2xl space-y-6 shadow-xl transition-all relative overflow-hidden ${config.cardBorderHover}`}
    >
      {/* Ambient Gradient Glow */}
      <div
        className={`absolute top-0 right-0 w-64 h-64 ${
          tier === 'goals'
            ? 'bg-purple-500/5'
            : tier === 'projects'
            ? 'bg-cyan-500/5'
            : 'bg-emerald-500/5'
        } rounded-full blur-3xl pointer-events-none -mr-20 -mt-20`}
      />

      {/* Tier Badge & Hierarchy Context */}
      <div className="flex flex-col items-center gap-3 relative z-10">
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${config.hierarchyBadgeColor}`}
        >
          {config.hierarchyBadge}
        </span>
        <div
          className={`w-16 h-16 rounded-2xl border flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-200 ${config.iconBg}`}
        >
          <Icon size={32} />
        </div>
      </div>

      {/* Bold H3 Title & Explanatory Copy */}
      <div className="max-w-md mx-auto space-y-2 relative z-10">
        <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
          {config.title}
        </h3>
        <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
          {config.text}
        </p>
        {'quote' in config && config.quote && (
          <p className="text-xs italic text-purple-300/90 pt-1 font-medium">
            {config.quote}
          </p>
        )}
      </div>

      {/* Educational Micro Hierarchy Map (Task -> Project -> Goal) */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 max-w-sm mx-auto py-2 px-3 rounded-xl bg-bg-900/70 border border-white/5 text-[10px] sm:text-xs relative z-10">
        <button
          type="button"
          onClick={() => onTabSwitch?.('tasks')}
          className={`font-semibold transition-colors cursor-pointer hover:text-slate-200 ${
            tier === 'tasks' ? 'text-emerald-400 underline underline-offset-4' : 'text-slate-500'
          }`}
        >
          Task
        </button>
        <ArrowRight size={12} className="text-slate-600 shrink-0" />
        <button
          type="button"
          onClick={() => onTabSwitch?.('projects')}
          className={`font-semibold transition-colors cursor-pointer hover:text-slate-200 ${
            tier === 'projects' ? 'text-cyan-400 underline underline-offset-4' : 'text-slate-500'
          }`}
        >
          Project
        </button>
        <ArrowRight size={12} className="text-slate-600 shrink-0" />
        <button
          type="button"
          onClick={() => onTabSwitch?.('goals')}
          className={`font-semibold transition-colors cursor-pointer hover:text-slate-200 ${
            tier === 'goals' ? 'text-purple-400 underline underline-offset-4' : 'text-slate-500'
          }`}
        >
          Goal
        </button>
      </div>

      {/* Primary Action Button */}
      <div className="pt-1 relative z-10">
        <button
          type="button"
          onClick={onCreate}
          className={`btn-primary text-xs sm:text-sm font-semibold px-5 py-2.5 inline-flex items-center gap-2 rounded-xl shadow-lg transition-all active:scale-95 ${config.btnClass}`}
        >
          <Plus size={16} />
          <span>{config.buttonText}</span>
        </button>
      </div>
    </div>
  );
}
