import { TimeTrackerBlock, TimeTrackerState, TimeTrackerTemplate } from '@/types';
import { uid, addDays } from './time/dates';
import { END_OF_DAY, blockIntervalMs, getBlockTimingAt, minutesToTimeString, templateForDate, timeStringToMinutes } from './timeTracker';

/**
 * A template edit reaching today and saved later days (pure; the store writes the result).
 *
 * Blocks a template puts on a day carry linked ids: `auto_<date>_<template>_<templateBlock>`, plus
 * `~<salt>` for a block written by an apply or by an earlier edit (so it never reuses an id another
 * device may hold as deleted). On a reached day, what is done, skipped, running, past or carries
 * pull-forward/trim/break bookkeeping stays exactly as it is; the upcoming rest is replaced by the
 * edited template's blocks, each cut to the free time after now and around what stays (pieces
 * under 5 minutes dropped). A day whose upcoming part is still exactly what the template (before
 * this edit) put there updates on its own; any other day is asked about first.
 *
 * Legacy days (filled before linked ids existed, so every block has a plain id): on a day the
 * template owns by weekday, an unlinked block whose plan fields match a block of the template as
 * it was before the edit counts as that template block (each template block and each day block
 * matched once). One match is enough for the day to be reached; matched blocks count as linked for
 * the untouched check and an upcoming one that still fits whole keeps its own id. Other unlinked
 * upcoming blocks are hand blocks (the day is asked about). On a day the template does not own,
 * plain blocks are never matched: a manual Apply there always wrote linked ids, so a match there
 * is a coincidence (a hand block or another template's), and the day is left.
 */

/** Pieces of a cut template block shorter than this are dropped. */
export const MIN_REACH_PIECE_MINUTES = 5;
const MINUTE_MS = 60_000;

const linkPrefix = (dateKey: string, templateId: string) => `auto_${dateKey}_${templateId}_`;

/** The template block a day block came from (its linked id), or null when it isn't linked. */
export function linkedTemplateBlockId(blockId: string, dateKey: string, templateId: string): string | null {
  const prefix = linkPrefix(dateKey, templateId);
  if (!blockId.startsWith(prefix)) return null;
  const rest = blockId.slice(prefix.length);
  const salt = rest.indexOf('~');
  const id = salt >= 0 ? rest.slice(0, salt) : rest;
  return id || null;
}

/** A new linked id for a template block on a date (salted, so it is never an id seen before). */
export function newLinkedBlockId(dateKey: string, templateId: string, templateBlockId: string, salt: string = uid()): string {
  return `${linkPrefix(dateKey, templateId)}${templateBlockId}~${salt}`;
}

const endMinutes = (b: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>) => {
  const start = timeStringToMinutes(b.startTime);
  const end = timeStringToMinutes(b.endTime);
  return end === 0 && start > 0 ? 1440 : end;
};

/** Same plan: start, end (24:00 = 00:00 after a start), category, extra categories, title, notes. */
export function samePlanFields(a: TimeTrackerBlock, b: TimeTrackerBlock): boolean {
  const extras = (x: TimeTrackerBlock) => [...(x.secondaryActivityIds || [])].sort().join(',');
  return (
    timeStringToMinutes(a.startTime) === timeStringToMinutes(b.startTime) &&
    endMinutes(a) === endMinutes(b) &&
    a.activityId === b.activityId &&
    extras(a) === extras(b) &&
    (a.customTitle || '') === (b.customTitle || '') &&
    (a.notes || '') === (b.notes || '')
  );
}

/** True when two templates' blocks plan the same day (same ids and plan fields). */
export function sameTemplateBlocks(a: TimeTrackerBlock[] = [], b: TimeTrackerBlock[] = []): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((x) => [x.id, x]));
  return a.every((x) => {
    const y = byId.get(x.id);
    return !!y && samePlanFields(x, y);
  });
}

const hasBookkeeping = (b: TimeTrackerBlock) =>
  !!(b.originalStartTime || b.originalEndTime || b.trimmedOriginalEndTime || b.pulledForwardTriggerId || b.trimmedDueToPullId || b.breakStartedAt);

/** A block a template edit never changes: resolved, running, past, or carrying bookkeeping. */
function isKept(b: TimeTrackerBlock, dateKey: string, nowMs: number): boolean {
  return !!b.completed || !!b.skipped || hasBookkeeping(b) || getBlockTimingAt(b, dateKey, nowMs) !== 'upcoming';
}

/** "HH:mm" for an instant on or after the start of `dateKey`; the next midnight is "24:00". */
function wallTime(ms: number, dateKey: string): string {
  if (ms === blockIntervalMs({ startTime: '00:00', endTime: END_OF_DAY }, dateKey).endMs) return END_OF_DAY;
  const at = new Date(ms);
  return minutesToTimeString(at.getHours() * 60 + at.getMinutes());
}

