import { useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import type { PlanReflectionNote } from '@/types';
import { Textarea } from '@/components/ui/primitives';
import { formatDateShort } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { PlanIconButton } from './PlanIconButton';
import { ShowMoreText, ShowMoreToggle } from './ShowMore';

/** Legacy notes were keyed by their date; newer ones by id. */
function noteKeyOf(note: PlanReflectionNote): string {
  return note.id || note.date || note.createdAt;
}

const NOTE_MAX = 1000;

export function ReflectionNotes({
  planId,
  notes,
  readOnly,
  onAdd,
  onEdit,
  onRequestDelete,
}: {
  planId: string;
  notes: PlanReflectionNote[];
  readOnly?: boolean;
  onAdd?: (text: string) => void;
  onEdit?: (noteKey: string, text: string) => void;
  onRequestDelete?: (noteKey: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);

  // Leave guards: a note being written, and an open edit that differs from the saved note.
  useUnsavedChanges(!readOnly, draft.trim());
  useUnsavedChanges(editing ? `${planId}:${editing.key}` : null, editing?.text ?? '');

  const visible = showAll ? notes : notes.slice(0, 1);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text || !onAdd) return;
    onAdd(text);
    setDraft('');
  };

  const saveEdit = () => {
    if (!editing || !editing.text.trim() || !onEdit) return;
    onEdit(editing.key, editing.text);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="space-y-2">
          <Textarea
            id={`plan-note-${planId}`}
            aria-label="New check-in note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="How is it going? What will you change?"
            rows={2}
            maxLength={NOTE_MAX}
          />
          <div className="flex justify-end">
            <button type="button" onClick={submitDraft} disabled={!draft.trim()} className="btn-secondary text-xs">
              Add check-in
            </button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="divide-y divide-overlay-subtle">
          {visible.map((note) => {
            const key = noteKeyOf(note);
            const isEditing = editing?.key === key;
            return (
              <li key={key} className="py-2.5 first:pt-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-content-muted">{formatDateShort(note.createdAt || note.date)}</span>
                  {!readOnly && !isEditing && (
                    <div className="-my-1 flex items-center gap-1">
                      <PlanIconButton
                        onClick={() => setEditing({ key, text: note.note })}
                        title="Edit"
                        label="Edit check-in note"
                        size="sm"
                      >
                        <Edit3 size={14} />
                      </PlanIconButton>
                      <PlanIconButton
                        tone="danger"
                        onClick={() => onRequestDelete?.(key)}
                        title="Delete"
                        label="Delete check-in note"
                        size="sm"
                      >
                        <Trash2 size={14} />
                      </PlanIconButton>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      id={`plan-note-edit-${planId}-${key}`}
                      aria-label="Edit check-in note"
                      value={editing.text}
                      onChange={(e) => setEditing({ key, text: e.target.value })}
                      rows={3}
                      maxLength={NOTE_MAX}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditing(null)} className="btn-secondary text-xs">
                        Cancel
                      </button>
                      <button type="button" onClick={saveEdit} disabled={!editing.text.trim()} className="btn-primary text-xs">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <ShowMoreText text={note.note} lines={4} className="text-sm text-content-secondary" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notes.length > 1 && (
        <ShowMoreToggle
          expanded={showAll}
          onToggle={() => setShowAll((v) => !v)}
          moreLabel={`Show all ${notes.length} check-ins`}
          lessLabel="Show latest only"
        />
      )}
    </div>
  );
}
