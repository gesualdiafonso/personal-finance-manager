-- =============================================================================
-- AUREON · 06 — Funções e triggers
-- =============================================================================
-- Depende de: 01–05.
--
-- Só o que a aplicação justifica:
--   A. Manutenção:   server_updated_at (cursor de sincronização), updated_at e rev nas tabelas
--                    de identidade/preferências; identidade imutável (id, user_id, created_at)
--                    e rev sempre crescente nas tabelas financeiras (concorrência otimista).
--   B. Integridade entre tabelas — as MESMAS regras que os repositórios da app já aplicam
--      (src/services/repositories/repositories.ts, checkRules), para que um cliente que fale
--      diretamente com a API não grave dados incoerentes:
--        moeda igual à da conta/cartão/meta/transação referida; tipo da categoria coerente;
--        cartão da conta do movimento; contribuição só de transferência/despesa não cancelada;
--        árvore de categorias (profundidade 2, mesmo tipo); moeda que não muda com referências;
--        cotação numa moeda diferente da base; fuso horário válido.
--      Tombstones (deleted_at preenchido) não são verificadas, como na app.
--      FICA NO DOMÍNIO (não aqui): fluxo de estado das contas domésticas, sobreposição de
--      orçamentos, conclusão de metas, regras de edição, deteção de duplicados.
--   C. Auditoria sem valores (SECURITY DEFINER — ver justificação).
--   D. Inicialização de novos utilizadores (SECURITY DEFINER — ver justificação) e
--      preenchimento para utilizadores que já existiam.
--
-- Privilégios: nenhuma destas funções pode ser chamada por anon/authenticated (EXECUTE revogado).
-- Os triggers continuam a disparar: o PostgreSQL não exige EXECUTE na função de um trigger.
-- Todas têm search_path vazio e nomes totalmente qualificados.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('public.set_server_updated_at()') is not null then
    raise exception 'AUREON 06 já foi aplicado (public.set_server_updated_at existe). Não é preciso repetir.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_account_fk') then
    raise exception 'Falta o script 05 (transactions_account_fk não existe). Execute 01 a 05 primeiro.';
  end if;
end $$;

-- =============================================================================
-- A. Manutenção
-- =============================================================================

-- Cursor de sincronização: hora do servidor em cada escrita (nunca o relógio do dispositivo).
create function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
comment on function public.set_server_updated_at() is 'Trigger: server_updated_at = hora do servidor (cursor de sincronização).';

-- Identidade imutável e rev crescente nas tabelas financeiras (controlFields).
create function public.protect_financial_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'AUREON: id, user_id e created_at não mudam (%.%)', tg_table_name, old.id
      using errcode = 'check_violation';
  end if;
  if new.rev <= old.rev then
    raise exception 'AUREON: rev tem de crescer em cada alteração (%.%: % → %)', tg_table_name, old.id, old.rev, new.rev
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
comment on function public.protect_financial_row() is
  'Trigger: em tabelas financeiras, id/user_id/created_at imutáveis e rev estritamente crescente (concorrência otimista; o conflito por base_rev é verificado na sincronização, Step 17).';

-- Perfil e preferências: dono imutável, updated_at e rev mantidos pelo servidor.
create function public.touch_identity_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    if new.id is distinct from old.id then
      raise exception 'AUREON: profiles.id não muda' using errcode = 'check_violation';
    end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'AUREON: user_id não muda (%)', tg_table_name using errcode = 'check_violation';
  end if;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  new.rev := old.rev + 1;
  return new;
end;
$$;
comment on function public.touch_identity_row() is 'Trigger: profiles/user_preferences — dono e created_at imutáveis; updated_at e rev mantidos pelo servidor.';

