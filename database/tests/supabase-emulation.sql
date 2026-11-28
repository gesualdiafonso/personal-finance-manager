-- =============================================================================
-- AUREON — LOCAL TEST HARNESS ONLY. NEVER RUN THIS IN SUPABASE.
-- =============================================================================
-- Recreates, in an EMPTY local PostgreSQL, the minimum that a Supabase project already has,
-- so the scripts in database/sql can be validated without touching any real project:
--   * roles anon, authenticated, service_role (service_role bypasses RLS, like in Supabase);
--   * schema auth with a minimal auth.users and auth.uid() reading the request JWT claims;
--   * Supabase's default privileges: everything created by postgres in public is granted to
--     anon, authenticated and service_role (this is what the AUREON scripts must undo).
-- It is a simplification: the real auth schema has many more columns and functions.
-- =============================================================================
-- Roles are cluster-wide: create them only once per local cluster.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::jsonb ->> 'role')), '')::text
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
