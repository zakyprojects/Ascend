import { CheckSquare, FolderKanban, ListOrdered, Target } from 'lucide-react';
import type { HowItWorksGuide } from '@/components/ui/HowItWorks';

/**
 * Projects & Goals. Rules from lib/projectProgress.ts (progress bottom-up, automatic status, manual
 * items), components/projects/hierarchy.ts (getLockStatus, goalStatusPatch) and TaskRow.tsx
 * ("Unlocks when … is done", focus button). Earns no points (marketing projectsGoals FAQ).
 */
export const projectsGoalsGuide: HowItWorksGuide = {
  title: 'How goals, projects and tasks work',
  intro: 'Plan big things in three levels. Ticking today’s tasks moves the rest.',
  steps: [
    {
      icon: Target,
      iconClass: 'badge-purple',
      title: 'Goal',
      meta: 'the long term',
      text: 'What you want to reach, like getting fit or paying off a card. Its progress is the average of its projects.',
    },
    {
      icon: FolderKanban,
      iconClass: 'badge-cyan',
      title: 'Project',
      meta: 'weeks or months',
      text: 'One part of a goal with a clear finish, like a 90-day gym plan. Its progress comes from its tasks, and it completes itself at 100%.',
    },
    {
      icon: CheckSquare,
      iconClass: 'badge-emerald',
      title: 'Task',
      meta: 'today',
      text: 'One step you can do now. A task with subtasks fills as you tick them and ticks itself when all are done. A task can also stand alone.',
    },
    {
      icon: ListOrdered,
      iconClass: 'border-overlay-default bg-overlay-subtle text-content-tertiary',
      title: 'Projects in order',
      text: 'Turn it on for a goal and each project unlocks when the ones before it are done. Its tasks wait until then. Reorder a goal’s projects to change which comes next.',
    },
  ],
  notes: [
    'A project with no tasks, or a goal with no projects, you update by hand.',
    'A goal with projects becomes Achieved on its own when all of them are done.',
    'Start a focus session from any open task with its timer button.',
    'Tap Reorder to put goals, a goal’s projects, tasks or a task’s subtasks in your own order. Done items stay under Done.',
  ],
  points: [
    'Projects & Goals earns no points and can’t cost any.',
    'A focus session started from a task earns on Prefrontal Cortex.',
  ],
};
