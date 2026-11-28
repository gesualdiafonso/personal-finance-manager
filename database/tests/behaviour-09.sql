-- =============================================================================
-- AUREON — TESTES DE COMPORTAMENTO LOCAIS do 09_profile_access.sql. NUNCA EXECUTAR NO SUPABASE.
-- =============================================================================
-- Base LOCAL com supabase-emulation.sql + database/sql/01–07 + 09. Dados fictícios
-- (EJEMPLO-FICTICIO). Cada verificação emite NOTICE 'PASS …' ou aborta com 'FAIL …'.
-- =============================================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create temporary table t09 (name text, ok boolean);
grant insert, select on t09 to anon, authenticated, service_role;

create or replace function pg_temp.check09(p_label text, p_condition boolean) returns void language plpgsql as $$
begin
  insert into t09 values (p_label, coalesce(p_condition, false));
  if coalesce(p_condition, false) then raise notice 'PASS %', p_label; else raise exception 'FAIL %', p_label; end if;
end $$;

create or replace function pg_temp.fails09(p_label text, p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      insert into t09 values (p_label, true);
      raise notice 'PASS %', p_label;
      return;
    end if;
    insert into t09 values (p_label, false);
    raise exception 'FAIL % — erro inesperado: %', p_label, sqlerrm;
  end;
  insert into t09 values (p_label, false);
  raise exception 'FAIL % — a instrução devia ter falhado', p_label;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000009a1', 'ana09@example.invalid', '{"full_name": "Ana 09"}'),
  ('00000000-0000-4000-8000-0000000009b2', 'beto09@example.invalid', '{"full_name": "Beto 09"}');

-- Utilizador A ---------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000009a1", "role": "authenticated"}';
select pg_temp.check09('09: A lê apenas o seu perfil (RLS)',
  (select count(*) from public.profiles) = 1
  and (select full_name from public.profiles) = 'Ana 09');
select pg_temp.check09('09: A não vê o perfil de B, mesmo pedindo pelo id',
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000009b2') = 0);
update public.profiles set full_name = 'Ana Atualizada', phone = '+54 11 5555-0000', country = 'AR', region = 'Córdoba'
  where id = '00000000-0000-4000-8000-0000000009a1';
select pg_temp.check09('09: A altera os campos editáveis do seu perfil',
  (select full_name = 'Ana Atualizada' and country = 'AR' from public.profiles));
update public.profiles set full_name = 'INVADIDO' where id = '00000000-0000-4000-8000-0000000009b2';
select pg_temp.fails09('09: A não pode ler contact_email (fora do GRANT)', 'select contact_email from public.profiles', 'permission denied');
select pg_temp.fails09('09: A não pode alterar username', $q$update public.profiles set username = 'outro' where id = '00000000-0000-4000-8000-0000000009a1'$q$, 'permission denied');
select pg_temp.fails09('09: A não pode alterar contact_email', $q$update public.profiles set contact_email = 'x@example.invalid'$q$, 'permission denied');
select pg_temp.fails09('09: A não pode mudar o id (apropriar-se de outra identidade)', $q$update public.profiles set id = '00000000-0000-4000-8000-0000000009b2'$q$, 'permission denied');
select pg_temp.fails09('09: A não pode inserir perfis', $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000009c3')$q$, 'permission denied');
select pg_temp.fails09('09: A não pode apagar o perfil', 'delete from public.profiles', 'permission denied');
select pg_temp.fails09('09: as restantes tabelas continuam fechadas', 'select count(*) from public.user_preferences', 'permission denied');
reset role;
reset request.jwt.claims;

select pg_temp.check09('09: o UPDATE de A sobre B não alterou nada (RLS filtra a linha)',
  (select full_name from public.profiles where id = '00000000-0000-4000-8000-0000000009b2') = 'Beto 09');
select pg_temp.check09('09: os triggers continuam a manter rev e updated_at',
  (select rev > 1 from public.profiles where id = '00000000-0000-4000-8000-0000000009a1'));

-- Sem sessão (anon) ------------------------------------------------------------------------------
set role anon;
select pg_temp.fails09('09: anon não lê perfis', 'select count(*) from public.profiles', 'permission denied');
select pg_temp.fails09('09: anon não altera perfis', $q$update public.profiles set full_name = 'x'$q$, 'permission denied');
reset role;

-- authenticated sem sub (token inválido) não vê nada --------------------------------------------
set role authenticated;
set request.jwt.claims = '{"role": "authenticated"}';
select pg_temp.check09('09: authenticated sem sub não vê nenhuma linha', (select count(*) from public.profiles) = 0);
reset role;
reset request.jwt.claims;

delete from auth.users where id in ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009b2');

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t09;
