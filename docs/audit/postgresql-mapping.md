# Mapeamento atual → PostgreSQL (proposta)

> **Histórico (Step 11).** O esquema definitivo está em [`database/sql/`](../../database/sql/README.md) e o mapeamento atual em [TYPESCRIPT-POSTGRES-MAPPING.md](../database/TYPESCRIPT-POSTGRES-MAPPING.md). Diferenças principais: taxas como texto exato, câmbio normalizado em `exchange_rate_sets`/`exchange_rate_quotes`, RLS sem políticas até ao Step 15, sem `FORCE ROW LEVEL SECURITY`.
>
> **Proposta de desenho, não uma migração.** Nada disto foi executado. O SQL definitivo nasce no Step 13 como `supabase/migrations/*.sql`, com testes de RLS. Referência: [STEP-11-ARCHITECTURE-AUDIT.md](STEP-11-ARCHITECTURE-AUDIT.md) §3.

## 1. Regras gerais de conversão

| Conceito atual | PostgreSQL | Notas |
| --- | --- | --- |
| `id` UUIDv7 gerado no cliente | `uuid primary key` (sem `default`) | Mantém os IDs: offline, idempotência e reclamação de dados sem renumerar |
| Dono (implícito hoje) | `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade` | Nunca vem do cliente com valor diferente da sessão: policy `with check (user_id = auth.uid())` |
| Unicidade para FKs compostas | `unique (user_id, id)` em cada tabela referenciada | Permite `foreign key (user_id, x_id) references t(user_id, id)` |
| `rev` | `integer not null check (rev >= 1)` | Concorrência otimista; o servidor só aceita `rev = base_rev + 1` (RPC/trigger) |
| `createdAt`, `updatedAt`, `deletedAt` (ISO com deslocamento) | `timestamptz` | O deslocamento original não se guarda (o instante sim). Leitura com `toIsoWithOffset` em Buenos Aires |
| `deviceId` | `text not null check (char_length(device_id) between 1 and 64)` | Auditoria/conflitos |
| — | `server_updated_at timestamptz not null default now()` (trigger em cada escrita) | **Cursor de sincronização** (não depende do relógio do dispositivo) |
| Valores em unidades menores (`amountMinor`) | `bigint` + `check` (≤ 9007199254740991 em valor absoluto) | Iguais ao cliente; positivos/não negativos conforme o esquema |
| `currency` (ISO 4217, lista fechada) | `text check (currency in ('ARS','USD','EUR','BRL','UYU','CLP','PYG','GBP'))` ou `enum` | `check` é mais fácil de evoluir que `enum` |
| Datas de calendário (`LocalDate`) | `date` | Sem fuso |
| Enums Zod | `text check (x in (...))` | Mesma lista que o Zod |
| Taxas de câmbio (string decimal) | `numeric(22,10) check (> 0)` | Nunca `float` |
| Texto livre cifrado (OD-11) | `text` com envelope `enc:v1:<iv>:<ciphertext>` (base64) **ou** em claro, conforme a decisão | Os `check` de comprimento/PAN só valem em claro; com cifragem passam a ser validados no cliente |
| camelCase (TS) | snake_case (SQL) | Mapeamento explícito numa camada (`src/services/remote/mapping.ts`, Step 15) |
| Tombstone `deletedAt` | `deleted_at timestamptz` | As linhas não se apagam (a sincronização precisa de propagar remoções) |

## 2. Tabelas

### `profiles` ← `UserProfile` (store `profiles`)

| Coluna | Tipo | Origem |
| --- | --- | --- |
| `id` | `uuid primary key references auth.users(id) on delete cascade` | Utilizador Supabase (não o `id` local) |
| `username` | `text unique` (minúsculas, padrão `USERNAME_PATTERN`) | `username` |
| `full_name`, `phone`, `region` | `text` (cifráveis) | idem |
| `email_contact` | `text` | `email` do perfil (o email de login está em `auth.users`) |
| `country` | `text check (country in (...))` ou `''` | `country` |
| `secondary_currency` | `text null` | `secondaryCurrency` |
| `language`, `date_format` | `text check` | idem |
| `created_at`, `updated_at` | `timestamptz` | idem |

Preenchida por trigger `on insert on auth.users`. Política: `id = auth.uid()`.

