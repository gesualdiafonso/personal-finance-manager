# Personal Finance Manager (PFM)

Aplicação web de finanças pessoais: responsiva, instalável como PWA, single-user, em pesos argentinos (ARS), com o fuso horário `America/Argentina/Buenos_Aires`.

**Estado:** Step 01 — fundação técnica. Ainda não há funcionalidades financeiras: só a estrutura, o Design System aplicado, a arquitetura de dados JSON, o armazenamento local, a base da PWA, os testes e a CI. O relatório do Step 01 está em [`docs/reports/step-01-report.md`](docs/reports/step-01-report.md).

## Princípios que não se negociam

- **Sem base de dados** ([ADR-001](docs/decisions/ADR-001-sem-base-de-dados.md)). A fonte oficial são ficheiros JSON versionados neste repositório; cada dispositivo guarda os dados no seu IndexedDB.
- **Local-first** ([ADR-002](docs/decisions/ADR-002-local-first.md)). A app não escreve no GitHub e não tem credenciais. As alterações entram por exportação, `git commit` e `git push`.
- **Dados publicados sempre cifrados** ([ADR-003](docs/decisions/ADR-003-cifragem.md)). Nada de texto simples num artefacto público; a CI verifica-o.
- **O Design System aprovado manda** ([`docs/design-system/`](docs/design-system/README.md)). Os tokens são gerados de `tokens.json`; o tema do Tailwind está fechado aos valores do sistema; as fontes são locais ([ADR-004](docs/decisions/ADR-004-fontes-locais.md)).
- **Dinheiro em inteiros** (centavos). Nunca vírgula flutuante como valor de referência.

## Começar

Requisitos: Node.js 22.12 ou superior (`.nvmrc`), npm.

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
| `npm run data:validate` | Valida `data/` nas quatro camadas |
| `npm run schemas:build` / `schemas:check` | Gera / verifica `schemas/*.schema.json` a partir do Zod |
| `npm run tokens:build` / `tokens:check` | Gera / verifica `src/styles/tokens.css` a partir do Design System |
| `npm run guard:deps` | Falha se existir alguma dependência de base de dados ou ORM |
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
src/features/    dashboard/ (estado vazio), settings/ (aparência, dados locais)
src/lib/         config/, formatting/ (ARS, datas), validation/ (Zod), errors/, i18n/, utils/
src/services/    data/ (fontes de dados), storage/ (IndexedDB, LocalStorage), crypto/
src/styles/      tokens.css gerado, fontes WOFF2 locais
tests/           unit/, integration/, e2e/
```

As diferenças em relação à estrutura sugerida no Step 01 estão justificadas em [docs/architecture/overview.md](docs/architecture/overview.md).

## Em aberto

As secções 11–14 do brief original continuam **por verificar**: o documento completo não foi recebido e o conteúdo não foi presumido. As decisões ainda por tomar (OD-1 a OD-8, idioma) estão em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md).
