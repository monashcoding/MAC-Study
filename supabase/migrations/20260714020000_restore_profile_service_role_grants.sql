-- The central-auth bridge creates and refreshes profiles with the server-only
-- Supabase service role. RLS bypass does not replace table-level privileges,
-- so grant only the operations used by getOrCreateMacProfile.
grant select, insert, update on table public.profiles to service_role;
