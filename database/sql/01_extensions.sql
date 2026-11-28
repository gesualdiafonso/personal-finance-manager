-- =============================================================================
-- AUREON · 01 — Extensões, tipos partilhados, funções puras e privilégios por omissão
-- =============================================================================
-- Depende de: 00 (todas as linhas OK).
-- O que faz:
--   1. Extensões: NENHUMA é necessária. Os IDs (UUIDv7) são gerados pela aplicação, não pela
--      base; não há pesquisa difusa nem exclusion constraints. Nada é instalado.
--   2. Tipos (domains) partilhados pelas tabelas: moeda, valor em unidades menores, taxa de
--      câmbio e identificador de dispositivo — as mesmas regras do Zod da aplicação.
--   3. Funções PURAS (sem ler tabelas) usadas pelas CHECK constraints dos scripts 02–05.
--   4. Privilégios por omissão seguros: as tabelas e sequências que o utilizador postgres
--      criar a seguir em public deixam de ser concedidas automaticamente a anon/authenticated.
-- Transação: tudo ou nada. Se falhar, nada fica criado e pode repetir depois de corrigir.
-- Repetição: se já foi executado com sucesso, para logo com uma mensagem clara.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typname = 'currency_code') then
    raise exception 'AUREON 01 já foi aplicado (o tipo public.currency_code existe). Não é preciso repetir.';
  end if;
end $$;

-- 1. Extensões ---------------------------------------------------------------------------
-- Nenhuma. (Supabase já traz pgcrypto e uuid-ossp no schema extensions; o AUREON não os usa.)

-- 2. Tipos partilhados -------------------------------------------------------------------

-- ISO 4217 suportadas pela aplicação (src/domain/currency.ts). Lista fechada.
create domain public.currency_code as text
  check (value in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP', 'PYG', 'GBP'));
comment on domain public.currency_code is 'Moeda ISO 4217 suportada (src/domain/currency.ts).';

-- Valores monetários: inteiros em unidades menores (centavos; pesos inteiros em CLP/PYG),
-- dentro do intervalo exato de um número JavaScript (Number.MAX_SAFE_INTEGER).
create domain public.money_minor as bigint
  check (value between -9007199254740991 and 9007199254740991);
comment on domain public.money_minor is 'Valor inteiro em unidades menores da moeda (amountMinor no Zod).';

-- Taxa de câmbio decimal escrita como texto canónico ("1450", "0.0006896552"): até 12 dígitos
-- inteiros e 10 decimais, maior que zero (RATE_PATTERN em src/domain/fx.ts). Texto e não
-- numeric, para chegar à aplicação sem passar por um número de vírgula flutuante.
create domain public.exchange_rate_text as text
  check (value ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,10})?$' and value ~ '[1-9]');
comment on domain public.exchange_rate_text is 'Taxa de câmbio decimal canónica (unidades de destino por 1 unidade de origem).';

-- Identificador aleatório do dispositivo que escreveu o registo (deviceId da aplicação).
create domain public.device_ref as text
  check (char_length(value) between 1 and 64);
comment on domain public.device_ref is 'deviceId da aplicação (aleatório; não identifica a pessoa).';

-- 3. Funções puras (usadas em CHECK constraints) ------------------------------------------
-- IMMUTABLE, sem acesso a tabelas, SECURITY INVOKER, search_path fixo.

-- Casas decimais da moeda (CLP e PYG não têm).
create function public.currency_minor_digits(p_currency public.currency_code)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case p_currency when 'CLP' then 0 when 'PYG' then 0 else 2 end
$$;
comment on function public.currency_minor_digits(public.currency_code) is
  'Casas decimais da moeda (SUPPORTED_CURRENCIES.minorDigits). Pura; usada em CHECK constraints.';

-- converted = amount × rate, convertido para as unidades menores do destino e arredondado UMA
-- vez, meio para longe de zero — exatamente como convertMinor() em src/domain/fx.ts.
create function public.conversion_amount(
  p_amount bigint,
  p_from public.currency_code,
  p_to public.currency_code,
  p_rate text
)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select round(
           p_amount::numeric
           * p_rate::numeric
           * power(10::numeric, public.currency_minor_digits(p_to) - public.currency_minor_digits(p_from))
         )::bigint
