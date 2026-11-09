-- Reading: a book can switch its unit mid-book, chapters <-> pages (Zakria 2026-11-09). Replaces
-- the unit lock of 20261019170000 (reading_books_keep_unit): the lock existed only because points
-- read every log in the BOOK's current unit; now each log keeps its own unit.
--
-- Zakria's points rules (2026-11-09):
--  * 1 chapter = 10 pts, 2 pages = 1 pt, 10 pts a day across all books (unchanged).
--  * A switch never changes points already earned and earns nothing (the app writes the book only,
--    never a log: src/lib/bookUnits.ts switchBookUnit).
--  * A book's points for a day follow its net progress in pages (1 chapter = 20 pages): reading the
--    same pages again after a switch earns nothing. The app keeps, on the book, each switch of today
--    and yesterday that lowered its place (data.unitSwitches: date, at, pagesBefore, pagesAfter, in
--    pages). Per book, in time order, each log adds its pages and each such switch subtracts
--    pagesBefore - pagesAfter; the book counts the highest running total it reached (never below 0).
--    A day without a switch is the plain sum, exactly as before.
--  * Lowering progress takes back only today's logs (the app; reading_logs_guard_today unchanged).
--
-- What this file does:
--  1. reading_logs_unit (BEFORE INSERT OR UPDATE, every role): a new log keeps a valid 'pages' /
--     'chapters' unit the app sent, else gets its book's current unit (old app builds send none);
--     an update keeps the unit the row already has (a log's unit never changes).
--  2. Backfill: every live log without a unit gets its book's unit (deleted logs can never come
--     back: sync_keep_newer_row drops updates of deleted rows). The award trigger is off for the
--     backfill (same numbers, no point row touched); the stamp trigger stays on so every device
--     pulls the stamped logs.
--  3. ascend_recompute_reading_awards (4-arg): a log's multiplier from its own unit, and the
--     switch rule above. Mirror: src/lib/readingAwards.ts computeReadingDayAward.
--  4. ascend_member_card: season pages shown only when every page log was written in pages (log unit).
--  5. Drops reading_books_keep_unit.
--
-- Prod-compatible: old builds can't switch (their own lock), and the server stamps their logs.
-- Run BEFORE the studio test.

BEGIN;

-- 1. A log's unit, stamped once ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reading_logs_unit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_unit text;
BEGIN
  IF TG_OP = 'UPDATE' AND lower(OLD.data->>'unit') IN ('pages', 'chapters') THEN
    NEW.data := jsonb_set(NEW.data, '{unit}', to_jsonb(lower(OLD.data->>'unit')));
    RETURN NEW;
  END IF;
  IF lower(NEW.data->>'unit') IN ('pages', 'chapters') THEN
    v_unit := lower(NEW.data->>'unit');
  ELSE
    SELECT CASE WHEN lower(b.data->>'unit') = 'chapters' THEN 'chapters' ELSE 'pages' END INTO v_unit
    FROM public.reading_books b
    WHERE b.user_id = NEW.user_id AND b.id = NEW.data->>'bookId';
  END IF;
  IF v_unit IS NULL THEN
    RETURN NEW; -- its book is not here (yet): read in the book's unit when it comes
  END IF;
  NEW.data := jsonb_set(NEW.data, '{unit}', to_jsonb(v_unit));
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reading_logs_unit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reading_logs_unit ON public.reading_logs;
CREATE TRIGGER reading_logs_unit BEFORE INSERT OR UPDATE ON public.reading_logs
  FOR EACH ROW EXECUTE FUNCTION public.reading_logs_unit();

-- 2. Backfill ------------------------------------------------------------------------------------

ALTER TABLE public.reading_logs DISABLE TRIGGER reading_logs_award_points;

UPDATE public.reading_logs l
SET data = jsonb_set(l.data, '{unit}',
      to_jsonb(CASE WHEN lower(b.data->>'unit') = 'chapters' THEN 'chapters' ELSE 'pages' END))
