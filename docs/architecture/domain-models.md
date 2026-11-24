# Modelos de domínio (schemaVersion 2.1.0)

Fonte de verdade: os schemas Zod em [`src/domain/schemas.ts`](../../src/domain/schemas.ts). Os ficheiros `schemas/*.schema.json` são gerados a partir deles (`npm run schemas:build`) e a CI falha se divergirem. Esta página resume-os; em caso de dúvida, manda o código.

Decisões aplicadas: D2-01 a D2-11 ([Step 02](../decisions/step-02-decisions.md)) e D3-01 ([Step 03](../decisions/step-03-decisions.md): cartão pré-pago, 2.1.0). Continuam em aberto: ADR-005 (idioma), OD-1, OD-2, OD-4, OD-7 e OD-8 (OD-3 e OD-5 decididas, por implementar).

## Regras comuns

- **Campos de controlo** em todos os registos: `id` (UUID; novos registos usam UUIDv7), `rev` (≥ 1, sobe a cada alteração), `createdAt`, `updatedAt`, `deletedAt` (ISO 8601 com fuso; `deletedAt ≠ null` = registo apagado, *tombstone*), `deviceId`.
- **Objetos estritos:** um campo desconhecido é um erro.
- **Dinheiro:** inteiros em centavos (`amount`, `initialBalance`, `creditLimit`) dentro de `Number.MAX_SAFE_INTEGER`. Decimais são recusados. Cada valor tem a sua `currency`.
- **Moedas (D2-02):** `ARS` e `USD`, ambas com 2 casas decimais ([`src/domain/currency.ts`](../../src/domain/currency.ts)). Uma transação, fatura, recorrência ou orçamento tem a moeda da sua conta/cartão. Não há conversões: transferências entre moedas diferentes são recusadas e os totais são sempre por moeda.
- **Datas financeiras:** datas de calendário `AAAA-MM-DD` (Buenos Aires), validadas como datas reais (`2026-02-30` é recusado).
- **Textos livres** nunca podem conter um número de cartão (12–19 dígitos seguidos, com ou sem espaços/hífenes).

## Entidades

| Entidade | Campos próprios | Regras |
| --- | --- | --- |
| **Account** | `name`, `institution?`, `accountType` (`checking` · `savings` · `cash` · `investment` · `other`), `currency`, `initialBalance` (pode ser negativo), `openingDate?`, `status` (`active` · `archived`) | `currentBalance` é **derivado**, nunca guardado (D2-10). Com referências, só se arquiva (D2-06). |
| **Card** | `accountId?` (conta pagadora), `name`, `cardType` (`credit` · `debit` · `prepaid`), `lastFourDigits?` (exatamente 4 dígitos), `creditLimit?`, `closingDay?`, `dueDay?`, `currency`, `status` (`active` · `inactive`) | Crédito exige `closingDay` e `dueDay`; débito e pré-pago não têm limite nem dias. Nunca se guarda o número completo. `accountId = null` só em cartões migrados do 1.x (aviso de validação). |
| **Transaction** | `type` (`income` · `expense` · `transfer`), `description`, `amount` (> 0), `currency`, `categoryId?`, `accountId`, `destinationAccountId?`, `cardId?`, `date`, `status` (`pending` · `completed` · `cancelled`), `notes?`, `billId?`, `recurrenceId?`, `legacyIds?` | Transferência = **um registo** com `destinationAccountId` ≠ `accountId`, sem categoria nem cartão (D2-03). Só transferências têm destino. Receitas não usam cartão. A categoria tem o tipo da transação. Com cartão, `accountId` é a conta pagadora do cartão. |
| **Category** | `name`, `type` (`income` · `expense`), `parentId?`, `icon?`, `color?`, `isDefault`, `isActive` | Árvore com 2 níveis no máximo, filho com o tipo do pai, sem ciclos. `icon` e `color` guardam-se mas **nunca se mostram** (D2-09). |
| **Bill** (conta doméstica) | `name`, `categoryId?`, `amount`, `currency`, `dueDate`, `accountId?`, `status` (`pending` · `paid` · `cancelled`), `notes?` | Moeda da conta, quando há conta. |
| **Recurrence** | `description`, `amount`, `currency`, `type` (`income` · `expense`), `frequency` (`weekly` · `monthly` · `yearly`), `startDate`, `endDate?`, `categoryId?`, `accountId`, `isActive` | `nextOccurrence` é **derivado** (D2-10): dia 31 → último dia dos meses curtos; 29/02 → 28/02 em anos não bissextos. |
| **Budget** | `name`, `categoryId` (despesa), `amount` (≥ 0), `currency`, `period` (`monthly` · `yearly` · `custom`), `startDate`, `endDate` | Mensal = dia 1 ao último dia de um mês; anual = 1/1 a 31/12. |
| **FinancialSettings** | `baseCurrency`, `timezone` (IANA), `locale`, `firstDayOfWeek` (`monday` · `sunday`), `numberFormat` | Ficheiro `data/settings.json`. Separado das preferências de interface (LocalStorage). Valores aprovados: ARS, `America/Argentina/Buenos_Aires`, `es-AR`, segunda-feira, `es-AR`. |

## Regras de saldo ([`src/domain/rules/balances.ts`](../../src/domain/rules/balances.ts))

| Transação | Efeito |
| --- | --- |
| `income` | `+amount` em `accountId` |
| `expense` | `−amount` em `accountId` |
| `transfer` | `−amount` em `accountId` e `+amount` em `destinationAccountId`; nunca conta como receita nem despesa |

- **Estado (D2-04):** `completed` conta no saldo atual; `pending` só no saldo projetado; `cancelled` nunca. Registos apagados nunca contam.
- **Compras com cartão (OD-8, D4-08):** débito e pré-pago descontam da conta na data da compra; crédito não mexe no saldo da conta e aparece em `committedOnCards` ("comprometido em cartões"). Todas contam como despesa nos totais de receitas/despesas. Detalhe em [financial-calculations.md](financial-calculations.md).
- **Totais por moeda:** `incomeAndExpenses` e `totalsByCurrency` devolvem um valor por moeda; somar ARS com USD lança `CURRENCY_MISMATCH`.

## Dinheiro no código ([`src/domain/money.ts`](../../src/domain/money.ts))

`Money = { amount: MinorUnits; currency }`, com `addMoney`, `subtractMoney`, `negateMoney`, `sumMoney`, `compareMoney`, `equalsMoney` e `totalsByCurrency`. Todas recusam misturar moedas. A formatação faz-se com `formatCurrencyAmount` (`$` para ARS, `US$` para USD, formato es-AR).
