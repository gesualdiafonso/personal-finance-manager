# Panel (`/`)

Implementado no Step 07, segundo [dashboard.md](../design-system/dashboard.md) do Design System (sem mudanças de tokens, tipografia ou navegação).

## O que mostra

| Bloco | Conteúdo | Origem do cálculo |
| --- | --- | --- |
| Cabeçalho | Saudação (hora de Buenos Aires), data, título do período, seletor Semana · Mes · Trimestre · Año com ‹ › e "Volver a hoy" | `dashboardPeriod`, `shiftPeriod` |
| Saldo disponível | Saldo atual das contas ativas, por moeda (a base em destaque, as outras "sin convertir"); barra da parte de cada conta. Num período passado: saldo no fim desse período | `summarizeAccounts`, `balancesAt` |
| Período | Ingresos, Gastos, Resultado (completados) por moeda; pendentes à parte | `periodFlow` → `incomeAndExpenses` |
| Faixa de obrigações | Por pagar (contas domésticas, vencidas a vermelho), gastos pendentes, comprometido em cartões; atalhos "Registrar gasto", "Pagar una cuenta", "Ver tarjetas" | `summarizeBills`, `pendingExpenses`, `summarizeCards` |
| A vencer | Contas domésticas pendentes (vencidas primeiro, com o que falta pagar) e ocorrências de recorrências de gasto nos próximos 30 dias | `upcomingObligations` |
| Fluxo do período | Gráfico (Recharts) de ingresos e gastos por tramo — dias (semana, mês), semanas (trimestre), meses (ano) — e a linha do saldo das contas até hoje; uma moeda de cada vez; tabela equivalente para leitores de ecrã | `flowSeries` |
| Transações recentes | As 8 mais recentes (sem canceladas): descrição, categoria, data, conta, tipo, valor com sinal; clique abre o detalhe (editar, cancelar) | `recentTransactions`, `TransactionDetailSheet` |
| Presupuestos | Os em curso, por percentagem usada, com estado, barra, ritmo do período e disponível/excedido (no telemóvel, os três mais perto do limite) | `budgetUsage`, `periodElapsedPercent` |
| Metas | Ativas: ahorrado, barra, falta, data prevista | `goalProgress` |
| Cuentas y tarjetas | Saldo por conta; por cartão: tipo, comprometido, disponível (crédito com limite), próximo vencimento | `summarizeAccounts`, `summarizeCards`, `cardSchedule` |

## Regras

- Nunca soma moedas; cada indicador aparece por moeda.
- Transferências, canceladas e eliminadas nunca contam como receitas ou despesas.
- Pendentes ficam fora do saldo atual e dos totais, indicados à parte.
- Compras com cartão de crédito: despesa na data da compra, comprometido no cartão, nunca descontadas da conta (D4-08). Ainda não há faturas nem pagamento de fatura (OD-8, step próprio), por isso não há dupla contagem.
- Pagamentos de contas domésticas são transações: a conta em si nunca entra nas despesas; o "por pagar" é o que falta depois dos pagamentos.
- Aportes a metas não são transações: nunca aparecem como receitas ou despesas.
- Uma ocorrência de recorrência já representada por uma conta doméstica ou transação não aparece duas vezes.
- Nada é guardado: tudo é derivado numa leitura do IndexedDB. Qualquer alteração (neste separador ou noutro) relê o Panel; mudar o período recalcula sem reler.
- A granularidade escolhida fica em LocalStorage (`pfm.dashboard.granularity`), como preferência leve.

## Navegação

Contas → `/cuentas/<id>`; cartões → `/tarjetas/<id>`; orçamentos e metas → `/presupuesto#presupuestos/<id>` e `#metas/<id>` (abrem o detalhe); contas domésticas e recorrências → as suas áreas; transações → detalhe na sheet do Panel, "Ver todas" → `/transacciones`.

## Estados

Carregamento com esqueletos e o cabeçalho real; erro com "Reintentar"; primeiro uso com o estado vazio aprovado ("$ 0", "Agrega la primera cuenta para empezar."); cada bloco sem dados tem a sua frase e uma ligação para criar.

Ficheiros: `src/domain/rules/dashboard.ts`, `src/features/dashboard/` (`dashboard-page.tsx`, `data.ts`, `flow-chart.tsx`, `empty-dashboard.tsx`).
