import { CheckSquare, FolderKanban, ListOrdered, Target, type LucideIcon } from 'lucide-react';
import { Dialog } from '@/components/ui/primitives';

const LEVELS: { icon: LucideIcon; iconClass: string; name: string; span: string; text: string; examples: string }[] = [
  {
    icon: Target,
    iconClass: 'badge-purple',
    name: 'Goal',
    span: 'the long term',
    text: 'What you want your life to look like. Without a goal, a dream stays a dream.',
    examples: 'Financial freedom, get fit, speak a new language, become debt-free.',
  },
  {
    icon: FolderKanban,
    iconClass: 'badge-cyan',
    name: 'Project',
    span: 'weeks or months',
    text: 'One phase of a goal with a clear finish line. Without a plan, a goal is just a wish.',
    examples: '90-day gym plan, launch a Shopify store, 30-day speaking course, pay off a credit card.',
  },
  {
    icon: CheckSquare,
    iconClass: 'badge-emerald',
    name: 'Task',
    span: 'today',
    text: 'The small step you take today. Done tasks fill their project, and done projects fill their goal.',
    examples: 'Do 50 pushups, list 5 new products, read 10 pages out loud, move $50 to savings.',
  },
];

/** The guide to how goals, projects and tasks connect. */
export function HowItWorksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How goals, projects and tasks work"
      description="A dream becomes real when it has a goal, a plan and a next step. AscendDay links all three, so what you do today moves your biggest goals."
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          Got it
        </button>
      }
    >
      <ol className="divide-y divide-overlay-subtle border-y border-overlay-subtle">
        {LEVELS.map((level) => {
          const Icon = level.icon;
          return (
            <li key={level.name} className="flex gap-3 py-3.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${level.iconClass}`}>
                <Icon size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="item-name text-sm">
                  {level.name} <span className="font-normal text-content-muted">· {level.span}</span>
                </h3>
                <p className="text-xs leading-relaxed text-content-tertiary">{level.text}</p>
                <p className="text-xs text-content-muted">For example: {level.examples}</p>
              </div>
            </li>
          );
        })}
        <li className="flex gap-3 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-overlay-default bg-overlay-subtle text-content-tertiary">
            <ListOrdered size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="item-name text-sm">Projects in order</h3>
            <p className="text-xs leading-relaxed text-content-tertiary">
              Turn it on for a goal and its projects unlock one at a time, so you finish one thing before starting the next.
            </p>
            <ul className="space-y-0.5 pt-0.5 text-xs text-content-muted">
              <li>Goal: Start a business</li>
              <li>1. Market research <span className="text-success-text">· open</span></li>
              <li>2. Build the first version · locked</li>
              <li>3. Launch · locked</li>
            </ul>
          </div>
        </li>
      </ol>
    </Dialog>
  );
}
