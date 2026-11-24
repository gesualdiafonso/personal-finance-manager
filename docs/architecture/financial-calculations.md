# Cálculos financeiros

Todos os cálculos estão em `src/domain/` e trabalham com **centavos inteiros** (`Money = { amount, currency }`). Somar moedas diferentes lança `CURRENCY_MISMATCH`. Os saldos são **sempre derivados** dos registos; nada guarda um saldo.

## Efeito de uma transação numa conta — `balanceEffect`

| Transação | Conta `accountId` | Conta `destinationAccountId` |
| --- | --- | --- |
| income | +amount | — |
| expense | −amount | — |
| expense com cartão de **crédito** | 0 (comprometido no cartão) | — |
| expense com cartão de **débito/pré-pago** | −amount | — |
| transfer | −amount | +amount |

Um cartão cujo tipo não se conhece é tratado como crédito (nunca tira dinheiro de uma conta por engano).

## Estados — D2-04

| Estado | Saldo atual | Saldo projetado | Totais de receitas/despesas |
| --- | --- | --- | --- |
| completed | conta | conta | conta |
| pending | não | conta | só com o filtro "Pendientes" |
| cancelled | não | não | nunca |
| apagado (tombstone) | não | não | nunca |

## Fórmulas

- **Saldo atual** (`deriveAccountBalance`) = `initialBalance` + Σ efeitos dos completados.
- **Saldo projetado** = `initialBalance` + Σ efeitos de completados e pendentes.
- **Receitas / despesas / neto** (`incomeAndExpenses`, `summarizeTransactions`) — por moeda; transferências nunca entram. Uma compra com crédito **é** despesa nos totais (na data da compra), mesmo sem mexer na conta.
- **Comprometido em cartões** (`committedOnCards`) — compras não canceladas, só cartões de crédito.
- **Reconciliação** (`reconcileAccount`) — saldo inicial + receitas − despesas (sem crédito) + transferências recebidas − enviadas; tem de ser igual ao saldo atual, e nenhum movimento pode estar noutra moeda. Mostrada em "Cómo se calcula el saldo" e verificada em Configuração → Datos locales.
- **Impacto de uma edição** (`editImpact`) — saldo de cada conta afetada (antiga, nova, os dois lados de uma transferência) com o registo antigo e com o novo, pela mesma derivação.

## Exemplo (dados fictícios de `data/`)

Conta A, ARS: 1.000.000,00 inicial + 3.450.000,00 receita − 42.310,00 despesa − 10.000,00 transferência = **4.397.690,00**. Fora: 1 pendente (5.000,00, conta no projetado → 4.392.690,00), 1 cancelada, 1 compra com crédito (18.140,00, comprometido).

## Datas

Datas financeiras são datas de calendário de Buenos Aires (`toLocalDate`). Os períodos (`periodRange`) são aritmética de calendário em UTC sobre `AAAA-MM-DD`: o fuso do dispositivo nunca decide o dia.