### `user_settings` ← `FinancialSettings` (store `settings`, chave `financial`)

| Coluna | Tipo |
| --- | --- |
| `user_id` | `uuid primary key references auth.users(id) on delete cascade` |
| `base_currency` | `text check (...)` |
| `timezone`, `locale`, `number_format` | `text` (validados pelo Zod; `timezone` também com `pg_timezone_names` num trigger) |
| `first_day_of_week` | `text check (in ('monday','sunday'))` |
| `exchange` | `jsonb` (conjuntos de taxas, modo, moedas ativas; validado pelo `exchangeSettingsSchema` no cliente e por uma `check` de forma mínima) |
| `rev`, `updated_at`, `server_updated_at` | como acima |

### `accounts` ← `Account`

`id, user_id, name (text, cifrável), institution (text null, cifrável), account_type text check (checking|savings|cash|investment|other), currency, initial_balance bigint (pode ser negativo), opening_date date null, status text check (active|archived)` + controlo.

### `cards` ← `Card`

`account_id uuid null` → FK composta `accounts`; `name`, `card_type check (credit|debit|prepaid)`, `last_four_digits text check (~ '^\d{4}$') null`, `credit_limit bigint null check (>= 0)`, `closing_day`/`due_day smallint check (1..31) null`, `currency`, `status check (active|inactive)`.
Checks: crédito ⇒ dias não nulos; não crédito ⇒ limite e dias nulos. Trigger: moeda = moeda da conta pagadora.

### `categories` ← `Category`

`name`, `type check (income|expense)`, `parent_id uuid null` → FK composta para `categories`, `icon`, `color check (~ '^#[0-9A-Fa-f]{6}$')`, `is_default bool`, `is_active bool`; `check (parent_id <> id)`. Profundidade ≤ 2, mesmo tipo do pai e ausência de ciclos validados por trigger.

### `transactions` ← `Transaction`

| Coluna | Tipo / regra |
| --- | --- |
| `type` | `check (income|expense|transfer)` |
| `description` (cifrável), `notes` (cifrável, null) | `text` |
| `amount` | `bigint check (amount > 0)` |
| `currency` | `check (...)` |
| `account_id` | `uuid not null` → FK composta `accounts` |
| `destination_account_id`, `category_id`, `card_id`, `bill_id`, `recurrence_id` | `uuid null` → FKs compostas |
| `date` | `date not null` |
| `status` | `check (pending|completed|cancelled)` |
| `legacy_ids` | `uuid[] null` |
| `conv_from`, `conv_to`, `conv_amount`, `conv_converted`, `conv_rate numeric(22,10)`, `conv_mode`, `conv_rate_set_id`, `conv_source`, `conv_rate_at timestamptz`, `conv_overridden` | Colunas nulas em bloco (todas ou nenhuma): permitem relatórios no servidor. Alternativa: `conversion jsonb` |

Checks: transferência ⇒ destino não nulo, diferente da origem, sem categoria, sem cartão; não transferência ⇒ sem destino; receita ⇒ sem cartão; `conv_from = currency and conv_amount = amount`. Trigger: moedas iguais às da conta, destino e cartão; tipo da categoria = tipo; cartão pertence à conta. Índices: `(user_id, date)`, `(user_id, account_id)`, `(user_id, server_updated_at)`.

### `bills` ← `Bill`

`name`, `description`, `category_id`, `amount bigint > 0`, `currency`, `due_date date`, `account_id`, `status check (pending|paid|cancelled)`, `notes`, `recurrence_id`, `occurrence_date date null`; `check (recurrence_id is null or occurrence_date is not null)`. Categoria de despesa (trigger).

### `recurrences` ← `Recurrence`

`description`, `amount > 0`, `currency`, `type check (income|expense)`, `frequency check (daily|weekly|biweekly|monthly|quarterly|semiannual|yearly)`, `start_date`, `end_date null check (>= start_date)`, `category_id`, `account_id not null`, `is_active`, `cancelled_at timestamptz null`, `notes`; `check (cancelled_at is null or not is_active)`.

### `budgets` ← `Budget`

