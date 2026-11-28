# Mapeamento TypeScript ↔ PostgreSQL (Step 13)

Esquema: `database/sql/02–04`. Modelos: `src/domain/schemas.ts`, `src/domain/fx.ts`, `src/domain/profile.ts`. Tipos gerados: `src/lib/supabase/types.ts` (`scripts/db/generate-types.mjs`). A correspondência campo a campo é testada em `tests/unit/database-schema.test.ts`: cada campo Zod tem coluna, cada coluna tem campo, e as enumerações coincidem.

> Este documento substitui a proposta do Step 11 ([audit/postgresql-mapping.md](../audit/postgresql-mapping.md)), que fica como histórico.

## Regras gerais

| TypeScript / Zod | PostgreSQL | Notas para o mapeamento (Step 16) |
| --- | --- | --- |
| camelCase | snake_case | `accountId` ↔ `account_id`; nome da tabela: `goalContributions` ↔ `goal_contributions` |
| `uuid` (UUIDv7 da app) | `uuid primary key`, sem valor por omissão | O id vem sempre da app |
| — | `user_id uuid not null default auth.uid()` | Não existe no Zod: retirar ao ler, nunca enviar outro que não o da sessão |
| `amountMinor` (inteiro seguro) | `public.money_minor` (`bigint` com limite ±2^53−1) | Chega como `number` (exato) |
| `currencyCodeSchema` | `public.currency_code` (domain com a lista fechada) | Tipado como união literal nos tipos gerados |
| `localDate` (`YYYY-MM-DD`) | `date` | Sem fuso |
| `isoDateTime` com deslocamento | `timestamptz` | O deslocamento original não é guardado (o instante sim). Ao ler, voltar a formatar com `toIsoWithOffset` (Buenos Aires) |
| `rateSchema` (string decimal) | `public.exchange_rate_text` (texto canónico) | Texto de propósito: nunca passa por float |
| `z.enum([...])` | `text` + `check (… in (...))` | Mesma lista e ordem (testado) |
| `.nullable()` | coluna `NULL` | — |
| `.optional()` (ausente) | coluna `NULL` | **Ao ler, NULL ⇒ omitir a chave** nos campos só opcionais (o Zod `strictObject` recusa `null` onde só aceita ausência): `budget.status`, `bill.description`/`recurrenceId`/`occurrenceDate`, `recurrence.cancelledAt`/`notes`, `transaction.legacyIds`/`conversion` |
| `controlFields` | `id, rev, created_at, updated_at, deleted_at, device_id` | `rev` cresce sempre (trigger) |
| — | `server_updated_at` | Cursor de sincronização (servidor); não existe no Zod |

## Entidades financeiras

### `Account` → `accounts`

| Zod | Coluna | Tipo |
| --- | --- | --- |
| id, rev, createdAt, updatedAt, deletedAt, deviceId | id, rev, created_at, updated_at, deleted_at, device_id | uuid, integer, timestamptz ×3, device_ref |
| name | name | text (1–80, sem PAN) |
| institution | institution | text NULL (≤ 80, sem PAN) |
| accountType | account_type | text: checking, savings, cash, investment, other |
| currency | currency | currency_code |
| initialBalance | initial_balance | money_minor (pode ser negativo) |
| openingDate | opening_date | date NULL |
| status | status | text: active, archived |

### `Card` → `cards`

| Zod | Coluna | Tipo |
| --- | --- | --- |
| accountId | account_id | uuid NULL → FK composta `accounts` |
| name | name | text (1–60) |
| cardType | card_type | text: credit, debit, prepaid |
| lastFourDigits | last_four_digits | text NULL (`^[0-9]{4}$`) |
| creditLimit | credit_limit | money_minor NULL (≥ 0) |
| closingDay, dueDay | closing_day, due_day | smallint NULL (1–31) |
| currency, status | currency, status | currency_code; text: active, inactive |

Checks: um cartão de crédito exige `closing_day` e `due_day`; os outros tipos não têm limite nem dias. Trigger: a moeda tem de ser igual à da conta pagadora.

### `Category` → `categories`

| Zod | Coluna | Tipo |
| --- | --- | --- |
| name | name | text (1–60) |
| type | type | text: income, expense |
| parentId | parent_id | uuid NULL → FK composta `categories` |
| icon | icon | text NULL (kebab-case) |
| color | color | text NULL (`#RRGGBB`) |
| isDefault, isActive | is_default, is_active | boolean |

Trigger: no máximo 2 níveis, pai do mesmo tipo; uma categoria com filhas não passa a filha nem muda de tipo.

### `Transaction` → `transactions` (receitas, despesas, transferências)

| Zod | Coluna | Tipo |
| --- | --- | --- |
| type | type | text: income, expense, transfer |
| description | description | text (1–140, sem PAN) |
| amount | amount | money_minor (> 0) — **moeda original** |
| currency | currency | currency_code |
| categoryId, accountId, destinationAccountId, cardId, billId, recurrenceId | category_id, account_id, destination_account_id, card_id, bill_id, recurrence_id | uuid (account_id NOT NULL) → FKs compostas |
| date | date | date |
| status | status | text: pending, completed, cancelled |
| notes | notes | text NULL (≤ 500) |
| legacyIds | legacy_ids | uuid[] NULL |
| conversion.from / to | conv_from / conv_to | currency_code NULL |
| conversion.amount / converted | conv_amount / conv_converted | money_minor NULL |
| conversion.rate | conv_rate | exchange_rate_text NULL |
| conversion.mode | conv_mode | text NULL: automatic, manual, custom |
| conversion.rateSetId | conv_rate_set_id | text NULL (≤ 40) |
| conversion.source | conv_source | text NULL: manual, dolarapi, user |
| conversion.rateAt | conv_rate_at | timestamptz NULL |
| conversion.overridden | conv_overridden | boolean NULL |

