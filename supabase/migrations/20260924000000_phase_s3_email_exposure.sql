-- Migration: Phase S3 Email Exposure Protection
-- Revokes SELECT permission on public.profiles.email from public roles (anon and authenticated).
-- Keeps public access to username, avatar, points, stats, uid, and other non-sensitive fields.
-- Does not touch INSERT or UPDATE permissions (clients still write email during signup/sync).
-- Does not modify RLS SELECT policies on public.profiles.

REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;
