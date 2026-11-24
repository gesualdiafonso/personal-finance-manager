# Arquitetura de dados JSON

A fonte oficial são ficheiros JSON em `data/`, num repositório privado (ADR-001, ADR-002). Não há base de dados, ORM nem persistência remota. Os modelos estão em [modelos de domínio](domain-models.md).

> Neste repositório, `data/` contém **apenas dados fictícios** marcados `EJEMPLO-FICTICIO` ([data/README.md](../../data/README.md)). Foram gerados pela migração 1.0.0 → 2.0.0 a partir de `tests/fixtures/v1/` e depois completados com exemplos de USD, cartão, pendente e cancelado.

## Ficheiros

```text
data/
  meta.json                            versão do formato, revisão, changesets integrados, somas de controlo
  settings.json                        Financial Settings (moeda base, fuso, locale, 1.º dia da semana, formato)
  accounts.json  categories.json  cards.json  bills.json  recurrences.json
  budgets/<AAAA>.json                  orçamentos pelo ano de startDate
  transactions/<AAAA>/<AAAA-MM>.json   transações pelo mês de date
```

Cada ficheiro tem o envelope `{ schema, schemaVersion, records }` (mais `period` em orçamentos e transações). `settings.json` tem `{ schema: "pfm.settings", schemaVersion, settings }`. `meta.json` deixou de ter moeda e fuso (passaram para `settings.json`); as somas de controlo são `{ count, amountSum }` por ficheiro.

JSON Schema gerados (`schemas/`): `meta`, `settings`, `account`, `card`, `category`, `transaction`, `bill`, `recurrence`, `budget` (`*.schema.json`).

## Validação em quatro camadas — [`src/services/data/dataset.ts`](../../src/services/data/dataset.ts)

Usada pela CLI, pela CI, pelas fontes de dados, pela migração, pela importação e pela verificação local do IndexedDB.

| Camada | `--only` | Verifica |
| --- | --- | --- |
| 1. Estrutura | `structure` | Schema Zod de cada ficheiro; `schemaVersion` atual (um 1.x pede migração, um 3.x pede atualizar a app); ficheiros obrigatórios (incluindo `settings.json`); nenhum ficheiro inesperado; `period` coerente com o caminho |
| 2. Referências | `references` | Referências a registos existentes e não apagados; mesma moeda entre transação, conta, destino e cartão (D2-02); tipo da categoria; conta pagadora do cartão; árvore de categorias |
| 3. Unicidade | `uniqueness` | Nenhum `id` repetido em todo o `data/`; partição por mês/ano; **avisos** de possível duplicado (mesma data, tipo, valor, moeda, conta e descrição normalizada) |
| 4. Invariantes | `invariants` | Somas de controlo de `meta.json` iguais às calculadas (I-10) |

Os **avisos** são mostrados mas não fazem falhar. As mensagens nunca contêm valores nem descrições: só ficheiros, ids, campos e regras.

```bash
npm run data:validate                        # todas as camadas
npm run data:validate -- --only references   # uma camada (a CI corre as quatro em passos com nome)
npm run data:checksums                       # recalcula meta.json depois de uma edição deliberada (recusa dados inválidos)
```

## Revisões

`dataRevision` só sobe. O dispositivo recusa uma publicação mais antiga (`DATA_REVISION_REGRESSION`), exceto num restauro explícito. Versões do formato: [versionamento](data-versioning.md).

## Fontes de dados — [`src/services/data/sources.ts`](../../src/services/data/sources.ts)

`OfficialDataSource.load()` devolve sempre um conjunto validado ou lança `AppError`: `createFileMapSource` (ficheiros em memória) e `createPublishedSource` (manifesto → hash → desencriptar → validar → revisão; ainda não ligado à interface, porque não existe publicação: OD-1, OD-7).

## Fluxo das alterações

1. A app guarda as alterações no IndexedDB e no `outbox` ([persistência local](local-persistence.md), [repositórios](data-repositories.md)).
2. A app exporta-as num *changeset* em JSON ([importação/exportação](data-import-export.md)).
3. O responsável verifica-o com `npm run data:changeset -- <ficheiro>`, integra-o **à mão** em `data/` (D2-08), corre `npm run data:checksums` e `npm run data:validate`, e faz commit e push.
4. A CI valida e, quando a OD-1/OD-7 estiverem decididas, publica o pacote cifrado.
