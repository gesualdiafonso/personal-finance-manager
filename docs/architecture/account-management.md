# Gestão de contas — arquitetura

Reutiliza integralmente o motor de dados do Step 02. Não há segunda camada de persistência, mocks nem armazenamento temporário.

```text
/cuentas, /cuentas/[id]  (shell estático; dados lidos no cliente)
  └─ src/features/accounts/
       accounts-page.tsx          lista, resumo, estados
       account-detail-page.tsx    detalhe, factos, cartões associados, movimentos
       account-sheet.tsx          criar/editar/eliminar (sheet sobre <dialog>)
       initial-balance-dialog.tsx correção do saldo inicial (D3-04)
       account-form.ts            schema Zod do formulário → input do domínio
       data.ts / detail-data.ts   leitura numa transação IndexedDB só de leitura
  └─ src/hooks/use-local-data.ts  getLocalDb · useLocalQuery · mutate · notifyDataChanged
  └─ src/domain/rules/accounts.ts summarizeAccounts (usa deriveAccountBalances)
  └─ src/services/repositories/   repositório de contas (Step 02), countReferences
```

## Modelo

`Account` do Step 02 sem alterações: `id`, `name`, `institution`, `accountType`, `currency` (ARS · USD), `initialBalance` (centavos, pode ser negativo), `openingDate`, `status` (`active` · `archived`) e os campos de controlo (`rev`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId`). Ver [domain-models.md](domain-models.md).

## Leitura

`loadAccountsView(db)` lê `accounts`, `transactions`, `cards`, `bills`, `recurrences` e `outbox` numa transação, descarta (e conta) os registos que falham o schema, e calcula:

- saldos com `deriveAccountBalances` (regra central D2-04 e D4-08, com o tipo de cada cartão; nenhum cálculo paralelo);
- indicadores com `summarizeAccounts`: ativas, arquivadas, bancárias, em efetivo, saldo das ativas **por moeda**;
- referências com `countReferencesIn` (a mesma regra D2-06 do repositório);
- "Solo en este dispositivo" a partir das operações pendentes do `outbox`.

`loadAccountDetail(db, id)` acrescenta o saldo projetado (`mode: "projected"`), os cartões associados e os movimentos (`movementsOfAccount`).

## Escrita

Só por `mutate((repos) => repos.accounts.…)`: o repositório valida o registo completo, verifica referências e moedas, grava registo + operação do `outbox` numa transação e, depois, `notifyDataChanged` faz todas as consultas montadas (neste separador e noutros, via `BroadcastChannel` local) voltarem a ler.

| Operação | Chamada | Proteções |
| --- | --- | --- |
| Criar | `accounts.create(input)` | Formulário Zod (erros por campo) + schema do domínio; botão desativado e guarda contra duplo envio |
| Editar | `accounts.update(id, patch, rev)` | `CONFLICT` se a conta mudou; moeda bloqueada com referências (também no repositório) |
| Corrigir saldo inicial | `accounts.update(id, { initialBalance }, rev)` | Diálogo de confirmação com antes/depois; transações intocadas |
| Arquivar / reativar | `accounts.update(id, { status }, rev)` | — |
| Eliminar | `accounts.delete(id, rev)` | Só sem referências; confirmação; tombstone |

## Erros

`STORAGE_UNAVAILABLE` (sem IndexedDB) e falhas de leitura mostram o estado de erro com "Reintentar". Falhas de gravação mantêm o formulário aberto, com os valores, e uma mensagem sem dados financeiros.

## Segurança

Os dados ficam no IndexedDB **sem cifragem** (OD-3 decidida, por implementar). Nada sai do dispositivo; não há logs com valores; o nome e a instituição recusam números de cartão.
