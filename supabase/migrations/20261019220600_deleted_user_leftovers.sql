-- Security B1: one-time cleanup of accounts deleted before 20261019220500
-- (Zakria 2026-10-19: a deleted member must not appear anywhere)
--
-- Same rules as public.ascend_scrub_deleted_user, for accounts that are already gone:
-- - league_archives: competitors whose id has no auth.users row are removed (live 2026-10-19:
--   29 rows, 606 entries of 23 deleted ids). Each owner's own stored rank and points stay. The
--   sync stamp trigger moves server_updated_at, so devices pull the new lists.
-- - notifications to others from a deleted member: the foreign key set actor_id to null but kept
--   actor_username. Limited to the member-to-member types, because three old daily reminders
--   carry actor_username 'Ascend System' with no actor and stay (live: 0 rows match, so this is a
--   safety net only).
-- - ascend_guest_cleanup_log: any stored ids or usernames of deleted guests are cleared (live:
--   none so far).
-- Run once, after 20261019220500.

BEGIN;

UPDATE public.league_archives la
SET data = jsonb_set(la.data, '{competitors}', coalesce((
      SELECT jsonb_agg(e.c ORDER BY e.o)
      FROM jsonb_array_elements(la.data->'competitors') WITH ORDINALITY AS e(c, o)
      WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = e.c->>'id')
    ), '[]'::jsonb))
WHERE jsonb_typeof(la.data->'competitors') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(la.data->'competitors') AS c
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = c->>'id')
  );

DELETE FROM public.notifications
WHERE actor_id IS NULL
  AND actor_username IS NOT NULL
  AND type IN ('partner_invite', 'partner_invite_accepted', 'partner_invite_declined', 'partner_removed',
               'challenge_deleted', 'partner_nudge', 'partner_pledge_done', 'partner_missed_habit',
               'challenge_completed');

UPDATE public.ascend_guest_cleanup_log
SET user_ids = '{}', usernames = '{}'
WHERE cardinality(user_ids) > 0 OR cardinality(usernames) > 0;

COMMIT;
