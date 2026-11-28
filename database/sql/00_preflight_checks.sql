-- =============================================================================
-- AUREON · 00 — Verificações prévias (SÓ LEITURA)
-- =============================================================================
-- O que faz:  verifica se o projeto Supabase está pronto para os scripts 01–08.
--             Não cria, altera nem apaga nada.
-- Quando:     antes de executar o 01. Pode repetir quantas vezes quiser.
-- Onde:       Supabase Dashboard → SQL Editor → New query → colar → Run.
-- Resultado:  uma única tabela. Todas as linhas devem estar 'OK' (ou 'AVISO' lido e
--             compreendido) antes de continuar. Uma linha 'ERRO' indica o que corrigir.
-- =============================================================================

with expected_tables(name) as (
  values ('profiles'), ('user_preferences'), ('user_devices'), ('exchange_rate_sets'), ('exchange_rate_quotes'),
         ('accounts'), ('categories'), ('cards'), ('recurrences'), ('bills'), ('transactions'),
         ('budgets'), ('goals'), ('goal_contributions'),
         ('sync_operations'), ('audit_logs'), ('backup_metadata')
),
checks(ordem, verificacao, estado, detalhe) as (
  select 1, 'Versão do PostgreSQL ≥ 15',
         case when current_setting('server_version_num')::int >= 150000 then 'OK' else 'ERRO' end,
         current_setting('server_version')
  union all
  select 2, 'Utilizador que executa (esperado: postgres)',
         case when current_user = 'postgres' then 'OK' else 'AVISO' end,
         current_user::text
  union all
  select 3, 'Schema auth (Supabase Auth)',
         case when exists (select 1 from pg_namespace where nspname = 'auth') then 'OK' else 'ERRO' end,
         'Tem de existir: é criado pelo Supabase'
  union all
  select 4, 'Tabela auth.users',
         case when to_regclass('auth.users') is not null then 'OK' else 'ERRO' end,
         'Referenciada por profiles.id e por cada user_id'
  union all
  select 5, 'Função auth.uid()',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid') then 'OK' else 'ERRO' end,
         'Usada como valor por omissão de user_id'
  union all
  select 6, 'Roles anon, authenticated, service_role',
         case when (select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) = 3 then 'OK' else 'ERRO' end,
         (select string_agg(rolname, ', ' order by rolname) from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
  union all
  select 7, 'Schema public existe',
         case when exists (select 1 from pg_namespace where nspname = 'public') then 'OK' else 'ERRO' end,
         'As tabelas do AUREON ficam em public'
  union all
  select 8, 'Tabelas do AUREON que já existem (esperado: nenhuma)',
         case when count(t.name) filter (where to_regclass('public.' || t.name) is not null) = 0 then 'OK' else 'ERRO' end,
         coalesce(string_agg(t.name, ', ') filter (where to_regclass('public.' || t.name) is not null), 'nenhuma')
  from expected_tables t
  union all
  select 9, 'Tipos do AUREON que já existem (esperado: nenhum)',
         case when count(*) = 0 then 'OK' else 'ERRO' end,
         coalesce(string_agg(typname, ', '), 'nenhum')
  from pg_type ty join pg_namespace n on n.oid = ty.typnamespace
  where n.nspname = 'public' and ty.typname in ('currency_code', 'money_minor', 'exchange_rate_text', 'device_ref')
  union all
  select 10, 'Trigger anterior em auth.users chamado on_auth_user_created_aureon',
         case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created_aureon') then 'ERRO' else 'OK' end,
         'É criado pelo script 06'
  union all
  select 11, 'Utilizadores já registados no Supabase Auth',
         'INFO',
         (select count(*)::text from auth.users) || ' (o script 06 cria-lhes perfil e preferências)'
)
select ordem, verificacao, estado, detalhe
from checks
order by ordem;
