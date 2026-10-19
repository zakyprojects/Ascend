import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Dialog, FieldRow, Form, Input, NumberField, Select, Textarea } from '@/components/ui/primitives';
import type { AppStore } from '@/lib/store';
import { BOOK_CATEGORIES } from '@/lib/books';
import type { BookCategory, UserBook, UserBookStatus } from '@/types';
import { earliestTargetDate, isNewPastDate } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { DEFAULT_BOOK_LENGTH, bookProgress, bookUnit, formatAmount, sameBook, type BookUnit } from './bookMeta';

interface BookFormValues {
  title: string;
  author: string;
  category: BookCategory | '';
  status: UserBookStatus;
  totalAmount: number;
  unit: BookUnit;
  targetFinishDate: string;
  reflection: string;
  description: string;
}

function valuesFrom(book: UserBook | null, status: UserBookStatus): BookFormValues {
  if (!book) {
    return {
      title: '',
      author: '',
      category: '',
      status,
      totalAmount: DEFAULT_BOOK_LENGTH,
      unit: 'pages',
      targetFinishDate: '',
      reflection: '',
      description: '',
    };
  }
  const p = bookProgress(book);
  return {
    title: book.title,
    author: book.author === 'Unknown Author' ? '' : book.author,
    category: (BOOK_CATEGORIES.some((c) => c.name === book.category) ? book.category : '') as BookCategory | '',
    status: book.status,
    totalAmount: p.total,
    unit: bookUnit(book),
    targetFinishDate: book.targetFinishDate || '',
    reflection: book.reflection || '',
    description: book.description || '',
  };
}

/**
 * Adds a book, or edits one (title, author, category, length, target, notes; a finished book's
 * takeaway). Progress and logs are never changed here. Remounted for each open (by key), so the
 * form always starts from the book's saved values or a blank book.
 */
export function BookFormDialog({
  store,
  open,
  book,
  initialStatus = 'reading',
  onClose,
}: {
  store: AppStore;
  open: boolean;
  /** The book to edit; none adds a new one. */
  book: UserBook | null;
  initialStatus?: UserBookStatus;
  onClose: () => void;
}) {
  const [values, setValues] = useState<BookFormValues>(() => valuesFrom(book, initialStatus));
  const guard = useUnsavedChanges(open ? book?.id ?? 'new-book' : null, values, { key: 'book-form', restore: setValues });
  const update = (patch: Partial<BookFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const editing = Boolean(book);
  const finished = values.status === 'completed';
  // In progress, the length can't go below what is already read.
  const minLength = book && !finished ? Math.max(1, bookProgress(book).current) : 1;
  const unitWord = values.unit === 'chapters' ? 'Chapters' : 'Pages';

  // Two books may share a title, so a book is the same book when title and author both match. A book
  // keeping its own title and author is fine (old duplicates can still be edited).
  const isDuplicateBook = () => {
    const entry = { title: values.title, author: values.author.trim() || 'Unknown Author' };
    if (book && sameBook(book, entry)) return false;
    return (store.state.libraryBooks || []).some((b) => b.id !== book?.id && sameBook(b, entry));
  };

  const submit = () => {
    const author = values.author.trim() || 'Unknown Author';
    const targetFinishDate = finished ? undefined : values.targetFinishDate.trim() || undefined;
    if (book) {
      store.updateBookDetails(book.id, {
        title: values.title,
        author,
        category: values.category || undefined,
        description: values.description,
        totalAmount: values.totalAmount,
        unit: values.unit,
        targetFinishDate,
        reflection: values.reflection,
      });
    } else {
      store.addCustomBookToLibrary(
        values.title.trim(),
        author,
        values.description.trim() || undefined,
        values.category || undefined,
        values.totalAmount,
        values.unit,
        values.status,
        targetFinishDate,
        finished ? values.reflection.trim() || undefined : undefined
      );
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={guard.dirty}
      title={editing ? 'Edit book' : 'Add book'}
      footer={
        <>
          <button type="button" onClick={() => guard.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="rh-book-form" className="btn-primary">
            {editing ? <Check size={16} /> : <Plus size={16} />}
            <span>{editing ? 'Save changes' : 'Add book'}</span>
          </button>
        </>
      }
    >
      <Form
        id="rh-book-form"
        onSubmit={submit}
        validate={() =>
          isDuplicateBook()
            ? { message: 'You already have this book (same title and author).', field: 'rh-book-title' }
            : !finished && isNewPastDate(values.targetFinishDate, book?.targetFinishDate)
            ? { message: 'Pick a later date.', field: 'rh-book-date' }
            : null
        }
        className="space-y-4"
      >
        <Input
          id="rh-book-title"
          label="Book title"
          required
          value={values.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Atomic Habits"
          maxLength={150}
          autoComplete="off"
        />
        <Input
          id="rh-book-author"
          label="Author"
          optional
          value={values.author}
          onChange={(e) => update({ author: e.target.value })}
          placeholder="e.g. James Clear"
          maxLength={100}
          autoComplete="off"
        />

        <FieldRow>
          <Select
            id="rh-book-category"
            label="Category"
            optional
            value={values.category}
            onChange={(e) => update({ category: e.target.value as BookCategory | '' })}
          >
            <option value="">No category</option>
            {BOOK_CATEGORIES.map((cat) => (
              <option key={cat.name} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </Select>
          {!editing && (
            <Select
              id="rh-book-status"
              label="Status"
              value={values.status}
              onChange={(e) => update({ status: e.target.value as UserBookStatus })}
            >
              <option value="reading">Reading now</option>
              <option value="to-read">Want to read</option>
              <option value="completed">Already finished</option>
            </Select>
          )}
        </FieldRow>

        <FieldRow>
          <NumberField
            id="rh-book-total"
            label={`Length (${unitWord.toLowerCase()})`}
            min={minLength}
            max={100000}
            required
            value={values.totalAmount}
            onValueChange={(n) => update({ totalAmount: n })}
            hint={minLength > 1 ? `You're at ${formatAmount(minLength, values.unit)}.` : undefined}
          />
          <Select
            id="rh-book-unit"
            label="Count in"
            value={values.unit}
            onChange={(e) => update({ unit: e.target.value as BookUnit })}
          >
            <option value="pages">Pages</option>
            <option value="chapters">Chapters</option>
          </Select>
        </FieldRow>

        {finished ? (
          <Textarea
            id="rh-book-takeaway"
            label="Key takeaway"
            optional
            value={values.reflection}
            onChange={(e) => update({ reflection: e.target.value })}
            placeholder="What did you learn, and how will you use it?"
            maxLength={2000}
          />
        ) : (
          <Input
            id="rh-book-date"
            label="Target finish date"
            optional
            type="date"
            min={earliestTargetDate(book?.targetFinishDate)}
            value={values.targetFinishDate}
            onChange={(e) => update({ targetFinishDate: e.target.value })}
          />
        )}

        <Textarea
          id="rh-book-notes"
          label="Notes"
          optional
          value={values.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Why are you reading it? What is it about?"
          maxLength={1000}
        />

        {!editing && finished && (
          <p className="text-xs text-content-muted">
            Books added as finished earn no points. Log pages as you read to earn them.
          </p>
        )}
      </Form>
    </Dialog>
  );
}
