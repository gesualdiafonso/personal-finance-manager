# Linha de base — Step 11 (2026-11-28)

Estado do projeto **antes** de qualquer trabalho de migração para Supabase. Executado nesta árvore de trabalho, Node 22, Next.js 16.4.6, Playwright 1.65 (Chromium, desktop 1440×900 e iPhone 390×844).

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Guardas de dependências (ADR-001: sem `@supabase/*`, ORMs, MongoDB…) | `npm run guard:deps` (dentro de `check`) | PASS |
| Lint, TypeScript, tokens, esquemas JSON, dados de exemplo, migrações, changeset | `npm run check` | PASS |
| Testes unitários e de integração | `npm test` (dentro de `check`) | **PASS — 418 testes, 39 ficheiros** (ver nota) |
| Build de produção | `npm run build` | PASS — 17 rotas, todas estáticas (`○`) |
| Artefactos públicos sem dados em claro | `npm run guard:artifacts` | PASS — 570 ficheiros |
| Vulnerabilidades | `npm audit` | PASS — 0 |
| E2E (build de produção) | `npx playwright test` | **PASS — 101 passados, 2 ignorados por desenho** |

**Nota — teste intermitente encontrado e corrigido.** Na primeira execução, `tests/integration/currency-exchange.test.tsx › edits rates, persists them and converts live` falhou uma vez (418 → 417). Passou em seis execuções isoladas. A causa estava no próprio teste: guardava uma referência ao conversor antes de o formulário de Configuración se remontar ao guardar, e, numa máquina carregada, continuava a consultar o nó antigo. Agora volta a consultar o conversor depois da remontagem; a asserção não mudou. Com a correção: `npm run check` verde (418/418). É a única alteração de código de teste neste step.

**Não alterado neste step:** código da aplicação, dependências, `package-lock.json`, configuração de produção (`next.config.ts`, Vercel), variáveis de ambiente, IndexedDB.
