/**
 * The Journal page's save rule: an entry needs at least this many characters (whitespace trimmed).
 * Shared with the public Journal page (src/marketing) so its copy can't drift. The server's award
 * check is looser (any content, journalAwards.ts); this is what the app asks for.
 */
export const MIN_JOURNAL_CONTENT_LENGTH = 10;
