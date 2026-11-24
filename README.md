# Personal Finance Manager (PFM)

Aplicação web de finanças pessoais: responsiva, instalável como PWA, single-user, em pesos argentinos (ARS) e dólares (USD, sem conversões), com o fuso horário `America/Argentina/Buenos_Aires`.

**Estado:** Step 04 — Transações: registo, lista, pesquisa, filtros, detalhe, edição, cancelamento e reconciliação, sobre contas e cartões (Step 03) e o motor de dados (Step 02, schemaVersion 2.1.0). Faturas de cartão de crédito ainda não. Relatórios: [Step 01](docs/reports/step-01-report.md), [Step 02](docs/reports/step-02-report.md), [Step 03](docs/reports/step-03-report.md), [Step 04](docs/reports/step-04-report.md). Funcionalidades: [Contas](docs/features/accounts.md) · [Cartões](docs/features/cards.md) · [Transações](docs/features/transactions.md).

## Princípios que não se negociam

- **Sem base de dados** ([ADR-001](docs/decisions/ADR-001-sem-base-de-dados.md)). A fonte oficial são ficheiros JSON versionados neste repositório; cada dispositivo guarda os dados no seu IndexedDB.
- **Local-first** ([ADR-002](docs/decisions/ADR-002-local-first.md)). A app não escreve no GitHub e não tem credenciais. As alterações entram por exportação, `git commit` e `git push`.
- **Dados publicados sempre cifrados** ([ADR-003](docs/decisions/ADR-003-cifragem.md)). Nada de texto simples num artefacto público; a CI verifica-o.
- **O Design System aprovado manda** ([`docs/design-system/`](docs/design-system/README.md)). Os tokens são gerados de `tokens.json`; o tema do Tailwind está fechado aos valores do sistema; as fontes são locais ([ADR-004](docs/decisions/ADR-004-fontes-locais.md)).
- **Dinheiro em inteiros** (centavos), sempre com moeda. Nunca vírgula flutuante como valor de referência.
- **O armazenamento local não está cifrado** (OD-3 decidida — "recordar neste dispositivo" —, por implementar): só dados fictícios até estar implementado ([segurança dos dados](docs/architecture/data-security.md)).

## Começar

Requisitos: Node.js 22 (≥ 22.22.2) ou 24 (≥ 24.15.0); o `.nvmrc` fixa o 22, como a CI. O Node 25 não é suportado. npm 10 ou 11.

```bash
npm ci
npm run dev          # http://localhost:3000
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (sem service worker) |
| `npm run build` / `npm start` | Build de produção (gera `public/sw.js` antes) e servidor |
| `npm run lint` | ESLint |
| `npm run typecheck` | Tipos de rotas do Next.js + `tsc --noEmit` (strict) |
| `npm test` | Vitest: testes unitários e de integração |
| `npm run test:e2e` | Playwright sobre o build de produção (corre `npm run build` antes) |
| `npm run data:validate` | Valida `data/` nas quatro camadas (`-- --only <camada>` para uma) |
| `npm run data:migrate` | Migra `data/` para a versão atual (`-- --check` só verifica) |
| `npm run data:checksums` | Recalcula as somas de controlo de `meta.json` |
| `npm run data:changeset -- <f>` | Verifica um changeset exportado contra `data/`, sem escrever |
| `npm run test:domain` · `test:data` · `test:repositories` · `test:migrations` · `test:exchange` · `test:security` | Grupos de testes (passos com nome na CI) |
| `npm run schemas:build` / `schemas:check` | Gera / verifica `schemas/*.schema.json` a partir do Zod |
| `npm run tokens:build` / `tokens:check` | Gera / verifica `src/styles/tokens.css` a partir do Design System |
| `npm run guard:deps` | Falha se existir dependência de base de dados, ORM, armazenamento remoto ou cliente de escrita no GitHub |
| `npm run guard:artifacts` | Falha se houver dados em texto simples nos artefactos públicos (depois do build) |
| `npm run check` | Todas as verificações rápidas, como na CI |

Mais detalhe: [instalação](docs/development/setup.md), [testes](docs/development/testing.md), [ambiente](docs/development/environment.md).

## Estrutura

```text
data/            dados oficiais versionados (aqui: só exemplos FICTÍCIOS)
schemas/         JSON Schema gerados a partir do Zod
docs/            design-system/ (aprovado), architecture/, development/, decisions/, reports/
scripts/         tokens, schemas, validação de dados, service worker, ícones, guardas da CI
src/app/         rotas (App Router): as nove áreas, offline, manifest, erros
src/components/  ui/ (shadcn/ui personalizado), layout/ (sidebar, rail, tab bar), shared/
src/domain/      modelos Zod, dinheiro e moedas, regras (saldos, categorias, recorrências), ids
src/features/    accounts/, cards/, movements/, transactions/, dashboard/ (estado vazio), settings/ (aparência, dados locais)
src/hooks/       use-local-data (leituras/escritas pelos repositórios), use-detail-id
src/lib/         config/, formatting/ (ARS, datas), validation/ (Zod), errors/, i18n/, utils/
src/services/    data/ (validação, fontes), storage/ (IndexedDB, LocalStorage), repositories/, exchange/ (importação/exportação), versioning/ (migrações), crypto/
src/styles/      tokens.css gerado, fontes WOFF2 locais
tests/           unit/, integration/, e2e/, fixtures/ (exemplo 1.x, changeset fictício)
```

As diferenças em relação à estrutura sugerida no Step 01 estão justificadas em [docs/architecture/overview.md](docs/architecture/overview.md).

## Em aberto

As secções 11–14 do brief original continuam **por verificar**: o documento completo não foi recebido e o conteúdo não foi presumido. As decisões ainda por tomar (OD-1 a OD-8, idioma) estão em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md); as aprovadas no Step 02 em [step-02-decisions.md](docs/decisions/step-02-decisions.md).

Arquitetura de dados: [JSON](docs/architecture/json-data-architecture.md) · [modelos](docs/architecture/domain-models.md) · [repositórios](docs/architecture/data-repositories.md) · [persistência local](docs/architecture/local-persistence.md) · [importação/exportação](docs/architecture/data-import-export.md) · [versionamento](docs/architecture/data-versioning.md) · [segurança](docs/architecture/data-security.md).
