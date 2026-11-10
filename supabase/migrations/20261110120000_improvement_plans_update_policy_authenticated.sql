-- Audit 2026-11-10 PL-L3 (security hygiene, no exposure): the UPDATE policy on improvement_plans
-- was created for role `public`; every other policy on the table is for `authenticated`. It was not
-- exploitable (its check needs auth.uid() = creator_id, and anon has no table grant), but it should
-- name the role it is meant for, like the rest. ALTER POLICY changes only the role list: the USING
-- and WITH CHECK expressions stay exactly as they are, and signed-in owners keep editing their plans.
-- Prod-compatible; can run any time (BEFORE or AFTER the production push, the app does not change).

ALTER POLICY "Users can update their own improvement plans" ON public.improvement_plans TO authenticated;
