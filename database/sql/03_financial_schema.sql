-- =============================================================================
-- AUREON · 03 — Esquema financeiro
-- =============================================================================
-- Depende de: 01, 02.
-- Cria: accounts, categories, cards, recurrences, bills, transactions, budgets, goals,
--       goal_contributions — uma tabela por entidade de src/domain/schemas.ts (ENTITY_SCHEMAS),
--       com TODOS os campos, os mesmos tipos e as mesmas regras de linha do Zod.
--
-- Convenções (docs: database/sql/README.md e docs/database/TYPESCRIPT-POSTGRES-MAPPING.md):
--   * id uuid       = id da app (UUIDv7 gerado no cliente; nunca gerado aqui).
--   * user_id       = dono (auth.users.id). unique (user_id, id) permite FKs compostas (05).
--   * rev, created_at, updated_at, deleted_at, device_id = controlFields da app.
--     deleted_at é a "tombstone": as linhas não se apagam (a sincronização propaga-as).
--   * server_updated_at = cursor de sincronização, mantido pelo servidor (trigger, 06).
--   * Valores: public.money_minor (inteiros em unidades menores). Moedas: public.currency_code.
--   * Campos "optional" do Zod (ausentes) são colunas NULL; o mapeamento (Step 16) omite-os
--     ao ler quando estão a NULL.
--
-- Fica para outros scripts: FKs compostas e índices (05), coerência entre tabelas e
-- triggers (06). Fica no domínio da app (não na base): fluxo de estado das contas
-- domésticas, sobreposição de orçamentos, conclusão de metas, deteção de duplicados.
--
-- Segurança: RLS ligada e nenhuma concessão a clientes em cada tabela, nesta transação.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.accounts') is not null then
    raise exception 'AUREON 03 já foi aplicado (public.accounts existe). Não é preciso repetir.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Falta o script 02 (public.profiles não existe). Execute 01 e 02 primeiro.';
  end if;
end $$;

-- accounts ← Account ------------------------------------------------------------------------
create table public.accounts (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null constraint accounts_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 80 and public.has_no_card_number(name)),
  institution       text constraint accounts_institution_check
                    check (institution is null or (char_length(institution) <= 80 and public.has_no_card_number(institution))),
  account_type      text not null constraint accounts_type_list check (account_type in ('checking', 'savings', 'cash', 'investment', 'other')),
  currency          public.currency_code not null,
  initial_balance   public.money_minor not null,          -- pode ser negativo (conta a descoberto)
  opening_date      date,
  status            text not null constraint accounts_status_list check (status in ('active', 'archived')),
  rev               integer not null constraint accounts_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint accounts_user_id_id_key unique (user_id, id)
);
comment on table public.accounts is 'Contas (Account). initial_balance é o único valor que pode ser negativo.';

-- categories ← Category -----------------------------------------------------------------------
create table public.categories (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null constraint categories_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 60 and public.has_no_card_number(name)),
  type              text not null constraint categories_type_list check (type in ('income', 'expense')),
  parent_id         uuid,
  icon              text constraint categories_icon_format check (icon is null or icon ~ '^[a-z0-9-]{1,40}$'),
  color             text constraint categories_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default        boolean not null,
  is_active         boolean not null,
  rev               integer not null constraint categories_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint categories_user_id_id_key unique (user_id, id),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);
comment on table public.categories is 'Categorias (Category). Árvore com profundidade máxima 2 e pai do mesmo tipo (trigger, 06).';

-- cards ← Card --------------------------------------------------------------------------------
create table public.cards (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id        uuid,                                  -- conta pagadora; NULL só em cartões migrados de 1.x
  name              text not null constraint cards_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 60 and public.has_no_card_number(name)),
  card_type         text not null constraint cards_type_list check (card_type in ('credit', 'debit', 'prepaid')),
  last_four_digits  text constraint cards_last_four_format check (last_four_digits is null or last_four_digits ~ '^[0-9]{4}$'),
  credit_limit      public.money_minor constraint cards_credit_limit_non_negative check (credit_limit is null or credit_limit >= 0),
  closing_day       smallint constraint cards_closing_day_range check (closing_day is null or closing_day between 1 and 31),
  due_day           smallint constraint cards_due_day_range check (due_day is null or due_day between 1 and 31),
  currency          public.currency_code not null,
  status            text not null constraint cards_status_list check (status in ('active', 'inactive')),
  rev               integer not null constraint cards_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint cards_user_id_id_key unique (user_id, id),
  constraint cards_credit_needs_days check (card_type <> 'credit' or (closing_day is not null and due_day is not null)),
  constraint cards_only_credit_has_limit_and_days check (card_type = 'credit' or (credit_limit is null and closing_day is null and due_day is null))
);
comment on table public.cards is 'Cartões (Card). Nunca o número completo, CVV ou PIN: só os 4 últimos dígitos.';

