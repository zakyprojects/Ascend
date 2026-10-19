import { trustedNowMs } from './clock';
import { supabase } from './supabase';
/**
 * Bug reports and ideas: the browser side of POST /api/feedback (api/feedback.ts), which files
 * them as issues in the private feedback repo. No token lives here.
 */

export type FeedbackKind = 'bug' | 'idea';

export const SEVERITY_OPTIONS = [
  { value: 'cosmetic', label: 'Looks off', hint: 'Visual glitch, typo' },
  { value: 'annoying', label: 'Gets in the way', hint: 'Works, but badly' },
  { value: 'blocking', label: 'Blocks me', hint: "Can't do the task" },
] as const;

export const IMPACT_OPTIONS = [
  { value: 'nice', label: 'Nice to have', hint: 'Small improvement' },
  { value: 'weekly', label: "I'd use it weekly", hint: 'Part of my routine' },
  { value: 'big', label: 'Changes how I use Ascend', hint: 'A real difference' },
] as const;

export const MAX_SCREENSHOTS = 3;
/** What a picked file may weigh before shrinking (phone photos can be large). */
export const MAX_SOURCE_MB = 20;
// Screenshots are redrawn at most this wide/high as JPEG: a few hundred KB, well inside the
// server's per-image cap and the 4.5 MB request limit even with three of them.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

export interface Screenshot {
  id: string;
  name: string;
  /** Object URL of the shrunk image, for the preview. Revoke when removed. */
  previewUrl: string;
  /** Base64 JPEG without the data: prefix, as the API takes it. */
  data: string;
}

export const newFeedbackRef = () =>
  `ASC-${trustedNowMs().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

function deviceKind(): string {
  return window.matchMedia('(pointer: coarse)').matches ? 'Touch' : 'Desktop';
}

/** Sent with every report and listed on the form, so the user sees exactly what goes out. */
export function feedbackContext(account: { uid?: string; isAnonymous?: boolean } | null): Record<string, string> {
  return {
    Browser: browserName(),
    Device: deviceKind(),
    Screen: `${window.innerWidth}×${window.innerHeight}`,
    Theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark',
    Version: `${__APP_VERSION__} (build ${__APP_BUILD__})`,
    Account: account && !account.isAnonymous ? `Signed in${account.uid ? ` (ID ${account.uid})` : ''}` : 'Guest',
  };
}

/** Shrinks a picked image to a JPEG preview + base64 payload. Rejects non-images. */
export async function prepareScreenshot(file: File): Promise<Screenshot> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image.`);
  if (file.size > MAX_SOURCE_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_SOURCE_MB} MB.`);

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} couldn't be read.`);
  });
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`${file.name} couldn't be read.`);
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error(`${file.name} couldn't be read.`);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} couldn't be read.`));
    reader.readAsDataURL(blob);
  });

  return {
    id: `${trustedNowMs()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    previewUrl: URL.createObjectURL(blob),
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
  };
}

export interface FeedbackSubmission {
  kind: FeedbackKind;
  ref: string;
  title: string;
  fields: Record<string, string>;
  context: Record<string, string>;
  screenshots: Screenshot[];
  /** When the form was opened (spam brake on the server). */
  startedAt: number;
  /** Honeypot: hidden from people, filled by bots. */
  website: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Feedback isn't set up yet. Please try again later.",
  rate_limited: 'Too many reports in a short time. Please wait a few minutes.',
  daily_limit: 'Too many reports today. Please try again tomorrow.',
  unauthorized: 'Your sign-in has ended. Sign in again, then send it.',
  too_large: 'The screenshots are too large. Remove one and try again.',
  token_invalid: "Feedback can't be delivered right now. Please try again later.",
  token_no_access: "Feedback can't be delivered right now. Please try again later.",
};

export async function submitFeedback(submission: FeedbackSubmission): Promise<string> {
  const { screenshots, ...rest } = submission;
  let res: Response;
  try {
    // The server accepts only the app's own users (guests included): it checks this session.
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ ...rest, images: screenshots.map(({ name, data }) => ({ name, data })) }),
    });
  } catch {
    throw new Error("Couldn't reach Ascend. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; ref?: string; error?: string } | null;
  if (res.ok && body?.ok) return body.ref || submission.ref;
  throw new Error(ERROR_MESSAGES[body?.error ?? ''] ?? 'Something went wrong sending it. Please try again.');
}
