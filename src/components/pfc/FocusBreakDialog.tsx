import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';
import { Dialog } from '@/components/ui/primitives';
import { cx } from '@/components/ui/primitives/shared';
import { FOCUS_BREAK_GRACE_MINUTES, FOCUS_BREAK_MINUTES, type FocusBreakMinutes } from './focusSession';

/** Picks a 5, 10 or 15 minute break in a focus session (the Follow schedule break dialog's look). */
export function FocusBreakDialog({
  open,
  onClose,
  breaksLeft,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  breaksLeft: number;
  onStart: (minutes: FocusBreakMinutes) => void;
}) {
  const [minutes, setMinutes] = useState<FocusBreakMinutes>(5);

  // Every open starts at 5 min.
  useEffect(() => {
    if (open) setMinutes(5);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Take a break"
      description={`The timer stops until you press Continue (up to ${FOCUS_BREAK_GRACE_MINUTES} min after the break ends). Not continued: the session ends at the break start, your focus time saved. Break time earns no points. ${
        breaksLeft === 1 ? 'This is your last break in this session.' : `${breaksLeft} breaks left in this session.`
      }`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onStart(minutes);
              onClose();
            }}
            className="btn-primary"
          >
            <Coffee size={16} aria-hidden="true" />
            <span>Start {minutes} min break</span>
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="label">Break length</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Break length">
          {FOCUS_BREAK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              aria-pressed={minutes === m}
              className={cx(
                'min-h-11 rounded-xl text-sm font-medium border transition-colors',
                minutes === m
                  ? 'bg-primary-500/15 text-brand-text border-primary-500/50'
                  : 'text-content-tertiary border-overlay-subtle hover:bg-overlay-subtle hover:text-content-primary'
              )}
            >
              <span className="figure">{m} min</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
