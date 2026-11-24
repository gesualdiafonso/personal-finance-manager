# Versionamento e migrações

## Três números diferentes

| Número | Onde | Significado |
| --- | --- | --- |
| `schemaVersion` | Todos os ficheiros de `data/` e das exportações | Formato dos dados (semver). Atual: **2.0.0** (`SCHEMA_VERSION`, `DATA_COMPATIBILITY`) |
| `dataRevision` | `meta.json` | Revisão dos dados publicados. Só sobe. |
| `LOCAL_DB_VERSION` | IndexedDB | Estrutura dos stores no dispositivo. Atual: **2** |

## Compatibilidade — [`src/lib/validation/compatibility.ts`](../../src/lib/validation/compatibility.ts)

`classifySchemaVersion(v)`:

- `current` — mesmo major (2.x): lê-se.
- `needs-migration` — major mais antigo (1.x): recusado com "migrar primeiro (`npm run data:migrate`)".
- `unsupported-future` — major mais novo (3.x): recusado com "atualizar a aplicação". **Nunca se faz downgrade.**

## Migrações — [`src/services/versioning/data-migrations.ts`](../../src/services/versioning/data-migrations.ts)

Cada migração é `{ from, to, description, migrate(files, ctx) }`, registada em `DATA_MIGRATIONS`. `migrateDataFiles` aplica-as em cadeia e:

- **não descarta registos:** cada registo de entrada fica como registo ou é absorvido noutro com o id guardado em `legacyIds`; a contagem `antes = depois + absorvidos` é verificada;
- **não adivinha:** se falta informação, pára com `MIGRATION_BLOCKED` e diz o que é preciso;
- **valida o resultado** nas quatro camadas antes de o devolver;
- **é idempotente:** dados já atuais voltam iguais (`changed: false`);
- **produz um relatório** com versões, contagens, campos renomeados, valores por omissão aplicados, fusões e avisos — nunca valores nem descrições.

### 1.0.0 → 2.0.0

| 1.x | 2.0 |
| --- | --- |
| `openingBalanceMinor`, `amountMinor`, `limitMinor` | `initialBalance`, `amount`, `creditLimit` (D2-01) + `currency` = a moeda do `meta` 1.x (ARS) |
| `kind` | `type` |
| `last4` | `lastFourDigits` |
| transação `status: paid` | `completed` |
| orçamento `period: "AAAA-MM"` | `period: "monthly"`, `startDate`, `endDate`, `name` = nome da categoria |
| transferência em duas pernas com `transferId` | **um** registo com `destinationAccountId` (D2-03); a perna de entrada fica em `legacyIds` |
| `meta.currency/minorUnit/timezone` | `data/settings.json` |
| `checksums.sumMinor` | `amountSum` |

Valores por omissão: contas `accountType: other`, `status: active`; categorias sem pai, ativas; cartões `cardType: credit`, `accountId: null` (aviso: completar à mão); faturas sem categoria; recorrências ativas.

**Transferências:** o 1.x não guardava a direção. A migração exige-a por transferência (`--transfer <transferId>=<contaDeOrigem>`); sem ela pára com `MIGRATION_BLOCKED` e lista as transferências e contas em causa.

```bash
npm run data:migrate -- [dir] [--out <dir>] [--transfer <transferId>=<accountId> ...]
npm run data:migrate -- --check      # a CI falha se data/ não estiver na versão atual
```

Os dados de exemplo foram migrados assim (`--transfer 0193a1b0-000e-…=0193a1b0-0001-…`, a perna "salida" na Conta A). O exemplo 1.x fica em `tests/fixtures/v1/` para os testes.

## IndexedDB 1 → 2

Ver [persistência local](local-persistence.md#atualização-da-versão-1-step-01-para-a-2): os registos v1 vão para `legacy_v1`, nunca são apagados.
