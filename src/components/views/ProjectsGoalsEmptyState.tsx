import { Plus, Target, FolderKanban, CheckSquare } from 'lucide-react';

export type HierarchyTier = 'goals' | 'projects' | 'tasks';

interface EmptyStateProps {
  tier: HierarchyTier;
  onCreate: () => void;
  isFiltered?: boolean;
}

const TIER_CONFIG = {
  goals: {
    title: 'No goals yet',
    text: 'Goals are your long-term targets. Your daily tasks build toward them.',
    icon: Target,
    iconBg: 'badge-purple',
    glow: 'hero-glow-purple',
    iconGlow: 'hero-icon-glow-purple',
    btnClass: 'bg-purple-600 hover:bg-purple-500 text-white',
    buttonText: 'Create Your First Goal',
  },
  projects: {
    title: 'No projects yet',
    text: 'Projects group related tasks and move a goal forward.',
    icon: FolderKanban,
    iconBg: 'badge-cyan',
    glow: 'hero-glow-cyan',
    iconGlow: 'hero-icon-glow-cyan',
    btnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    buttonText: 'Create Your First Project',
  },
  tasks: {
    title: 'No tasks yet',
    text: 'Tasks are the small things you do each day. Link them to a project to keep them organized.',
    icon: CheckSquare,
    iconBg: 'badge-emerald',
    glow: '',
    iconGlow: 'hero-icon-glow-emerald',
    btnClass: '',
    buttonText: 'Create Your First Task',
  },
};

export function EmptyState({ tier, onCreate, isFiltered = false }: EmptyStateProps) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  if (isFiltered) {
    return (
      <div className="py-12 text-center border border-dashed border-overlay-default rounded-2xl space-y-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mx-auto ${config.iconBg}`}>
          <Icon size={20} />
        </div>
        <div className="max-w-sm mx-auto space-y-1">
          <h3 className="item-name text-sm text-content-secondary">No {tier.charAt(0).toUpperCase() + tier.slice(1)} Found</h3>
          <p className="text-xs text-content-muted leading-relaxed">
            Nothing matches your search or filters.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={`btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 ${config.btnClass}`}
        >
          <Plus size={14} />
          <span>{config.buttonText}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden py-16 px-6 text-center border border-dashed border-overlay-default rounded-2xl space-y-5">
      <div aria-hidden="true" className={`hero-glow ${config.glow}`} />
      <div className={`relative w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto ${config.iconBg} ${config.iconGlow}`}>
        <Icon size={26} />
      </div>
      <div className="relative max-w-md mx-auto space-y-2">
        <h3 className="text-lg font-semibold text-content-primary">
          {config.title}
        </h3>
        <p className="text-sm text-content-muted leading-relaxed">
          {config.text}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className={`relative btn-primary text-sm px-5 py-2.5 inline-flex items-center gap-2 ${config.btnClass}`}
      >
        <Plus size={16} />
        <span>{config.buttonText}</span>
      </button>
    </div>
  );
}
