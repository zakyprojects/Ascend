import { Dialog } from '@/components/ui/primitives';
import { FOCUS_DAILY_CAP, FOCUS_MINUTES_PER_POINT, FOCUS_MIN_MINUTES } from '@/lib/points/focusPoints';
import { FOCUS_BREAK_GRACE_MINUTES, FOCUS_RESUME_WINDOW_MINUTES } from './focusSession';

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
            25 min if you are starting out, 50 min for core tasks, 90 min or more for complex work. A session
            counts from {FOCUS_MIN_MINUTES} min: every {FOCUS_MINUTES_PER_POINT} min of focus is 1 pt, and today&apos;s sessions add
            up, up to {FOCUS_DAILY_CAP} pts a day.
          </div>
          <div className="py-2.5">
            <span className="item-name !text-content-secondary block mb-0.5">3. Stay with it</span>
            The session keeps running if you close the app or lock your phone, and it shows on all your devices. A break
            stops the clock until you press Continue; not continued within {FOCUS_BREAK_GRACE_MINUTES} min after it ends, the
            session ends at the break start. Logging out pauses it everywhere: resume within{' '}
            {FOCUS_RESUME_WINDOW_MINUTES} min to carry on; after that it ends where you paused.
          </div>
          <div className="py-2.5">
            <span className="item-name !text-content-secondary block mb-0.5">4. Real breaks</span>
            Step away from screens: stretch, walk, drink water. Scrolling is not a break.
          </div>
        </div>
      </div>
    </Dialog>
  );
}