**Checks:**

- forma das transferências: destino diferente da origem, sem categoria, sem cartão; só as transferências têm destino;
- receita sem cartão;
- conversão completa (todas as colunas ou nenhuma), com `conv_from = currency`, `conv_amount = amount` e `conv_converted = conversion_amount(…)` (o mesmo cálculo e arredondamento de `convertMinor`);
- uma taxa `custom` tem de ser marcada como *override*.

**Triggers:**

- moedas iguais às da conta, da conta de destino e do cartão;
- tipo da categoria igual ao tipo do movimento;
- o cartão pertence à conta do movimento;
- não se cancela uma transação que sustente uma contribuição viva.

### `Bill` → `bills`

name (1–80) · description (opcional, ≤ 200) · category_id (despesa) · amount (> 0) · currency · due_date · account_id NULL · status (pending, paid, cancelled) · notes · recurrence_id (opcional) · occurrence_date (opcional; obrigatória com recorrência).

### `Recurrence` → `recurrences`

description (1–120) · amount (> 0) · currency · type (income, expense) · frequency (daily … yearly, 7 valores) · start_date · end_date NULL (≥ início) · category_id · account_id NOT NULL · is_active · cancelled_at (opcional; cancelada ⇒ inativa) · notes (opcional).

### `Budget` → `budgets`

name · category_id NULL (geral) · amount (≥ 0) · currency · period (weekly, monthly, quarterly, yearly, custom) · start_date · end_date · description (opcional) · status (opcional; NULL = ativo). Check `budget_period_is_valid` (semana de 7 dias, mês civil, trimestre civil, ano civil). Trigger: só categorias de despesa.

### `Goal` → `goals`

name · description · kind (7 valores) · amount (> 0) · initial_amount (≥ 0) · currency · start_date · target_date (≥ início) · status (active, completed, cancelled) · completed_at (⇔ concluída) · archived_at (só se fechada).

### `GoalContribution` → `goal_contributions`

goal_id NOT NULL · amount (> 0) · currency · date · description · account_id · transaction_id · cancelled_at.

- Índice único parcial: uma contribuição viva por transação.
- Trigger: moeda igual à da meta, da conta e da transação; a transação não pode ser uma receita nem estar cancelada.

## Perfil e preferências

`ProfileView` na app = `profiles` + `user_preferences`. É uma fonte por valor, como já acontecia localmente (D-AUTH-03).

| TypeScript | Tabela.coluna |
| --- | --- |
| `UserProfile.id` (local) | — (na nuvem, o perfil usa `auth.users.id` = `profiles.id`) |
| username | profiles.username (opcional; o login é por email) |
| fullName, phone, country, region | profiles.full_name, phone, country, region (`''` = vazio, como no Zod) |
| email (contacto do perfil) | profiles.contact_email (o email de login fica em `auth.users`) |
| createdAt, updatedAt | profiles.created_at, updated_at (mantidos pelo servidor) |
| preferredCurrency / `FinancialSettings.baseCurrency` | user_preferences.base_currency |
| secondaryCurrency, language, dateFormat | user_preferences.secondary_currency, language, date_format |
| timezone, locale, numberFormat, firstDayOfWeek | user_preferences.timezone (validado contra `pg_timezone_names`), locale, number_format, first_day_of_week |
| `ExchangeSettings.enabledCurrencies` | user_preferences.enabled_currencies (`currency_code[]`, sem repetidos) |
| `ExchangeSettings.defaultMode` | user_preferences.default_conversion_mode |
| `ExchangeSettings.activeRateSetId` | user_preferences.active_rate_set_id → FK composta (diferível) |
| `ExchangeSettings.providerEnabled` | user_preferences.provider_enabled |
| `RateSet` (id, name, kind, base) | exchange_rate_sets (PK `user_id, id`) |
| `RateSet.manual[cur]` / `.automatic[cur]` | exchange_rate_quotes (PK `user_id, rate_set_id, currency, mode`): rate, quoted_at (= `Quote.updatedAt`), source |

**Não sobem para a nuvem:**

- `CredentialRecord` e `SessionRecord`: palavras-passe e sessões são do Supabase Auth;
- as preferências de interface do LocalStorage (`pfm.theme`, `pfm.dashboard.*`), que são por dispositivo;
- as stores locais `publications`, `snapshot`, `rollback`, `legacy_v1` e `migration_log`.

## Sistema

| App | Tabela | Notas |
| --- | --- | --- |
| `LocalOperation` (outbox) | sync_operations | Só metadados: operation_id, entity, record_key, op, base_rev, result, error_code, client_created_at. Sem o conteúdo do registo |
| deviceId | user_devices | Sem IP nem user agent |
| — | audit_logs | Escrito pelo trigger; só nomes de colunas |
| backup cifrado (Step 20) | backup_metadata | Formato, KDF, iterações (≥ 600 000), cifra, contagens, SHA-256 do ficheiro; nunca o ficheiro nem a frase |
