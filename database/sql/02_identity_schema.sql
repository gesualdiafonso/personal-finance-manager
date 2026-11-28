-- =============================================================================
-- AUREON · 02 — Identidade, preferências e configuração de câmbio
-- =============================================================================
-- Depende de: 01.
-- Cria: profiles, user_preferences, user_devices, exchange_rate_sets, exchange_rate_quotes.
--
-- Origem na aplicação:
--   profiles             ← UserProfile (src/domain/profile.ts), campos pessoais.
--   user_preferences     ← FinancialSettings (src/domain/schemas.ts) + preferências do perfil
--                          (secondaryCurrency, language, dateFormat) + ExchangeSettings
--                          (enabledCurrencies, defaultMode, activeRateSetId, providerEnabled).
--                          Uma fonte por valor (D-AUTH-03): a moeda principal vive só aqui.
--   exchange_rate_sets   ← ExchangeSettings.rateSets[] (src/domain/fx.ts).
--   exchange_rate_quotes ← RateSet.manual / RateSet.automatic (uma linha por moeda e modo).
--   user_devices         ← deviceId da aplicação (store device do IndexedDB).
--
-- NÃO há palavras-passe, hashes, tokens nem sessões em nenhuma tabela: isso é do Supabase Auth.
-- As preferências de interface por dispositivo (tema, período do Panel — LocalStorage) não
-- sobem para a nuvem.
--
-- Segurança (Step 13): RLS ativa e nenhuma concessão a anon/authenticated em cada tabela, já
-- nesta transação — as tabelas ficam inacessíveis aos clientes até às políticas do Step 15.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'AUREON 02 já foi aplicado (public.profiles existe). Não é preciso repetir.';
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'currency_code') then
    raise exception 'Falta o script 01 (o tipo public.currency_code não existe). Execute o 01 primeiro.';
  end if;
end $$;