-- recurrences ← Recurrence ----------------------------------------------------------------------
create table public.recurrences (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description       text not null constraint recurrences_description_check
                    check (char_length(btrim(description)) > 0 and char_length(description) <= 120 and public.has_no_card_number(description)),
  amount            public.money_minor not null constraint recurrences_amount_positive check (amount > 0),
  currency          public.currency_code not null,
  type              text not null constraint recurrences_type_list check (type in ('income', 'expense')),
  frequency         text not null constraint recurrences_frequency_list
                    check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  start_date        date not null,
  end_date          date,
  category_id       uuid,
  account_id        uuid not null,
  is_active         boolean not null,                      -- false = em pausa
  cancelled_at      timestamptz,                           -- opcional (2.2.0): cancelamento definitivo
  notes             text constraint recurrences_notes_check check (notes is null or (char_length(notes) <= 500 and public.has_no_card_number(notes))),
  rev               integer not null constraint recurrences_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint recurrences_user_id_id_key unique (user_id, id),
  constraint recurrences_end_after_start check (end_date is null or end_date >= start_date),
  constraint recurrences_cancelled_not_active check (cancelled_at is null or not is_active)
);
comment on table public.recurrences is 'Recorrências (Recurrence). Geram contas domésticas/movimentos na app; a base não gera nada.';

-- bills ← Bill (cuentas domésticas) --------------------------------------------------------------
create table public.bills (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null constraint bills_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 80 and public.has_no_card_number(name)),
  description       text constraint bills_description_check
                    check (description is null or (char_length(description) <= 200 and public.has_no_card_number(description))),
  category_id       uuid,
  amount            public.money_minor not null constraint bills_amount_positive check (amount > 0),
  currency          public.currency_code not null,
  due_date          date not null,
  account_id        uuid,                                  -- conta prevista para o pagamento (opcional)
  status            text not null constraint bills_status_list check (status in ('pending', 'paid', 'cancelled')),
  notes             text constraint bills_notes_check check (notes is null or (char_length(notes) <= 500 and public.has_no_card_number(notes))),
  recurrence_id     uuid,
  occurrence_date   date,
  rev               integer not null constraint bills_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint bills_user_id_id_key unique (user_id, id),
  constraint bills_recurrence_needs_occurrence check (recurrence_id is null or occurrence_date is not null)
);
comment on table public.bills is 'Contas domésticas (Bill). "overdue" e "partial" são derivados na app; "paid" segue os pagamentos (regra do domínio).';

-- transactions ← Transaction (receitas, despesas e transferências) --------------------------------
create table public.transactions (
  id                     uuid primary key,
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type                   text not null constraint transactions_type_list check (type in ('income', 'expense', 'transfer')),
  description            text not null constraint transactions_description_check
                         check (char_length(btrim(description)) > 0 and char_length(description) <= 140 and public.has_no_card_number(description)),
  amount                 public.money_minor not null constraint transactions_amount_positive check (amount > 0),
  currency               public.currency_code not null,    -- moeda ORIGINAL do movimento
  category_id            uuid,
  account_id             uuid not null,
  destination_account_id uuid,
  card_id                uuid,
  date                   date not null,
  status                 text not null constraint transactions_status_list check (status in ('pending', 'completed', 'cancelled')),
  notes                  text constraint transactions_notes_check check (notes is null or (char_length(notes) <= 500 and public.has_no_card_number(notes))),
  bill_id                uuid,
  recurrence_id          uuid,
  legacy_ids             uuid[],                           -- proveniência de registos 1.x fundidos (opcional)
  -- Conversão guardada (Transaction.conversion, 2.4.0): estimativa na moeda principal, fixada
  -- quando o movimento foi gravado e nunca recalculada (D-FX-05). Todas as colunas ou nenhuma.
  conv_from              public.currency_code,
  conv_to                public.currency_code,
  conv_amount            public.money_minor,
  conv_converted         public.money_minor,
  conv_rate              public.exchange_rate_text,
  conv_mode              text constraint transactions_conv_mode_list check (conv_mode is null or conv_mode in ('automatic', 'manual', 'custom')),
  conv_rate_set_id       text constraint transactions_conv_rate_set_length check (conv_rate_set_id is null or char_length(conv_rate_set_id) <= 40),
  conv_source            text constraint transactions_conv_source_list check (conv_source is null or conv_source in ('manual', 'dolarapi', 'user')),
  conv_rate_at           timestamptz,
  conv_overridden        boolean,
  rev                    integer not null constraint transactions_rev_positive check (rev >= 1),
  created_at             timestamptz not null,
  updated_at             timestamptz not null,
  deleted_at             timestamptz,
  device_id              public.device_ref not null,
  server_updated_at      timestamptz not null default clock_timestamp(),
  constraint transactions_user_id_id_key unique (user_id, id),
  -- Regras de transferência e de cartão (superRefine de transactionSchema).
  constraint transactions_transfer_shape check (
    type <> 'transfer'
    or (destination_account_id is not null and destination_account_id <> account_id and category_id is null and card_id is null)
  ),
  constraint transactions_only_transfer_has_destination check (type = 'transfer' or destination_account_id is null),
  constraint transactions_income_without_card check (type <> 'income' or card_id is null),
  -- Conversão: tudo ou nada (conv_rate_set_id pode ser NULL numa taxa personalizada).
  constraint transactions_conversion_complete check (
    num_nulls(conv_from, conv_to, conv_amount, conv_converted, conv_rate, conv_mode, conv_source, conv_rate_at, conv_overridden) in (0, 9)
    and (conv_from is not null or conv_rate_set_id is null)
  ),
  constraint transactions_conversion_consistent check (
    conv_from is null or (
      conv_from = currency
      and conv_amount = amount
      and conv_to <> conv_from
      and conv_converted >= 0
      and conv_converted = public.conversion_amount(conv_amount, conv_from, conv_to, conv_rate)
      and (conv_mode <> 'custom' or conv_overridden)
    )
  )
);
comment on table public.transactions is
  'Movimentos (Transaction). Receitas e despesas são type income/expense; transferências movem entre duas contas da mesma moeda. amount é sempre positivo e na moeda original.';
