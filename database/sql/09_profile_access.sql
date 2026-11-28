-- =============================================================================
-- AUREON · 09 — Acesso do próprio utilizador ao seu perfil (Step 14, Supabase Auth)
-- =============================================================================
-- Depende de: 01–08 aplicados e verificados (08 = 0 falhas).
-- Execução: MANUAL, pelo utilizador, no SQL Editor do Supabase. Nunca pela aplicação, CLI ou
-- migrations automáticas. Pode repetir: é idempotente (repõe exatamente o mesmo estado).
--
-- O que faz — e apenas isto:
--   1. Confirma que o Step 13 está instalado (public.profiles existe com RLS ativa) e que não
--      existem outras políticas em public.profiles além das deste script (aborta se existirem).
--   2. Cria DUAS políticas em public.profiles, só para o papel authenticated:
--        aureon_profiles_select_own — cada utilizador lê APENAS a sua linha (id = auth.uid());
--        aureon_profiles_update_own — cada utilizador altera APENAS a sua linha.
--   3. Concede privilégios POR COLUNA ao papel authenticated:
--        SELECT (id, username, full_name, phone, country, region, created_at, updated_at)
--        UPDATE (full_name, phone, country, region)
--      Sem INSERT nem DELETE (o perfil é criado pelo trigger de 06 e apagado em cascata com a
--      conta). Sem acesso a contact_email, rev nem server_updated_at. Nada para anon.
--
-- O que NÃO faz: não cria tabelas nem colunas; não toca em nenhuma outra tabela (as restantes
-- 16 continuam fechadas, sem políticas, até ao Step 15); não guarda passwords, hashes nem
-- tokens (public.profiles não tem colunas para isso); não copia o email de login — esse fica
-- em auth.users e a aplicação lê-o do Supabase Auth.
--
-- Porquê agora: o Step 14 integra o perfil com a identidade do Supabase Auth. A aplicação
-- grava os campos editáveis do perfil (nome, telefone, país, região) com a sessão do próprio
-- utilizador e a chave publicável — nunca com service_role. Sem este script a aplicação
-- funciona na mesma: o perfil fica só no dispositivo e a página Perfil indica-o.
--
-- O Step 15 revê estas políticas junto com as das restantes tabelas.
--
-- Reverter (se necessário, no SQL Editor):
--   begin;
--   drop policy if exists aureon_profiles_select_own on public.profiles;
--   drop policy if exists aureon_profiles_update_own on public.profiles;
--   revoke all on public.profiles from anon, authenticated;
--   commit;
--
-- Transação: tudo ou nada. A última instrução devolve a verificação (o SQL Editor mostra só
-- o último resultado): todas as linhas devem ter ok = true.
-- =============================================================================

begin;

do $$
declare
  v_others text;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles não existe. Execute primeiro os scripts 01 a 07 do Step 13 (e confirme com 08).';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'RLS não está ativa em public.profiles. Execute 07_rls_enablement.sql antes deste script.';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'auth.uid() não existe: este script é para um projeto Supabase.';
  end if;
  select string_agg(policyname, ', ') into v_others
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname not in ('aureon_profiles_select_own', 'aureon_profiles_update_own');
  if v_others is not null then
    raise exception 'public.profiles já tem outras políticas (%). Reveja-as antes de continuar; nada foi alterado.', v_others;
  end if;
end $$;

-- Políticas (recriadas para o script ser idempotente) ------------------------------------
drop policy if exists aureon_profiles_select_own on public.profiles;
drop policy if exists aureon_profiles_update_own on public.profiles;

create policy aureon_profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy aureon_profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

comment on policy aureon_profiles_select_own on public.profiles is
  'Step 14: cada utilizador autenticado lê apenas o seu perfil (id = auth.uid()).';
comment on policy aureon_profiles_update_own on public.profiles is
  'Step 14: cada utilizador autenticado altera apenas o seu perfil; colunas limitadas por GRANT.';

-- Privilégios por coluna (repostos do zero: revogar a tabela revoga também as colunas) ----
revoke all on public.profiles from anon, authenticated;
grant select (id, username, full_name, phone, country, region, created_at, updated_at) on public.profiles to authenticated;
grant update (full_name, phone, country, region) on public.profiles to authenticated;

