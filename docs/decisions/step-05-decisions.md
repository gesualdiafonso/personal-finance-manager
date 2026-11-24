# Decisões do Step 05 — Bills & Recurrences

Propostas na auditoria do Step 05 e **aprovadas pelo responsável** ("autorizo", 2026-11-24). Continuam em aberto: ADR-005, OD-1, OD-2, OD-4, OD-7 e as secções 11–14 do brief original. A geração automática de ocorrências (D5-08/D5-09) volta a ser apresentada em detalhe antes de ser implementada, como pede o brief.

| ID | Decisão |
| --- | --- |
| D5-01 | **Schema 2.2.0, só acrescentos.** `Recurrence.frequency` + `daily`, `biweekly`, `quarterly`, `semiannual`; `Recurrence.cancelledAt?`, `Recurrence.notes?`; `Bill.description?`, `Bill.recurrenceId?`, `Bill.occurrenceDate?`. Os dados 2.0/2.1 continuam válidos sem migração. |
| D5-02 | Sem entidade `Payment`: um pagamento é uma despesa (`Transaction` com `billId`). Pago = soma dos pagamentos não cancelados; falta pagar = valor − pago, nunca negativo. Calculado. |
| D5-03 | `pending`, `paid`, `cancelled` guardados; **vencida** e **parcial** calculadas com a data de hoje em Buenos Aires. |
| D5-04 | O repositório mantém `paid` coerente com os pagamentos em qualquer gravação de uma transação com `billId`; marcar como paga à mão é recusado; a integridade confere. |
| D5-05 | Pagamento: valor positivo ≤ falta pagar, conta ativa da mesma moeda, conta a pagar pendente, proteção contra duplo envio, gravação atómica. |
| D5-06 | Anular um pagamento = cancelar a transação (política do Step 04). |
| D5-07 | Cancelar uma conta a pagar com pagamentos mantém os pagamentos (confirmação diz quantos). Eliminar só sem nenhum pagamento (nem cancelado). |
| D5-08 | Despesa recorrente → conta a pagar pendente; receita recorrente → transação pendente. Nunca movimentos concluídos automáticos. Sem duplicados: id determinístico + verificação no repositório. |
| D5-09 | Geração ao abrir a app e nas duas áreas; horizonte hoje + 30 dias; recuperação desde a criação da recorrência, máx. 12 por recorrência e execução; uma só operação. |
| D5-10 | Pausar = `isActive: false`; cancelar = `cancelledAt` (definitivo); editar só afeta ocorrências ainda não geradas. |
| D5-11 | Dia 29–31 → último dia dos meses curtos, sempre calculado a partir de `startDate`; 29/02 → 28/02; quinzenal = 14 dias; datas de calendário de Buenos Aires. |
| D5-12 | Manter "Cuentas domésticas" (`/cuentas-domesticas`) e "Recurrencias"; detalhe em sheet lateral; pagamento numa sheet própria. |
| D5-13 | Grupos Vencidas · Hoy · Próximos 7 días · Próximos 30 días · Después + vista de mês simples. Sem notificações. |
| D5-14 | Indicadores por moeda, sem cards de KPI. |
| D5-15 | Contas a pagar e recorrências de despesa usam categorias de despesa; recorrências de receita, de receita. |

## Pormenores de implementação (fase 1)

- **Conta a pagar fechada:** uma conta paga ou cancelada só muda as notas — garantido pelo repositório (`PROTECTED_OPERATION`), à semelhança da D4-03. Uma cancelada não se reabre.
- Conta para pagar arquivada: uma conta a pagar que já a usa mantém-na; não se pode passar a usar uma conta arquivada (como a D4-07).
- Uma recorrência referida por uma conta a pagar não se pode eliminar (`REFERRERS`).
- Não há índice `billId` no IndexedDB (mudá-lo exigiria a versão 3 da base local): a área lê as transações uma vez e filtra.
