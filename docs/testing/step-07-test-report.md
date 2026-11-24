# Step 07 — Relatório de testes (Panel)

Executado em 2026-11-24, Node 22.23.5, Playwright 1.65.1 (Chromium), build de produção. Só dados fictícios.

| Gate | Resultado |
| --- | --- |
| `npm run check` (dependências proibidas, ESLint, TypeScript, tokens, JSON Schemas, dados, migrações, changeset, testes) | ✓ código 0 |
| Unitários + integração | ✓ **332 testes, 34 ficheiros** (Step 06: 320) |
| `npm run build` | ✓ |
| `npm run guard:artifacts` | ✓ 477 ficheiros sem dados em texto simples |
| E2E (desktop 1440×900 e iPhone 390×844) | ✓ **76 passados**, 2 ignorados por desenho; `platform` + `dashboard` repetidos 3× sem falhas |

## Testes novos

- `tests/unit/dashboard.test.ts` (8): períodos e deslocação entre anos; receitas/despesas/resultado só com completados, por moeda, sem transferências, canceladas nem eliminadas, pendentes à parte; filtro de período; saldos por moeda (a transferência não muda o total, compra a crédito não sai da conta); série do gráfico por granularidade, saldo só até hoje e soma igual ao resumo (sem duplicar); recentes; gastos pendentes; "a vencer" sem repetir uma ocorrência já representada por uma conta doméstica.
- `tests/integration/dashboard-page.test.tsx` (4): estado vazio; moedas separadas, aportes a metas fora das receitas, atualização após uma alteração nos dados; filtro de período e preferência guardada; o carregador não escreve e o comprometido dos cartões vem das compras.
- `tests/e2e/dashboard.spec.ts` (2 × desktop e iPhone): estado vazio → contas e movimentos pela interface → valores do Panel; detalhe de uma transação recente, cancelada no Panel, e os indicadores atualizam; filtros Año e período anterior; navegação para conta e orçamentos; sem scroll horizontal em todas as granularidades.

## Ajustes a testes existentes (nenhum removido)

`tests/unit/theme.test.tsx`: a lista fechada de preferências passa a incluir `pfm.dashboard.granularity` (e um teste de validação dessa chave).
