import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';
import { Dialog, FieldErrorBubble, NumberField } from '@/components/ui/primitives';
import { cx } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';

const QUICK_MINUTES = [5, 10, 15];

/** A break inside the live block (Follow schedule), up to `maxMinutes`. */
export function TakeBreakDialog({
  open,
  onClose,
  blockTitle,
  blockEnd,
  maxMinutes,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  blockTitle: string;
  blockEnd: string;
  maxMinutes: number;
  /** Throws when the store refuses the break. */
  onStart: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState(5);
  const [error, setError] = useState<string | null>(null);

  // Every open starts at 5 min (or less when the block is nearly over).
  useEffect(() => {
    if (open) {
      setMinutes(Math.max(1, Math.min(5, maxMinutes)));
      setError(null);
    }
    // Only on open: the limit shrinks every second while the block runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const safeMax = Math.max(1, maxMinutes);
  const value = Math.min(minutes, safeMax);

  const start = () => {
    try {
      onStart(value);
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "Couldn't start the break. Try again."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Take a break"
      description={`During ${blockTitle}. The block ends at ${blockEnd}; up to ${safeMax} min available.`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={start} className="btn-primary">
            <Coffee size={16} aria-hidden="true" />
            <span>Start {value} min break</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="label">Break length</p>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_MINUTES.map((m) => {
              const allowed = safeMax >= m;
              const selected = value === m;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!allowed}
                  onClick={() => setMinutes(m)}
                  aria-pressed={selected}
                  className={cx(
                    'min-h-11 rounded-xl text-sm font-medium border transition-colors',
                    !allowed
                      ? 'opacity-40 cursor-not-allowed border-overlay-subtle text-content-disabled'
                      : selected
                        ? 'bg-primary-500/15 text-brand-text border-primary-500/50'
                        : 'text-content-tertiary border-overlay-subtle hover:bg-overlay-subtle hover:text-content-primary'
                  )}
                >
                  <span className="figure">{m} min</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="pfc-break-range" className="block text-xs text-content-muted mb-1.5">
            Other length (1–{safeMax} min)
          </label>
          <div className="flex items-center gap-3">
            <input
              id="pfc-break-range"
              type="range"
              min={1}
              max={safeMax}
              step={1}
              value={value}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="flex-1 h-11 sm:h-6 accent-primary-500 cursor-pointer"
            />
            <div className="w-20 shrink-0">
              <NumberField
                aria-label="Break length in minutes"
                min={1}
                max={safeMax}
                value={value}
                onValueChange={(v) => setMinutes(Math.min(safeMax, Math.max(1, Math.round(v))))}
                className="text-center tabular-nums"
              />
            </div>
          </div>
        </div>

        {error && <FieldErrorBubble message={error} attached={false} />}
      </div>
    </Dialog>
  );
}
