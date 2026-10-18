import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Dialog, FieldRow, Form, Input, NumberField, Select } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import type { UserBook } from '@/types';
import { earliestTargetDate, isNewPastDate } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { bookProgress, bookUnit, type BookUnit } from './bookMeta';

/** Moves a library book to Reading after confirming its length and an optional target date. */
export function StartReadingDialog({
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
  const [total, setTotal] = useState(() => (book ? bookProgress(book).total : 250));
  const [unit, setUnit] = useState<BookUnit>(() => (book ? bookUnit(book) : 'pages'));
  const [targetDate, setTargetDate] = useState(() => book?.targetFinishDate || '');
  const guard = useUnsavedChanges(open ? book?.id ?? null : null, [total, unit, targetDate]);
  const minLength = book ? Math.max(1, bookProgress(book).current) : 1;

  const submit = () => {
    if (!book) return;
    store.updateUserBookStatus(book.id, 'reading', {
      totalAmount: total,
      unit,
      targetFinishDate: targetDate.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={guard.dirty}
      title={book ? `Start reading: ${book.title}` : 'Start reading'}
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
          <Select id="rh-start-unit" label="Count in" value={unit} onChange={(e) => setUnit(e.target.value as BookUnit)}>
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
