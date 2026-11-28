-- =============================================================================
-- AUREON — LOCAL BEHAVIOUR TESTS. NEVER RUN IN SUPABASE.
-- =============================================================================
-- Run in a LOCAL database where supabase-emulation.sql and database/sql/01–07 were applied.
-- All data is fictitious (EJEMPLO-FICTICIO). Each check raises NOTICE 'PASS …' or aborts with
-- 'FAIL …'. Ends with a summary.
-- =============================================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create temporary table t_results (name text, ok boolean);
-- The role tests record their results here too (test harness only).
grant insert, select on t_results to anon, authenticated, service_role;

-- expect_error(label, sql, pattern): the statement must fail with a message matching pattern.
create or replace function pg_temp.expect_error(p_label text, p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      insert into t_results values (p_label, true);
      raise notice 'PASS %', p_label;
      return;
    end if;
    insert into t_results values (p_label, false);
    raise exception 'FAIL % — unexpected error: %', p_label, sqlerrm;
  end;
  insert into t_results values (p_label, false);
  raise exception 'FAIL % — statement succeeded but should have failed', p_label;
end $$;

create or replace function pg_temp.expect_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results values (p_label, true);
  raise notice 'PASS %', p_label;
exception when others then
  insert into t_results values (p_label, false);
  raise exception 'FAIL % — %', p_label, sqlerrm;
end $$;

create or replace function pg_temp.expect_true(p_label text, p_condition boolean) returns void language plpgsql as $$
begin
  if p_condition then
    insert into t_results values (p_label, true);
    raise notice 'PASS %', p_label;
  else
    insert into t_results values (p_label, false);
    raise exception 'FAIL %', p_label;
  end if;
end $$;

-- Fictitious users ------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'ana@example.invalid', '{"username": "Ana.Ejemplo", "full_name": "Ana Ejemplo", "preferred_currency": "ARS"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'beto@example.invalid', '{"username": "ana.ejemplo", "preferred_currency": "XXX"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'carla@example.invalid', '{"preferred_currency": "USD", "full_name": 12}');

select pg_temp.expect_true('new users get a profile, preferences and two empty rate sets',
  (select count(*) from public.profiles) = 3
  and (select count(*) from public.user_preferences) = 3
  and (select count(*) from public.exchange_rate_sets) = 6
  and (select count(*) from public.exchange_rate_quotes) = 0);
select pg_temp.expect_true('valid metadata is used (username lower-cased, full name, currency)',
  (select username = 'ana.ejemplo' and full_name = 'Ana Ejemplo' from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'));
select pg_temp.expect_true('a taken username and an unknown currency are ignored, never fatal',
  (select username is null from public.profiles where id = '00000000-0000-4000-8000-0000000000b2')
  and (select base_currency = 'ARS' from public.user_preferences where user_id = '00000000-0000-4000-8000-0000000000b2'));
select pg_temp.expect_true('USD as preferred currency: enabled [USD, ARS], sets based on USD',
  (select base_currency = 'USD' and enabled_currencies = array['USD','ARS']::public.currency_code[] from public.user_preferences where user_id = '00000000-0000-4000-8000-0000000000c3')
  and (select bool_and(base = 'USD') from public.exchange_rate_sets where user_id = '00000000-0000-4000-8000-0000000000c3'));

-- Fixtures (as postgres, like a trusted import) ---------------------------------------------------
\set A '''00000000-0000-4000-8000-0000000000a1'''
\set B '''00000000-0000-4000-8000-0000000000b2'''
insert into public.accounts (id, user_id, name, account_type, currency, initial_balance, status, rev, created_at, updated_at, device_id) values
  ('10000000-0000-7000-8000-000000000001', :A, 'EJEMPLO-FICTICIO Caja ARS', 'cash', 'ARS', 100000, 'active', 1, now(), now(), 'dev-a'),
  ('10000000-0000-7000-8000-000000000002', :A, 'EJEMPLO-FICTICIO Cuenta USD', 'checking', 'USD', -500, 'active', 1, now(), now(), 'dev-a'),
  ('10000000-0000-7000-8000-000000000003', :A, 'EJEMPLO-FICTICIO Ahorro ARS', 'savings', 'ARS', 0, 'active', 1, now(), now(), 'dev-a'),
  ('10000000-0000-7000-8000-0000000000b1', :B, 'EJEMPLO-FICTICIO Cuenta de B', 'cash', 'ARS', 0, 'active', 1, now(), now(), 'dev-b');
insert into public.categories (id, user_id, name, type, parent_id, is_default, is_active, rev, created_at, updated_at, device_id) values
  ('20000000-0000-7000-8000-000000000001', :A, 'Comida', 'expense', null, true, true, 1, now(), now(), 'dev-a'),
  ('20000000-0000-7000-8000-000000000002', :A, 'Supermercado', 'expense', '20000000-0000-7000-8000-000000000001', false, true, 1, now(), now(), 'dev-a'),
  ('20000000-0000-7000-8000-000000000003', :A, 'Sueldo', 'income', null, true, true, 1, now(), now(), 'dev-a');
insert into public.cards (id, user_id, account_id, name, card_type, last_four_digits, credit_limit, closing_day, due_day, currency, status, rev, created_at, updated_at, device_id) values
  ('30000000-0000-7000-8000-000000000001', :A, '10000000-0000-7000-8000-000000000001', 'EJEMPLO Visa', 'credit', '4242', 50000000, 20, 5, 'ARS', 'active', 1, now(), now(), 'dev-a');
insert into public.goals (id, user_id, name, kind, amount, initial_amount, currency, start_date, status, rev, created_at, updated_at, device_id) values
  ('40000000-0000-7000-8000-000000000001', :A, 'EJEMPLO Fondo', 'emergency', 1000000, 0, 'ARS', '2026-01-01', 'active', 1, now(), now(), 'dev-a');

-- Row rules (CHECK constraints) --------------------------------------------------------------------
select pg_temp.expect_ok('valid expense with category and card',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, category_id, account_id, card_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'expense', 'EJEMPLO-FICTICIO super', 12345, 'ARS',
             '20000000-0000-7000-8000-000000000002', '10000000-0000-7000-8000-000000000001', '30000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$);
select pg_temp.expect_ok('valid USD expense with a conversion snapshot (USD 100 × 1450 = ARS 145.000)',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, date, status,
       conv_from, conv_to, conv_amount, conv_converted, conv_rate, conv_mode, conv_rate_set_id, conv_source, conv_rate_at, conv_overridden,
       rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'expense', 'EJEMPLO-FICTICIO compra USD', 10000, 'USD',
       '10000000-0000-7000-8000-000000000002', '2026-11-21', 'completed',
       'USD', 'ARS', 10000, 14500000, '1450', 'manual', 'oficial', 'manual', now(), false, 1, now(), now(), 'dev-a')$q$);
select pg_temp.expect_error('conversion: converted must equal amount × rate',
  $q$update public.transactions set conv_converted = 14500001, rev = 2 where id = '50000000-0000-7000-8000-000000000002'$q$, 'transactions_conversion_consistent');
select pg_temp.expect_error('conversion: all fields or none',
  $q$update public.transactions set conv_rate = null, rev = 2 where id = '50000000-0000-7000-8000-000000000002'$q$, 'transactions_conversion_complete');
select pg_temp.expect_error('conversion: custom rate must be an override',
  $q$update public.transactions set conv_mode = 'custom', rev = 2 where id = '50000000-0000-7000-8000-000000000002'$q$, 'transactions_conversion_consistent');
select pg_temp.expect_true('conversion arithmetic matches convertMinor (rounding, CLP without decimals)',
  public.conversion_amount(1, 'USD', 'ARS', '0.5') = 1
  and public.conversion_amount(25050, 'EUR', 'ARS', '1600.75') = 40098788
  and public.conversion_amount(1000, 'CLP', 'ARS', '1.5') = 150000
  and public.conversion_amount(150000, 'ARS', 'CLP', '0.6666666667') = 1000
  and public.conversion_amount(777, 'EUR', 'ARS', '1234.5678901234') = 959259);
select pg_temp.expect_error('transfer needs two different accounts and no category',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, destination_account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'transfer', 'x', 1, 'ARS',
             '10000000-0000-7000-8000-000000000001', '10000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'transactions_transfer_shape');
select pg_temp.expect_error('amounts are positive',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'expense', 'x', 0, 'ARS', '10000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'transactions_amount_positive');
select pg_temp.expect_error('no card numbers in free text',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000a1', 'expense', 'pago 4111 1111 1111 1111', 1, 'ARS', '10000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'transactions_description_check');
select pg_temp.expect_error('unsupported currency',
  $q$insert into public.accounts (id, user_id, name, account_type, currency, initial_balance, status, rev, created_at, updated_at, device_id)
     values ('10000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'x', 'cash', 'JPY', 0, 'active', 1, now(), now(), 'dev-a')$q$, 'currency_code');
select pg_temp.expect_error('amount beyond the JavaScript safe range',
  $q$insert into public.accounts (id, user_id, name, account_type, currency, initial_balance, status, rev, created_at, updated_at, device_id)
     values ('10000000-0000-7000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'x', 'cash', 'ARS', 9007199254740992, 'active', 1, now(), now(), 'dev-a')$q$, 'money_minor');
select pg_temp.expect_error('debit cards have no limit or statement days',
  $q$insert into public.cards (id, user_id, name, card_type, credit_limit, currency, status, rev, created_at, updated_at, device_id)
     values ('30000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'x', 'debit', 100, 'ARS', 'active', 1, now(), now(), 'dev-a')$q$, 'cards_only_credit_has_limit_and_days');
select pg_temp.expect_error('monthly budget must cover exactly one calendar month',
  $q$insert into public.budgets (id, user_id, name, amount, currency, period, start_date, end_date, rev, created_at, updated_at, device_id)
     values ('60000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'x', 100, 'ARS', 'monthly', '2026-11-02', '2026-11-30', 1, now(), now(), 'dev-a')$q$, 'budgets_period_dates');
select pg_temp.expect_ok('valid quarterly, weekly and general budgets',
  $q$insert into public.budgets (id, user_id, name, category_id, amount, currency, period, start_date, end_date, rev, created_at, updated_at, device_id) values
     ('60000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'T4', '20000000-0000-7000-8000-000000000001', 100, 'ARS', 'quarterly', '2026-10-01', '2026-12-31', 1, now(), now(), 'dev-a'),
     ('60000000-0000-7000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'Semana', null, 100, 'ARS', 'weekly', '2026-11-23', '2026-11-29', 1, now(), now(), 'dev-a'),
     ('60000000-0000-7000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 'Feb', null, 100, 'ARS', 'monthly', '2028-02-01', '2028-02-29', 1, now(), now(), 'dev-a')$q$);
select pg_temp.expect_error('completed goal needs completed_at',
  $q$update public.goals set status = 'completed', rev = 2 where id = '40000000-0000-7000-8000-000000000001'$q$, 'goals_completed_at_matches_status');

-- Cross-user references (composite FKs) ------------------------------------------------------------
select pg_temp.expect_error('a transaction cannot point at another user''s account (IDOR)',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000a1', 'expense', 'x', 1, 'ARS', '10000000-0000-7000-8000-0000000000b1', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'transactions_account_fk');
select pg_temp.expect_error('a contribution cannot point at another user''s goal',
  $q$insert into public.goal_contributions (id, user_id, goal_id, amount, currency, date, rev, created_at, updated_at, device_id)
     values ('70000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b2', '40000000-0000-7000-8000-000000000001', 1, 'ARS', '2026-11-20', 1, now(), now(), 'dev-b')$q$, 'goal_contributions_goal_fk');

-- Cross-table integrity (triggers) ------------------------------------------------------------------
select pg_temp.expect_error('currency must match the account',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000a1', 'expense', 'x', 1, 'USD', '10000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'difere da conta');
select pg_temp.expect_error('an income cannot use an expense category',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, category_id, account_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e6', '00000000-0000-4000-8000-0000000000a1', 'income', 'x', 1, 'ARS', '20000000-0000-7000-8000-000000000001', '10000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'categoria');
select pg_temp.expect_error('the card must belong to the movement''s account',
  $q$insert into public.transactions (id, user_id, type, description, amount, currency, account_id, card_id, date, status, rev, created_at, updated_at, device_id)
     values ('50000000-0000-7000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000a1', 'expense', 'x', 1, 'ARS', '10000000-0000-7000-8000-000000000003', '30000000-0000-7000-8000-000000000001', '2026-11-20', 'completed', 1, now(), now(), 'dev-a')$q$, 'conta pagadora');
select pg_temp.expect_error('categories are at most two levels deep',
  $q$insert into public.categories (id, user_id, name, type, parent_id, is_default, is_active, rev, created_at, updated_at, device_id)
     values ('20000000-0000-7000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'Nivel 3', 'expense', '20000000-0000-7000-8000-000000000002', false, true, 1, now(), now(), 'dev-a')$q$, '2 níveis');
select pg_temp.expect_error('a subcategory has the parent''s type',
  $q$insert into public.categories (id, user_id, name, type, parent_id, is_default, is_active, rev, created_at, updated_at, device_id)
     values ('20000000-0000-7000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'Mal', 'income', '20000000-0000-7000-8000-000000000001', false, true, 1, now(), now(), 'dev-a')$q$, 'mesmo tipo');
select pg_temp.expect_error('budgets only on expense categories',
  $q$insert into public.budgets (id, user_id, name, category_id, amount, currency, period, start_date, end_date, rev, created_at, updated_at, device_id)
     values ('60000000-0000-7000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', 'x', '20000000-0000-7000-8000-000000000003', 1, 'ARS', 'custom', '2026-01-01', '2026-01-31', 1, now(), now(), 'dev-a')$q$, 'despesa');
select pg_temp.expect_ok('contribution backed by an expense',
  $q$insert into public.goal_contributions (id, user_id, goal_id, amount, currency, date, account_id, transaction_id, rev, created_at, updated_at, device_id)
     values ('70000000-0000-7000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-7000-8000-000000000001', 12345, 'ARS', '2026-11-20',
             '10000000-0000-7000-8000-000000000001', '50000000-0000-7000-8000-000000000001', 1, now(), now(), 'dev-a')$q$);
select pg_temp.expect_error('one live contribution per transaction',
  $q$insert into public.goal_contributions (id, user_id, goal_id, amount, currency, date, transaction_id, rev, created_at, updated_at, device_id)
     values ('70000000-0000-7000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-7000-8000-000000000001', 1, 'ARS', '2026-11-20',
             '50000000-0000-7000-8000-000000000001', 1, now(), now(), 'dev-a')$q$, 'goal_contributions_one_live_per_transaction');
select pg_temp.expect_error('a transaction backing a live contribution cannot be cancelled',
  $q$update public.transactions set status = 'cancelled', rev = 2 where id = '50000000-0000-7000-8000-000000000001'$q$, 'contribuição');
select pg_temp.expect_error('the currency of a referenced account cannot change',
  $q$update public.accounts set currency = 'USD', rev = 2 where id = '10000000-0000-7000-8000-000000000001'$q$, 'não muda enquanto');
select pg_temp.expect_ok('the currency of an unreferenced account can change',
  $q$update public.accounts set currency = 'EUR', rev = 2 where id = '10000000-0000-7000-8000-000000000003'$q$);
select pg_temp.expect_error('a quote cannot be in the base currency',
  $q$insert into public.exchange_rate_quotes (user_id, rate_set_id, currency, mode, rate, quoted_at, source)
     values ('00000000-0000-4000-8000-0000000000a1', 'oficial', 'ARS', 'manual', '1', now(), 'manual')$q$, 'base');
select pg_temp.expect_ok('valid manual and automatic quotes',
  $q$insert into public.exchange_rate_quotes (user_id, rate_set_id, currency, mode, rate, quoted_at, source) values
     ('00000000-0000-4000-8000-0000000000a1', 'oficial', 'USD', 'manual', '1450', now(), 'manual'),
     ('00000000-0000-4000-8000-0000000000a1', 'oficial', 'USD', 'automatic', '1480.5', now(), 'dolarapi')$q$);
select pg_temp.expect_error('rates are positive canonical decimals',
  $q$insert into public.exchange_rate_quotes (user_id, rate_set_id, currency, mode, rate, quoted_at, source)
     values ('00000000-0000-4000-8000-0000000000a1', 'oficial', 'EUR', 'manual', '0', now(), 'manual')$q$, 'exchange_rate_text');
select pg_temp.expect_error('unknown time zone refused',
  $q$update public.user_preferences set timezone = 'Marte/Olimpo' where user_id = '00000000-0000-4000-8000-0000000000a1'$q$, 'fuso');
-- The FK is DEFERRABLE (profile, preferences and rate sets are created together): it is checked at
-- COMMIT, or immediately when asked.
begin;
set constraints user_preferences_active_rate_set_fk immediate;
select pg_temp.expect_error('the active rate set must exist (deferred FK, checked at commit)',
  $q$update public.user_preferences set active_rate_set_id = 'no-existe' where user_id = '00000000-0000-4000-8000-0000000000a1'$q$, 'user_preferences_active_rate_set_fk');
commit;

-- Row protection -------------------------------------------------------------------------------------
select pg_temp.expect_error('rev must grow on every update',
  $q$update public.accounts set name = 'EJEMPLO otra', rev = 1 where id = '10000000-0000-7000-8000-000000000002'$q$, 'rev tem de crescer');
select pg_temp.expect_error('user_id never changes',
  $q$update public.accounts set user_id = '00000000-0000-4000-8000-0000000000b2', rev = 5 where id = '10000000-0000-7000-8000-000000000002'$q$, 'não mudam');
select pg_temp.expect_ok('a tombstone keeps its old references and passes',
  $q$update public.transactions set deleted_at = now(), rev = 2 where id = '50000000-0000-7000-8000-000000000002'$q$);
select pg_temp.expect_true('profile updates bump rev and updated_at on the server',
  (select rev from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 1);
update public.profiles set full_name = 'Ana María Ejemplo' where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.expect_true('… rev is now 2', (select rev from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 2);

-- Audit without values --------------------------------------------------------------------------------
select pg_temp.expect_true('audit records soft deletes with column names',
  exists (select 1 from public.audit_logs where table_name = 'transactions' and record_key = '50000000-0000-7000-8000-000000000002' and action = 'soft_delete' and 'deleted_at' = any (changed_columns)));
select pg_temp.expect_true('audit never stores values (no description, name or amount)',
  not exists (select 1 from public.audit_logs a where a::text ~ '(EJEMPLO|Ana|14500000|4242)'));

-- Role access: closed until Step 15 -------------------------------------------------------------------
set role anon;
select pg_temp.expect_error('anon cannot read transactions', 'select count(*) from public.transactions', 'permission denied');
select pg_temp.expect_error('anon cannot read profiles', 'select count(*) from public.profiles', 'permission denied');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select pg_temp.expect_error('authenticated cannot read its own accounts yet (no grants/policies)', 'select count(*) from public.accounts', 'permission denied');
select pg_temp.expect_error('authenticated cannot insert', $q$insert into public.user_devices (user_id, device_id) values ('00000000-0000-4000-8000-0000000000a1', 'x')$q$, 'permission denied');
select pg_temp.expect_error('authenticated cannot write the audit log', $q$insert into public.audit_logs (user_id, table_name, record_key, action) values ('00000000-0000-4000-8000-0000000000a1', 'x', 'x', 'insert')$q$, 'permission denied');
select pg_temp.expect_error('authenticated cannot call privileged functions', $q$select public.initialize_user('00000000-0000-4000-8000-0000000000a1', '{}')$q$, 'permission denied');
reset role;
reset request.jwt.claims;
set role service_role;
select pg_temp.expect_true('service_role (server only) still reads, bypassing RLS', (select count(*) from public.accounts) >= 4);
reset role;

-- Secure default privileges ------------------------------------------------------------------------------
create table public.t_default_priv_probe (id int);
select pg_temp.expect_true('a new table in public is not granted to anon/authenticated by default',
  not has_table_privilege('anon', 'public.t_default_priv_probe', 'select')
  and not has_table_privilege('authenticated', 'public.t_default_priv_probe', 'select'));
drop table public.t_default_priv_probe;

-- Account deletion cascades everything of that user ----------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.expect_true('deleting a user removes all their rows (and only theirs)',
  (select count(*) from public.accounts where user_id = '00000000-0000-4000-8000-0000000000a1') = 0
  and (select count(*) from public.transactions) = 0
  and (select count(*) from public.audit_logs where user_id = '00000000-0000-4000-8000-0000000000a1') = 0
  and (select count(*) from public.accounts where user_id = '00000000-0000-4000-8000-0000000000b2') = 1
  and (select count(*) from public.profiles) = 2);

-- Summary ----------------------------------------------------------------------------------------------
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
