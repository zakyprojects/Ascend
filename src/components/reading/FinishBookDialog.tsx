import { useMemo, useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { Dialog, Form, Textarea } from '@/components/ui/primitives';
import { CapMeter } from '@/components/ui/CapMeter';
import type { AppStore } from '@/lib/store';
import type { UserBook } from '@/types';
import { formatDateKeyHuman, todayKey } from '@/lib/dates';
import { trustedNow } from '@/lib/clock';
import { READING_POINTS } from '@/lib/pointsConfig';
import {
  READING_BONUS_COOLDOWN_DAYS,
  READING_BONUS_MIN_LOG_DAYS,
  READING_BONUS_MIN_SPAN_DAYS,
  readingBonusAlreadyGiven,
  readingBonusCooldown,
  readingBonusProgress,
} from '@/lib/readingAwards';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { bookProgress } from './bookMeta';
import { actionFeedback } from '@/lib/actionFeedback';

/**
 * Finishes a book with its key takeaway (required). Shows whether the one-time finish bonus
 * applies, using the same gates as finishBook and ascend_recompute_reading_bonus (readingBonusProgress):
 * pages logged on 5 separate days, the first at least 7 days ago, and no other finish bonus in the
 * last 13 days (readingBonusCooldown). Finish counts today as a reading day when it adds the unread pages.
 */
export function FinishBookDialog({
  store,
  book,
  open,
  onClose,
}: {
  store: AppStore;
  book: UserBook | null;
  open: boolean;
  onClose: () => void;
}) {
  const [takeaway, setTakeaway] = useState('');
  const guard = useUnsavedChanges(open ? book?.id ?? null : null, takeaway, { key: 'book-finish', restore: setTakeaway });
  const { readingLogs, pointsHistory } = store.state;

  const eligibility = useMemo(() => {
    if (!book) return null;
    const today = todayKey(trustedNow());
    const alreadyAwarded = readingBonusAlreadyGiven(book, pointsHistory);
    const progress = readingBonusProgress(book.id, readingLogs, today, bookProgress(book).left > 0);
    const cooldown = readingBonusCooldown(book.id, pointsHistory, today);
    return {
      alreadyAwarded,
      ...progress,
      cooldown,
      isEligible: !alreadyAwarded && !cooldown.active && progress.meetsSpan && progress.meetsDays,
    };
  }, [book, readingLogs, pointsHistory]);

  const submit = () => {
    if (!book || !takeaway.trim()) return;
    store.finishBook(book.id, takeaway.trim());
    actionFeedback('tick');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={guard.dirty}
      title={book ? `Finish: ${book.title}` : 'Finish book'}
      footer={
        <>
          <button type="button" onClick={() => guard.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="rh-finish-form" className="btn-primary">
            <CheckCircle2 size={16} />
            <span>{eligibility?.isEligible ? `Finish (+${READING_POINTS.completionBonus})` : 'Mark finished'}</span>
          </button>
        </>
      }
    >
      <Form id="rh-finish-form" onSubmit={submit} className="space-y-4">
        {eligibility?.isEligible ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success-text" />
            <p className="text-xs leading-relaxed text-content-secondary">
              You get the <span className="figure text-success-text">+{READING_POINTS.completionBonus}</span> finish bonus. You
              read it over {eligibility.spanDays} days and logged pages on {eligibility.loggedDays}.
            </p>
          </div>
        ) : eligibility?.alreadyAwarded ? (
          <div className="flex items-start gap-3 rounded-xl border border-overlay-default p-3.5">
            <Info size={18} className="mt-0.5 shrink-0 text-content-muted" />
            <p className="text-xs leading-relaxed text-content-muted">This book already got its finish bonus.</p>
          </div>
        ) : eligibility?.cooldown.active && eligibility.cooldown.lastDay && eligibility.cooldown.nextDay ? (
          <div className="flex items-start gap-3 rounded-xl border border-overlay-default p-3.5">
            <Info size={18} className="mt-0.5 shrink-0 text-content-muted" />
            <p className="text-xs leading-relaxed text-content-muted">
              No finish bonus for this book. Finish bonuses come at most once every {READING_BONUS_COOLDOWN_DAYS} days: your
              last was on {formatDateKeyHuman(eligibility.cooldown.lastDay)}, the next can come from{' '}
              {formatDateKeyHuman(eligibility.cooldown.nextDay)}. Finishing later won&apos;t add it to this book. Page points you
              already earned stay.
            </p>
          </div>
        ) : (
          eligibility && (
            <div className="space-y-3 rounded-xl border border-overlay-default p-3.5">
              <div className="flex items-start gap-3">
                <Info size={18} className="mt-0.5 shrink-0 text-content-muted" />
                <p className="text-xs leading-relaxed text-content-muted">
                  No finish bonus yet. The <span className="figure">+{READING_POINTS.completionBonus}</span> bonus needs pages
                  logged on {READING_BONUS_MIN_LOG_DAYS} separate days, the first at least {READING_BONUS_MIN_SPAN_DAYS} days
                  ago. Keep logging to earn it, or finish now without it. Page points you already earned stay.
                </p>
              </div>
              <div className="space-y-2 border-t border-overlay-subtle pt-3">
                <CapMeter
                  variant="bar"
                  label={`Days since first log (${Math.min(eligibility.spanDays, READING_BONUS_MIN_SPAN_DAYS)}/${READING_BONUS_MIN_SPAN_DAYS})`}
                  earned={eligibility.spanDays}
                  cap={READING_BONUS_MIN_SPAN_DAYS}
                />
                <CapMeter
                  variant="bar"
                  label={`Reading days logged (${Math.min(eligibility.loggedDays, READING_BONUS_MIN_LOG_DAYS)}/${READING_BONUS_MIN_LOG_DAYS})`}
                  earned={eligibility.loggedDays}
                  cap={READING_BONUS_MIN_LOG_DAYS}
                />
              </div>
            </div>
          )
        )}

        <Textarea
          id="rh-finish-takeaway"
          label="Key takeaway"
          required
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
          placeholder="What did you learn, and how will you use it?"
          className="min-h-[100px] leading-relaxed"
          maxLength={2000}
        />
      </Form>
    </Dialog>
  );
}
