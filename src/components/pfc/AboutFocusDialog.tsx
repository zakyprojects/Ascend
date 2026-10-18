import { Dialog } from '@/components/ui/primitives';

export function AboutFocusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="About deep focus"
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          Got it
        </button>
      }
    >
      <div className="space-y-4 text-content-tertiary text-xs leading-relaxed">
        <p>
          <strong className="text-content-secondary">Deep work</strong>, a term from computer scientist Cal Newport, means
          focused work on one hard task without distractions.
        </p>
        <p>
          Holding attention on one thing leans on the prefrontal cortex, the part of the brain that handles planning,
          working memory and impulse control. Like most skills, staying focused tends to get easier with regular practice.
        </p>
        <div className="divide-y divide-overlay-subtle">
          <div className="py-2.5">
            <span className="item-name !text-content-secondary block mb-0.5">1. No distractions</span>
            Put your phone out of sight, close unrelated tabs and turn off notifications while you focus.
          </div>
          <div className="py-2.5">
            <span className="item-name !text-content-secondary block mb-0.5">2. Pick the right length</span>
            25 min if you are starting out, 50 min for core tasks, 90 min or more for complex work.
          </div>
          <div className="py-2.5">
            <span className="item-name !text-content-secondary block mb-0.5">3. Real breaks</span>
            Step away from screens: stretch, walk, drink water. Scrolling is not a break.
          </div>
        </div>
      </div>
    </Dialog>
  );
}
