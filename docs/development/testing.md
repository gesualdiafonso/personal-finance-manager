# Testes

| Tipo | Ferramenta | Onde | Comando |
| --- | --- | --- | --- |
| Unitários | Vitest 5 + jsdom + React Testing Library | `tests/unit/` | `npm test` |
| Integração (IndexedDB, fonte publicada) | Vitest + `fake-indexeddb` | `tests/integration/` | `npm test` |
| E2E | Playwright (Chromium, desktop 1440×900 e iPhone 390×844) | `tests/e2e/` | `npm run test:e2e` |
| Tipos | `next typegen` + `tsc --noEmit` (strict) | — | `npm run typecheck` |
| Lint | ESLint (regras do Next.js + importações proibidas) | — | `npm run lint` |
| Dados | Zod, quatro camadas | `data/` | `npm run data:validate` (`-- --only <camada>`) |
| Migrações | `data/` na versão atual + testes 1.0.0 → 2.0.0 | `tests/unit/migrations.test.ts` | `npm run data:migrate -- --check`, `npm run test:migrations` |
| Changesets | Formato, hash e aplicação em memória | `tests/fixtures/changesets/` | `npm run data:changeset -- <f>` |
| Schemas | Zod → JSON Schema, sem divergências | `schemas/` | `npm run schemas:check` |
| Tokens | `tokens.json` → `tokens.css`, sem divergências | `src/styles/` | `npm run tokens:check` |
| Guardas | Sem BD/ORM/armazenamento remoto/escrita no GitHub; sem texto simples nos artefactos | — | `npm run guard:deps`, `npm run guard:artifacts` |

## Fuso horário nos testes

Os testes **não** correm no fuso de Buenos Aires. O Vitest corre com `TZ=Asia/Tokyo` e o Playwright com `timezoneId: "Asia/Tokyo"`. Isso prova que a app usa `America/Argentina/Buenos_Aires` qualquer que seja o fuso do dispositivo. Um teste de datas que só passa em Buenos Aires está errado.

## E2E

Os testes E2E correm sobre o **build de produção** (o service worker, as fontes e o manifest só se comportam como em produção):

```bash
npm run build
npm run test:e2e
```

O Playwright arranca `next start` na porta 3200 (`E2E_PORT`). Na CI, o Chromium instala-se com `npx playwright install --with-deps chromium`. Localmente, podes apontar para um Chrome que já tenhas com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/caminho/para/chrome`.

**Limite conhecido:** os projetos "iphone" simulam a viewport e o toque em **Chromium**, não em Safari/WebKit. A verificação em Safari num iPhone real fica pendente (ver o relatório do Step 01).

## O que cada critério do Step 01 testa

| Critério | Testes |
| --- | --- |
| Formatação ARS e precisão | `tests/unit/money.test.ts`, `design-system.test.tsx` (`<Money>`) |
| Datas e fuso | `tests/unit/date.test.ts`, E2E "shows today in Buenos Aires…" |
| Validação JSON | `tests/unit/data-validation.test.ts`, `npm run data:validate` |
| Compatibilidade de versões | `tests/unit/compatibility.test.ts` |
| IndexedDB | `tests/integration/local-store.test.ts`, E2E "IndexedDB" |
| Persistência do tema | `tests/unit/theme.test.tsx`, E2E "theme preference" |
| Fontes locais sem Google Fonts | E2E "local fonts" |
| Manifest e service worker | E2E "PWA groundwork" |
| Design System (tokens) | `tests/unit/design-system.test.tsx`, `npm run tokens:check` |
| Cifragem | `tests/unit/crypto.test.ts`, `tests/integration/published-source.test.ts` |

## O que cada área do Step 02 testa

| Área | Testes | Comando |
| --- | --- | --- |
| Dinheiro, moedas, saldos, categorias, recorrências, ids | `tests/unit/domain.test.ts`, `money.test.ts` | `npm run test:domain` |
| Validação e compatibilidade de versões | `tests/unit/data-validation.test.ts`, `compatibility.test.ts` | `npm run test:data` |
| IndexedDB v2, atualização v1 → v2, publicações, repositórios | `tests/integration/local-store.test.ts`, `repositories.test.ts` | `npm run test:repositories` |
| Migrações de dados | `tests/unit/migrations.test.ts` | `npm run test:migrations` |
| Importação, exportação, changesets, fonte publicada | `tests/integration/exchange.test.ts`, `published-source.test.ts` | `npm run test:exchange` |
| Segurança (falhas do pacote cifrado, nada cifrado em silêncio) | `tests/unit/data-security.test.ts`, `crypto.test.ts` | `npm run test:security` |

Todos os testes usam só dados fictícios (`EJEMPLO-FICTICIO`).
