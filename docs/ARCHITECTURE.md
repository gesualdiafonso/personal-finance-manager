# Arquitetura do AUREON

Índice de alto nível. Estado em 2026-11-28 (Step 14). Detalhe: [architecture/overview.md](architecture/overview.md) (arquitetura atual, por camada) e [audit/supabase-blueprint.md](audit/supabase-blueprint.md) (destino).

## Implementado vs. planeado

| Área | Estado | Onde |
| --- | --- | --- |
| Next.js 16 App Router, páginas estáticas, PWA offline | **Implementado** | `src/app`, `scripts/pwa` |
| Domínio (Zod + regras puras), módulos financeiros | **Implementado** | `src/domain`, `src/features` |
| Dados no IndexedDB (`pfm-local` v4), repositórios com `outbox` | **Implementado — fonte de trabalho atual** | `src/services/storage`, `src/services/repositories` |
| Login local (PBKDF2) e perfil global | **Implementado — ativo só sem Supabase configurado (modo local)** | `src/services/auth`, `src/features/auth` |
| **Supabase Auth** (email + password, verificação, recuperação, sessões `HttpOnly`, proteção de rotas no servidor, migração assistida da conta local, uma base local por identidade) | **Implementado (Step 14) — ativo quando o Supabase está configurado** | [architecture/supabase-auth.md](architecture/supabase-auth.md), `src/lib/supabase/auth-service.ts`, `src/features/auth/cloud-*`, `src/services/auth/identity-binding.ts` |
| Exportação/importação JSON 2.4.0 | Implementado (sem UI de descarga) | `src/services/exchange` |
| Dependências Supabase (`@supabase/supabase-js` 2.119.2, `@supabase/ssr` 0.12.7) | **Implementado (Step 12)** | `package.json` |
| Configuração Supabase validada (Zod), recusa de chaves privilegiadas | **Implementado (Step 12)** | `src/lib/supabase/config.ts`, `next.config.ts` |
| Cliente Supabase de servidor (em uso, Step 14); cliente de browser (sem uso desde o Step 14) | Implementado | `src/lib/supabase/server.ts`, `client.ts` |
| Proxy Next.js 16 (refresh de sessão + **proteção de rotas no servidor**, nega por omissão) | **Implementado (Step 12/14)** | `src/proxy.ts`, `src/lib/supabase/proxy.ts` |
| Health check da ligação | **Implementado (Step 12)** | `src/lib/supabase/health.ts`, `/api/health/supabase`, Configuración → Nube |
| CSP global (com `connect-src` limitado ao projeto Supabase e à DolarApi) | **Implementado (Step 12)** | `next.config.ts` |
| Esquema PostgreSQL (17 tabelas, FKs compostas, CHECK, triggers, auditoria, RLS ativa sem políticas) | **Preparado e validado localmente (Step 13); por executar pelo utilizador no SQL Editor** | [database/sql/README.md](../database/sql/README.md), [database/](database/) |
| Acesso ao próprio perfil na nuvem (2 políticas em `profiles`, por coluna) | **Preparado (Step 14), opcional; por executar no SQL Editor** | [database/sql/09_profile_access.sql](../database/sql/09_profile_access.sql) |
| Row Level Security | **Ativada sem políticas nos scripts (acesso de clientes bloqueado); políticas por utilizador no Step 15** | [database/SECURITY.md](database/SECURITY.md) |
| Sincronização nuvem ⇄ IndexedDB | Planeado | blueprint §6 |
| Cifragem ao nível da aplicação | Planeado — Step 18 (OD-11/12/13) | blueprint §5 |
| Backup JSON cifrado, independente do Supabase | Planeado | blueprint §8 |

## Visão atual (Step 14, modo Supabase)

```mermaid
flowchart LR
  subgraph Browser
    UI["Módulos (cliente)"] --> Repo["Repositórios"] --> IDB[("IndexedDB<br/>pfm-local / pfm-local~userId")]
    UI --> Prov["CloudAuthProvider<br/>(sem tokens)"]
    Prov --> Bind["identity-binding<br/>(dono, migração)"] --> IDB
  end
  subgraph Next["Servidor Next.js (Vercel)"]
    Proxy["src/proxy.ts<br/>refresh + proteção de rotas"]
    Actions["Server Actions<br/>cloud-actions.ts"]
    Confirm["GET /auth/confirm"]
    Session["GET /api/auth/session"]
  end
  Prov -->|"chamadas"| Actions
  Prov -->|"quem sou?"| Session
  Actions & Confirm & Session & Proxy -->|"cookies HttpOnly"| Auth[("Supabase Auth")]
  Actions -.->|"perfil (SQL 09)"| Supa[("public.profiles")]
```

**Regras desta fase:**

- os dados financeiros continuam no dispositivo; nada financeiro é enviado ao Supabase;
- o ingresso é Supabase Auth quando o Supabase está configurado, e a conta local quando não está;
- sem variáveis configuradas, a app comporta-se exatamente como antes do Step 12.

## Decisões

[ADR-006](decisions/ADR-006-supabase-hibrido.md) (Supabase + IndexedDB) substitui o [ADR-001](decisions/ADR-001-sem-base-de-dados.md). Decisões em aberto: [decisions/open-decisions.md](decisions/open-decisions.md).
