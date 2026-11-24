# Informes (`/informes`)

Implementado no Step 08, arquétipo **Análise** do Design System ([arquitetura.md](../design-system/arquitetura.md)): gráfico primeiro, a toda a largura, com seletor de período e comparação; tabela de suporte por baixo. Responde a "¿Cómo evolucioné?". Sem mudanças de tokens, tipografia ou navegação global.

## Controlo do período e filtros

| Controlo | Valores |
| --- | --- |
| Período | Semana · Mes · Trimestre · Año (‹ › e "Volver a hoy", como no Panel) · Personalizado (Desde/Hasta) |
| Comparar con | Período anterior equivalente (o mês anterior, o trimestre anterior…; personalizado → os mesmos dias imediatamente antes) · Mismo período del año anterior (semana: 52 semanas antes) |
| Categoría | A categoria e as subcategorias |
| Cuenta | Movimentos da conta como origem ou destino |
| Tipo | Todos · Ingresos · Gastos · Transferencias |
| Moneda | Só aparece com mais de uma moeda; ARS e USD nunca se somam nem se convertem |

Datas de calendário de Buenos Aires (`toLocalDate`), nunca a hora do dispositivo. No iPhone, categoria/conta/tipo dobram atrás de "Más filtros".

## Secções (separadores sublinhados)

| Secção | Conteúdo | Seletor (`src/domain/rules/reports.ts`) |
| --- | --- | --- |
| Ingresos y gastos | Evolução mensal (12 meses), tabela período × comparação × variação, "Dónde se fue el dinero" (top 5) | `incomeExpenseReport`, `flowByBucket`, `categoryBreakdown` |
| Flujo de caja | Entradas/saídas por tramo com a linha do saldo; saldo inicial, variação, saldo final; tramos positivos e negativos; previsto até ao fim do período (pendentes, contas domésticas por pagar, recorrências ainda não geradas) | `cashFlowReport`, `expectedInRange` |
| Categorías | Ranking de gastos (e de receitas quando há) com participação e variação | `categoryBreakdown` |
| Cuentas | Evolução do saldo (da conta filtrada ou da soma na moeda); por conta: saldos inicial/final, receitas, despesas, compras a crédito à parte, transferências, distribuição das operações | `accountsReport`, `cashFlowReport` |
| Tarjetas | Compras por cartão (e pendentes), comparação, comprometido, uso do limite e a sua evolução | `cardsReport` |
| Presupuestos | Barras orçado × utilizado, execução, acima do orçamento, período anterior | `budgetsReport` (reutiliza `budgetUsage`, `budgetHistory`) |
| Metas | Aportes por tramo e acumulado; progresso, falta, aportado no período, ritmo observado e estimativa | `goalsReport`, `goalSeries` (reutiliza `goalProgress`) |

`src/services/reports/build-report.ts` (`buildReport`) monta o relatório inteiro a partir de uma leitura do IndexedDB (`src/features/reports/data.ts`). A página, os exportadores e a impressão renderizam **o mesmo objeto**.

## Regras

- Receitas/despesas: só movimentos **completados**; pendentes à parte; transferências, canceladas e eliminadas nunca contam.
- Compra com cartão de crédito: despesa na data da compra (uma vez), nunca saída da conta no fluxo de caixa; ainda não há faturas nem pagamento de fatura (OD-8), por isso não há dupla contagem. A secção Tarjetas di-lo explicitamente.
- Pagamentos de contas domésticas são despesas; a conta doméstica nunca é somada. No "previsto", um pagamento pendente já conta como pago para a conta (D5-02) e só aparece como gasto pendente.
- Aportes a metas não são receitas nem despesas.
- Variação percentual contra zero não é mostrada ("sin datos para comparar"). Período em curso marcado como provisório; o ritmo de uma meta precisa de pelo menos dois aportes em 90 dias.
- Filtros de categoria/tipo aplicam-se a receitas/despesas, categorias e compras com cartão; contas, fluxo de caixa, orçamentos e metas ignoram-nos (os saldos incluem todos os movimentos) e a página avisa.
- Sem donuts nem tartes (regra **P-10** do Design System): a distribuição por categoria é um ranking de barras com percentagens. O brief pedia donut/pie; prevalece a regra.

## Exportação (D8-05)

| Botão | Ficheiro | Formato |
| --- | --- | --- |
| CSV de transacciones | `pfm-informe-<desde>_<hasta>-transacciones.csv` | UTF-8 com BOM, `;`, CRLF, decimal com vírgula + coluna em centavos; fórmulas neutralizadas (`'=`…) |
| CSV del informe | `…-resumen.csv` | Uma linha por número: secção, moeda, conceito, detalhe, valor, centavos, comparação, participação |
| JSON | `…-informe.json` | `pfm.report` v1, validado por `reportDocumentSchema` (Zod): período, comparação, filtros, moedas, `amountUnit: "minor"`, `encrypted: false`, notas |
| Imprimir o guardar PDF | diálogo do navegador | Todas as secções, cabeçalho com período, moeda, data e "No está cifrado"; sem navegação; gráficos com largura fixa para A4 |

Tudo é gerado no navegador (Blob + `URL.createObjectURL`, revogado logo a seguir). Nada é enviado nem gravado em `public/`. A interface avisa ao lado dos botões que os ficheiros contêm dados financeiros e **não estão cifrados**.

Ficheiros: `src/domain/rules/reports.ts`, `src/services/reports/` (`build-report.ts`, `export.ts`), `src/features/reports/` (`reports-page.tsx`, `sections.tsx`, `charts.tsx`, `ui.tsx`, `data.ts`).