-- Configurações e cotações de câmbio: chave imutável, updated_at do servidor.
create function public.touch_exchange_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'exchange_rate_sets' then
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception 'AUREON: a chave de exchange_rate_sets não muda' using errcode = 'check_violation';
    end if;
  else
    if (new.user_id, new.rate_set_id, new.currency, new.mode) is distinct from (old.user_id, old.rate_set_id, old.currency, old.mode) then
      raise exception 'AUREON: a chave de exchange_rate_quotes não muda' using errcode = 'check_violation';
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
comment on function public.touch_exchange_row() is 'Trigger: chave imutável e updated_at do servidor nas tabelas de câmbio.';

-- =============================================================================
-- B. Integridade entre tabelas (SECURITY INVOKER: lê só linhas que o próprio utilizador vê)
-- =============================================================================

create function public.enforce_card_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
begin
  if new.deleted_at is not null or new.account_id is null then return new; end if;
  select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.account_id;
  if found and v_currency is distinct from new.currency then
    raise exception 'AUREON: a moeda do cartão (%) difere da conta pagadora (%)', new.currency, v_currency using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function public.enforce_transaction_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
  v_type text;
  v_card_account uuid;
begin
  if new.deleted_at is not null then return new; end if;

  select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.account_id;
  if found and v_currency is distinct from new.currency then
    raise exception 'AUREON: a moeda do movimento (%) difere da conta (%)', new.currency, v_currency using errcode = 'check_violation';
  end if;

  if new.destination_account_id is not null then
    select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.destination_account_id;
    if found and v_currency is distinct from new.currency then
      raise exception 'AUREON: a moeda do movimento (%) difere da conta de destino (%)', new.currency, v_currency using errcode = 'check_violation';
    end if;
  end if;

  if new.category_id is not null then
    select c.type into v_type from public.categories c where c.user_id = new.user_id and c.id = new.category_id;
    if found and v_type is distinct from new.type then
      raise exception 'AUREON: um movimento % não pode usar uma categoria %', new.type, v_type using errcode = 'check_violation';
    end if;
  end if;

  if new.card_id is not null then
    select c.currency, c.account_id into v_currency, v_card_account from public.cards c where c.user_id = new.user_id and c.id = new.card_id;
    if found then
      if v_currency is distinct from new.currency then
        raise exception 'AUREON: a moeda do movimento (%) difere do cartão (%)', new.currency, v_currency using errcode = 'check_violation';
      end if;
      if v_card_account is not null and v_card_account <> new.account_id then
        raise exception 'AUREON: account_id tem de ser a conta pagadora do cartão' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Uma transação que sustenta uma contribuição viva não pode ser cancelada.
  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    if exists (select 1 from public.goal_contributions g
               where g.user_id = new.user_id and g.transaction_id = new.id and g.cancelled_at is null and g.deleted_at is null) then
      raise exception 'AUREON: esta transação sustenta uma contribuição para uma meta; cancele primeiro a contribuição' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create function public.enforce_bill_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
  v_type text;
begin
  if new.deleted_at is not null then return new; end if;
  if new.account_id is not null then
    select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.account_id;
    if found and v_currency is distinct from new.currency then
      raise exception 'AUREON: a moeda da conta doméstica (%) difere da conta (%)', new.currency, v_currency using errcode = 'check_violation';
    end if;
  end if;
  if new.category_id is not null then
    select c.type into v_type from public.categories c where c.user_id = new.user_id and c.id = new.category_id;
    if found and v_type <> 'expense' then
      raise exception 'AUREON: uma conta doméstica usa uma categoria de despesa' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create function public.enforce_recurrence_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
  v_type text;
begin
  if new.deleted_at is not null then return new; end if;
  select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.account_id;
  if found and v_currency is distinct from new.currency then
    raise exception 'AUREON: a moeda da recorrência (%) difere da conta (%)', new.currency, v_currency using errcode = 'check_violation';
  end if;
  if new.category_id is not null then
    select c.type into v_type from public.categories c where c.user_id = new.user_id and c.id = new.category_id;
    if found and v_type is distinct from new.type then
      raise exception 'AUREON: uma recorrência % não pode usar uma categoria %', new.type, v_type using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create function public.enforce_budget_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.deleted_at is not null or new.category_id is null then return new; end if;
  select c.type into v_type from public.categories c where c.user_id = new.user_id and c.id = new.category_id;
  if found and v_type <> 'expense' then
    raise exception 'AUREON: os orçamentos aplicam-se a categorias de despesa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function public.enforce_goal_contribution_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency text;
  v_type text;
  v_status text;
