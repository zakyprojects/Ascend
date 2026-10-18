import { Plus, Target, FolderKanban, CheckSquare, SearchX } from 'lucide-react';
import { EmptyState as EmptyStateBase } from '@/components/ui/primitives';

export type HierarchyTier = 'goals' | 'projects' | 'tasks';

interface EmptyStateProps {
  tier: HierarchyTier;
  onCreate: () => void;
  /** The list has items, but the search or filters hide them all. */
  isFiltered?: boolean;
  onClearFilters?: () => void;
}

const TIER_CONFIG = {
  goals: {
    title: 'No goals yet',
    filteredTitle: 'No goals match',
    text: 'A dream without a goal stays a dream. Write down what you want, then plan the projects that get you there.',
    icon: Target,
    iconClass: 'badge-purple',
    btnClass: 'bg-purple-600 hover:bg-purple-500 text-white',
    buttonText: 'Create your first goal',
  },
  projects: {
    title: 'No projects yet',
    filteredTitle: 'No projects match',
    text: 'A goal without a plan is just a wish. Projects are the plan: clear phases that move a goal forward.',
    icon: FolderKanban,
    iconClass: 'badge-cyan',
    btnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    buttonText: 'Create your first project',
  },
  tasks: {
    title: 'No tasks yet',
    filteredTitle: 'No tasks match',
    text: 'Big goals are reached in small steps. Add one thing you can do today, and link it to a project to see it count.',
    icon: CheckSquare,
    iconClass: 'badge-emerald',
    btnClass: '',
    buttonText: 'Add your first task',
  },
};

/** Projects & Goals empty state per tier, in the tier's colour, on the shared EmptyState. */
export function EmptyState({ tier, onCreate, isFiltered = false, onClearFilters }: EmptyStateProps) {
  const config = TIER_CONFIG[tier];

  if (isFiltered) {
    return (
      <EmptyStateBase
        icon={SearchX}
        iconClassName="bg-overlay-subtle text-content-muted border border-overlay-default"
        title={config.filteredTitle}
        description="Nothing matches your search or filters."
        action={
          onClearFilters && (
            <button type="button" onClick={onClearFilters} className="btn-secondary text-xs px-4 py-2">
              Clear filters
            </button>
          )
        }
      />
    );
  }

  return (
    <EmptyStateBase
      icon={config.icon}
      iconClassName={config.iconClass}
      title={config.title}
      description={config.text}
      action={
        <button
          type="button"
          onClick={onCreate}
          className={`btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 ${config.btnClass}`}
        >
          <Plus size={14} aria-hidden="true" />
          <span>{config.buttonText}</span>
        </button>
      }
    />
  );
}
