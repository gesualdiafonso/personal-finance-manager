# Arquitetura de dados JSON

A fonte oficial são ficheiros JSON em `data/`, num repositório privado (ADR-001, ADR-002). Os schemas Zod em `src/lib/validation/schemas.ts` são a fonte de verdade do formato. `schemas/*.schema.json` é **gerado** a partir deles (`npm run schemas:build`), e a CI falha se divergirem.

> Neste repositório, `data/` contém **apenas dados fictícios** marcados `EJEMPLO-FICTICIO` ([data/README.md](../../data/README.md)).

A referência completa aprovada no Step 00 é o documento "PFM - Arquitetura de Dados". Esta página descreve o que está **implementado**.

## Ficheiros

```text
data/
  meta.json                         versão do formato, revisão, moeda, fuso, somas de controlo
  accounts.json  categories.json  cards.json  bills.json  recurrences.json
  budgets/<AAAA>.json               orçamento por ano
  transactions/<AAAA>/<AAAA-MM>.json  transações por mês
```

Cada ficheiro tem um envelope `{ schema, schemaVersion, records }` (mais `period` em orçamentos e transações). Cada registo tem os campos de controlo `id` (UUID), `rev`, `createdAt`, `updatedAt`, `deletedAt` (apagar = marcar) e `deviceId`.

**Campos provisórios.** Além dos campos de controlo, os campos de cada entidade (cartões, contas domésticas, recorrências…) são o mínimo necessário para testar a fundação. As regras de negócio estão em aberto (OD-8) e podem depender das secções 11–14 do brief.

## Dinheiro

- Sempre inteiros em centavos (`amountMinor`, `openingBalanceMinor`, `limitMinor`), dentro de `Number.MAX_SAFE_INTEGER`.
- `42310.00` é recusado na validação (invariante I-01). O sinal de uma transação vem de `kind`; o valor é sempre positivo.
- Formatação: `src/lib/formatting/money.ts` divide por inteiros (sem dividir em vírgula flutuante) e aplica o formato es-AR: `$ 4.812.340,56`, `−$ 48.300`.

## Validação em quatro camadas

Implementada em `src/services/data/dataset.ts` e usada tanto por `npm run data:validate` (CI) como pela app em qualquer importação:

| Camada | Verifica |
| --- | --- |
| 1. Estrutura | Schema Zod de cada ficheiro, `schemaVersion` compatível, ficheiros obrigatórios presentes, nenhum ficheiro inesperado, `period` coerente com o caminho |
| 2. Referências | `accountId`, `categoryId`, `cardId`, `billId` e `recurrenceId` apontam para registos existentes e não apagados (I-05) |
| 3. Unicidade e partição | Nenhum `id` repetido em todo o `data/`; cada transação no ficheiro do seu mês e cada orçamento no do seu ano (I-06) |
| 4. Invariantes | Transferências com duas pernas iguais em contas diferentes (I-03); somas de controlo de `meta.json` iguais às calculadas (I-10); moeda única ARS com 2 casas (I-02, no schema) |

As mensagens de erro nunca contêm valores nem descrições: só ficheiros, ids, campos e regras.

## Versões e compatibilidade

- `schemaVersion` (semver). Esta build escreve `1.0.0` e lê `1.x` (`DATA_COMPATIBILITY` em `src/lib/config/app.ts`). Um major diferente é recusado com `INCOMPATIBLE_SCHEMA_VERSION`.
- `dataRevision` só sobe. Uma revisão mais antiga é recusada (`DATA_REVISION_REGRESSION`), exceto num restauro explícito.

## Fontes de dados

`src/services/data/sources.ts` define `OfficialDataSource.load()`, que devolve sempre um conjunto **validado** ou lança `AppError`:

- `createFileMapSource(files)` — ficheiros já em memória (validador da CLI, testes, importação de ficheiro).
- `createPublishedSource({ manifestUrl, passphrase, … })` — lê o manifesto, descarrega o pacote, verifica o hash, desencripta, valida as quatro camadas e verifica a revisão. **Ainda não está ligado à interface**, porque não existe nenhuma publicação.

## Separação entre dados oficiais e registos locais

Os stores oficiais do IndexedDB contêm exatamente a última publicação validada e só são substituídos por inteiro. As alterações locais vão apenas para o `outbox`. Ver [persistência local](local-persistence.md).

## O que falta (passos seguintes)

- Publicação cifrada pela CI (depende de OD-1, OD-2, OD-7).
- Formato e aplicação dos conjuntos de alterações (`changes/inbox`, OD-4) e cifragem das exportações (OD-5).
- Regras de negócio das entidades (OD-8, brief §11–14).
