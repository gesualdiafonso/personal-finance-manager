-- =============================================================================
-- AUREON · 04 — Tabelas de sistema (sincronização, auditoria, backups)
-- =============================================================================
-- Depende de: 01, 02, 03.
-- Cria: sync_operations, audit_logs, backup_metadata.
--
--   sync_operations  ← LocalOperation (outbox do IndexedDB). Regista o RESULTADO de cada
--                      operação enviada por um dispositivo, para que reenviar a mesma operação
--                      (mesmo operation_id) não a aplique duas vezes. NÃO guarda o registo
--                      (os dados vivem nas tabelas financeiras) — só metadados.
--   audit_logs       Histórico de alterações às tabelas de dados, preenchido pelo trigger do
--                      script 06. Guarda QUE tabela, QUE registo, QUE ação e os NOMES das
--                      colunas alteradas — nunca valores, nunca segredos, tokens ou palavras-passe.
--   backup_metadata  Registo dos backups JSON cifrados feitos pela app (Step 20): quando, que
--                      formato, que KDF, contagens e hash do ficheiro. Nunca o ficheiro, nunca a
--                      frase, nunca a chave. Os backups continuam independentes do Supabase.
--
-- Segurança: RLS ligada e nenhuma concessão a clientes. audit_logs só é escrito pelo trigger
-- (SECURITY DEFINER, script 06); nenhum cliente pode inserir, alterar ou apagar auditoria.
-- Transação: tudo ou nada.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.sync_operations') is not null then
    raise exception 'AUREON 04 já foi aplicado (public.sync_operations existe). Não é preciso repetir.';
  end if;
  if to_regclass('public.transactions') is null then
    raise exception 'Falta o script 03 (public.transactions não existe). Execute 01, 02 e 03 primeiro.';
  end if;
end $$;

-- Entidades sincronizáveis (nomes da app, ENTITY_NAMES + preferências e câmbio).
create table public.sync_operations (
  operation_id  uuid primary key,                        -- LocalOperation.operationId (gerado no cliente)
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id     public.device_ref not null,
  entity        text not null constraint sync_operations_entity_list check (entity in (
                  'accounts', 'cards', 'categories', 'transactions', 'bills', 'recurrences', 'budgets',
                  'goals', 'goalContributions', 'profiles', 'userPreferences', 'exchangeRateSets', 'exchangeRateQuotes')),
  record_key    text not null constraint sync_operations_record_key_length check (char_length(record_key) between 1 and 200),
  op            text not null constraint sync_operations_op_list check (op in ('create', 'update', 'delete')),
  base_rev      integer constraint sync_operations_base_rev_positive check (base_rev is null or base_rev >= 1),
  result        text not null constraint sync_operations_result_list check (result in ('applied', 'conflict', 'rejected')),
  error_code    text constraint sync_operations_error_code_format check (error_code is null or error_code ~ '^[A-Z_]{1,40}$'),
  client_created_at timestamptz not null,                -- LocalOperation.createdAt
  received_at   timestamptz not null default now()
);
comment on table public.sync_operations is
  'Idempotência da sincronização: uma linha por operação do outbox recebida. Só metadados; nunca o conteúdo do registo.';
comment on column public.sync_operations.record_key is 'Id do registo (uuid) ou chave composta (ex.: oficial|USD|manual nas cotações).';

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  occurred_at     timestamptz not null default clock_timestamp(),
  table_name      text not null constraint audit_logs_table_name_format check (table_name ~ '^[a-z_]{1,63}$'),
  record_key      text not null constraint audit_logs_record_key_length check (char_length(record_key) between 1 and 200),
  action          text not null constraint audit_logs_action_list check (action in ('insert', 'update', 'soft_delete', 'restore')),
  changed_columns text[] not null default '{}',
  device_id       public.device_ref,
  actor_role      text constraint audit_logs_actor_role_length check (actor_role is null or char_length(actor_role) <= 63)
);
comment on table public.audit_logs is
  'Auditoria sem valores: tabela, registo, ação, nomes das colunas alteradas, dispositivo e papel. Escrita só pelo trigger public.audit_row_change().';

create table public.backup_metadata (
  id               uuid primary key,                       -- gerado pela app
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id        public.device_ref not null,
  created_at       timestamptz not null,
  format           text not null constraint backup_metadata_format_list check (format in ('pfm-export-json')),
  schema_version   text not null constraint backup_metadata_schema_version_format check (schema_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  encrypted        boolean not null,
  kdf              text constraint backup_metadata_kdf_list check (kdf is null or kdf in ('PBKDF2-HMAC-SHA-256')),
  kdf_iterations   integer constraint backup_metadata_kdf_iterations_min check (kdf_iterations is null or kdf_iterations >= 600000),
  cipher           text constraint backup_metadata_cipher_list check (cipher is null or cipher in ('AES-256-GCM')),
  record_counts    jsonb not null default '{}'::jsonb constraint backup_metadata_record_counts_object check (jsonb_typeof(record_counts) = 'object'),
  file_sha256      text constraint backup_metadata_file_sha256_format check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes       bigint constraint backup_metadata_size_non_negative check (size_bytes is null or size_bytes >= 0),
  server_received_at timestamptz not null default now(),
  constraint backup_metadata_encryption_fields check (
    (encrypted and kdf is not null and kdf_iterations is not null and cipher is not null)
    or (not encrypted and kdf is null and kdf_iterations is null and cipher is null)
  )
);
comment on table public.backup_metadata is
  'Metadados dos backups feitos pela app. Nunca o ficheiro, a frase ou a chave; record_counts só tem contagens por entidade (sem valores).';

-- Segurança ------------------------------------------------------------------------------------
alter table public.sync_operations enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.backup_metadata enable row level security;
revoke all on table public.sync_operations, public.audit_logs, public.backup_metadata from public, anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;

commit;

select 'AUREON 04 aplicado: 3 tabelas de sistema, RLS ligada, sem acesso de clientes. Seguinte: 05_constraints_and_indexes.sql' as resultado;