interface Piece {
  templateBlock: TimeTrackerBlock;
  startTime: string;
  endTime: string;
}

/**
 * The template's blocks as they fit this day now: each one minus the time before `nowMs` and
 * minus every kept block; its longest free stretch (the earliest on a tie) if 5 minutes or more.
 */
function templatePieces(template: TimeTrackerTemplate, dateKey: string, nowMs: number, kept: TimeTrackerBlock[]): Piece[] {
  const busy = kept.map((b) => blockIntervalMs(b, dateKey));
  const pieces: Piece[] = [];
  for (const tb of template.blocks || []) {
    const { startMs, endMs } = blockIntervalMs(tb, dateKey);
    let free: Array<[number, number]> = [[Math.max(startMs, nowMs), endMs]];
    for (const k of busy) {
      free = free.flatMap(([s, e]): Array<[number, number]> => {
        if (k.endMs <= s || k.startMs >= e) return [[s, e]];
        const out: Array<[number, number]> = [];
        if (k.startMs > s) out.push([s, k.startMs]);
        if (k.endMs < e) out.push([k.endMs, e]);
        return out;
      });
    }
    let best: [number, number] | null = null;
    for (const seg of free) {
      if (seg[1] - seg[0] >= MIN_REACH_PIECE_MINUTES * MINUTE_MS && (!best || seg[1] - seg[0] > best[1] - best[0])) best = seg;
    }
    if (!best) continue;
    const whole = best[0] === startMs && best[1] === endMs;
    pieces.push({
      templateBlock: tb,
      startTime: whole ? tb.startTime : wallTime(best[0], dateKey),
      endTime: whole ? tb.endTime : wallTime(best[1], dateKey),
    });
  }
  return pieces;
}

const pieceKey = (p: Piece) =>
  JSON.stringify([
    p.templateBlock.id,
    p.startTime,
    p.endTime,
    p.templateBlock.activityId,
    [...(p.templateBlock.secondaryActivityIds || [])].sort(),
    p.templateBlock.customTitle || '',
    p.templateBlock.notes || '',
  ]);

export interface TemplateEditReachDay {
  dateKey: string;
  /** 'auto' = the upcoming part is the template as it was (updates on its own); 'ask' = changed by hand. */
  kind: 'auto' | 'ask';
  /** The day's blocks after the update. */
  blocks: TimeTrackerBlock[];
  /** Blocks taken off the day (the upcoming part being replaced). */
  removed: TimeTrackerBlock[];
}

/**
 * The days a template edit reaches and what each becomes. `before` is the time tracker before the
 * edit, `after` the same with only the templates changed. Reached: today and every saved later day
 * that is not cleared, holds at least one block linked to it (filled on its weekday or by a
 * manual Apply) or, on a legacy day it owns, one plain block matching it, was not moved away from it by this edit (weekday removed or taken by another
 * template in the same save), and whose upcoming part would actually change. Nothing is reached when the
 * template is gone or its blocks did not change (a name- or weekday-only edit).
 */
