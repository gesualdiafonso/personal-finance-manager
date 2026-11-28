-- =============================================================================
-- AUREON · 05 — Chaves estrangeiras compostas e índices
-- =============================================================================
-- Depende de: 01, 02, 03, 04.
--
-- 1. Chaves estrangeiras COMPOSTAS (user_id, x_id) → (user_id, id).
--    Porquê compostas: no PostgreSQL a verificação de uma FK NÃO passa pela RLS. Com uma FK
--    simples (x_id → id), um utilizador poderia gravar uma referência para uma linha de OUTRO
--    utilizador (e usar o erro/sucesso para saber se um id existe). Com (user_id, x_id), a linha
--    referenciada tem de pertencer ao mesmo utilizador.
--    MATCH SIMPLE (por omissão): uma referência opcional a NULL não é verificada.
--    ON DELETE: NO ACTION (as linhas não se apagam — tombstones); a eliminação de um utilizador
--    em auth.users apaga tudo dele em cascata pelas FKs de user_id.
--
-- 2. Índices pelos padrões de consulta reais da app (listas por data, por conta, por categoria,
--    pendentes, cursor de sincronização). unique (user_id, id) já serve consultas por user_id,
--    por isso não há índices só em user_id nessas tabelas.
--
-- 3. Unicidade de domínio: uma contribuição viva por transação.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'transactions_account_fk') then
    raise exception 'AUREON 05 já foi aplicado (transactions_account_fk existe). Não é preciso repetir.';
  end if;
  if to_regclass('public.sync_operations') is null then
    raise exception 'Falta o script 04 (public.sync_operations não existe). Execute 01 a 04 primeiro.';
  end if;
end $$;

-- 1. FKs compostas --------------------------------------------------------------------------------
alter table public.categories
  add constraint categories_parent_fk foreign key (user_id, parent_id) references public.categories (user_id, id);

alter table public.cards
  add constraint cards_account_fk foreign key (user_id, account_id) references public.accounts (user_id, id);

alter table public.recurrences
  add constraint recurrences_account_fk  foreign key (user_id, account_id)  references public.accounts (user_id, id),
  add constraint recurrences_category_fk foreign key (user_id, category_id) references public.categories (user_id, id);

alter table public.bills
  add constraint bills_account_fk    foreign key (user_id, account_id)    references public.accounts (user_id, id),
  add constraint bills_category_fk   foreign key (user_id, category_id)   references public.categories (user_id, id),
  add constraint bills_recurrence_fk foreign key (user_id, recurrence_id) references public.recurrences (user_id, id);

alter table public.transactions
  add constraint transactions_account_fk             foreign key (user_id, account_id)             references public.accounts (user_id, id),
  add constraint transactions_destination_account_fk foreign key (user_id, destination_account_id) references public.accounts (user_id, id),
  add constraint transactions_category_fk            foreign key (user_id, category_id)            references public.categories (user_id, id),
  add constraint transactions_card_fk                foreign key (user_id, card_id)                references public.cards (user_id, id),
  add constraint transactions_bill_fk                foreign key (user_id, bill_id)                references public.bills (user_id, id),
  add constraint transactions_recurrence_fk          foreign key (user_id, recurrence_id)          references public.recurrences (user_id, id);

alter table public.budgets
  add constraint budgets_category_fk foreign key (user_id, category_id) references public.categories (user_id, id);

alter table public.goal_contributions
  add constraint goal_contributions_goal_fk        foreign key (user_id, goal_id)        references public.goals (user_id, id),
  add constraint goal_contributions_account_fk     foreign key (user_id, account_id)     references public.accounts (user_id, id),
  add constraint goal_contributions_transaction_fk foreign key (user_id, transaction_id) references public.transactions (user_id, id);

alter table public.sync_operations
  add constraint sync_operations_device_fk foreign key (user_id, device_id) references public.user_devices (user_id, device_id);

alter table public.backup_metadata
  add constraint backup_metadata_device_fk foreign key (user_id, device_id) references public.user_devices (user_id, device_id);

