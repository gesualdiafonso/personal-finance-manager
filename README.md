# AUREON — Personal Financial Intelligence

*Wealth is built with intention.*

AUREON (antes Personal Finance Manager) é uma aplicação web de finanças pessoais: responsiva, instalável como PWA, single-user e **local-first**, multimoeda (ARS como moeda principal por omissão; USD, EUR, BRL, UYU, CLP, PYG, GBP), com conversões explícitas e rotuladas como estimativa ([docs/features/currency-exchange.md](docs/features/currency-exchange.md)), no fuso horário `America/Argentina/Buenos_Aires`. Interface em espanhol (es-AR).

**Estado (Step 10 — release final):** Panel, Transacciones, Cuentas, Tarjetas, Cuentas domésticas (fase 1: gestão, sem pagamentos), Presupuesto (orçamentos e metas), Configuración, identidade AUREON com tema claro e escuro. Por fazer: pagamentos de contas domésticas, recorrências (interface e geração), faturas de cartão, relatórios (Informes) e cifragem local. Relatório final: [docs/testing/step-10-final-qa.md](docs/testing/step-10-final-qa.md).

## Arquitetura em poucas linhas

- **Dados locais hoje, Supabase em preparação** ([ADR-006](docs/decisions/ADR-006-supabase-hibrido.md)). Cada dispositivo guarda os dados financeiros no seu **IndexedDB**; o LocalStorage só guarda preferências leves (tema, período do Panel). Desde o Step 12 existem os clientes Supabase, a validação do ambiente e um health check, mas **nada financeiro vai para a nuvem e ainda não há tabelas nem RLS** ([arquitetura: implementado vs. planeado](docs/ARCHITECTURE.md)).
- **Ingresso** ([Supabase Auth](docs/architecture/supabase-auth.md), Step 14): com o Supabase configurado, conta com email e password, email verificado, recuperação por email e sessão em cookies `HttpOnly` geridos pelo servidor; as páginas privadas são recusadas no servidor sem sessão. Cada identidade tem a sua base local e a conta local antiga migra-se de forma assistida. **Sem Supabase configurado**, mantém-se a [conta local do dispositivo](docs/architecture/authentication.md) (PBKDF2), igual ao Step 10. Os dados financeiros continuam no dispositivo em ambos os modos.
- Todas as páginas são **estáticas**: o servidor (Vercel ou `next start`) só entrega HTML, JS e CSS; nenhum dado financeiro passa por ele.
- A fonte oficial opcional são ficheiros JSON versionados em `data/` (aqui só exemplos **fictícios**); a app nunca escreve no GitHub. Dados publicados são sempre cifrados ([ADR-003](docs/decisions/ADR-003-cifragem.md)).
- **Dinheiro em inteiros** (centavos), sempre com moeda; nunca vírgula flutuante como valor.
- **O armazenamento local não está cifrado** (OD-3 decidida, por implementar): usar só dados fictícios até lá ([segurança](docs/architecture/data-security.md)).

## Começar

Requisitos: Node.js 22 (≥ 22.22.2, fixado em `.nvmrc`) ou 24 (≥ 24.15.0); npm 10 ou 11. Não há variáveis de ambiente obrigatórias. Com as do Supabase, o ingresso passa a ser Supabase Auth; sem elas, conta local ([.env.example](.env.example), [ENVIRONMENT.md](docs/ENVIRONMENT.md), [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)).

```bash
npm ci
npm run dev                 # http://localhost:3000 (sem service worker)
npm run build && npm start  # produção local (gera public/sw.js antes do build)
```