comment on column public.transactions.conv_converted is 'Estimativa = conv_amount × conv_rate nas unidades menores de conv_to, arredondada uma vez (verificada por CHECK).';

-- budgets ← Budget -------------------------------------------------------------------------------
create table public.budgets (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null constraint budgets_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 80 and public.has_no_card_number(name)),
  category_id       uuid,                                  -- NULL = orçamento geral
  amount            public.money_minor not null constraint budgets_amount_non_negative check (amount >= 0),
  currency          public.currency_code not null,
  period            text not null constraint budgets_period_list check (period in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date        date not null,
  end_date          date not null,
  description       text constraint budgets_description_check
                    check (description is null or (char_length(description) <= 200 and public.has_no_card_number(description))),
  status            text constraint budgets_status_list check (status is null or status in ('active', 'archived')),  -- NULL = ativo (opcional no Zod)
  rev               integer not null constraint budgets_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint budgets_user_id_id_key unique (user_id, id),
  constraint budgets_period_dates check (public.budget_period_is_valid(period, start_date, end_date))
);
comment on table public.budgets is 'Orçamentos (Budget). O gasto é derivado dos movimentos, nunca guardado.';

-- goals ← Goal -----------------------------------------------------------------------------------
create table public.goals (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null constraint goals_name_check
                    check (char_length(btrim(name)) > 0 and char_length(name) <= 80 and public.has_no_card_number(name)),
  description       text constraint goals_description_check
                    check (description is null or (char_length(description) <= 200 and public.has_no_card_number(description))),
  kind              text not null constraint goals_kind_list
                    check (kind in ('emergency', 'purchase', 'vehicle', 'travel', 'home', 'reserve', 'other')),
  amount            public.money_minor not null constraint goals_amount_positive check (amount > 0),
  initial_amount    public.money_minor not null constraint goals_initial_amount_non_negative check (initial_amount >= 0),
  currency          public.currency_code not null,
  start_date        date not null,
  target_date       date,
  status            text not null constraint goals_status_list check (status in ('active', 'completed', 'cancelled')),
  completed_at      timestamptz,
  archived_at       timestamptz,
  rev               integer not null constraint goals_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint goals_user_id_id_key unique (user_id, id),
  constraint goals_target_after_start check (target_date is null or target_date >= start_date),
  constraint goals_completed_at_matches_status check ((status = 'completed') = (completed_at is not null)),
  constraint goals_active_not_archived check (archived_at is null or status <> 'active')
);
comment on table public.goals is 'Metas de poupança (Goal). O progresso é derivado (inicial + contribuições vivas).';

-- goal_contributions ← GoalContribution -----------------------------------------------------------
create table public.goal_contributions (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id           uuid not null,
  amount            public.money_minor not null constraint goal_contributions_amount_positive check (amount > 0),
  currency          public.currency_code not null,
  date              date not null,
  description       text constraint goal_contributions_description_check
                    check (description is null or (char_length(description) <= 200 and public.has_no_card_number(description))),
  account_id        uuid,
  transaction_id    uuid,                                  -- transferência ou despesa que moveu o dinheiro (opcional)
  cancelled_at      timestamptz,                           -- anular = cancelar (fica no histórico)
  rev               integer not null constraint goal_contributions_rev_positive check (rev >= 1),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  device_id         public.device_ref not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint goal_contributions_user_id_id_key unique (user_id, id)
);
comment on table public.goal_contributions is 'Contribuições para metas (GoalContribution). Não alteram saldos; nunca se apagam (cancelam-se).';

-- Segurança: RLS ligada e nenhuma concessão a clientes (políticas no Step 15) --------------------
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.cards              enable row level security;
alter table public.recurrences        enable row level security;
alter table public.bills              enable row level security;
alter table public.transactions       enable row level security;
alter table public.budgets            enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_contributions enable row level security;
revoke all on table public.accounts, public.categories, public.cards, public.recurrences, public.bills,
                    public.transactions, public.budgets, public.goals, public.goal_contributions
  from public, anon, authenticated;

commit;

select 'AUREON 03 aplicado: 9 tabelas financeiras, RLS ligada, sem acesso de clientes. Seguinte: 04_system_schema.sql' as resultado;
