/**
 * What the app and the public /contact page send to POST /api/feedback (api/feedback.ts), kept
 * free of imports so the marketing pages can use it without the app's Supabase code.
 */

export type FeedbackKind = 'bug' | 'idea' | 'other';

export const FEEDBACK_KINDS: ReadonlyArray<{ value: FeedbackKind; label: string; hint: string }> = [
  { value: 'bug', label: 'Report a bug', hint: 'Something broke' },
  { value: 'idea', label: 'Suggest an idea', hint: 'Make it better' },
  { value: 'other', label: 'Something else', hint: 'Anything on your mind' },
];

export const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  value === 'bug' || value === 'idea' || value === 'other';

/** The optional private rating ("How is AscendDay working for you?"): 1 = not well, 5 = very well. */
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/** A whole 1–5, or null for no rating (the server applies the same rule). */
export function validRating(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export interface FeedbackPayloadInput {
  kind: FeedbackKind;
  ref: string;
  title: string;
  fields: Record<string, string>;
  rating: number | null;
  replyOk: boolean;
  context: Record<string, string>;
  images: Array<{ name: string; data: string }>;
  startedAt: number;
  website: string;
}

/**
 * The in-app body. Only the fields of the chosen kind go out: a bug report never carries an idea's
 * text, the rating goes only with "Something else", and the reply flag is the only reply detail
 * (the server reads the email from the session itself).
 */
export function buildFeedbackPayload(input: FeedbackPayloadInput): Record<string, unknown> {
  const keep: Record<FeedbackKind, string[]> = {
    bug: ['whatHappened', 'steps', 'expected', 'severity', 'area'],
    idea: ['problem', 'idea', 'impact', 'area'],
    other: ['message', 'area'],
  };
  const fields: Record<string, string | number> = {};
  for (const key of keep[input.kind]) {
    const value = (input.fields[key] ?? '').trim();
    if (value) fields[key] = value;
  }
  const rating = input.kind === 'other' ? validRating(input.rating) : null;
  if (rating !== null) fields.rating = rating;
  return {
    kind: input.kind,
    ref: input.ref,
    title: input.kind === 'other' ? '' : input.title.trim(),
    fields,
    replyOk: input.replyOk,
    context: input.context,
    images: input.kind === 'other' ? [] : input.images,
    startedAt: input.startedAt,
    website: input.website,
  };
}

export interface ContactPayloadInput {
  kind: FeedbackKind;
  ref: string;
  name: string;
  email: string;
  message: string;
  captchaToken: string;
  context: Record<string, string>;
  /** How long the form has been open, in ms (the page's own clock may be wrong). */
  fillMs: number;
  website: string;
}

/** The signed-out body from /contact: one message, the sender's email, and the Turnstile token. */
export function buildContactPayload(input: ContactPayloadInput): Record<string, unknown> {
  return {
    kind: input.kind,
    ref: input.ref,
    title: '',
    name: input.name.trim(),
    email: input.email.trim(),
    fields: { message: input.message.trim() },
    captchaToken: input.captchaToken,
    context: input.context,
    fillMs: Math.max(0, Math.round(input.fillMs)),
    website: input.website,
  };
}

/** A plausible email address (the browser's own check runs first; this matches the server's). */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/.test(v);
}

/** The server's error codes as people read them. */
export const FEEDBACK_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Feedback isn't set up yet. Please try again later.",
  rate_limited: 'Too many messages in a short time. Please wait a few minutes.',
  daily_limit: 'Too many messages today. Please try again tomorrow.',
  unauthorized: 'Your sign-in has ended. Sign in again, then send it.',
  too_large: 'The screenshots are too large. Remove one and try again.',
  captcha_failed: 'Couldn’t confirm this browser. Please try again.',
  bad_request: 'Something in the form is missing. Check it and try again.',
  token_invalid: "Feedback can't be delivered right now. Please try again later.",
  token_no_access: "Feedback can't be delivered right now. Please try again later.",
};

export const FEEDBACK_FALLBACK_ERROR = 'Something went wrong sending it. Please try again.';

/** A new reference for one message (kept across retries of it). */
export function newFeedbackRefAt(nowMs: number): string {
  return `ASC-${nowMs.toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}