FROM public.reading_books b
WHERE b.user_id = l.user_id AND b.id = l.data->>'bookId'
  AND l.deleted_at IS NULL
  AND lower(l.data->>'unit') IS DISTINCT FROM 'pages'
  AND lower(l.data->>'unit') IS DISTINCT FROM 'chapters';

ALTER TABLE public.reading_logs ENABLE TRIGGER reading_logs_award_points;

-- 3. Day award: each log in its own unit; a switch never earns, and pages it took off don't earn twice

CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text, p_floor boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_pages     numeric     := 0;
  v_count     int         := 0;
  v_used      int;
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  numeric;
  v_at        timestamptz;
  v_id        text        := 'reading_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
  v_books     jsonb       := '{}'::jsonb; -- per book: running total "t" and best "b", in pages
  v_total     numeric;
  v_best      numeric;
  v_new_best  numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reading_awards:' || p_user::text || ':' || v_key));

  FOR v_item IN
    SELECT ev.kind, ev.book_id, ev.pages, ev.logged_at
    FROM (
      SELECT 0 AS kind,
             b.id AS book_id,
             l.id AS ord_id,
             public.ascend_reading_log_pages(l.data)
               * CASE WHEN (CASE WHEN lower(l.data->>'unit') IN ('pages', 'chapters') THEN lower(l.data->>'unit')
                                 ELSE lower(b.data->>'unit') END) = 'chapters' THEN 20 ELSE 1 END AS pages,
             public.ascend_instant(l.data->>'createdAt') AS logged_at
      FROM public.reading_logs l
      JOIN public.reading_books b
        ON b.user_id = l.user_id AND b.id = l.data->>'bookId' AND b.deleted_at IS NULL
      WHERE l.user_id = p_user
        AND l.deleted_at IS NULL
        AND l.data->>'date' = v_key
        AND (l.data->>'finish') IS DISTINCT FROM 'true'
      UNION ALL
      SELECT 1,
             b.id,
             b.id || '#' || s.ord,
             -greatest((s.e->>'pagesBefore')::numeric - (s.e->>'pagesAfter')::numeric, 0),
             public.ascend_instant(s.e->>'at')
      FROM public.reading_books b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(b.data->'unitSwitches') = 'array' THEN b.data->'unitSwitches' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS s(e, ord)
      WHERE b.user_id = p_user
        AND b.deleted_at IS NULL
        AND jsonb_typeof(s.e) = 'object'
        AND s.e->>'date' = v_key
        AND jsonb_typeof(s.e->'pagesBefore') = 'number'
        AND jsonb_typeof(s.e->'pagesAfter') = 'number'
    ) ev
    ORDER BY ev.logged_at NULLS LAST, ev.kind, ev.ord_id COLLATE "C"
  LOOP
    v_total := coalesce((v_books->v_item.book_id->>'t')::numeric, 0) + v_item.pages;
    v_best := coalesce((v_books->v_item.book_id->>'b')::numeric, 0);
    v_new_best := greatest(v_best, v_total);
    v_pages := v_pages + (v_new_best - v_best);
    v_books := v_books || jsonb_build_object(v_item.book_id, jsonb_build_object('t', v_total, 'b', v_new_best));
    IF v_item.kind = 0 THEN
      v_count := v_count + 1;
      IF v_first IS NULL AND least(floor(v_pages / 2), 10) > 0 THEN
        v_first := coalesce(v_item.logged_at, now());
      END IF;
    END IF;
  END LOOP;

  v_used := least(floor(v_pages / 2), 10)::int;

  SELECT pe.data->>'timestamp',
         CASE WHEN jsonb_typeof(pe.data->'amount') = 'number' THEN (pe.data->>'amount')::numeric END
  INTO v_kept, v_kept_amt
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF p_floor AND v_used <= coalesce(v_kept_amt, 0) THEN
    RETURN; -- an earlier day never drops
  END IF;

  IF v_used > 0 THEN
    v_at := least(greatest(v_first, v_day_start), now(), v_day_end - interval '1 millisecond');
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Pages logged (' || v_count || ')',
      'source', 'reading',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'metadata', jsonb_build_object('date', v_key, 'logs', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  IF p_floor THEN
    RETURN; -- never takes anything away from an earlier day
  END IF;

  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'reading\_award\_%'
    AND pe.id NOT LIKE 'reading\_bonus\_%'
    AND pe.data->>'source' IN ('reading', 'reading_bonus')
    AND jsonb_typeof(pe.data->'amount') = 'number'
    AND (pe.data->>'amount')::numeric > 0
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) TO service_role;

