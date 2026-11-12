import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { moveId, sameOrder } from '@/lib/items/listOrder';
import { prefersReducedMotion } from '@/lib/motion';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { returnFocusToReorderButton } from './reorderFocus';

/**
 * Reorder mode of a list (knowledge/mode-a-reorder-items-2026-11-07.md §4.1): one compact column,
 * a drag handle and up/down buttons per row; moves stay a draft until Done, Cancel drops them, and
 * leaving with moves asks to discard. Loaded on demand (LazyReorderList), so the drag library is
 * not in the main bundle.
 */

export interface ReorderItem {
  id: string;
  title: string;
}

export interface ReorderListProps {
  items: ReorderItem[];
  /** What the list holds, for the heading and screen readers ("habits"). */
  label: string;
  onDone: (ids: string[]) => void;
  onCancel: () => void;
  /** Extra chips for a row, computed from the draft order (a sequential goal's live lock chips). */
  renderMeta?: (id: string, draft: readonly string[]) => ReactNode;
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export default function ReorderList({ items, label, onDone, onCancel, renderMeta }: ReorderListProps) {
  const initial = useMemo(() => items.map((i) => i.id), [items]);
  const [draft, setDraft] = useState<string[]>(initial);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Items removed meanwhile (another device) drop out; new ones join the end of the draft.
  const ids = useMemo(() => {
    const live = draft.filter((id) => byId.has(id));
    return [...live, ...initial.filter((id) => !live.includes(id))];
  }, [draft, byId, initial]);
  const changed = !sameOrder(ids, initial);
  const { confirmDiscard } = useUnsavedChanges(`reorder:${label}`, ids);
  const reduced = prefersReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);

  // Keyboard focus starts on the first row's drag handle, not lost on the page when the mode opens.
  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  // Closing hands focus back to the Reorder button that opened this list.
  const leave = (close: () => void) => {
    returnFocusToReorderButton(label);
    close();
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const titleOf = (id: string | number) => `"${byId.get(String(id))?.title ?? ''}"`;
  const position = (id: string | number) => `${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${position(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over position ${position(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${titleOf(active.id)} at position ${position(over.id)}.` : `Dropped ${titleOf(active.id)}.`),
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) setDraft(moveId(ids, String(active.id), to - from));
  };
  const move = (id: string, delta: number) => setDraft(moveId(ids, id, delta));

  return (
    <section data-no-swipe aria-label={`Reorder ${label}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-tertiary">Drag a row by its handle, or use the arrows.</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => confirmDiscard(() => leave(onCancel))}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => leave(changed ? () => onDone(ids) : onCancel)}>
            Done
          </Button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'To move a row, press Space, then the arrow keys. Press Space again to drop it there, or Escape to cancel.',
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol ref={listRef} className="card divide-y divide-overlay-subtle overflow-hidden p-0">
            {ids.map((id, index) => (
              <SortableRow
                key={id}
                id={id}
                title={byId.get(id)?.title ?? ''}
                first={index === 0}
                last={index === ids.length - 1}
                reduced={reduced}
                meta={renderMeta?.(id, ids)}
                onMove={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableRow({
  id,
  title,
  first,
  last,
  reduced,
  meta,
  onMove,
}: {
  id: string;
  title: string;
  first: boolean;
  last: boolean;
  reduced: boolean;
  meta?: ReactNode;
  onMove: (id: string, delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reduced ? null : undefined,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: reduced ? undefined : transition,
  };
  // A move that takes the row to the top or bottom disables the arrow just pressed, which would drop
  // focus to the page: focus goes to the row's other arrow instead (and stays on the pressed one otherwise).
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef<'up' | 'down' | null>(null);
  useLayoutEffect(() => {
    const was = pressed.current;
    if (!was) return;
    pressed.current = null;
    const [same, other] = was === 'up' ? [upRef.current, downRef.current] : [downRef.current, upRef.current];
    const target = same && !same.disabled ? same : other;
    if (target && !target.disabled && document.activeElement !== target) target.focus();
  });
  const press = (dir: 'up' | 'down') => {
    // Only when the arrow had focus (keyboard, or a click that focused it); a tap elsewhere keeps its place.
    if (document.activeElement === (dir === 'up' ? upRef.current : downRef.current)) pressed.current = dir;
    onMove(id, dir === 'up' ? -1 : 1);
  };
  const arrow = cx(
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-muted hover:bg-overlay-subtle hover:text-content-primary disabled:opacity-30 disabled:pointer-events-none',
    FOCUS_RING,
    TAP_TARGET_Y
  );
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cx('relative flex items-center gap-2 bg-bg-800 px-2 py-1.5', isDragging && 'z-10 shadow-sm')}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-no-press
        aria-label={`Drag "${title}"`}
        className={cx(
          'flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-content-muted hover:text-content-primary active:cursor-grabbing',
          FOCUS_RING
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-content-primary">{title}</p>
        {meta && <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      <button type="button" ref={upRef} className={arrow} disabled={first} aria-label={`Move "${title}" up`} onClick={() => press('up')}>
        <ChevronUp size={18} aria-hidden="true" />
      </button>
      <button type="button" ref={downRef} className={arrow} disabled={last} aria-label={`Move "${title}" down`} onClick={() => press('down')}>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
    </li>
  );
}
