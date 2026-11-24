# Gestão de cartões — arquitetura

```text
/tarjetas, /tarjetas/[id]
  └─ src/features/cards/
       cards-page.tsx            secções por tipo, resumo, estados
       card-detail-page.tsx      factos, datas, comprometido, compras
       card-sheet.tsx            criar/editar/eliminar; campos condicionais
       card-form.ts              schema Zod do formulário → input do domínio
       data.ts / detail-data.ts  leitura numa transação só de leitura
  └─ src/domain/rules/cards.ts   nextMonthlyDate · cardSchedule · summarizeCards
  └─ src/services/repositories/  repositório de cartões (Step 02 + regra da conta bloqueada)
```

## Modelo (schemaVersion 2.1.0)

`Card`: `accountId` (conta de pagamento), `name`, `cardType` (`credit` · `debit` · `prepaid`), `lastFourDigits` (4 dígitos ou nulo), `creditLimit`, `closingDay`, `dueDay`, `currency`, `status` (`active` · `inactive`) e campos de controlo.

- Crédito: `closingDay` e `dueDay` obrigatórios (1–31); limite opcional.
- Débito e pré-pago: limite, fecho e vencimento têm de ser nulos.
- A moeda é a da conta de pagamento (`CURRENCY_MISMATCH` no repositório).
- Objeto estrito: nenhum campo além destes (sem número completo, CVV, PIN ou credenciais).

## Regras

| Regra | Onde |
| --- | --- |
| Conta de pagamento existe e não está apagada | Repositório (`REFERENCE_CONSTRAINT`) e formulário |
| Conta de um cartão com movimentos não muda | Repositório (`REFERENCE_CONSTRAINT`) e formulário (campo bloqueado) |
| Eliminar só sem movimentos | Repositório (D2-06) e interface |
| Próximo fecho / vencimento | `nextMonthlyDate`: dia ajustado ao último dia do mês; aritmética de calendário em `AAAA-MM-DD`, sem relógio nem fuso do dispositivo (data de hoje em Buenos Aires) |
| Comprometido | `committedOnCards`: compras não canceladas com cartão de **crédito**, por cartão, na moeda do cartão (D4-08) |
| Limite total | Soma dos limites dos cartões de crédito **ativos**, por moeda; nunca somado a saldos nem chamado "disponível" |

## Limitações

- Desde o Step 04 (D4-08): compras com débito e pré-pago descontam da conta na data da compra; só as de crédito ficam como comprometido.
- Sem faturas (abertas, fechadas, pagas) nem crédito disponível: OD-8.
- Cartões migrados do 1.x podem ter `accountId: null`; a interface obriga a escolher conta na edição seguinte.