-- 4. Member card: pages from logs written in pages -------------------------------------------------

CREATE OR REPLACE FUNCTION public.ascend_member_card(p_member uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_viewer uuid := auth.uid();
  v_viewer_public boolean;
  v_allowed boolean;
  v_created timestamptz;
  v_tz text;
  v_today date;
  v_today_t text;
  v_season int;
  v_s_start timestamptz;
  v_s_end timestamptz;
  v_s_first date;
  v_s_last date;
  v_w_end date;
  v_first_t text;
  v_end_t text;
  v_joined date;
  v_this_week text;
  v_first_active date;
  v_from date;
  v_days int;
  v_active int;
  v_card jsonb;
  v_has boolean;
  v_x jsonb;
BEGIN
  IF v_viewer IS NULL OR p_member IS NULL THEN
    RETURN NULL;
  END IF;

  -- The visibility rule of ascend_member_profiles, unchanged.
  SELECT coalesce(pr.is_profile_public, true) INTO v_viewer_public
  FROM public.profiles pr WHERE pr.id = v_viewer;

  SELECT (
           p.id = v_viewer
           OR (coalesce(v_viewer_public, true) AND coalesce(p.is_profile_public, true))
           OR EXISTS (
             SELECT 1 FROM public.partnerships ps
             WHERE (ps.user1_id = v_viewer AND ps.user2_id = p.id)
                OR (ps.user2_id = v_viewer AND ps.user1_id = p.id)
           )
         ),
         p.created_at
    INTO v_allowed, v_created
  FROM public.profiles p
  WHERE p.id = p_member;

  IF v_allowed IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Clocks: the member's own day; the season from the shared UTC boundaries.
  v_tz := public.ascend_user_timezone(p_member);
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_today_t := to_char(v_today, 'YYYY-MM-DD');
  v_season := public.ascend_season_number(now());
  v_s_start := public.ascend_season_begin(v_season);
  v_s_end := public.ascend_season_begin(v_season + 1);
  v_s_first := (v_s_start AT TIME ZONE 'UTC')::date;
  v_s_last := (v_s_end AT TIME ZONE 'UTC')::date - 1;
  -- Behind UTC right after a rollover the member's today can still be before the new season's first
  -- day: the window is then empty (never negative).
  v_w_end := least(v_today, v_s_last);
  v_first_t := to_char(v_s_first, 'YYYY-MM-DD');
  v_end_t := to_char(v_w_end, 'YYYY-MM-DD');
  v_joined := (coalesce(v_created, now()) AT TIME ZONE v_tz)::date;
  v_this_week := public.ascend_week_key(v_today, v_tz);

  v_card := jsonb_build_object('v', 2);

  -- Active days: any habit check-in, exercise, skill, reading, focus or journal day in the window.
  -- Day keys stay text ('YYYY-MM-DD' sorts like a date), so a malformed key can never raise.
  WITH win AS (
    SELECT d::date AS d, to_char(d, 'YYYY-MM-DD') AS k
    FROM generate_series(v_s_first, v_w_end, interval '1 day') d
  ), days AS (
    -- daily habits: the completion keys of days in the window
    SELECT w.k
    FROM public.habits h
    JOIN win w ON (h.data->'completions'->w.k->>'done') = 'true'
    WHERE h.user_id = p_member AND h.deleted_at IS NULL
      AND coalesce(h.data->>'frequency', 'daily') <> 'weekly'
      AND w.k >= CASE WHEN h.data->>'createdAtPeriod' ~ '^\d{4}-\d{2}-\d{2}$'
                      THEN greatest(v_first_t, h.data->>'createdAtPeriod') ELSE v_first_t END
    UNION
    -- weekly habits: the day the week was ticked (in the member's timezone)
    SELECT to_char(public.ascend_instant(c.value->>'updatedAt') AT TIME ZONE v_tz, 'YYYY-MM-DD')
    FROM public.habits h
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(h.data->'completions') = 'object'
                                       THEN h.data->'completions' ELSE '{}'::jsonb END) c
    WHERE h.user_id = p_member AND h.deleted_at IS NULL AND h.data->>'frequency' = 'weekly'
      AND c.key ~ '^\d{4}-W\d{2}$' AND (c.value->>'done') = 'true'
    UNION
    SELECT x.data->>'date' FROM public.workouts x WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION
    SELECT x.data->>'date' FROM public.skill_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION
    SELECT x.data->>'date' FROM public.reading_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION
    SELECT to_char(x.log_date, 'YYYY-MM-DD') FROM public.focus_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION
    SELECT to_char(x.entry_date, 'YYYY-MM-DD') FROM public.journal_entries x WHERE x.user_id = p_member AND x.deleted_at IS NULL
  )
  SELECT count(*)::int, min(w.d)
    INTO v_active, v_first_active
  FROM (SELECT DISTINCT k FROM days) dd
  JOIN win w ON w.k = dd.k;

  -- Since the season's first day, or since joining when later (a guest's earlier first log counts).
  v_from := greatest(v_s_first, least(v_joined, coalesce(v_first_active, v_joined)));
  v_days := greatest(1, v_w_end - v_from + 1);

  v_card := v_card || jsonb_build_object(
    'season', v_season,
    'seasonStart', to_char(v_s_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'seasonEnd', to_char(v_s_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'asOf', v_today_t,
    'from', to_char(v_from, 'YYYY-MM-DD'),
    'days', v_days,
    'active', least(v_active, v_days)
  );

  -- Today: habits ticked on the member's local today (the Partners page).
  SELECT to_jsonb(count(*)::int) INTO v_x
  FROM public.habits h
  WHERE h.user_id = p_member AND h.deleted_at IS NULL
    AND (h.data->'completions'->v_today_t->>'done') = 'true';
  v_card := v_card || jsonb_build_object('today', jsonb_build_object('habitsDone', coalesce(v_x, '0'::jsonb)));

  -- Current streak: the longest run ending today or yesterday over each active habit's check-ins,
  -- exercise days, reading days, resisted days of each bad habit still being fought, and skill days.
  -- Ties go to the higher priority (habit 100, exercise 80, reading 60, resisted 40, skill 20).
  WITH keys AS (
    SELECT 'h:' || h.id AS src, coalesce(nullif(btrim(h.data->>'category'), ''), 'Habit Journey') AS cat, 100 AS prio, c.k
    FROM public.habits h
    CROSS JOIN LATERAL (
      SELECT e.key AS k FROM jsonb_each(CASE WHEN jsonb_typeof(h.data->'completions') = 'object'
                                             THEN h.data->'completions' ELSE '{}'::jsonb END) e
      WHERE (e.value->>'done') = 'true'
      UNION
      SELECT a.value FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(h.data->'completions') = 'array'
                                                         THEN h.data->'completions' ELSE '[]'::jsonb END) a
    ) c
    WHERE h.user_id = p_member AND h.deleted_at IS NULL
    UNION ALL
    SELECT 'exercise', 'Exercise', 80, x.data->>'date' FROM public.workouts x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION ALL
    SELECT 'reading', 'Reading', 60, x.data->>'date' FROM public.reading_logs x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL
    UNION ALL
    SELECT 'b:' || b.id, 'Resisted', 40, l.data->>'date'
    FROM public.bad_habits b
    JOIN public.bad_habit_logs l ON l.user_id = b.user_id AND l.deleted_at IS NULL
     AND l.data->>'badHabitId' = b.id AND l.data->>'status' = 'resisted'
    WHERE b.user_id = p_member AND b.deleted_at IS NULL
      AND coalesce(b.data->>'isCompleted', 'false') <> 'true'
    UNION ALL
    SELECT 'skill', 'Skill Practice', 20, x.data->>'date' FROM public.skill_logs x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL
  ), dated AS (
    -- Only real calendar days on or before today; nested CASE so a malformed key is never cast.
    SELECT DISTINCT src, cat, prio,
      CASE WHEN k ~ '^[12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' AND k <= v_today_t THEN
        CASE WHEN substr(k, 9, 2)::int <= extract(day FROM (make_date(substr(k, 1, 4)::int, substr(k, 6, 2)::int, 1)
                                                            + interval '1 month - 1 day'))::int
             THEN k::date END
      END AS day
    FROM keys
  ), runs AS (
    SELECT src, cat, prio, day, day - (row_number() OVER (PARTITION BY src ORDER BY day))::int AS grp
    FROM dated WHERE day IS NOT NULL
  ), islands AS (
    SELECT src, cat, prio, count(*)::int AS n, max(day) AS last FROM runs GROUP BY src, cat, prio, grp
  )
  SELECT jsonb_build_object('days', i.n, 'category', i.cat)
    INTO v_x
  FROM islands i
  WHERE i.last >= v_today - 1
  ORDER BY i.n DESC, i.prio DESC
  LIMIT 1;
  v_card := v_card || jsonb_build_object('streak', coalesce(v_x, jsonb_build_object('days', 0, 'category', '')));

  -- Habits: share of check-ins done. A daily habit is due each day from its creation; a weekly one
  -- each week touching the window from its creation week. Today (this week) counts only once done.
  SELECT EXISTS (SELECT 1 FROM public.habits h WHERE h.user_id = p_member AND h.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    WITH win AS (
      SELECT to_char(d, 'YYYY-MM-DD') AS k, public.ascend_week_key(d::date, v_tz) AS wk
      FROM generate_series(v_s_first, v_w_end, interval '1 day') d
    ), daily AS (
      SELECT (h.data->'completions'->w.k->>'done') = 'true' AS done, w.k = v_today_t AS is_now
      FROM public.habits h
      JOIN win w ON w.k >= CASE WHEN h.data->>'createdAtPeriod' ~ '^\d{4}-\d{2}-\d{2}$'
                                THEN greatest(v_first_t, h.data->>'createdAtPeriod') ELSE v_first_t END
      WHERE h.user_id = p_member AND h.deleted_at IS NULL
        AND coalesce(h.data->>'frequency', 'daily') <> 'weekly'
    ), weekly AS (
      SELECT (h.data->'completions'->ww.wk->>'done') = 'true' AS done, ww.wk = v_this_week AS is_now
      FROM public.habits h
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN h.data->>'createdAtPeriod' ~ '^\d{4}-W\d{2}$' THEN h.data->>'createdAtPeriod'
          WHEN h.data->>'createdAtPeriod' ~ '^[12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN
            CASE WHEN substr(h.data->>'createdAtPeriod', 9, 2)::int <= extract(day FROM (make_date(
                        substr(h.data->>'createdAtPeriod', 1, 4)::int, substr(h.data->>'createdAtPeriod', 6, 2)::int, 1)
                        + interval '1 month - 1 day'))::int
                 THEN public.ascend_week_key((h.data->>'createdAtPeriod')::date, v_tz) END
        END AS created_week
      ) cw
      JOIN (SELECT DISTINCT wk FROM win) ww ON cw.created_week IS NULL OR ww.wk >= cw.created_week
      WHERE h.user_id = p_member AND h.deleted_at IS NULL AND h.data->>'frequency' = 'weekly'
    ), checks AS (
      SELECT done, is_now FROM daily UNION ALL SELECT done, is_now FROM weekly
    )
    SELECT jsonb_build_object(
             'done', count(*) FILTER (WHERE done),
             'due', count(*) FILTER (WHERE done OR NOT is_now))
      INTO v_x
    FROM checks;
    v_card := v_card || jsonb_build_object('habits', v_x);
  END IF;

  -- Exercise: the 3 most-done exercises, one row per exercise and unit (never added across units),
  -- ranked by days, then sessions, then the newest; newest spelling; best = the largest one-day total.
  SELECT EXISTS (SELECT 1 FROM public.workouts x WHERE x.user_id = p_member AND x.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    WITH ex AS (
      SELECT lower(regexp_replace(coalesce(x.data->>'type', ''), '[^[:alnum:]]+', '', 'g')) AS gk,
             nullif(btrim(coalesce(x.data->>'type', '')), '') AS name,
             CASE WHEN lower(btrim(coalesce(x.data->>'unit', 'mins'))) IN ('reps', 'sets', 'km')
                  THEN lower(btrim(x.data->>'unit')) ELSE 'mins' END AS unit,
             x.data->>'date' AS day,
             coalesce(x.data->>'createdAt', '') AS created,
             CASE WHEN jsonb_typeof(x.data->'amount') = 'number' THEN (x.data->>'amount')::numeric END AS amount,
             CASE WHEN jsonb_typeof(x.data->'durationMinutes') = 'number' THEN (x.data->>'durationMinutes')::numeric END AS minutes
      FROM public.workouts x
      WHERE x.user_id = p_member AND x.deleted_at IS NULL
        AND x.data->>'date' >= v_first_t AND x.data->>'date' <= v_end_t
        AND x.data->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    ), ex_amt AS (
      SELECT gk, name, unit, day, created,
             greatest(CASE WHEN unit = 'mins' THEN CASE WHEN amount > 0 THEN amount ELSE coalesce(minutes, 0) END
                           ELSE coalesce(amount, 0) END, 0) AS amt
      FROM ex
    ), per_day AS (
      SELECT gk, unit, day, sum(amt) AS amt, count(*) AS n FROM ex_amt GROUP BY gk, unit, day
    ), grp AS (
      SELECT d.gk, d.unit, sum(d.amt) AS total, count(*)::int AS days, max(d.amt) AS best, sum(d.n) AS sessions,
             max(d.day) AS newest
      FROM per_day d GROUP BY d.gk, d.unit
    ), named AS (
      SELECT g.*,
             (SELECT left(coalesce(a.name, 'Workout'), 40) FROM ex_amt a
              WHERE a.gk = g.gk AND a.unit = g.unit
              ORDER BY a.day DESC, a.created DESC LIMIT 1) AS name,
             (SELECT max(a.day || '|' || a.created) FROM ex_amt a WHERE a.gk = g.gk AND a.unit = g.unit) AS stamp
      FROM grp g
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', t.name, 'unit', t.unit, 'total', round(t.total, 2), 'days', t.days, 'best', round(t.best, 2))
             ORDER BY t.days DESC, t.sessions DESC, t.stamp DESC), '[]'::jsonb)
      INTO v_x
    FROM (SELECT * FROM named ORDER BY days DESC, sessions DESC, stamp DESC LIMIT 3) t;
    v_card := v_card || jsonb_build_object('exercise', v_x);
  END IF;

  -- Skills: practice minutes and days only. Skill names stay private. (Cleared lifetime minutes are
  -- undated, so they are not part of a season figure.)
  SELECT EXISTS (SELECT 1 FROM public.skills s WHERE s.user_id = p_member AND s.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.skill_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    SELECT jsonb_build_object(
             'minutes', coalesce(round(sum(CASE WHEN jsonb_typeof(x.data->'durationMinutes') = 'number'
                                                THEN greatest((x.data->>'durationMinutes')::numeric, 0) ELSE 0 END)), 0),
             'days', count(DISTINCT x.data->>'date'))
      INTO v_x
    FROM public.skill_logs x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL
      AND x.data->>'date' >= v_first_t AND x.data->>'date' <= v_end_t
      AND x.data->>'date' ~ '^\d{4}-\d{2}-\d{2}$';
    v_card := v_card || jsonb_build_object('skills', v_x);
  END IF;

  -- Reading: days read (a Finish log counts as a reading day), books finished this season, and pages
  -- only when every page log in the window was written in pages (the log's own unit, else its
  -- book's; a book can switch units, 20261109190000) for a book still in the library.
  SELECT EXISTS (SELECT 1 FROM public.reading_books b WHERE b.user_id = p_member AND b.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.reading_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    WITH logs AS (
      SELECT x.data->>'date' AS day,
             coalesce(x.data->'finish' NOT IN ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb), false) AS finish,
             public.ascend_reading_log_pages(x.data) AS pages,
             EXISTS (
               SELECT 1 FROM public.reading_books b
               WHERE b.user_id = p_member AND b.deleted_at IS NULL
                 AND coalesce(x.data->>'bookId', '') <> ''
                 AND (b.id = x.data->>'bookId' OR b.data->>'linkedBookId' = x.data->>'bookId')
                 AND CASE WHEN lower(x.data->>'unit') IN ('pages', 'chapters') THEN lower(x.data->>'unit')
                          ELSE lower(coalesce(nullif(b.data->>'unit', ''), 'pages')) END = 'pages'
             ) AS pages_book
      FROM public.reading_logs x
      WHERE x.user_id = p_member AND x.deleted_at IS NULL
        AND x.data->>'date' >= v_first_t AND x.data->>'date' <= v_end_t
        AND x.data->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    ), agg AS (
      SELECT count(DISTINCT day)::int AS days,
             count(*) FILTER (WHERE NOT finish) AS page_logs,
             bool_and(pages_book) FILTER (WHERE NOT finish) AS pages_only,
             round(sum(pages) FILTER (WHERE NOT finish)) AS pages
      FROM logs
    )
    SELECT jsonb_build_object(
             'days', a.days,
             'booksThisSeason', (
               SELECT count(*)::int FROM public.reading_books b
               WHERE b.user_id = p_member AND b.deleted_at IS NULL
                 AND (b.data->>'status' = 'completed' OR b.data->>'isFinished' = 'true')
                 AND public.ascend_instant(coalesce(b.data->>'completedAt', b.data->>'dateCompleted')) >= v_s_start
                 AND public.ascend_instant(coalesce(b.data->>'completedAt', b.data->>'dateCompleted')) < v_s_end))
           || CASE WHEN a.page_logs > 0 AND a.pages_only THEN jsonb_build_object('pages', a.pages) ELSE '{}'::jsonb END
      INTO v_x
    FROM agg a;
    v_card := v_card || jsonb_build_object('reading', v_x);
  END IF;

  -- Focus (Deep Focus / Prefrontal Cortex timer): minutes and sessions.
  SELECT EXISTS (SELECT 1 FROM public.focus_logs x WHERE x.user_id = p_member AND x.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    SELECT jsonb_build_object('minutes', coalesce(sum(greatest(x.duration_minutes, 0)), 0), 'sessions', count(*))
      INTO v_x
    FROM public.focus_logs x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL AND x.log_date BETWEEN v_s_first AND v_w_end;
    v_card := v_card || jsonb_build_object('focus', v_x);
  END IF;

  -- Journal: days with an entry only. Never content or mood.
  SELECT EXISTS (SELECT 1 FROM public.journal_entries x WHERE x.user_id = p_member AND x.deleted_at IS NULL) INTO v_has;
  IF v_has THEN
    SELECT jsonb_build_object('days', count(DISTINCT x.entry_date))
      INTO v_x
    FROM public.journal_entries x
    WHERE x.user_id = p_member AND x.deleted_at IS NULL AND x.entry_date BETWEEN v_s_first AND v_w_end;
    v_card := v_card || jsonb_build_object('journal', v_x);
  END IF;

  RETURN v_card;
END;
$function$;

-- 5. The unit lock goes -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS reading_books_keep_unit ON public.reading_books;
DROP FUNCTION IF EXISTS public.reading_books_keep_unit();

COMMIT;
