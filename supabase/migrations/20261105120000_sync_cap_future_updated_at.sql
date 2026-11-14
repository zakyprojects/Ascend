-- Sync tables: a row's updated_at is never stored later than the server's clock (fix 7 of
-- knowledge/mode-a-sync-scenarios-2026-11-05.md; Zakria's go 2026-11-05, "han sab aik sath, go").
-- Applied to the shared studio/prod database on 2026-11-05 (knowledge/mode-b-sync-fixes-2026-11-05.md).
--
-- Why: a device whose clock runs ahead and has not read the server time yet (offline start) stamps
-- its edits in the future. keep-newer (newer updated_at wins) then refused every later edit of that
-- row from any other device until the real time passed the stamp, silently (RETURN NULL, no error).
--
-- What changes (only public.sync_stamp_row, the BEFORE INSERT OR UPDATE trigger function of all 24
-- synced tables; no trigger, table, grant or data changes):
--   * updated_at is lowered to the statement's clock_timestamp() when it is later than that. The
--     same instant is the row's server_updated_at, so updated_at <= server_updated_at always holds.
--   * The *_stamp triggers run after the *_keep_newer ones (BEFORE triggers fire in name order), so
--     the incoming row is still compared as sent: a future stamp still beats the stored row, as it
--     did before (it is a write arriving now). Only the value stored is capped, which is what every
--     later write is compared with.
--   * No legitimate writer stamps the future: clients use the server-trusted clock (clock.ts),
--     server functions use now() / clock_timestamp(). A client a few ms ahead loses those ms only.
--   * Old and new app versions are unaffected otherwise: the client never reads updated_at back into
--     a row hash (toRow leaves it out), and jsonb data (data.updatedAt) is not touched.
--   * Checked before applying: no row of these tables had updated_at in the future (read-only count).
--
-- Rollback: work/snapshots/sync-future-cap-2026-11-05/ROLLBACK.md (re-create the previous body).

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_stamp_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
  END IF;
  -- A device clock ahead of the server must not make this row unbeatable until that time.
  IF NEW.updated_at > v_now THEN
    NEW.updated_at := v_now;
  END IF;
  NEW.server_updated_at := v_now;
  RETURN NEW;
END;
$function$;

COMMIT;