| Comando | O que faz |
| --- | --- |
| `npm run check` | Todas as verificações rápidas, como na CI: dependências proibidas, ESLint, TypeScript strict, tokens, JSON Schemas, dados de exemplo, migrações, changeset e testes |
| `npm test` | Vitest: testes unitários e de integração (jsdom + fake-indexeddb) |
| `npm run test:e2e` | Playwright sobre o build de produção (desktop 1440×900 e iPhone 390×844) |
| `npm run lint` / `npm run typecheck` | ESLint / tipos de rotas + `tsc --noEmit` |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run guard:artifacts` | Falha se houver dados em texto simples nos artefactos públicos (depois do build) |
| `npm run tokens:build` | Gera `src/styles/tokens.css` a partir de `docs/design-system/tokens.json` |
| `npm run icons:build` | Gera os ícones PNG da PWA a partir do monograma AUREON |
| `npm run data:validate` · `data:migrate` · `data:checksums` · `data:changeset` | Ferramentas dos ficheiros de dados |

Mais detalhe: [instalação](docs/development/setup.md), [testes](docs/development/testing.md), [ambiente](docs/development/environment.md), [deploy na Vercel](docs/deployment/VERCEL.md).

## Estrutura

```text
data/            dados oficiais versionados (aqui: só exemplos FICTÍCIOS)
schemas/         JSON Schema gerados a partir do Zod
docs/            branding/ (AUREON), design-system/, architecture/, features/, deployment/, decisions/, testing/, reports/
public/          brand/ (logótipos SVG), icons/ (PWA), sw.js (gerado no build)
scripts/         tokens, schemas, dados, service worker, ícones, guardas da CI
src/app/         rotas (App Router): as nove áreas, offline, manifest, ícone
src/components/  brand/ (logótipo), ui/, layout/ (sidebar, rail, tab bar, cabeçalho móvel), shared/
src/domain/      modelos Zod, dinheiro, regras (saldos, transações, contas a pagar, orçamentos, metas, Panel)
src/features/    accounts, cards, transactions, bills, planning, dashboard, settings
src/services/    storage/ (IndexedDB, LocalStorage), repositories/, data/, exchange/, versioning/, crypto/
src/styles/      tokens.css gerado, fontes WOFF2 locais (Manrope, Cormorant Garamond)
tests/           unit/, integration/, e2e/, fixtures/
```

## Documentação

- Marca: [identidade](docs/branding/BRAND-IDENTITY.md) · [cores](docs/branding/COLOR-SYSTEM.md) · [tipografia](docs/branding/TYPOGRAPHY.md) · [logótipo](docs/branding/LOGO-SYSTEM.md) · [interface](docs/branding/UI-BRANDING.md) · [Design System](docs/design-system/README.md)
- Funcionalidades: [Panel](docs/features/dashboard.md) · [Contas](docs/features/accounts.md) · [Cartões](docs/features/cards.md) · [Transações](docs/features/transactions.md) · [Orçamentos](docs/features/budgets.md) · [Metas](docs/features/financial-goals.md)
- **Migração para Supabase (Steps 12–14 feitos; restante por implementar):** [Supabase Auth](docs/architecture/supabase-auth.md) · [checklist do painel (§11)](docs/SUPABASE_SETUP.md#11-checklist-manual-do-step-14-alterações-exatas-no-painel) · [decisões do Step 14](docs/decisions/step-14-auth-decisions.md) · [configuração no painel](docs/SUPABASE_SETUP.md) · [ambiente](docs/ENVIRONMENT.md) · [**scripts SQL para o SQL Editor**](database/sql/README.md) · [diagrama de entidades](docs/database/ERD.md) · [ADR-006](docs/decisions/ADR-006-supabase-hibrido.md) · [auditoria do Step 11](docs/audit/STEP-11-ARCHITECTURE-AUDIT.md) · [blueprint e roteiro 12–20](docs/audit/supabase-blueprint.md) · [mapeamento PostgreSQL](docs/audit/postgresql-mapping.md)
- Arquitetura: [visão geral](docs/architecture/overview.md) · [autenticação e perfil](docs/architecture/authentication.md) · [cálculos financeiros](docs/architecture/financial-calculations.md) · [persistência local](docs/architecture/local-persistence.md) · [versionamento](docs/architecture/data-versioning.md) · [importação/exportação](docs/architecture/data-import-export.md) · [segurança](docs/architecture/data-security.md) · [PWA](docs/architecture/pwa.md)
- Decisões em aberto (OD-1, OD-2, OD-4, OD-7, ADR-005, secções 11–14 do brief original): [open-decisions.md](docs/decisions/open-decisions.md)
