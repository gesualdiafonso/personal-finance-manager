#!/usr/bin/env node
/**
 * Generates database/sql/08_verification.sql from a LOCAL reference database built with
 * database/tests/supabase-emulation.sql + database/sql/01–07 (never from Supabase).
 *
 * The expected objects (tables, columns and types, PK/FK/unique/check constraints, indexes,
 * triggers, functions, domains) are read from that database's catalog and embedded in the
 * verification script as literal lists, so 08 checks the user's project against exactly what
 * was validated locally.
 *
 * Usage: PGHOST=/tmp/pgtest PGPORT=55432 node scripts/db/generate-verification.mjs aureon_ref
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const db = process.argv[2] ?? "aureon_ref";
if (/supabase/i.test(process.env.PGHOST ?? "")) {
  console.error("Refusing: PGHOST looks like Supabase. Use a local reference database.");
  process.exit(2);
}
const query = (sql) =>
  execFileSync("psql", ["-U", process.env.PGUSER ?? "postgres", "-d", db, "-At", "-F", "\t", "-X", "-c", sql], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

const TABLES = [
  "profiles", "user_preferences", "user_devices", "exchange_rate_sets", "exchange_rate_quotes",
  "accounts", "categories", "cards", "recurrences", "bills", "transactions", "budgets", "goals", "goal_contributions",
  "sync_operations", "audit_logs", "backup_metadata",
];
const inList = TABLES.map((t) => `'${t}'`).join(", ");
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const columns = query(`
  select c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (${inList}) and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum`);
const constraints = query(`
  select cl.relname, co.conname, co.contype
  from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relname in (${inList}) and co.contype in ('p', 'f', 'u', 'c')
  order by cl.relname, co.contype, co.conname`);
const indexes = query(`
  select tablename, indexname from pg_indexes where schemaname = 'public' and tablename in (${inList})
  order by tablename, indexname`);
const triggers = query(`
  select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and ((n.nspname = 'public' and c.relname in (${inList})) or t.tgname = 'on_auth_user_created_aureon')
  order by c.relname, t.tgname`);
const functions = query(`
  select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef,
         has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' order by p.proname`);
const domains = query(`
  select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'd' order by t.typname`);

const values = (rows, map) => rows.map((r) => `    (${map(r).join(", ")})`).join(",\n");
const typeLabel = { p: "chave primária", f: "chave estrangeira", u: "unicidade", c: "check" };

const sql = `-- =============================================================================
-- AUREON · 08 — Verificação final (SÓ LEITURA)
-- =============================================================================
-- Depende de: 00–07 aplicados.
-- O que faz: compara o projeto com o esquema validado localmente e devolve UMA tabela:
--   1.ª linha  RESUMO (número de verificações e de falhas);
--   depois     as linhas com estado ERRO (o que falta ou está errado);
--   por fim    as linhas OK.
-- Não cria, altera nem apaga nada. Pode repetir quando quiser.
-- Ficheiro GERADO por scripts/db/generate-verification.mjs a partir de uma base local de
-- referência (${new Date().toISOString().slice(0, 10)}). Não editar à mão: regenerar.
-- =============================================================================

with
expected_tables(table_name) as (
  values ${TABLES.map((t) => `(${lit(t)})`).join(", ")}
),
expected_columns(table_name, column_name, data_type, not_null) as (
  values
${values(columns, ([t, c, ty, nn]) => [lit(t), lit(c), lit(ty), nn === "t" ? "true" : "false"])}
),
expected_constraints(table_name, constraint_name, constraint_type) as (
  values
${values(constraints, ([t, n, ty]) => [lit(t), lit(n), lit(ty)])}
),
expected_indexes(table_name, index_name) as (
  values
${values(indexes, ([t, i]) => [lit(t), lit(i)])}
),
expected_triggers(table_name, trigger_name) as (
  values
${values(triggers, ([t, g]) => [lit(t), lit(g)])}
),
expected_functions(function_name, arguments, security_definer, authenticated_execute) as (
  values
${values(functions, ([f, a, s, x]) => [lit(f), lit(a), s === "t" ? "true" : "false", x === "t" ? "true" : "false"])}
),
expected_domains(domain_name) as (
  values ${domains.map(([d]) => `(${lit(d)})`).join(", ")}
),
actual_columns as (
  select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull as not_null
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
),
checks(categoria, objeto, esperado, encontrado, ok) as (
  -- Tabelas
  select 'tabela', e.table_name, 'existe', case when to_regclass('public.' || e.table_name) is null then 'em falta' else 'existe' end,
         to_regclass('public.' || e.table_name) is not null
  from expected_tables e
  union all
  -- Colunas (por tabela: em falta, tipo ou NOT NULL diferentes)
  select 'colunas', e.table_name,
         count(*)::text || ' colunas',
         coalesce(nullif(concat_ws('; ',
           'em falta: ' || string_agg(e.column_name, ', ') filter (where a.column_name is null),
           'tipo/nulidade diferente: ' || string_agg(e.column_name, ', ') filter (where a.column_name is not null and (a.data_type <> e.data_type or a.not_null <> e.not_null))
         ), ''), 'todas corretas'),
         count(*) filter (where a.column_name is null or a.data_type <> e.data_type or a.not_null <> e.not_null) = 0
  from expected_columns e
  left join actual_columns a on a.table_name = e.table_name and a.column_name = e.column_name
  group by e.table_name
  union all
  -- Restrições (PK, FK, unicidade, checks): uma linha por tabela e tipo
  select case e.constraint_type ${Object.entries(typeLabel).map(([k, v]) => `when '${k}' then '${v}'`).join(" ")} end, e.table_name,
         count(*)::text,
         coalesce('em falta: ' || string_agg(e.constraint_name, ', ') filter (where co.oid is null), 'todas presentes'),
         count(*) filter (where co.oid is null) = 0
  from expected_constraints e
  left join pg_class cl on cl.relname = e.table_name and cl.relnamespace = 'public'::regnamespace
  left join pg_constraint co on co.conrelid = cl.oid and co.conname = e.constraint_name and co.contype::text = e.constraint_type
  group by e.table_name, e.constraint_type
  union all
  -- Índices (por tabela)
  select 'índices', e.table_name, count(*)::text,
         coalesce('em falta: ' || string_agg(e.index_name, ', ') filter (where i.indexname is null), 'todos presentes'),
         count(*) filter (where i.indexname is null) = 0
  from expected_indexes e
  left join pg_indexes i on i.schemaname = 'public' and i.tablename = e.table_name and i.indexname = e.index_name
  group by e.table_name
  union all
  -- Triggers (por tabela; inclui o de auth.users)
  select 'triggers', e.table_name, count(*)::text,
         coalesce('em falta: ' || string_agg(e.trigger_name, ', ') filter (where t.oid is null), 'todos presentes'),
         count(*) filter (where t.oid is null) = 0
  from expected_triggers e
  left join pg_trigger t on t.tgname = e.trigger_name and not t.tgisinternal
       and t.tgrelid = (select c.oid from pg_class c where c.relname = e.table_name
                        and c.relnamespace = case when e.table_name = 'users' then 'auth'::regnamespace else 'public'::regnamespace end)
  group by e.table_name
  union all
  -- Funções: existem, SECURITY DEFINER só onde previsto, search_path fixo, EXECUTE correto
  select 'função', e.function_name || '(' || e.arguments || ')',
         case when e.security_definer then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
           || '; authenticated ' || case when e.authenticated_execute then 'executa' else 'não executa' end || '; anon não executa; search_path fixo',
         case when p.oid is null then 'em falta'
              else case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
                || '; authenticated ' || case when has_function_privilege('authenticated', p.oid, 'execute') then 'executa' else 'não executa' end
                || '; anon ' || case when has_function_privilege('anon', p.oid, 'execute') then 'EXECUTA' else 'não executa' end
                || case when exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%') then '; search_path fixo' else '; SEM search_path' end
         end,
         p.oid is not null and p.prosecdef = e.security_definer
           and has_function_privilege('authenticated', p.oid, 'execute') = e.authenticated_execute
           and not has_function_privilege('anon', p.oid, 'execute')
           and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  from expected_functions e
  left join pg_proc p on p.proname = e.function_name and p.pronamespace = 'public'::regnamespace
       and pg_get_function_identity_arguments(p.oid) = e.arguments
  union all
  -- Tipos partilhados
  select 'tipo', e.domain_name, 'existe',
         case when exists (select 1 from pg_type t where t.typname = e.domain_name and t.typnamespace = 'public'::regnamespace) then 'existe' else 'em falta' end,
         exists (select 1 from pg_type t where t.typname = e.domain_name and t.typnamespace = 'public'::regnamespace)
  from expected_domains e
  union all
  -- RLS ativa e sem políticas (fechado até ao Step 15)
  select 'RLS', e.table_name, 'ativa, 0 políticas',
         case when c.oid is null then 'tabela em falta'
              else case when c.relrowsecurity then 'ativa' else 'DESATIVADA' end || ', '
                || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = e.table_name) || ' políticas' end,
         coalesce(c.relrowsecurity, false) and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = e.table_name) = 0
  from expected_tables e
  left join pg_class c on c.relname = e.table_name and c.relnamespace = 'public'::regnamespace
  union all
  -- Privilégios: nada para anon nem authenticated
  select 'privilégios', e.table_name, 'anon e authenticated sem privilégios',
         case when c.oid is null then 'tabela em falta'
              else concat_ws(', ',
                case when has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') then 'anon TEM privilégios' end,
                case when has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger') then 'authenticated TEM privilégios' end)
         end,
         c.oid is not null
           and not has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
           and not has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger')
  from expected_tables e
  left join pg_class c on c.relname = e.table_name and c.relnamespace = 'public'::regnamespace
  union all
  select 'privilégios', 'audit_logs_id_seq', 'anon e authenticated sem privilégios',
         case when to_regclass('public.audit_logs_id_seq') is null then 'em falta'
              when has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'usage, select, update')
                or has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'usage, select, update') then 'TEM privilégios'
              else 'sem privilégios' end,
         to_regclass('public.audit_logs_id_seq') is not null
           and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'usage, select, update')
           and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'usage, select, update')
  union all
  -- Privilégios por omissão (01): tabelas novas do postgres em public sem concessão a clientes
  select 'privilégios por omissão', 'tabelas novas em public (postgres)', 'sem concessão a anon/authenticated',
         coalesce((select string_agg(acl::text, ' ') from pg_default_acl d, unnest(d.defaclacl) acl
                   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
                     and (acl::text like 'anon=%' or acl::text like 'authenticated=%')), 'sem concessão'),
         not exists (select 1 from pg_default_acl d, unnest(d.defaclacl) acl
                     where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
                       and (acl::text like 'anon=%' or acl::text like 'authenticated=%'))
  union all
  -- Utilizadores existentes têm perfil e preferências
  select 'dados', 'perfis e preferências dos utilizadores existentes',
         (select count(*) from auth.users)::text || ' utilizadores',
         (select count(*) from auth.users u where exists (select 1 from public.profiles p where p.id = u.id)
                                             and exists (select 1 from public.user_preferences x where x.user_id = u.id))::text || ' com perfil e preferências',
         (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
                                             or not exists (select 1 from public.user_preferences x where x.user_id = u.id)) = 0
)
select categoria, objeto, esperado, encontrado, estado
from (
  select 0 as ordem, 'RESUMO' as categoria,
         count(*)::text || ' verificações' as objeto,
         'todas OK' as esperado,
         (count(*) filter (where not ok))::text || ' com erro' as encontrado,
         case when bool_and(ok) then 'OK' else 'ERRO' end as estado
  from checks
  union all
  select case when ok then 2 else 1 end, categoria, objeto, esperado, encontrado, case when ok then 'OK' else 'ERRO' end
  from checks
) r
order by ordem, categoria, objeto;
`;

writeFileSync(resolve("database/sql/08_verification.sql"), sql);
console.log(`08_verification.sql: ${TABLES.length} tables, ${columns.length} columns, ${constraints.length} constraints, ${indexes.length} indexes, ${triggers.length} triggers, ${functions.length} functions, ${domains.length} domains`);