begin
  if new.deleted_at is not null then return new; end if;
  select g.currency into v_currency from public.goals g where g.user_id = new.user_id and g.id = new.goal_id;
  if found and v_currency is distinct from new.currency then
    raise exception 'AUREON: a moeda da contribuição (%) difere da meta (%)', new.currency, v_currency using errcode = 'check_violation';
  end if;
  if new.account_id is not null then
    select a.currency into v_currency from public.accounts a where a.user_id = new.user_id and a.id = new.account_id;
    if found and v_currency is distinct from new.currency then
      raise exception 'AUREON: a moeda da contribuição (%) difere da conta (%)', new.currency, v_currency using errcode = 'check_violation';
    end if;
  end if;
  if new.transaction_id is not null then
    select t.currency, t.type, t.status into v_currency, v_type, v_status
      from public.transactions t where t.user_id = new.user_id and t.id = new.transaction_id;
    if found then
      if v_currency is distinct from new.currency then
        raise exception 'AUREON: a moeda da contribuição (%) difere da transação (%)', new.currency, v_currency using errcode = 'check_violation';
      end if;
      if v_type = 'income' then
        raise exception 'AUREON: uma contribuição só pode apontar para uma transferência ou despesa' using errcode = 'check_violation';
      end if;
      if v_status = 'cancelled' then
        raise exception 'AUREON: uma contribuição não pode apontar para uma transação cancelada' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Árvore de categorias: profundidade máxima 2 (CATEGORY_MAX_DEPTH), pai do mesmo tipo.
create function public.enforce_category_tree()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_parent uuid;
  v_parent_type text;
begin
  if new.deleted_at is not null then return new; end if;
  if new.parent_id is not null then
    select c.parent_id, c.type into v_parent_parent, v_parent_type
      from public.categories c where c.user_id = new.user_id and c.id = new.parent_id;
    if found then
      if v_parent_parent is not null then
        raise exception 'AUREON: as categorias têm no máximo 2 níveis' using errcode = 'check_violation';
      end if;
      if v_parent_type is distinct from new.type then
        raise exception 'AUREON: uma subcategoria tem o mesmo tipo do pai' using errcode = 'check_violation';
      end if;
    end if;
    if exists (select 1 from public.categories c where c.user_id = new.user_id and c.parent_id = new.id and c.deleted_at is null) then
      raise exception 'AUREON: uma categoria com subcategorias não pode passar a subcategoria' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.type is distinct from old.type
     and exists (select 1 from public.categories c where c.user_id = new.user_id and c.parent_id = new.id and c.deleted_at is null) then
    raise exception 'AUREON: o tipo de uma categoria com subcategorias não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- A moeda de um registo referido por outros registos vivos não muda (regra da app).
-- Argumentos do trigger: pares 'tabela.coluna' que referem esta tabela (fixados no DDL abaixo).
create function public.prevent_referenced_currency_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pair text;
  v_table text;
  v_column text;
  v_found boolean;
begin
  if new.currency is not distinct from old.currency then return new; end if;
  foreach v_pair in array tg_argv loop
    v_table := split_part(v_pair, '.', 1);
    v_column := split_part(v_pair, '.', 2);
    execute pg_catalog.format(
      'select exists (select 1 from public.%I r where r.user_id = $1 and r.%I = $2 and r.deleted_at is null)',
      v_table, v_column)
      into v_found using new.user_id, new.id;
    if v_found then
      raise exception 'AUREON: a moeda de %.% não muda enquanto houver registos que o referem (%)', tg_table_name, new.id, v_table
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- Cotação: numa moeda diferente da base da configuração.
create function public.enforce_quote_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
begin
  select s.base into v_base from public.exchange_rate_sets s where s.user_id = new.user_id and s.id = new.rate_set_id;
  if found and v_base = new.currency then
    raise exception 'AUREON: a moeda base da configuração não tem cotação (vale 1)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Fuso horário IANA conhecido pelo servidor.
