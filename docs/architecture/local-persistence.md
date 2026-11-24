# Persistência local

Dois mecanismos do navegador, com papéis que não se misturam (decisão D1):

| Mecanismo | Guarda | Não guarda nunca |
| --- | --- | --- |
| **IndexedDB** (`pfm-local`) | Dados financeiros: a última publicação, as alterações locais, as Financial Settings | Frase-passe, chaves, sal |
| **LocalStorage** | Quatro preferências leves e não financeiras | Valores, descrições, saldos, frase-passe, chaves |

O IndexedDB é uma API de armazenamento do navegador neste dispositivo: não é um serviço de base de dados, não tem servidor e não sincroniza. A biblioteca `idb` é só um invólucro tipado de Promises.

> **O IndexedDB não está cifrado.** Guardar localmente não é cifrar. A cifragem em repouso (OD-3) está decidida — "recordar neste dispositivo" — mas ainda não implementada ([segurança dos dados](data-security.md)). Um teste (`tests/unit/data-security.test.ts`) confirma que os registos ficam legíveis, para que ninguém o presuma.

## IndexedDB versão 3 — [`src/services/storage/local-store.ts`](../../src/services/storage/local-store.ts)

| Store | Chave | Índices | Conteúdo |
| --- | --- | --- | --- |
| `accounts` | `id` | `status` | **Stores de trabalho** (D2-05): a última publicação com as alterações locais aplicadas. É aqui que os repositórios leem e escrevem. |
| `cards` | `id` | `accountId` | |
| `categories` | `id` | `parentId`, `type` | |
| `bills` | `id` | `dueDate`, `accountId` | |
| `recurrences` | `id` | `accountId` | |
| `budgets` | `id` | `startDate`, `categoryId` | |
| `transactions` | `id` | `date`, `accountId`, `destinationAccountId`, `categoryId`, `cardId`, `status`, `type` | |
| `goals` | `id` | `status` | Metas de poupança (v3, Step 06) |
| `goalContributions` | `id` | `goalId`, `transactionId` | Aportes às metas (v3, Step 06) |
| `snapshot` | `key` | — | A última publicação exatamente como foi importada (os seus ficheiros) |
| `outbox` | `seq` | `recordId`, `exportedIn`, `entity` | Cada alteração local, por ordem: `create` · `update` · `delete`, com `baseRev` e o registo completo |
| `publications` | `dataRevision` | — | Histórico de publicações importadas (`meta`) |
| `settings` | `key` | — | Financial Settings |
| `device` | `key` | — | `deviceId` deste dispositivo |
| `legacy_v1` | `id` | — | Registos da versão 1 postos de parte na atualização (nunca apagados) |

**v2 → v3 (Step 06):** só cria `goals` e `goalContributions`, vazias; nenhum registo é movido; fica uma entrada `{ from: 2, to: 3 }` em `migration_log`.
| `migration_log` | `id` | — | Registo das atualizações de versão |
| `rollback` | `key` | — | O estado imediatamente antes da última importação aplicada (um nível de anular) |

## Operações

- `openLocalStore()` — cria ou atualiza. Falha → `STORAGE_UNAVAILABLE`.
- `importPublication(db, dataSet, files)` — **numa única transação**: guarda o `snapshot`, reconstrói os stores de trabalho, guarda as settings e a publicação, e reaplica o `outbox`. As operações já integradas (o seu changeset está em `meta.appliedChangesets`) saem do `outbox`. Uma operação cujo `baseRev` já não corresponde é marcada `conflict` e **não** é aplicada: os conflitos nunca se resolvem em silêncio. Recusa revisões mais antigas, exceto com `allowRestore`.
- `getLocalStoreStatus`, `countPendingOperations`, `getFinancialSettings`, `ensureDeviceId`, `readWorkingDataSet`.
- `checkLocalIntegrity` — cada registo volta a passar no schema; referências, moedas, árvore de categorias e ids verificados com as mesmas regras de `data/`; `outbox` válido e com sequência crescente. Os problemas só nomeiam stores, ids e regras.
- Escritas: pelos [repositórios](data-repositories.md). Exportação, importação e anular: [importação/exportação](data-import-export.md).

## Atualização da versão 1 (Step 01) para a 2

Os registos da versão 1 usam o formato 1.x. Na atualização, **todos** (stores oficiais, `outbox` e `publications`) são copiados sem alterações para `legacy_v1`, os stores antigos são recriados no formato 2 e fica um registo em `migration_log` com as contagens. Nada é apagado; o `deviceId` mantém-se. Os stores de trabalho ficam vazios até à próxima publicação ou importação 2.x. Coberto por `tests/integration/local-store.test.ts`.

Cada versão nova acrescenta um passo `if (oldVersion < N)` no `upgrade` e nunca pode apagar o `outbox` nem o `legacy_v1`.

## LocalStorage — [`src/services/storage/preferences.ts`](../../src/services/storage/preferences.ts)

Sem alterações no Step 02. Lista fechada de chaves validadas por Zod: `pfm.theme`, `pfm.obligations.lastArea`, `pfm.quickAdd.lastAccountId`, `pfm.dashboard.period`. Leituras e escritas protegidas por `try/catch`.
