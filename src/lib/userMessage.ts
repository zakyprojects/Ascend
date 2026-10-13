/**
 * Turns a caught error into text that is safe to show people.
 * Network failures get one shared message, technical errors (database codes,
 * stack-like text) get the caller's fallback, and our own plain messages
 * (time-block collisions, username cooldown, wrong password) pass through.
 * Always console.error the real error at the call site; this is display only.
 */
export const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

const NETWORK_PATTERN = /failed to fetch|networkerror|load failed|err_internet|network request failed|aborterror|timed? ?out|timeout/i;
const TECHNICAL_PATTERN =
  /row-level security|violates|duplicate key|relation|column|function .* does not exist|jwt|supabase|database|rpc|upsert|permission denied|null value|syntax|schema|undefined|TypeError|Error:/i;

export function toUserMessage(err: unknown, fallback: string): string {
  const e = (err ?? {}) as { name?: unknown; message?: unknown; code?: unknown };
  const message = typeof err === 'string' ? err : typeof e.message === 'string' ? e.message.trim() : '';
  const name = typeof e.name === 'string' ? e.name : '';
  const code = typeof e.code === 'string' ? e.code : '';

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return NETWORK_MESSAGE;
  if (name === 'AbortError' || NETWORK_PATTERN.test(message)) return NETWORK_MESSAGE;
  if (!message) return fallback;
  if (/^\d{5}$/.test(code) || /^PGRST/.test(code) || TECHNICAL_PATTERN.test(message)) return fallback;
  return message;
}
