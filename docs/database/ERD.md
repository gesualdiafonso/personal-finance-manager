# Diagrama de entidades (Step 13)

Fonte: `database/sql/02–05`. Todas as tabelas estão em `public`, com RLS ativa e sem políticas até ao Step 15.

**Convenções:**

- Cada tabela de dados tem `user_id → auth.users.id` (com eliminação em cascata).
- As relações entre tabelas do utilizador são **chaves estrangeiras compostas** `(user_id, x_id) → (user_id, id)`.
- O diagrama mostra os campos de relação e os principais. A lista completa está em [TYPESCRIPT-POSTGRES-MAPPING.md](TYPESCRIPT-POSTGRES-MAPPING.md).

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "id"
  AUTH_USERS ||--|| USER_PREFERENCES : "user_id"
  AUTH_USERS ||--o{ USER_DEVICES : "user_id"
  AUTH_USERS ||--o{ EXCHANGE_RATE_SETS : "user_id"
  EXCHANGE_RATE_SETS ||--o{ EXCHANGE_RATE_QUOTES : "(user_id, rate_set_id)"
  EXCHANGE_RATE_SETS ||--o{ USER_PREFERENCES : "active_rate_set_id (diferível)"

  AUTH_USERS ||--o{ ACCOUNTS : "user_id"
  AUTH_USERS ||--o{ CATEGORIES : "user_id"
  CATEGORIES |o--o{ CATEGORIES : "parent_id (máx. 2 níveis)"
  ACCOUNTS |o--o{ CARDS : "account_id (conta pagadora)"
  ACCOUNTS ||--o{ RECURRENCES : "account_id"
  CATEGORIES |o--o{ RECURRENCES : "category_id"
  ACCOUNTS |o--o{ BILLS : "account_id"
  CATEGORIES |o--o{ BILLS : "category_id (despesa)"
  RECURRENCES |o--o{ BILLS : "recurrence_id + occurrence_date"
  ACCOUNTS ||--o{ TRANSACTIONS : "account_id"
  ACCOUNTS |o--o{ TRANSACTIONS : "destination_account_id (transferência)"
  CATEGORIES |o--o{ TRANSACTIONS : "category_id"
  CARDS |o--o{ TRANSACTIONS : "card_id"
  BILLS |o--o{ TRANSACTIONS : "bill_id (pagamentos)"
  RECURRENCES |o--o{ TRANSACTIONS : "recurrence_id"
  CATEGORIES |o--o{ BUDGETS : "category_id (NULL = geral)"
  GOALS ||--o{ GOAL_CONTRIBUTIONS : "goal_id"
  ACCOUNTS |o--o{ GOAL_CONTRIBUTIONS : "account_id"
  TRANSACTIONS |o--o| GOAL_CONTRIBUTIONS : "transaction_id (1 viva por transação)"

  USER_DEVICES ||--o{ SYNC_OPERATIONS : "(user_id, device_id)"
  USER_DEVICES ||--o{ BACKUP_METADATA : "(user_id, device_id)"
  AUTH_USERS ||--o{ AUDIT_LOGS : "user_id"

  PROFILES {
    uuid id PK "= auth.users.id"
    text username UK "opcional"
    text full_name
    text contact_email
    text phone
    text country
    text region
  }
  USER_PREFERENCES {
    uuid user_id PK
    currency_code base_currency "moeda principal (fonte única)"
    currency_code secondary_currency
    text timezone
    text date_format
    currency_code_array enabled_currencies
    text active_rate_set_id FK
  }
  EXCHANGE_RATE_SETS {
    uuid user_id PK
    text id PK "slug: oficial, mep…"
    text kind
    currency_code base
  }
  EXCHANGE_RATE_QUOTES {
    uuid user_id PK
    text rate_set_id PK
    currency_code currency PK
    text mode PK "manual | automatic"
    exchange_rate_text rate
    timestamptz quoted_at
  }
  ACCOUNTS {
    uuid id PK
    uuid user_id FK
    text name
    currency_code currency
    money_minor initial_balance
    text status
  }
  CARDS {
    uuid id PK
    uuid account_id FK
    text card_type
    text last_four_digits
    money_minor credit_limit
  }
  CATEGORIES {
    uuid id PK
    uuid parent_id FK
    text type "income | expense"
  }
  TRANSACTIONS {
    uuid id PK
    text type "income | expense | transfer"
    money_minor amount "> 0, moeda original"
    currency_code currency
    date date
    text status
    uuid account_id FK
    uuid destination_account_id FK
    uuid category_id FK
    uuid card_id FK
    uuid bill_id FK
    uuid recurrence_id FK
    exchange_rate_text conv_rate "snapshot opcional"
    money_minor conv_converted
  }
  BILLS {
    uuid id PK
    money_minor amount
    date due_date
    text status
    uuid recurrence_id FK
  }
  RECURRENCES {
    uuid id PK
    text frequency
    date start_date
    uuid account_id FK
  }
  BUDGETS {
    uuid id PK
    uuid category_id FK
    text period
    date start_date
    date end_date
  }
  GOALS {
    uuid id PK
    money_minor amount
    text status
  }
  GOAL_CONTRIBUTIONS {
    uuid id PK
    uuid goal_id FK
    uuid transaction_id FK
    money_minor amount
    timestamptz cancelled_at
  }
  SYNC_OPERATIONS {
    uuid operation_id PK
    text entity
    text record_key
    text result
  }
  AUDIT_LOGS {
    bigint id PK
    text table_name
    text record_key
    text action
    text_array changed_columns "só nomes, nunca valores"
  }
  BACKUP_METADATA {
    uuid id PK
    text schema_version
    boolean encrypted
    text file_sha256
  }
```

**Colunas comuns às 9 tabelas financeiras** (`controlFields` da app):

| Coluna | Papel |
| --- | --- |
| `id`, `user_id` | Identidade e dono |
| `rev` | Concorrência otimista |
| `created_at`, `updated_at` | Datas do cliente |
| `deleted_at` | Tombstone |
| `device_id` | Dispositivo que escreveu |
| `server_updated_at` | Cursor de sincronização |
