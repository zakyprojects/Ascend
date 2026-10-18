import { useEffect, useRef } from 'react';
import { ArrowRight, Check, Clock } from 'lucide-react';
import type { Lesson } from '@/types';
import { Dialog } from '@/components/ui/primitives';
import { actionFeedback } from '@/lib/actionFeedback';

export const pointsLabel = (n: number) => `+${n} ${n === 1 ? 'pt' : 'pts'}`;

/**
 * Read one lesson. Mark as read stays pinned under the text; once read, it offers the next
 * lesson. Shared by Lessons and Neuroplasticity.
 */
export function LessonReader({
  lesson,
  isRead,
  next,
  onMarkRead,
  onOpenLesson,
  onClose,
}: {
  lesson: Lesson | null;
  isRead: boolean;
  /** The lesson after this one in the reader's list, if any. */
  next?: Lesson;
  onMarkRead: (lessonId: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
  onClose: () => void;
}) {
  // Mark as read swaps the footer: focus moves to its new button instead of dropping to the page.
  const afterReadRef = useRef<HTMLButtonElement>(null);
  const wasReadRef = useRef(isRead);
  useEffect(() => {
    const justRead = isRead && !wasReadRef.current;
    wasReadRef.current = isRead;
    if (!justRead) return;
    const active = document.activeElement;
    if (!active || active === document.body) afterReadRef.current?.focus();
  }, [isRead, lesson?.id]);

  return (
    <Dialog
      open={Boolean(lesson)}
      onClose={onClose}
      title={lesson?.title ?? ''}
      maxWidth="max-w-lg"
      contentKey={lesson?.id}
      footer={
        lesson &&
        (isRead ? (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-sm text-success-text">
              <Check size={16} aria-hidden="true" />
              Read this season
            </span>
            {next ? (
              <button ref={afterReadRef} type="button" onClick={() => onOpenLesson(next)} className="btn-secondary">
                Next lesson <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button ref={afterReadRef} type="button" onClick={onClose} className="btn-secondary">
                Done
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={() => {
              actionFeedback('tick');
              onMarkRead(lesson.id);
            }}
            className="btn-primary w-full">
            <Check size={16} aria-hidden="true" />
            Mark as read ({pointsLabel(lesson.points)})
          </button>
        ))
      }
    >
      {lesson && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
            <span>{lesson.category}</span>
            <span className="flex items-center gap-1">
              <Clock size={11} aria-hidden="true" /> {lesson.readTime} min read
            </span>
            <span className="text-brand-text">{pointsLabel(lesson.points)}, once a season</span>
          </div>
          {renderLessonContent(lesson.content)}
        </div>
      )}
    </Dialog>
  );
}

// Lesson bodies (lib/lessons.ts) use a small Markdown subset: ``` callouts, blank-line
// separated blocks, "- " and "1. " lists, and **bold**. Rendered here so no syntax shows.
type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

const BULLET = /^- (.*)$/;
const NUMBERED = /^(\d+)\. (.*)$/;

function parseLessonBlocks(text: string): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  for (const line of text.split('\n').map((l) => l.trim())) {
    const last = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (!line) {
      blocks.push({ kind: 'p', text: '' });
    } else if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[2]);
      else blocks.push({ kind: 'ol', items: [numbered[2]], start: Number(numbered[1]) });
    } else if (last?.kind === 'p' && last.text) {
      last.text += ` ${line}`;
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.text);
}

function renderInline(text: string) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-content-primary">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

const LIST_CLASS = 'text-sm text-content-tertiary leading-relaxed mb-3 pl-5 space-y-1.5 marker:text-content-disabled';

function renderLessonContent(content: string) {
  // Odd parts of the ``` split are callouts.
  return content.split(/```([\s\S]*?)```/).map((part, idx) => {
    if (idx % 2 === 1) {
      return (
        <div key={idx} className="my-3 border-l-2 border-primary-500/50 pl-3 text-sm italic text-content-tertiary">
          {renderInline(part.trim())}
        </div>
      );
    }
    return (
      <div key={idx}>
        {parseLessonBlocks(part).map((block, bIdx) => {
          if (block.kind === 'ul') {
            return (
              <ul key={bIdx} className={`list-disc ${LIST_CLASS}`}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          if (block.kind === 'ol') {
            return (
              <ol key={bIdx} start={block.start} className={`list-decimal ${LIST_CLASS}`}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          }
          return (
            <p key={bIdx} className="mb-3 text-sm leading-relaxed text-content-tertiary">
              {renderInline(block.text)}
            </p>
          );
        })}
      </div>
    );
  });
}
