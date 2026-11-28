# Step 13 — Validação dos scripts SQL

Executado em 2026-11-28. **Nenhum projeto Supabase foi contactado**; a base de produção não foi testada.

## Ambientes locais (descartáveis, só socket Unix)

| Ambiente | Superutilizador | Quem executa os scripts | Para quê |
| --- | --- | --- | --- |
| A | `postgres` | `postgres` | Executor completo: `database/tests/run-local.sh` |
| B | `supabase_admin` | `postgres` **sem** superutilizador; `auth.users` pertence a `supabase_auth_admin` | Aproximar as permissões reais do SQL Editor do Supabase |

Ambos com PostgreSQL 16.15 e a emulação mínima `database/tests/supabase-emulation.sql`: papéis `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()` e os privilégios por omissão do Supabase. A emulação é uma simplificação: o schema `auth` real tem muito mais.

## Resultados

| Verificação | A | B |
| --- | --- | --- |
| `00` sem instalação: 11 linhas OK/INFO | ✅ | ✅ |
| `01`–`07` aplicam sem erros, por ordem | ✅ | ✅ |
| Testes de comportamento (`database/tests/behaviour.sql`) | ✅ 53/53 | ✅ 53/53 |
| `08` depois da instalação e dos testes: 189 verificações, 0 erros | ✅ | ✅ |
| Repetir `01`–`06` para logo com "já foi aplicado", sem alterar nada | ✅ | — |
| Repetir `07` é idempotente | ✅ | — |
| `00` depois da instalação assinala `ERRO` (tabelas já existentes) | ✅ | — |
| `99` recusa desinstalar com dados | ✅ | ✅ |
| `99` numa instalação vazia, depois `00` OK e reinstalação `01`–`07` com `08` a 0 erros | — | ✅ |
| `08` deteta falhas injetadas: RLS desativada, política a mais, FK em falta, coluna/check em falta, EXECUTE revogado, GRANT a `anon`, privilégio por omissão inseguro, trigger em falta, índice em falta | ✅ 10 erros reportados | — |

Os 53 testes de comportamento cobrem:

- inicialização de utilizadores, com metadados válidos, inválidos e username repetido;
- checks de linha: conversão exata e arredondamento iguais a `convertMinor`, CLP sem decimais, transferências, valores positivos, PAN em texto, moeda não suportada, limite de 2^53, cartões, períodos de orçamento e metas;
- referências entre utilizadores (FKs compostas);
- coerência entre tabelas: moedas, tipos de categoria, cartão da conta, árvore de categorias, orçamentos, contribuições, cancelamento de uma transação que sustenta uma contribuição, moeda bloqueada quando referida, cotação na moeda base, fuso horário e configuração ativa (FK diferível);
- `rev` crescente e `user_id` imutável;
- tombstones;
- auditoria sem valores;
- acesso por papel (`anon`/`authenticated` recusados, `service_role` com acesso);
- privilégios por omissão;
- eliminação em cascata de um utilizador.

## Problemas encontrados e corrigidos durante a validação

1. **`DROP TRIGGER` em `auth.users` exige ser dono da tabela** (no ambiente B, como no Supabase). O `99` passou a remover o trigger em cascata com a sua própria função.
2. Uma linha sem efeito em `initialize_user` foi removida.
3. Ajustes no próprio harness: papéis criados uma vez por cluster; tabela de resultados acessível aos papéis de teste; teste da FK diferível com `SET CONSTRAINTS … IMMEDIATE`.

## Na aplicação (CI, sem PostgreSQL)

- `tests/unit/database-schema.test.ts` (34 testes): organização dos ficheiros; 00/08 só de leitura e 01–07 em transação; cada campo Zod ↔ coluna nas 9 entidades; preferências; nenhuma coluna de segredo; tipos gerados = tabelas criadas; 13 enumerações + moedas + países iguais ao Zod; RLS e REVOKE em cada tabela; nenhuma política; nenhum GRANT a `anon`; GRANTs a `authenticated` só nas 5 funções puras; `search_path` fixo em todas as funções; SECURITY DEFINER só nas 3 documentadas; `user_id` + `unique (user_id, id)`; 21 FKs compostas e nenhuma FK simples entre tabelas do utilizador; auditoria só com metadados.
- `src/lib/supabase/types.ts` gerado a partir da base local de referência (`scripts/db/generate-types.mjs`); `tsc` sem erros.

## Como repetir

```bash
# PostgreSQL local descartável (nunca o Supabase)
PGHOST=/tmp/pgtest PGPORT=55432 database/tests/run-local.sh
# Regenerar 08 e os tipos depois de mudar o esquema (a partir de uma base local de referência)
PGHOST=/tmp/pgtest PGPORT=55432 node scripts/db/generate-verification.mjs aureon_ref
PGHOST=/tmp/pgtest PGPORT=55432 node scripts/db/generate-types.mjs aureon_ref
```

Os executores recusam correr se `PGHOST` parecer um endereço do Supabase.
