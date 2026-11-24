# Repositórios de dados

Código: [`src/services/repositories/repositories.ts`](../../src/services/repositories/repositories.ts). Não são uma abstração de base de dados: são funções tipadas sobre os stores de trabalho do IndexedDB deste dispositivo.

## Interface

```ts
const repos = createRepositories({ db });           // cada chamada é a sua própria unidade de trabalho
await repos.transactions.getAll();                  // sem tombstones; { includeDeleted: true } para os incluir
await repos.transactions.getById(id);
const t = await repos.transactions.create(input);   // input sem campos de controlo
await repos.transactions.update(t.id, { amount: 200000 }, t.rev);  // rev esperado
await repos.transactions.delete(t.id, t.rev + 1);   // tombstone
```

Há um repositório por entidade: `accounts`, `cards`, `categories`, `bills`, `recurrences`, `budgets`, `transactions`.

## O que cada escrita faz

1. Constrói o registo **completo**. Os campos de controlo (`id`, `rev`, datas, `deviceId`) são postos aqui; o chamador não os pode alterar (`VALIDATION_FAILED`).
2. Valida-o com o schema Zod da entidade.
3. Verifica as regras contra os stores: referências existentes e não apagadas (`REFERENCE_CONSTRAINT`), mesma moeda (`CURRENCY_MISMATCH`), tipo da categoria, conta pagadora do cartão, árvore de categorias, orçamentos só em categorias de despesa.
4. Grava o registo **e** a operação do `outbox` na **mesma transação** IndexedDB.

Se qualquer passo falhar, nada é gravado.

## Regras

| Situação | Resultado |
| --- | --- |
| `id` já existe | `DUPLICATE_ID` |
| Transação igual a outra (data, tipo, valor, moeda, conta, descrição normalizada) | `POSSIBLE_DUPLICATE` com o id da outra; aceita-se com `{ allowPossibleDuplicate: true }` |
| `rev` diferente do esperado | `CONFLICT` (alguém alterou o registo entretanto) |
| Apagar conta, cartão ou categoria com referências | `REFERENCE_CONSTRAINT` — arquivar (`status: archived`) ou desativar (`inactive`, `isActive: false`) (D2-06) |
| Mudar a moeda de uma conta ou cartão com referências | `REFERENCE_CONSTRAINT` |
| Apagar | Tombstone: `deletedAt` preenchido, `rev` + 1; o registo fica no store e viaja na exportação |
| Transações (Step 04) | Tipo imutável; cancelado só muda notas; só se apagam pendentes/cancelados; contas arquivadas e cartões inativos recusados em movimentos novos — ver [transaction-engine.md](transaction-engine.md) |

## Unidade de trabalho

```ts
await unitOfWork({ db }, async (r) => {
  const account = await r.accounts.create({...});
  await r.transactions.create({ ...input, accountId: account.id });
});
```

Todas as escritas da função ficam numa só transação: ou entram todas ou nenhuma. Dentro dela só se pode esperar (`await`) por chamadas aos repositórios; esperar por outra coisa (rede, temporizadores) fecha a transação do IndexedDB, e a escrita seguinte falha com `STORAGE_FAILURE` sem deixar nada a meio.

## Operações protegidas

`clearLocalData(db, { confirmation: "BORRAR-DATOS-LOCALES" })` apaga os stores de trabalho, o snapshot, as publicações, as settings e o `outbox`. Sem a confirmação literal → `PROTECTED_OPERATION`. Com alterações por exportar, também exige `discardPendingChanges: true`. O `legacy_v1` nunca é apagado.

## Testes

`tests/integration/repositories.test.ts` (criação, validação, referências, moedas, transferências num registo, duplicados, árvore de categorias, concorrência, tombstones, D2-06, unidade de trabalho atómica, operações protegidas).
