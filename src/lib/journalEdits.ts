import type { JournalEntry, Mood } from '@/types';
import { journalEntryEarns } from './points/journalAwards';
import { MIN_JOURNAL_CONTENT_LENGTH } from './journalRules';

/**
 * Editing a saved journal entry (any day): only its mood and notes change. The id, the date and
 * createdAt stay, so the day it belongs to never moves and the server's guard (entry_date
 * unchanged on update) lets it through. The server recomputes only today's journal award, so an
 * earlier entry's points never change; that entry also keeps its pointsAwarded flag. Today's
 * entry gets its flag from the same check the award uses.
 *
 * Returns the new list, or null when the entry is gone (deleted on another device) or nothing
 * changed. An edit never creates an entry.
 */
export function applyJournalEntryEdit(
  entries: JournalEntry[],
  entryId: string,
  mood: Mood,
  content: string,
  today: string
): { journalEntries: JournalEntry[]; entry: JournalEntry } | null {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return null;
  const existing = entries[idx];
  const trimmed = content.trim();
  if (existing.mood === mood && (existing.content ?? '') === trimmed) return null;

  const entry: JournalEntry = { ...existing, mood, content: trimmed };
  if (entry.date === today) entry.pointsAwarded = journalEntryEarns(entry);
  return { journalEntries: entries.map((e, i) => (i === idx ? entry : e)), entry };
}

/**
 * The edit form's notes rule: the Journal page's minimum, except that an entry saved with no notes
 * (mood only) can keep having none, so its mood can still be changed.
 */
export function journalEditNotesOk(originalContent: string | undefined, content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length >= MIN_JOURNAL_CONTENT_LENGTH) return true;
  return trimmed.length === 0 && (originalContent ?? '').trim().length === 0;
}
