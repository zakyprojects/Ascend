import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Dialog, FieldRow, Form, Input, NumberField, Select } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import type { CuratedBook, UserBook } from '@/types';
import { earliestTargetDate, isNewPastDate } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { isBookUnitLocked } from '@/lib/readingAwards';
import { UNIT_LOCKED_HINT, bookProgress, bookUnit, lengthsByUnit, type BookUnit } from './bookMeta';

/**
 * Moves a library book to Reading, or adds a Discover book straight to Reading, after
 * confirming its length and an optional target date.
 */
export function StartReadingDialog({
  store,
  book,
  curated = null,
  open,
  onClose,
  onStarted,
}: {
  store: AppStore;
  book: UserBook | null;
  /** A Discover book not in the library yet; it is added only when the dialog is submitted. */
  curated?: CuratedBook | null;
  open: boolean;
  onClose: () => void;
  onStarted?: (title: string) => void;
}) {
  const [unit, setUnit] = useState<BookUnit>(() => (book ? bookUnit(book) : 'pages'));
  // One length per unit, so switching to chapters and back keeps the book's page count.
  const [lengths, setLengths] = useState(() =>
    lengthsByUnit(unit, book ? bookProgress(book).total : curated?.totalPages || curated?.totalAmount || 250)
  );
  const total = lengths[unit];
  const setTotal = (n: number) => setLengths((l) => ({ ...l, [unit]: n }));
  const [targetDate, setTargetDate] = useState(() => book?.targetFinishDate || '');
  const guard = useUnsavedChanges(open ? book?.id ?? curated?.id ?? null : null, [total, unit, targetDate]);
  const title = book?.title ?? curated?.title;
  const minLength = book ? Math.max(1, bookProgress(book).current) : 1;
  const unitLocked = Boolean(book && isBookUnitLocked(book, store.state.readingLogs || []));

  const submit = () => {
    if (book) {
      store.updateUserBookStatus(book.id, 'reading', {
        totalAmount: total,
        unit,
        targetFinishDate: targetDate.trim() || undefined,
      });
    } else if (curated) {
      store.addCuratedBookToLibrary(curated, 'reading', total, unit, targetDate);
    } else {
      return;
    }
    if (title) onStarted?.(title);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={guard.dirty}
      title={title ? `Start reading: ${title}` : 'Start reading'}
      description="Check the length and, if you like, set a target finish date."
      footer={
        <>
          <button type="button" onClick={() => guard.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="rh-start-form" className="btn-primary">
            <PlayCircle size={16} />
            <span>Start reading</span>
          </button>
        </>
      }
    >
      <Form
        id="rh-start-form"
        onSubmit={submit}
        validate={() =>
          isNewPastDate(targetDate, book?.targetFinishDate) ? { message: 'Pick a later date.', field: 'rh-start-date' } : null
        }
        className="space-y-4"
      >
        <FieldRow>
          <NumberField
            id="rh-start-total"
            label={`Length (${unit})`}
            min={minLength}
            max={100000}
            required
            value={total}
            onValueChange={setTotal}
          />
          <Select
            id="rh-start-unit"
            label="Count in"
            value={unit}
            onChange={(e) => setUnit(e.target.value as BookUnit)}
            disabled={unitLocked}
            hint={unitLocked ? UNIT_LOCKED_HINT : undefined}
          >
            <option value="pages">Pages</option>
            <option value="chapters">Chapters</option>
          </Select>
        </FieldRow>
        <Input
          id="rh-start-date"
          label="Target finish date"
          optional
          type="date"
          min={earliestTargetDate(book?.targetFinishDate)}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Form>
    </Dialog>
  );
}