create function public.enforce_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'AUREON: fuso horário desconhecido: %', new.timezone using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- C. Auditoria sem valores
-- =============================================================================
-- SECURITY DEFINER — justificação: audit_logs tem RLS e nenhuma concessão a clientes, para que
-- ninguém a possa escrever, alterar ou apagar a partir da app. O trigger precisa de inserir
-- mesmo assim; corre com o dono da função (postgres), search_path vazio, sem parâmetros vindos
-- do cliente, e grava APENAS: dono, tabela, chave, ação, NOMES das colunas alteradas,
-- dispositivo e papel. Nunca valores. EXECUTE revogado de todos os clientes.
-- Argumentos do trigger: [0] coluna do dono ('user_id' ou 'id'), [1..] colunas da chave.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := pg_catalog.to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else null end;
  v_key text := '';
  v_action text := 'insert';
  v_changed text[] := '{}';
  v_role text;
  i integer;
begin
  for i in 1 .. tg_nargs - 1 loop
    v_key := v_key || case when i > 1 then '|' else '' end || coalesce(v_new ->> tg_argv[i], '');
  end loop;
  if tg_op = 'UPDATE' then
    select coalesce(pg_catalog.array_agg(k order by k), '{}') into v_changed
      from pg_catalog.jsonb_object_keys(v_new) as k
      where k not in ('server_updated_at', 'updated_at', 'rev') and (v_new -> k) is distinct from (v_old -> k);
    if v_changed = '{}' then return null; end if;      -- nada de relevante mudou
    v_action := case
      when (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then 'soft_delete'
      when (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then 'restore'
      else 'update' end;
  end if;
  begin
    v_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;
  insert into public.audit_logs (user_id, table_name, record_key, action, changed_columns, device_id, actor_role)
  values ((v_new ->> tg_argv[0])::uuid, tg_table_name, v_key, v_action, v_changed, v_new ->> 'device_id', coalesce(v_role, session_user::text));
  return null;
end;
$$;
comment on function public.audit_row_change() is
  'SECURITY DEFINER (justificado): escreve em audit_logs, que nenhum cliente pode escrever. Só metadados e nomes de colunas; nunca valores.';

-- =============================================================================
-- D. Inicialização de utilizadores
-- =============================================================================
-- SECURITY DEFINER — justificação: corre no registo de um utilizador (trigger em auth.users)
-- quando ainda não há sessão nem políticas que lhe permitam escrever; cria o perfil, as
-- preferências e as duas configurações de taxa por omissão (Oficial e MEP, SEM cotações:
-- nunca se inventam). Só usa valores validados dos metadados (username, nome, moeda) e ignora
-- os inválidos; nunca falha por causa deles. EXECUTE revogado de todos os clientes.
create function public.initialize_user(p_user_id uuid, p_metadata jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_metadata ->> 'username', '')));
  v_full_name text := pg_catalog.btrim(coalesce(p_metadata ->> 'full_name', ''));
  v_currency text := coalesce(p_metadata ->> 'preferred_currency', 'ARS');
  v_enabled public.currency_code[];
