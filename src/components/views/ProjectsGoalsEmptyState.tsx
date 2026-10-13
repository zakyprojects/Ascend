import { Plus, Target, FolderKanban, CheckSquare } from 'lucide-react';
import { EmptyState as EmptyStateBase } from '@/components/ui/primitives';

export type HierarchyTier = 'goals' | 'projects' | 'tasks';

interface EmptyStateProps {
  tier: HierarchyTier;
  onCreate: () => void;
  isFiltered?: boolean;
}

const TIER_CONFIG = {
  goals: {
    title: 'No goals yet',
    filteredTitle: 'No goals found',
    text: 'Goals are your long-term targets. Your daily tasks build toward them.',
    icon: Target,
    iconClass: 'badge-purple',
    btnClass: 'bg-purple-600 hover:bg-purple-500 text-white',
    buttonText: 'Create Your First Goal',
  },
  projects: {
    title: 'No projects yet',
    filteredTitle: 'No projects found',
    text: 'Projects group related tasks and move a goal forward.',
    icon: FolderKanban,
    iconClass: 'badge-cyan',
    btnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    buttonText: 'Create Your First Project',
  },
  tasks: {
    title: 'No tasks yet',
    filteredTitle: 'No tasks found',
    text: 'Tasks are the small things you do each day. Link them to a project to keep them organized.',
    icon: CheckSquare,
    iconClass: 'badge-emerald',
    btnClass: '',
    buttonText: 'Create Your First Task',
  },
};

/** Projects & Goals empty state per tier, in the tier's colour, on the shared EmptyState. */
export function EmptyState({ tier, onCreate, isFiltered = false }: EmptyStateProps) {
  const config = TIER_CONFIG[tier];

  return (
    <EmptyStateBase
      icon={config.icon}
      iconClassName={config.iconClass}
      title={isFiltered ? config.filteredTitle : config.title}
      description={isFiltered ? 'Nothing matches your search or filters.' : config.text}
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
