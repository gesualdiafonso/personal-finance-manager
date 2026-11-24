# Motor de transações

Reutiliza o modelo, o repositório e a persistência do Step 02. Não há segunda camada de persistência nem cálculos nos componentes.

```text
/transacciones (shell estático)
  └─ src/features/transactions/
       transactions-page.tsx   estado da página (filtros, período, ordem), entradas globais
       list-data.ts            leitura do período pelo índice `date` (uma transação só de leitura)
       form-data.ts            contas/cartões ativos, categorias por uso
       transaction-form.ts     formulário → input do domínio (erros em espanhol)
       transaction-sheet.tsx   criar e editar (QuickAdd), pré-visualização do impacto
       transaction-detail.tsx  detalhe, cancelar, eliminar, notas de um cancelado
       edit-impact.ts          lê os dados e pede o impacto ao domínio
       ledger.tsx · filters-bar.tsx · summary.tsx · new-transaction.ts
  └─ src/domain/rules/
       balances.ts             efeito no saldo (D2-04, D4-08), derivação, totais
       transactions.ts         períodos, pesquisa, filtros, ordenação, resumo, política, editImpact
       reconciliation.ts       decomposição do saldo e verificação
  └─ src/services/repositories/repositories.ts   escrita + regras (abaixo)
```

## Modelo

`Transaction` (schema 2.1.0): `type` (income · expense · transfer), `description`, `amount` (> 0, centavos), `currency`, `categoryId?`, `accountId`, `destinationAccountId?` (só transferências), `cardId?` (só despesas), `date` (calendário de Buenos Aires), `status` (pending · completed · cancelled), `notes?`, `billId?`, `recurrenceId?` e campos de controlo. Ver [domain-models.md](domain-models.md).

## Escrita (repositório)

Cada `create`/`update`/`delete` valida o registo completo e grava registo + operação do `outbox` numa só transação IndexedDB. Para transações aplica ainda:

| Regra | Erro |
| --- | --- |
| Referências existentes, mesma moeda, categoria do mesmo tipo, conta = conta do cartão | `REFERENCE_CONSTRAINT`, `CURRENCY_MISMATCH`, `VALIDATION_FAILED` |
| Conta arquivada / cartão inativo em movimento novo ou referência alterada (D4-07) | `REFERENCE_CONSTRAINT` |
| Possível duplicado (sem `allowPossibleDuplicate`) | `POSSIBLE_DUPLICATE` |
| Versão desatualizada (concorrência, reversões repetidas) | `CONFLICT` |
| Mudar o tipo (D4-01) | `PROTECTED_OPERATION` |
| Alterar um cancelado além das notas (D4-03) | `PROTECTED_OPERATION` |
| Eliminar um completado (D4-04) | `PROTECTED_OPERATION` |

**Atomicidade:** uma transferência é um único registo, por isso não pode ficar meio aplicada. Várias escritas juntas usam `unitOfWork`: ou entram todas ou nenhuma (testado com uma falha a meio).

**Cancelar** é um `update` de estado: o registo fica, a reversão é a ausência do efeito no saldo derivado, e o rasto é a operação no `outbox` (com a revisão anterior), que segue no changeset.

## Leitura

`loadTransactionList(db, range)` usa `IDBKeyRange.bound(from, to)` sobre o índice `date`: só o período escolhido sai do IndexedDB. Filtros, pesquisa, ordenação e resumo são funções puras do domínio sobre esse período; a interface só mostra. A pesquisa espera 250 ms (`useDebouncedValue`).

## Interface e atualização

Leituras com `useLocalQuery`, escritas com `mutate`; depois de cada escrita, todas as consultas montadas voltam a ler (e outros separadores do mesmo dispositivo, por `BroadcastChannel` local). "Gravado" só aparece depois da escrita terminar; duplo clique grava uma vez.

## Segurança

Nenhum dado sai do dispositivo; mensagens de erro sem valores; textos recusam números de cartão. **O IndexedDB não está cifrado** (OD-3 decidida, por implementar) — só dados fictícios.

## Limitações

- Faturas de cartão de crédito, cuotas, pagamento de fatura, crédito disponível e devoluções (OD-8): step próprio.
- Transferências entre moedas: sem modelo de câmbio.
- Movimentos com `billId`/`recurrenceId` não se criam por esta interface (Steps de contas domésticas e recorrências).
