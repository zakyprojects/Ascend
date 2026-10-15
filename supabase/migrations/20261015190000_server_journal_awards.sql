-- Journal points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 6)
-- The app used to write its own journal points to point_entries (+2 for an entry, -2 when it
-- was cleared or deleted), so a console write could claim any amount. Now:
--   * The database writes one row per local day, id journal_award_<YYYY-MM-DD>: +2
--     (JOURNAL_POINTS.entryCompleted) while that day has a live entry with non-empty content.
--     Only the user's current local day is (re)computed, so deleting or editing an earlier
--     day's entry keeps that day's points (Zakria 2026-10-15). Clearing or deleting today's
--     entry removes today's +2.
--   * Entries of any day may still be written, so text saved late from offline is never
--     dropped; it just earns nothing.
--   * The app can no longer write journal points (source journal, journal_award_ ids).
-- The point value is unchanged. Older app-written rows stay as they are; the app's own journal
-- rows of a day the server recomputes (from 2026-10-15, JOURNAL_AWARDS_SERVER_SINCE in
-- src/lib/journalAwards.ts) are replaced by the server's row (live check 2026-10-15 18:55:
-- there are none).
-- src/lib/journalAwards.ts must stay identical to ascend_recompute_journal_awards.

BEGIN;

-- 1. The award row of one user's local day, recomputed from the day's entries.
CREATE OR REPLACE FUNCTION public.ascend_recompute_journal_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_points    int         := 2; -- JOURNAL_POINTS.entryCompleted
  v_id        text        := 'journal_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_written   timestamptz;
  v_at        timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('journal_awards:' || p_user::text || ':' || v_key));

  -- The day's newest live entry with content.
  SELECT max(j.created_at) INTO v_written
  FROM public.journal_entries j
  WHERE j.user_id = p_user
    AND j.deleted_at IS NULL
    AND j.entry_date = p_day
    -- Same whitespace as JavaScript's String.prototype.trim (journalEntryEarns).
    AND btrim(j.content, E' \t\n\r\u000B\f\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF') <> '';

  IF v_written IS NOT NULL THEN
    v_at := least(greatest(v_written, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_points,
      'reason', 'Journal entry completed',
      'source', 'journal',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('date', v_key)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  -- The app-written journal rows (awards and deductions) of the day, from before this migration.
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'journal\_award\_%'
    AND pe.data->>'source' = 'journal'
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 2. Any entry change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.journal_entries_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text := public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_journal_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

-- 3. Only the server writes habit awards, bad-habit points, workout points, skill points,
--    reading points, journal points and missed-habit and missed-workout penalties
--    (20261015160000 plus the journal lines).
CREATE OR REPLACE FUNCTION public.point_entries_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.id LIKE 'habit\_award\_%' OR NEW.id LIKE 'bad\_habit\_%' OR NEW.id LIKE 'habit\_missed\_%'
     OR NEW.id LIKE 'workout\_award\_%' OR NEW.id LIKE 'exercise\_missed\_%' OR NEW.id LIKE 'skill\_award\_%'
     OR NEW.id LIKE 'reading\_award\_%' OR NEW.id LIKE 'reading\_bonus\_%' OR NEW.id LIKE 'journal\_award\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus', 'journal')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%' OR OLD.id LIKE 'journal\_award\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus', 'journal')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_journal_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journal_entries_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- 4. Server rows from 2026-10-15 up to each user's today; the app's own rows for those days
--    are retired.
DO $$
DECLARE
  v_row record;
  v_tz text;
  v_day date;
BEGIN
  FOR v_row IN SELECT DISTINCT j.user_id FROM public.journal_entries j LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_day := DATE '2026-10-15';
    WHILE v_day <= (now() AT TIME ZONE v_tz)::date LOOP
      PERFORM public.ascend_recompute_journal_awards(v_row.user_id, v_day, v_tz);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER journal_entries_award_points AFTER INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_award_points();

COMMIT;
