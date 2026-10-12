import { Plus } from 'lucide-react';

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
    buttonText: 'Create Your First Goal',
  },
  projects: {
    title: 'No projects yet',
    text: 'Projects group related tasks and move a goal forward.',
    buttonText: 'Create Your First Project',
  },
  tasks: {
    title: 'No tasks yet',
    text: 'Tasks are the small things you do each day. Link them to a project to keep them organized.',
    buttonText: 'Create Your First Task',
  },
};

export function EmptyState({ tier, onCreate, isFiltered = false }: EmptyStateProps) {
  const config = TIER_CONFIG[tier];

  if (isFiltered) {
    return (
      <div className="py-12 text-center border border-dashed border-overlay-default rounded-2xl space-y-3">
        <div className="max-w-sm mx-auto space-y-1">
          <h3 className="item-name text-sm text-content-secondary">No {tier.charAt(0).toUpperCase() + tier.slice(1)} Found</h3>
          <p className="text-xs text-content-muted leading-relaxed">
            Nothing matches your search or filters.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          <span>{config.buttonText}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="py-16 px-6 text-center border border-dashed border-overlay-default rounded-2xl space-y-5">
      <div className="max-w-md mx-auto space-y-2">
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
        className="btn-primary text-sm px-5 py-2.5 inline-flex items-center gap-2"
      >
        <Plus size={16} />
        <span>{config.buttonText}</span>
      </button>
    </div>
  );
}
