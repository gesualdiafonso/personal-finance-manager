# ADR-006 — Supabase (PostgreSQL + Auth) com cache IndexedDB

- **Estado:** aceite pelo proprietário do produto no brief do Step 11 (2026-11-28) — "definitive architecture decisions". **Por implementar** (Steps 12–20).
- **Substitui:** [ADR-001](ADR-001-sem-base-de-dados.md) (sem base de dados) e, em parte, [ADR-002](ADR-002-local-first.md) (local-first: o IndexedDB deixa de ser a fonte de trabalho e passa a cache + fila). Substitui também a autenticação local ([auth-decisions.md](auth-decisions.md), D-AUTH-01…10) e o pipeline de publicação por GitHub (OD-1, OD-2, OD-4, OD-7 deixam de se aplicar).
- **Mantém e estende:** [ADR-003](ADR-003-cifragem.md) (cifragem com Web Crypto, PBKDF2 600 000 + AES-256-GCM) — agora como cifragem adicional ao nível da aplicação.

## Decisão

| Tema | Decisão |
| --- | --- |
| Base de dados | Supabase PostgreSQL — **fonte oficial** |
| Autenticação | Supabase Auth, em substituição da conta local |
| Persistência | Híbrida: nuvem + IndexedDB (cache offline e fila de sincronização) |
| Segurança | Cifragem do fornecedor + cifragem adicional na aplicação |
| Autorização | Row Level Security do PostgreSQL |
| Aplicação | Next.js App Router + TypeScript (sem mudança) |
| Validação | Arquitetura Zod existente |
| Backup | Exportação/importação JSON cifrada, independente da nuvem |
| Proibido | MongoDB; segredos no cliente; `service_role` fora do servidor |

## Consequências

- **Step 12 (feito):** `guard:deps` permite só os pacotes oficiais `@supabase/supabase-js` e `@supabase/ssr` (e os seus subpacotes oficiais); continuam proibidos ORMs, MongoDB, Firebase, outros `@supabase/*` e URLs `supabase.co` escritos no código. O ESLint só deixa importar `@supabase/*` em `src/lib/supabase/**` e `src/proxy.ts`. O `.env.example`, o README e `docs/ENVIRONMENT.md` foram atualizados.
- Os ficheiros `data/` e o formato JSON 2.4.0 ficam como formato de backup/importação e dados de teste, não como fonte oficial.
- Detalhe técnico: [STEP-11-ARCHITECTURE-AUDIT.md](../audit/STEP-11-ARCHITECTURE-AUDIT.md), [supabase-blueprint.md](../audit/supabase-blueprint.md), [postgresql-mapping.md](../audit/postgresql-mapping.md).