-- profiles ------------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text unique
                    constraint profiles_username_format check (username ~ '^[a-z0-9]([a-z0-9._-]{1,30}[a-z0-9])$'),
  full_name         text not null default ''
                    constraint profiles_full_name_length check (char_length(full_name) <= 80),
  contact_email     text not null default ''
                    constraint profiles_contact_email_format check (
                      contact_email = '' or (char_length(contact_email) <= 120 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
                    ),
  phone             text not null default ''
                    constraint profiles_phone_format check (phone = '' or phone ~ '^\+?[0-9 ()-]{6,24}$'),
  country           text not null default ''
                    constraint profiles_country_list check (country in ('', 'AR', 'UY', 'CL', 'BR', 'PY', 'BO', 'PE', 'CO', 'EC', 'VE', 'MX', 'US', 'CA', 'ES', 'PT', 'IT', 'FR', 'DE', 'GB')),
  region            text not null default ''
                    constraint profiles_region_length check (char_length(region) <= 60),
  rev               integer not null default 1 constraint profiles_rev_positive check (rev >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp()
);
comment on table public.profiles is
  'Perfil global (UserProfile). id = auth.users.id. contact_email é o email de contacto do perfil, distinto do email de login (auth.users). Sem segredos.';
comment on column public.profiles.username is 'Nome de utilizador opcional (minúsculas). Não serve para entrar: o login é por email (Supabase Auth).';

-- exchange_rate_sets (antes de user_preferences, que aponta para a configuração ativa) ----
create table public.exchange_rate_sets (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null constraint exchange_rate_sets_id_format check (id ~ '^[a-z0-9-]{1,40}$'),
  name              text not null constraint exchange_rate_sets_name_length check (char_length(btrim(name)) between 1 and 40),
  kind              text not null constraint exchange_rate_sets_kind_list check (kind in ('official', 'mep', 'blue', 'card', 'custom')),
  base              public.currency_code not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
comment on table public.exchange_rate_sets is
  'Configurações de taxas com nome (Oficial, MEP, personalizadas) — ExchangeSettings.rateSets. id é um slug escolhido pela app, único por utilizador.';

create table public.exchange_rate_quotes (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rate_set_id       text not null,
  currency          public.currency_code not null,
  mode              text not null constraint exchange_rate_quotes_mode_list check (mode in ('manual', 'automatic')),
  rate              public.exchange_rate_text not null,
  quoted_at         timestamptz not null,
  source            text not null constraint exchange_rate_quotes_source_list check (source in ('manual', 'dolarapi')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, rate_set_id, currency, mode),
  foreign key (user_id, rate_set_id) references public.exchange_rate_sets (user_id, id) on delete cascade,
  -- As cotações manuais têm fonte manual; as automáticas vêm de um fornecedor.
  constraint exchange_rate_quotes_source_matches_mode check ((mode = 'manual') = (source = 'manual'))
);
comment on table public.exchange_rate_quotes is
  'Cotação de uma moeda numa configuração: quantas unidades da base compra 1 unidade de currency. Manuais e automáticas separadas (D-FX-04). Nunca inventadas: só existem se o utilizador ou o fornecedor as gravaram.';
comment on column public.exchange_rate_quotes.quoted_at is 'Quote.updatedAt: quando a cotação foi tomada.';

-- user_preferences ------------------------------------------------------------------------
create table public.user_preferences (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  base_currency           public.currency_code not null default 'ARS',
  secondary_currency      public.currency_code,
  timezone                text not null default 'America/Argentina/Buenos_Aires'
                          constraint user_preferences_timezone_length check (char_length(timezone) between 1 and 64),
  locale                  text not null default 'es-AR' constraint user_preferences_locale_format check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  number_format           text not null default 'es-AR' constraint user_preferences_number_format check (number_format ~ '^[a-z]{2}-[A-Z]{2}$'),
  first_day_of_week       text not null default 'monday' constraint user_preferences_first_day_list check (first_day_of_week in ('monday', 'sunday')),
  language                text not null default 'es-AR' constraint user_preferences_language_list check (language in ('es-AR')),
  date_format             text not null default 'dd/MM/yyyy' constraint user_preferences_date_format_list check (date_format in ('dd/MM/yyyy', 'yyyy-MM-dd')),
  enabled_currencies      public.currency_code[] not null default array['ARS', 'USD']::public.currency_code[]
                          constraint user_preferences_enabled_currencies check (cardinality(enabled_currencies) >= 1 and public.array_is_distinct(enabled_currencies)),
  default_conversion_mode text not null default 'manual' constraint user_preferences_conversion_mode_list check (default_conversion_mode in ('automatic', 'manual')),
  active_rate_set_id      text not null default 'oficial',
  provider_enabled        boolean not null default false,
  rev                     integer not null default 1 constraint user_preferences_rev_positive check (rev >= 1),
  device_id               public.device_ref,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  server_updated_at       timestamptz not null default clock_timestamp(),
  constraint user_preferences_secondary_differs check (secondary_currency is null or secondary_currency <> base_currency),
  -- Diferível: o perfil, as preferências e as configurações de taxa nascem juntos (script 06).
  constraint user_preferences_active_rate_set_fk foreign key (user_id, active_rate_set_id)
    references public.exchange_rate_sets (user_id, id) deferrable initially deferred
);
comment on table public.user_preferences is
  'Preferências financeiras e regionais (FinancialSettings + secondaryCurrency/language/dateFormat do perfil + ExchangeSettings). Uma linha por utilizador.';
comment on column public.user_preferences.base_currency is 'Moeda principal (FinancialSettings.baseCurrency = preferredCurrency do perfil). Fonte única.';
comment on column public.user_preferences.timezone is 'Fuso IANA; validado contra pg_timezone_names pelo trigger do script 06.';

-- user_devices ----------------------------------------------------------------------------
create table public.user_devices (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id     public.device_ref not null,
  label         text constraint user_devices_label_length check (label is null or char_length(label) <= 60),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  primary key (user_id, device_id)
);
comment on table public.user_devices is
  'Dispositivos que escreveram dados (deviceId aleatório da app). Sem IP, sem user agent, sem tokens. revoked_at prepara "terminar sessão neste dispositivo".';

-- Segurança: RLS ligada e nenhuma concessão a clientes (políticas no Step 15) ----------------
alter table public.profiles             enable row level security;
alter table public.user_preferences     enable row level security;
alter table public.user_devices         enable row level security;
alter table public.exchange_rate_sets   enable row level security;
alter table public.exchange_rate_quotes enable row level security;
revoke all on table public.profiles, public.user_preferences, public.user_devices,
                    public.exchange_rate_sets, public.exchange_rate_quotes
  from public, anon, authenticated;

commit;

select 'AUREON 02 aplicado: 5 tabelas de identidade/preferências, RLS ligada, sem acesso de clientes. Seguinte: 03_financial_schema.sql' as resultado;