commit;

-- Verificação (só leitura) ---------------------------------------------------------------
select verificacao, esperado, encontrado, ok
from (
  select 1 as ordem, 'RLS em public.profiles' as verificacao, 'ativa' as esperado,
         case when c.relrowsecurity then 'ativa' else 'DESATIVADA' end as encontrado,
         c.relrowsecurity as ok
  from pg_class c where c.oid = 'public.profiles'::regclass
  union all
  select 2, 'políticas em public.profiles', 'aureon_profiles_select_own, aureon_profiles_update_own',
         coalesce((select string_agg(policyname || ' (' || cmd || ', ' || array_to_string(roles, ',') || ')', ', ' order by policyname)
                   from pg_policies where schemaname = 'public' and tablename = 'profiles'), 'nenhuma'),
         (select count(*) = 2
                 and bool_and(roles = array['authenticated']::name[])
                 and bool_and((policyname = 'aureon_profiles_select_own' and cmd = 'SELECT') or (policyname = 'aureon_profiles_update_own' and cmd = 'UPDATE'))
          from pg_policies where schemaname = 'public' and tablename = 'profiles')
  union all
  select 3, 'authenticated: privilégios de tabela', 'nenhum (só por coluna)',
         case when has_table_privilege('authenticated', 'public.profiles', 'select, insert, update, delete, truncate, references, trigger') then 'TEM privilégios de tabela' else 'nenhum' end,
         not has_table_privilege('authenticated', 'public.profiles', 'select, insert, update, delete, truncate, references, trigger')
  union all
  select 4, 'authenticated: SELECT por coluna', 'id, username, full_name, phone, country, region, created_at, updated_at',
         coalesce((select string_agg(column_name, ', ' order by column_name) from information_schema.column_privileges
                   where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT'), 'nenhuma'),
         (select coalesce(array_agg(column_name::text order by column_name), '{}') from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT')
           = array['country', 'created_at', 'full_name', 'id', 'phone', 'region', 'updated_at', 'username']
  union all
  select 5, 'authenticated: UPDATE por coluna', 'full_name, phone, country, region',
         coalesce((select string_agg(column_name, ', ' order by column_name) from information_schema.column_privileges
                   where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'), 'nenhuma'),
         (select coalesce(array_agg(column_name::text order by column_name), '{}') from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE')
           = array['country', 'full_name', 'phone', 'region']
  union all
  select 6, 'authenticated: INSERT/DELETE/contact_email', 'sem acesso',
         case when has_any_column_privilege('authenticated', 'public.profiles', 'insert')
                or has_table_privilege('authenticated', 'public.profiles', 'delete')
                or has_column_privilege('authenticated', 'public.profiles', 'contact_email', 'select') then 'TEM acesso' else 'sem acesso' end,
         not (has_any_column_privilege('authenticated', 'public.profiles', 'insert')
              or has_table_privilege('authenticated', 'public.profiles', 'delete')
              or has_column_privilege('authenticated', 'public.profiles', 'contact_email', 'select'))
  union all
  select 7, 'anon em public.profiles', 'sem acesso',
         case when has_any_column_privilege('anon', 'public.profiles', 'select, insert, update, references') then 'TEM acesso' else 'sem acesso' end,
         not has_any_column_privilege('anon', 'public.profiles', 'select, insert, update, references')
  union all
  select 8, 'restantes 16 tabelas', '0 políticas',
         (select count(*) from pg_policies where schemaname = 'public' and tablename <> 'profiles'
            and tablename in ('user_preferences', 'user_devices', 'exchange_rate_sets', 'exchange_rate_quotes', 'accounts', 'categories', 'cards',
                              'recurrences', 'bills', 'transactions', 'budgets', 'goals', 'goal_contributions', 'sync_operations', 'audit_logs', 'backup_metadata'))::text || ' políticas',
         (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename <> 'profiles'
            and tablename in ('user_preferences', 'user_devices', 'exchange_rate_sets', 'exchange_rate_quotes', 'accounts', 'categories', 'cards',
                              'recurrences', 'bills', 'transactions', 'budgets', 'goals', 'goal_contributions', 'sync_operations', 'audit_logs', 'backup_metadata'))
) v
order by ordem;
