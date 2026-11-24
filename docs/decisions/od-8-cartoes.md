# OD-8 — Compras com cartão, saldos e faturas

**Estado:** decidida em parte pelo responsável em 2026-11-24. **Ainda não implementada**: até ao step que a implementar, o código mantém a regra provisória D2-11 (nenhuma compra com cartão mexe no saldo da conta; aparecem como "comprometido").

## Decidido

| Tema | Decisão |
| --- | --- |
| Cartão de débito | A compra é uma despesa da conta de pagamento **na data da compra**, como uma despesa normal. Sem fatura nem "comprometido". |
| Cartão pré-pago | Igual ao débito: desconta da conta associada na data da compra. O saldo próprio do cartão não é modelado. |
| Cartão de crédito | **Modelo por fatura**: as compras acumulam-se na fatura aberta até ao dia de fecho (compra depois do fecho → fatura seguinte); ao fechar, a fatura fica com total e data de vencimento; o **pagamento** da fatura é um movimento da conta para o cartão e é o único que desconta da conta, marcando a fatura como paga. |
| Relatórios | A despesa conta na data da compra, por categoria; o pagamento da fatura não é despesa (sem dupla contagem). |
| Crédito disponível | Passa a existir: limite − o que está por pagar. O detalhe do cartão passa a ser por fatura (aberta, fechada, paga), como no Design System. |
| Moeda | Cada fatura na sua moeda, sem conversão (D2-02). |

## Em aberto

| Tema | Pergunta |
| --- | --- |
| Cuotas | Uma compra em N prestações reparte-se por N faturas: implementar já com as faturas, ou depois? |
| Pagamento parcial / mínimo | O que não se paga passa para a fatura seguinte. Os juros registam-se à mão, ou ficam de fora? |
| Devoluções | Proposta: abatem na fatura aberta. Por confirmar explicitamente. |

## Impacto quando for implementada

- Substitui D2-11 nas regras de saldo (`src/domain/rules/balances.ts`) e nos indicadores de cartões.
- Novo modelo de fatura (schema 2.x, aditivo ou não — a definir no plano do step) e regras de fecho/vencimento já existentes (`src/domain/rules/cards.ts`).
- Os dados de exemplo e os testes de saldo mudam (o cartão de débito passa a descontar da conta).
