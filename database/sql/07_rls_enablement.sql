-- =============================================================================
-- AUREON · 07 — Row Level Security: ativada, SEM políticas (bloqueio intencional)
-- =============================================================================
-- Depende de: 01–06.
--
-- O que faz (idempotente — pode repetir sem efeitos laterais):
--   1. Garante RLS ATIVA nas 17 tabelas do AUREON (os scripts 02–04 já a ativaram).
--   2. Garante que anon e authenticated NÃO têm qualquer privilégio nelas nem na sequência
--      de audit_logs.
--   3. Confirma que NÃO existe nenhuma política nessas tabelas (aborta se existir).
--
-- PORQUÊ SEM POLÍTICAS: com RLS ativa e nenhuma política, o PostgreSQL nega todas as linhas a
-- quem não é dono da tabela nem tem BYPASSRLS. Somado à ausência de GRANTs, a app (chave
-- publicável, papéis anon/authenticated) não consegue ler nem escrever NADA nestas tabelas.
-- É intencional: as políticas completas, por operação e por utilizador, e os GRANTs mínimos
-- chegam no Step 15. Até lá a base existe, mas está fechada aos clientes.
--
-- Quem continua a ter acesso: o SQL Editor (papel postgres, dono das tabelas) e o papel
-- service_role (BYPASSRLS no Supabase; nunca usado no browser). FORCE ROW LEVEL SECURITY não é
-- usado: obrigaria o próprio dono a ter políticas e bloquearia a manutenção pelo SQL Editor e
-- os triggers SECURITY DEFINER (auditoria e inicialização de utilizadores).
--
-- Isto NÃO é a autorização completa: não há políticas por utilizador. Ver README §RLS.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles', 'user_preferences', 'user_devices', 'exchange_rate_sets', 'exchange_rate_quotes',
    'accounts', 'categories', 'cards', 'recurrences', 'bills', 'transactions', 'budgets', 'goals', 'goal_contributions',
    'sync_operations', 'audit_logs', 'backup_metadata'];
  v_policies integer;
begin
  if to_regprocedure('public.set_server_updated_at()') is null then
    raise exception 'Falta o script 06 (public.set_server_updated_at não existe). Execute 01 a 06 primeiro.';
  end if;
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Tabela em falta: public.%. Execute os scripts 02–04 antes do 07.', v_table;
    end if;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
  end loop;
  revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;

  select count(*) into v_policies from pg_policies where schemaname = 'public' and tablename = any (v_tables);
  if v_policies > 0 then
    raise exception 'Existem % políticas RLS em tabelas do AUREON. O Step 13 não cria políticas; reveja-as antes de continuar (README §Recuperação).', v_policies;
  end if;
end $$;

comment on schema public is 'AUREON: tabelas com RLS ativa e sem políticas até ao Step 15 (acesso de clientes bloqueado de propósito).';

commit;

-- Resultado: uma linha por tabela.
select c.relname                                                      as tabela,
       case when c.relrowsecurity then 'ATIVA' else 'DESATIVADA' end   as rls,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
       has_table_privilege('anon', c.oid, 'select')          as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
       case when c.relrowsecurity
                 and not has_table_privilege('anon', c.oid, 'select, insert, update, delete')
                 and not has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
            then 'OK — fechada até ao Step 15' else 'VERIFICAR' end   as estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('profiles', 'user_preferences', 'user_devices', 'exchange_rate_sets', 'exchange_rate_quotes',
                    'accounts', 'categories', 'cards', 'recurrences', 'bills', 'transactions', 'budgets', 'goals',
                    'goal_contributions', 'sync_operations', 'audit_logs', 'backup_metadata')
order by c.relname;