export function planTemplateEditReach(
  before: TimeTrackerState,
  after: TimeTrackerState,
  templateId: string,
  today: string,
  nowMs: number,
  newSalt: () => string = uid
): TemplateEditReachDay[] {
  const oldTemplate = (before.templates || []).find((t) => t.id === templateId);
  const newTemplate = (after.templates || []).find((t) => t.id === templateId);
  if (!oldTemplate || !newTemplate || sameTemplateBlocks(oldTemplate.blocks, newTemplate.blocks)) return [];

  const cleared = new Set(before.clearedDates || []);
  const plans: TemplateEditReachDay[] = [];
  for (const [dateKey, dayBlocks] of Object.entries(before.dailyLogs || {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (dateKey < today || dayBlocks === undefined || cleared.has(dateKey)) continue;
    // Moved away in this save (its weekday removed or taken): left as it is. A day this template
    // reached only by a manual Apply (not its weekday, or another template's) is still reached.
    if (templateForDate(before, dateKey)?.id === templateId && templateForDate(after, dateKey)?.id !== templateId) continue;
    const blocks = dayBlocks || [];
    // Which template block each day block is: its linked id, or (legacy day) a plan-field match.
    const linkOf = new Map<TimeTrackerBlock, string>();
    for (const b of blocks) {
      const link = linkedTemplateBlockId(b.id, dateKey, templateId);
      if (link !== null) linkOf.set(b, link);
    }
    if (linkOf.size === 0 && templateForDate(before, dateKey)?.id === templateId) {
      const used = new Set<string>();
      for (const b of blocks) {
        if (b.id.startsWith('auto_')) continue; // another template's (or another date's) block
        const tb = (oldTemplate.blocks || []).find((x) => !!x.id && !used.has(x.id) && samePlanFields(b, x));
        if (!tb) continue;
        used.add(tb.id);
        linkOf.set(b, tb.id);
      }
    }
    if (linkOf.size === 0) continue;

    const kept = blocks.filter((b) => isKept(b, dateKey, nowMs));
    const upcoming = blocks.filter((b) => !isKept(b, dateKey, nowMs));

    // Untouched: every upcoming block is a template block as the template had it, once each, and
    // no template block that is still ahead was deleted; no kept block ahead carries bookkeeping.
    const oldById = new Map((oldTemplate.blocks || []).map((tb) => [tb.id, tb]));
    const seen = new Set<string>();
    let untouched = !kept.some((b) => hasBookkeeping(b) && getBlockTimingAt(b, dateKey, nowMs) === 'upcoming');
    for (const b of upcoming) {
      const link = linkOf.get(b) ?? null;
      const tb = link ? oldById.get(link) : undefined;
      if (!link || !tb || seen.has(link) || !samePlanFields(b, tb)) untouched = false;
      if (link) seen.add(link);
    }
    const linkedOnDay = new Set(linkOf.values());
    for (const tb of oldTemplate.blocks || []) {
      if (getBlockTimingAt(tb, dateKey, nowMs) === 'upcoming' && !linkedOnDay.has(tb.id)) untouched = false;
    }

    const pieces = templatePieces(newTemplate, dateKey, nowMs, kept);
    // The edit changes nothing still ahead on this day (say, only a block already past): leave it, don't ask.
    const oldPieces = templatePieces(oldTemplate, dateKey, nowMs, kept);
    if (oldPieces.map(pieceKey).join('|') === pieces.map(pieceKey).join('|')) continue;

    const reusable = new Map<string, TimeTrackerBlock>();
    for (const b of upcoming) {
      const link = linkOf.get(b);
      if (link && !reusable.has(link)) reusable.set(link, b);
    }
    const nowIso = new Date(nowMs).toISOString();
    const added = pieces.map((p): TimeTrackerBlock => {
      const tb = p.templateBlock;
      const plan: TimeTrackerBlock = {
        id: '',
        startTime: p.startTime,
        endTime: p.endTime,
        activityId: tb.activityId,
        ...(tb.secondaryActivityIds?.length ? { secondaryActivityIds: tb.secondaryActivityIds } : {}),
        ...(tb.customTitle ? { customTitle: tb.customTitle } : {}),
        ...(tb.notes ? { notes: tb.notes } : {}),
      };
      const whole = p.startTime === tb.startTime && p.endTime === tb.endTime;
      const previous = whole && tb.id ? reusable.get(tb.id) : undefined;
      if (previous) {
        // Updated in place: same id, so the other device's copy is replaced, not doubled.
        if (samePlanFields(previous, { ...plan, id: previous.id })) return previous;
        return { ...plan, id: previous.id, createdAt: previous.createdAt ?? nowIso };
      }
      return { ...plan, id: tb.id ? newLinkedBlockId(dateKey, templateId, tb.id, newSalt()) : uid(), createdAt: nowIso };
    });

    const addedIds = new Set(added.map((b) => b.id));
    const removed = upcoming.filter((b) => !addedIds.has(b.id));
    // Nothing would change (every block stays as it is).
    if (removed.length === 0 && added.every((b) => upcoming.includes(b))) continue;
    plans.push({
      dateKey,
      kind: untouched ? 'auto' : 'ask',
      blocks: [...kept, ...added].sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)),
      removed,
    });
  }
  return plans;
}

/**
 * The days to write for a reach: every 'auto' day, plus the 'ask' days when the user chose Update
 * (`includeAsked`). A removed half of a block past midnight leaves its other half (today or later)
 * as a plain block, as deleting one half by hand does.
 */
export function templateEditReachDays(
  before: TimeTrackerState,
  plans: TemplateEditReachDay[],
  includeAsked: boolean,
  today: string
): Record<string, TimeTrackerBlock[]> {
  const days: Record<string, TimeTrackerBlock[]> = {};
  const chosen = plans.filter((p) => p.kind === 'auto' || includeAsked);
  for (const p of chosen) days[p.dateKey] = p.blocks;
  for (const p of chosen) {
    for (const removed of p.removed) {
      if (!removed.splitPairId) continue;
      const otherDate = addDays(p.dateKey, removed.startTime === '00:00' ? -1 : 1);
      if (otherDate < today) continue;
      const source = days[otherDate] ?? before.dailyLogs?.[otherDate];
      if (!source) continue;
      const partner = source.find((b) => b.id !== removed.id && b.splitPairId === removed.splitPairId);
      if (!partner) continue;
      days[otherDate] = source.map((b) => {
        if (b !== partner) return b;
        const { splitPairId: _unlinked, ...rest } = b;
        return rest;
      });
    }
  }
  return days;
}

