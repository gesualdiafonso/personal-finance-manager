# Step 08 — Relatório de testes (Informes)

Executado em 2026-11-24, Playwright com o Google Chrome local (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), build de produção. Só dados fictícios.

| Gate | Resultado |
| --- | --- |
| `npm run check` (dependências proibidas, ESLint, TypeScript, tokens, JSON Schemas, dados, migrações, changeset, testes) | ✓ código 0 |
| Unitários + integração | ✓ **358 testes, 36 ficheiros** (Step 07: 332) |
| `npm run build` | ✓ (`/informes` estático) |
| `npm run guard:artifacts` | ✓ 487 ficheiros sem dados em texto simples |
| E2E (desktop 1440×900 e iPhone 390×844) | ✓ **80 passados**, 2 ignorados por desenho (Step 07: 76) |

## Testes novos

- `tests/unit/reports.test.ts` (20): períodos, comparação (anterior, ano anterior, personalizado, 29/02, semana), tramos; receitas/despesas só completadas, por moeda, sem transferências/canceladas/eliminadas, pendentes à parte; filtros (subcategorias, conta como destino, tipo); evolução soma igual ao total; categorias (agregação, participação, ranking, comparação); fluxo de caixa (compra a crédito fora, transferência interna anulada, identidade de saldo, tramos +/−, filtro de conta); previsto sem duplicar pagamentos nem recorrências já geradas; contas; cartões (comprometido e uso do limite); orçamentos (pai+filho sem dupla contagem); metas (ritmo só com dados suficientes, acumulado); relatório inteiro e estados vazios; CSV (BOM, `;`, decimal, injeção de fórmulas, aspas) e JSON validado pelo schema.
- `tests/integration/reports-page.test.tsx` (6): estado vazio; moedas separadas e aportes a metas fora das receitas; todas as secções; filtros e período sem dados; releitura após alteração; exportação CSV/JSON (BOM, sem `fetch`) e impressão com todas as secções; o carregador não escreve.
- `tests/e2e/reports.spec.ts` (2 × desktop e iPhone): dados criados pela interface → valores; secções; filtro de conta; descargas CSV/JSON reais; modo de impressão sem navegação; sem scroll horizontal em todos os períodos e secções.
- Capturas e PDF impresso (dados fictícios): `docs/reports/step-08-ecras/`.