$$;
comment on function public.conversion_amount(bigint, public.currency_code, public.currency_code, text) is
  'Valor convertido esperado de uma conversão guardada (convertMinor em src/domain/fx.ts). Pura.';

-- Texto sem número de cartão: 12 a 19 dígitos seguidos (com espaços ou hífens) nunca são
-- guardados (CARD_NUMBER_PATTERN em src/domain/schemas.ts).
create function public.has_no_card_number(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is null or p_text !~ '[0-9]([ -]?[0-9]){11,18}'
$$;
comment on function public.has_no_card_number(text) is
  'Falso se o texto contiver algo parecido com um número de cartão (PAN). Pura.';

-- Coerência período/datas de um orçamento (superRefine de budgetSchema).
create function public.budget_period_is_valid(p_period text, p_start date, p_end date)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_end >= p_start and case p_period
    when 'weekly'    then p_end = p_start + 6
    when 'monthly'   then extract(day from p_start) = 1
                          and p_end = (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    when 'quarterly' then extract(day from p_start) = 1
                          and extract(month from p_start)::int in (1, 4, 7, 10)
                          and p_end = (date_trunc('month', p_start) + interval '3 months - 1 day')::date
    when 'yearly'    then p_start = make_date(extract(year from p_start)::int, 1, 1)
                          and p_end = make_date(extract(year from p_start)::int, 12, 31)
    when 'custom'    then true
    else false
  end
$$;
comment on function public.budget_period_is_valid(text, date, date) is
  'Datas coerentes com o período do orçamento (semana de 7 dias, mês, trimestre civil, ano civil). Pura.';

-- Array sem elementos repetidos.
create function public.array_is_distinct(p_values anyarray)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(p_values) = (select count(distinct v) from unnest(p_values) as v)
$$;
comment on function public.array_is_distinct(anyarray) is 'Verdadeiro se o array não tiver repetidos. Pura.';

-- Privilégios destas funções: as CHECK constraints precisam de EXECUTE para o papel que
-- insere. anon nunca; authenticated e service_role sim (são funções puras, sem dados).
revoke all on function public.currency_minor_digits(public.currency_code) from public, anon, authenticated;
revoke all on function public.conversion_amount(bigint, public.currency_code, public.currency_code, text) from public, anon, authenticated;
revoke all on function public.has_no_card_number(text) from public, anon, authenticated;
revoke all on function public.budget_period_is_valid(text, date, date) from public, anon, authenticated;
revoke all on function public.array_is_distinct(anyarray) from public, anon, authenticated;
grant execute on function public.currency_minor_digits(public.currency_code) to authenticated, service_role;
grant execute on function public.conversion_amount(bigint, public.currency_code, public.currency_code, text) to authenticated, service_role;
grant execute on function public.has_no_card_number(text) to authenticated, service_role;
grant execute on function public.budget_period_is_valid(text, date, date) to authenticated, service_role;
grant execute on function public.array_is_distinct(anyarray) to authenticated, service_role;

-- 4. Privilégios por omissão --------------------------------------------------------------
-- Por omissão, o Supabase concede ALL a anon e authenticated sobre tudo o que o postgres cria
-- em public. Para o AUREON isso abriria as tabelas privadas à chave publicável. A partir daqui,
-- tabelas e sequências novas criadas pelo postgres em public NÃO recebem essas concessões; o
-- Step 15 concede, tabela a tabela, só o necessário a authenticated, junto com as políticas.
-- (Os scripts 02–04 revogam também explicitamente, tabela a tabela.)
-- Efeito lateral: aplica-se a QUALQUER tabela que o postgres crie depois em public. Para
-- repor o comportamento do Supabase (não recomendado), ver database/sql/README.md §Recuperação.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

commit;

select 'AUREON 01 aplicado: 4 tipos, 5 funções puras, privilégios por omissão seguros. Seguinte: 02_identity_schema.sql' as resultado;
