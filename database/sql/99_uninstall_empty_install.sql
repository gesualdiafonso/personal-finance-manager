-- =============================================================================
-- AUREON · 99 — Desinstalar uma instalação VAZIA (recuperação; DESTRUTIVO)
-- =============================================================================
-- Para quê: limpar uma instalação incompleta ou errada para recomeçar no 00, ANTES de haver
-- dados reais. Remove tudo o que os scripts 01–07 criaram: o trigger em auth.users, as
-- funções, as 17 tabelas e os 4 tipos.
--
-- PROTEÇÃO: aborta, sem apagar nada, se QUALQUER tabela financeira ou de sistema tiver linhas
-- (contas, movimentos, cotações, sincronização, backups…). Perfis, preferências, configurações
-- de taxa vazias e auditoria criados automaticamente para utilizadores não contam como dados.
-- NÃO toca em auth.users (as contas de login ficam).
--
-- Nunca execute isto num projeto com dados reais. Não há forma de desfazer.
-- Os privilégios por omissão alterados pelo 01 NÃO são repostos (mais seguro assim); para os
-- repor, ver README §Recuperação.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
declare
  v_table text;
  v_rows bigint;
  v_with_data text[] := '{}';
begin
  foreach v_table in array array['accounts', 'categories', 'cards', 'recurrences', 'bills', 'transactions', 'budgets', 'goals',
                                 'goal_contributions', 'exchange_rate_quotes', 'sync_operations', 'backup_metadata', 'user_devices'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('select count(*) from public.%I', v_table) into v_rows;
      if v_rows > 0 then v_with_data := v_with_data || (v_table || ' (' || v_rows || ')'); end if;
    end if;
  end loop;
  if cardinality(v_with_data) > 0 then
    raise exception 'Desinstalação recusada: há dados em %. Este script só serve para instalações vazias.', array_to_string(v_with_data, ', ');
  end if;
end $$;

-- O trigger em auth.users é removido em cascata com a SUA função: DROP TRIGGER exigiria ser dono
-- de auth.users (no Supabase o dono é supabase_auth_admin); a função é do AUREON.
drop function if exists public.handle_new_user() cascade;

drop table if exists
  public.audit_logs, public.sync_operations, public.backup_metadata,
  public.goal_contributions, public.goals, public.budgets, public.transactions, public.bills,
  public.recurrences, public.cards, public.categories, public.accounts,
  public.user_preferences, public.exchange_rate_quotes, public.exchange_rate_sets, public.user_devices, public.profiles
  cascade;

drop function if exists
  public.initialize_user(uuid, jsonb), public.audit_row_change(),
  public.enforce_valid_timezone(), public.enforce_quote_currency(), public.prevent_referenced_currency_change(),
  public.enforce_category_tree(), public.enforce_goal_contribution_refs(), public.enforce_budget_refs(),
  public.enforce_recurrence_refs(), public.enforce_bill_refs(), public.enforce_transaction_refs(), public.enforce_card_refs(),
  public.touch_exchange_row(), public.touch_identity_row(), public.protect_financial_row(), public.set_server_updated_at(),
  public.array_is_distinct(anyarray), public.budget_period_is_valid(text, date, date), public.has_no_card_number(text),
  public.conversion_amount(bigint, public.currency_code, public.currency_code, text), public.currency_minor_digits(public.currency_code);

drop domain if exists public.device_ref, public.exchange_rate_text, public.money_minor, public.currency_code;

commit;

select 'AUREON desinstalado (instalação vazia). Para reinstalar: 00 → 01 → … → 07 → 08.' as resultado;