-- 2. Índices -------------------------------------------------------------------------------------
-- Cursor de sincronização (pull incremental por servidor): (user_id, server_updated_at, chave).
create index accounts_sync_idx           on public.accounts           (user_id, server_updated_at, id);
create index categories_sync_idx         on public.categories         (user_id, server_updated_at, id);
create index cards_sync_idx              on public.cards              (user_id, server_updated_at, id);
create index recurrences_sync_idx        on public.recurrences        (user_id, server_updated_at, id);
create index bills_sync_idx              on public.bills              (user_id, server_updated_at, id);
create index transactions_sync_idx       on public.transactions       (user_id, server_updated_at, id);
create index budgets_sync_idx            on public.budgets            (user_id, server_updated_at, id);
create index goals_sync_idx              on public.goals              (user_id, server_updated_at, id);
create index goal_contributions_sync_idx on public.goal_contributions (user_id, server_updated_at, id);
create index exchange_rate_sets_sync_idx   on public.exchange_rate_sets   (user_id, server_updated_at);
create index exchange_rate_quotes_sync_idx on public.exchange_rate_quotes (user_id, server_updated_at);

-- Movimentos: listas por data (Panel, Transacciones), por conta (saldos, detalhe da conta),
-- por categoria (orçamentos), por cartão (detalhe do cartão), por estado (pendentes), e as
-- ligações a contas domésticas e recorrências. Parciais quando a coluna é opcional.
create index transactions_user_date_idx        on public.transactions (user_id, date desc, id);
create index transactions_user_account_idx     on public.transactions (user_id, account_id, date);
create index transactions_user_destination_idx on public.transactions (user_id, destination_account_id, date) where destination_account_id is not null;
create index transactions_user_category_idx    on public.transactions (user_id, category_id, date)            where category_id is not null;
create index transactions_user_card_idx        on public.transactions (user_id, card_id, date)                where card_id is not null;
create index transactions_user_bill_idx        on public.transactions (user_id, bill_id)                      where bill_id is not null;
create index transactions_user_recurrence_idx  on public.transactions (user_id, recurrence_id)                where recurrence_id is not null;
create index transactions_user_pending_idx     on public.transactions (user_id, date)                         where status = 'pending' and deleted_at is null;

create index categories_user_parent_idx  on public.categories (user_id, parent_id) where parent_id is not null;
create index cards_user_account_idx      on public.cards      (user_id, account_id) where account_id is not null;

create index recurrences_user_account_idx  on public.recurrences (user_id, account_id);
create index recurrences_user_category_idx on public.recurrences (user_id, category_id) where category_id is not null;

create index bills_user_due_date_idx    on public.bills (user_id, due_date);
create index bills_user_account_idx     on public.bills (user_id, account_id)    where account_id is not null;
create index bills_user_category_idx    on public.bills (user_id, category_id)   where category_id is not null;
create index bills_user_recurrence_idx  on public.bills (user_id, recurrence_id, occurrence_date) where recurrence_id is not null;

create index budgets_user_start_idx     on public.budgets (user_id, start_date);
create index budgets_user_category_idx  on public.budgets (user_id, category_id) where category_id is not null;

create index goals_user_status_idx      on public.goals (user_id, status);

create index goal_contributions_user_goal_idx    on public.goal_contributions (user_id, goal_id, date);
create index goal_contributions_user_account_idx on public.goal_contributions (user_id, account_id) where account_id is not null;

-- Sistema.
create index sync_operations_user_received_idx on public.sync_operations (user_id, received_at);
create index sync_operations_user_record_idx   on public.sync_operations (user_id, entity, record_key);
create index sync_operations_user_device_idx   on public.sync_operations (user_id, device_id);
create index audit_logs_user_occurred_idx      on public.audit_logs (user_id, occurred_at desc);
create index audit_logs_user_record_idx        on public.audit_logs (user_id, table_name, record_key);
create index backup_metadata_user_created_idx  on public.backup_metadata (user_id, created_at desc);
create index backup_metadata_user_device_idx   on public.backup_metadata (user_id, device_id);

-- 3. Uma contribuição VIVA por transação (o mesmo dinheiro não conta duas vezes).
create unique index goal_contributions_one_live_per_transaction
  on public.goal_contributions (user_id, transaction_id)
  where transaction_id is not null and cancelled_at is null and deleted_at is null;

commit;

select 'AUREON 05 aplicado: FKs compostas, índices e unicidade de contribuições. Seguinte: 06_functions_and_triggers.sql' as resultado;
