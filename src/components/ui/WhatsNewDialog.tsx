import { useId } from 'react';
import { Dialog } from './primitives/Dialog';
import { DEFAULT_RELEASE_TITLE, releaseNoteGroups, type ReleaseNote } from '@/lib/releaseNote';
import { formatDateShort } from '@/lib/time/dates';

/** The note's groups (New, Improved, Changed, Fixed, Removed); only groups with lines render. */
export function ReleaseNoteBody({ note }: { note: ReleaseNote }) {
  const baseId = useId();
  return (
    <div className="space-y-4">
      {releaseNoteGroups(note).map((group) => (
        <section key={group.key} aria-labelledby={`${baseId}-${group.key}`} className="space-y-1.5">
          <h3 id={`${baseId}-${group.key}`} className="item-name text-sm">
            {group.label}
          </h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-content-secondary">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The release note (lib/releaseNote): pops up once, and opens again from the notification panel. */
export function WhatsNewDialog({ open, onClose, note }: { open: boolean; onClose: () => void; note: ReleaseNote }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={note.title || DEFAULT_RELEASE_TITLE}
      description={formatDateShort(note.releasedAt)}
      footer={
        <button type="button" onClick={onClose} className="btn-secondary">
          Got it
        </button>
      }
    >
      <ReleaseNoteBody note={note} />
    </Dialog>
  );
}
