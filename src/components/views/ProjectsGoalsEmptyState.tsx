import { Plus } from 'lucide-react';

export type HierarchyTier = 'goals' | 'projects' | 'tasks';

interface EmptyStateProps {
  tier: HierarchyTier;
  onCreate: () => void;
  isFiltered?: boolean;
  onTabSwitch?: (tier: HierarchyTier) => void;
}

const TIER_CONFIG = {
  goals: {
    title: 'Define Your Vision',
    text: 'Goals are your ultimate long-term targets. Set a north star to align your daily actions.',
    buttonText: 'Create Your First Goal',
  },
  projects: {
    title: 'Bridge the Gap',
    text: 'Projects group related tasks together to achieve your broader goals. Break down your vision into actionable phases.',
    buttonText: 'Create Your First Project',
  },
  tasks: {
    title: 'Start the Engine',
    text: 'Tasks are the atomic, daily actions that move the needle. Link them to projects to maintain focus.',
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
            No items match your active search or filter criteria.
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