begin
  if v_username !~ '^[a-z0-9]([a-z0-9._-]{1,30}[a-z0-9])$'
     or exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := null;
  end if;
  if pg_catalog.char_length(v_full_name) > 80 then v_full_name := ''; end if;
  if v_currency not in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP', 'PYG', 'GBP') then v_currency := 'ARS'; end if;
  v_enabled := case when v_currency = 'USD' then array['USD', 'ARS'] else array[v_currency, 'USD'] end::public.currency_code[];

  insert into public.profiles (id, username, full_name) values (p_user_id, v_username, v_full_name)
    on conflict (id) do nothing;
  insert into public.exchange_rate_sets (user_id, id, name, kind, base) values
    (p_user_id, 'oficial', 'Oficial', 'official', v_currency::public.currency_code),
    (p_user_id, 'mep', 'MEP', 'mep', v_currency::public.currency_code)
    on conflict (user_id, id) do nothing;
  insert into public.user_preferences (user_id, base_currency, enabled_currencies, active_rate_set_id)
    values (p_user_id, v_currency::public.currency_code, v_enabled, 'oficial')
    on conflict (user_id) do nothing;
end;
$$;
comment on function public.initialize_user(uuid, jsonb) is
  'SECURITY DEFINER (justificado): cria perfil, preferências e configurações de taxa vazias de um utilizador. Chamada pelo trigger de auth.users e pelo preenchimento inicial.';

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.initialize_user(new.id, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end;
$$;
comment on function public.handle_new_user() is
  'SECURITY DEFINER (justificado): trigger AFTER INSERT em auth.users que chama initialize_user. Único objeto do AUREON no schema auth é o trigger que a usa.';

-- =============================================================================
-- Privilégios das funções: nenhum cliente as executa diretamente.
-- =============================================================================
revoke all on function public.set_server_updated_at()              from public, anon, authenticated;
revoke all on function public.protect_financial_row()              from public, anon, authenticated;
revoke all on function public.touch_identity_row()                 from public, anon, authenticated;
revoke all on function public.touch_exchange_row()                 from public, anon, authenticated;
revoke all on function public.enforce_card_refs()                  from public, anon, authenticated;
revoke all on function public.enforce_transaction_refs()           from public, anon, authenticated;
revoke all on function public.enforce_bill_refs()                  from public, anon, authenticated;
revoke all on function public.enforce_recurrence_refs()            from public, anon, authenticated;
revoke all on function public.enforce_budget_refs()                from public, anon, authenticated;
revoke all on function public.enforce_goal_contribution_refs()     from public, anon, authenticated;
revoke all on function public.enforce_category_tree()              from public, anon, authenticated;
revoke all on function public.prevent_referenced_currency_change() from public, anon, authenticated;
revoke all on function public.enforce_quote_currency()             from public, anon, authenticated;
revoke all on function public.enforce_valid_timezone()             from public, anon, authenticated;
revoke all on function public.audit_row_change()                   from public, anon, authenticated;
revoke all on function public.initialize_user(uuid, jsonb)         from public, anon, authenticated;
revoke all on function public.handle_new_user()                    from public, anon, authenticated;

-- =============================================================================
-- Triggers (ordem por nome dentro de cada momento: t10 → t20 → t90; AFTER: t95)
-- =============================================================================

-- Tabelas financeiras: identidade/rev, integridade, cursor, auditoria.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['accounts', 'categories', 'cards', 'recurrences', 'bills', 'transactions', 'budgets', 'goals', 'goal_contributions'] loop
    execute format('create trigger t10_protect_row before update on public.%I for each row execute function public.protect_financial_row()', v_table);
    execute format('create trigger t90_server_updated_at before insert or update on public.%I for each row execute function public.set_server_updated_at()', v_table);
    execute format('create trigger t95_audit after insert or update on public.%I for each row execute function public.audit_row_change(%L, %L)', v_table, 'user_id', 'id');
  end loop;
end $$;

create trigger t20_enforce_refs before insert or update on public.cards              for each row execute function public.enforce_card_refs();
create trigger t20_enforce_refs before insert or update on public.transactions       for each row execute function public.enforce_transaction_refs();
create trigger t20_enforce_refs before insert or update on public.bills              for each row execute function public.enforce_bill_refs();
create trigger t20_enforce_refs before insert or update on public.recurrences        for each row execute function public.enforce_recurrence_refs();
create trigger t20_enforce_refs before insert or update on public.budgets            for each row execute function public.enforce_budget_refs();
create trigger t20_enforce_refs before insert or update on public.goal_contributions for each row execute function public.enforce_goal_contribution_refs();
create trigger t20_enforce_tree before insert or update on public.categories         for each row execute function public.enforce_category_tree();

-- Moeda que não muda enquanto for referida (mesmas relações que REFERRERS na app).
create trigger t30_currency_locked before update of currency on public.accounts
  for each row execute function public.prevent_referenced_currency_change(
    'cards.account_id', 'transactions.account_id', 'transactions.destination_account_id',
    'bills.account_id', 'recurrences.account_id', 'goal_contributions.account_id');
create trigger t30_currency_locked before update of currency on public.cards
  for each row execute function public.prevent_referenced_currency_change('transactions.card_id');
create trigger t30_currency_locked before update of currency on public.goals
  for each row execute function public.prevent_referenced_currency_change('goal_contributions.goal_id');
create trigger t30_currency_locked before update of currency on public.transactions
  for each row execute function public.prevent_referenced_currency_change('goal_contributions.transaction_id');
create trigger t30_currency_locked before update of currency on public.bills
  for each row execute function public.prevent_referenced_currency_change('transactions.bill_id');
create trigger t30_currency_locked before update of currency on public.recurrences
  for each row execute function public.prevent_referenced_currency_change('transactions.recurrence_id', 'bills.recurrence_id');

-- Identidade e preferências.
create trigger t10_touch before update on public.profiles         for each row execute function public.touch_identity_row();
create trigger t10_touch before update on public.user_preferences for each row execute function public.touch_identity_row();
create trigger t20_valid_timezone before insert or update of timezone on public.user_preferences for each row execute function public.enforce_valid_timezone();
create trigger t90_server_updated_at before insert or update on public.profiles         for each row execute function public.set_server_updated_at();
create trigger t90_server_updated_at before insert or update on public.user_preferences for each row execute function public.set_server_updated_at();
create trigger t95_audit after insert or update on public.profiles         for each row execute function public.audit_row_change('id', 'id');
create trigger t95_audit after insert or update on public.user_preferences for each row execute function public.audit_row_change('user_id', 'user_id');

-- Câmbio.
create trigger t10_touch before update on public.exchange_rate_sets   for each row execute function public.touch_exchange_row();
create trigger t10_touch before update on public.exchange_rate_quotes for each row execute function public.touch_exchange_row();
create trigger t20_quote_currency before insert or update on public.exchange_rate_quotes for each row execute function public.enforce_quote_currency();
create trigger t90_server_updated_at before insert or update on public.exchange_rate_sets   for each row execute function public.set_server_updated_at();
create trigger t90_server_updated_at before insert or update on public.exchange_rate_quotes for each row execute function public.set_server_updated_at();
create trigger t95_audit after insert or update on public.exchange_rate_sets   for each row execute function public.audit_row_change('user_id', 'id');
create trigger t95_audit after insert or update on public.exchange_rate_quotes for each row execute function public.audit_row_change('user_id', 'rate_set_id', 'currency', 'mode');

-- Novos utilizadores (único objeto do AUREON no schema auth, padrão documentado pelo Supabase).
create trigger on_auth_user_created_aureon
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Utilizadores que já existiam antes deste script: perfil, preferências e taxas por omissão.
do $$
declare
  v_user record;
begin
  for v_user in select u.id, u.raw_user_meta_data from auth.users u
                where not exists (select 1 from public.profiles p where p.id = u.id) loop
    perform public.initialize_user(v_user.id, coalesce(v_user.raw_user_meta_data, '{}'::jsonb));
  end loop;
end $$;

commit;

select 'AUREON 06 aplicado: 17 funções, triggers de manutenção, integridade e auditoria, inicialização de utilizadores. Seguinte: 07_rls_enablement.sql' as resultado;
