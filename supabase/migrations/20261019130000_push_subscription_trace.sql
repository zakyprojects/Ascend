-- Push trace per device (ASCEND_BACKLOG #7): the send-push Edge Function stamps each
-- push_subscriptions row after every delivery attempt, so a device that silently stopped getting
-- pushes shows up in a read-only query.
--   last_ok_at    when the push service last accepted a push for this device
--   last_error_at when a push to this device last failed (404/410 delete the row instead)
--   last_status   HTTP status of the latest attempt (201 = accepted); NULL when the push service
--                 never answered (network error, timeout) or before the first attempt
-- Additive only: no client reads or writes the table (RLS on, no grants to anon/authenticated);
-- save_push_subscription and the push trigger are unchanged.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_ok_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status   integer;