`name`, `category_id null` (null = geral), `amount bigint >= 0`, `currency`, `period check (weekly|monthly|quarterly|yearly|custom)`, `start_date`, `end_date check (>= start_date)`, `description`, `status check (active|archived) null`. A coerência período/datas e a regra "sem gémeo ativo sobreposto" ficam num trigger (ou numa *exclusion constraint* com `daterange` + `btree_gist`).

### `goals` ← `Goal`

`name`, `description`, `kind check (...)`, `amount > 0`, `initial_amount >= 0`, `currency`, `start_date`, `target_date null`, `status check (active|completed|cancelled)`, `completed_at`, `archived_at`; checks `(status = 'completed') = (completed_at is not null)`, `archived_at is null or status <> 'active'`.

### `goal_contributions` ← `GoalContribution`

`goal_id not null` → FK composta `goals`; `account_id`, `transaction_id` nulas → FKs compostas; `amount > 0`, `currency`, `date`, `description`, `cancelled_at`. Índice único parcial: `unique (user_id, transaction_id) where transaction_id is not null and cancelled_at is null and deleted_at is null` (uma contribuição viva por transação).

### `sync_operations` (opcional, idempotência) ← `LocalOperation`

`operation_id uuid primary key`, `user_id`, `entity text`, `record_id uuid`, `applied_at timestamptz`, `result text`. Permite reenviar a mesma operação sem efeito duplo.

### Não migram

`credentials`, `sessions` (substituídos pelo Supabase Auth), `publications`, `snapshot`, `rollback`, `legacy_v1`, `migration_log` (locais), preferências LocalStorage (por dispositivo).

## 3. SQL de proposta (excerto representativo)

```sql
-- Proposta (Step 13 produzirá a migração definitiva e os testes). NÃO EXECUTADO.
create table public.accounts (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  institution      text,
  account_type     text not null check (account_type in ('checking','savings','cash','investment','other')),
  currency         text not null check (currency in ('ARS','USD','EUR','BRL','UYU','CLP','PYG','GBP')),
  initial_balance  bigint not null check (abs(initial_balance) <= 9007199254740991),
  opening_date     date,
  status           text not null check (status in ('active','archived')),
  rev              integer not null check (rev >= 1),
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  deleted_at       timestamptz,
  device_id        text not null check (char_length(device_id) between 1 and 64),
  server_updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.transactions (
  id                     uuid primary key,
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type                   text not null check (type in ('income','expense','transfer')),
  description            text not null,
  amount                 bigint not null check (amount > 0 and amount <= 9007199254740991),
  currency               text not null check (currency in ('ARS','USD','EUR','BRL','UYU','CLP','PYG','GBP')),
  account_id             uuid not null,
  destination_account_id uuid,
  category_id            uuid,
  card_id                uuid,
  date                   date not null,
  status                 text not null check (status in ('pending','completed','cancelled')),
  notes                  text,
  bill_id                uuid,
  recurrence_id          uuid,
  -- … colunas conv_* , controlo e server_updated_at como em accounts …
  rev integer not null check (rev >= 1),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  device_id text not null, server_updated_at timestamptz not null default now(),
  unique (user_id, id),
  -- FKs COMPOSTAS: a verificação de FK ignora a RLS; (user_id, …) impede apontar para linhas de outro utilizador.
  foreign key (user_id, account_id)             references public.accounts   (user_id, id),
  foreign key (user_id, destination_account_id) references public.accounts   (user_id, id),
  foreign key (user_id, category_id)            references public.categories (user_id, id),
  foreign key (user_id, card_id)                references public.cards      (user_id, id),
  foreign key (user_id, bill_id)                references public.bills      (user_id, id),
  foreign key (user_id, recurrence_id)          references public.recurrences(user_id, id),
  check (type <> 'transfer' or (destination_account_id is not null and destination_account_id <> account_id
                                and category_id is null and card_id is null)),
  check (type = 'transfer' or destination_account_id is null),
  check (type <> 'income' or card_id is null)
);
create index on public.transactions (user_id, date);
create index on public.transactions (user_id, server_updated_at);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;
create policy transactions_select on public.transactions for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Sem política de DELETE: remoções são tombstones (update de deleted_at).
```

`(select auth.uid())` em vez de `auth.uid()` evita reavaliar a função por linha (recomendação de desempenho do Supabase para RLS). O padrão aplica-se a todas as tabelas.
