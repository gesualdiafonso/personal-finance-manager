# Persistência local

Dois mecanismos do navegador, com papéis que não se misturam (decisão D1):

| Mecanismo | Guarda | Não guarda nunca |
| --- | --- | --- |
| **IndexedDB** (`pfm-local`) | Dados financeiros: a última publicação importada e as alterações locais por exportar | Frase-passe, chaves |
| **LocalStorage** | Quatro preferências leves e não financeiras | Valores, descrições, saldos, frase-passe, chaves |

O IndexedDB é uma API de armazenamento do navegador neste dispositivo: não é um serviço de base de dados, não tem servidor e não sincroniza. A biblioteca `idb` é só um invólucro tipado de Promises sobre essa API.

## IndexedDB — `src/services/storage/local-store.ts`

**Versão 1** (`LOCAL_DB_VERSION`):

| Store | Chave | Índices | Conteúdo |
| --- | --- | --- | --- |
| `accounts`, `categories`, `cards`, `recurrences` | `id` | — | Registos oficiais |
| `bills` | `id` | `dueDate` | Registos oficiais |
| `budgets` | `id` | `period`, `categoryId` | Registos oficiais |
| `transactions` | `id` | `date`, `accountId`, `categoryId`, `status`, `cardId` | Registos oficiais |
| `outbox` | `seq` (incremental) | `recordId`, `exportedIn` | Operações locais (`create`, `update`, `delete`) |
| `publications` | `dataRevision` | — | Histórico de importações (`meta` incluído) |
| `device` | `key` | — | `deviceId` deste dispositivo |

**Operações disponíveis:**

- `openLocalStore()` — abre e cria ou atualiza. Uma falha dá `STORAGE_UNAVAILABLE`.
- `replaceOfficialData(db, dataSet)` — substitui todos os stores oficiais e regista a publicação **numa única transação**. Recusa revisões mais antigas. Nunca toca no `outbox`.
- `appendLocalOperation(db, op)` — valida e acrescenta ao `outbox`. Os stores oficiais não são alterados.
- `getLocalStoreStatus`, `countPendingOperations`, `ensureDeviceId`.
- `buildBackup` / `restoreBackup` — base de exportação e importação (todos os stores e o `outbox`, validados, restaurados numa transação). **Sem interface de descarga no Step 01**: a cifragem das exportações (OD-5) tem de ser decidida antes de algum ficheiro sair do dispositivo.
- `checkLocalIntegrity` — cada registo oficial volta a passar no schema, ids únicos entre stores, `outbox` válido e com sequência crescente.

**Atualizações de versão:** cada versão nova acrescenta um passo `if (oldVersion < N)` no `upgrade` e nunca pode apagar o `outbox`.

**Em aberto:** a cifragem em repouso (OD-3) não está implementada; os registos ficam como dados estruturados no dispositivo. Por isso, `data/` só tem dados fictícios até esta decisão estar tomada.

## LocalStorage — `src/services/storage/preferences.ts`

Lista fechada de chaves, cada uma validada por Zod ao ler e ao escrever:

| Chave | Valores |
| --- | --- |
| `pfm.theme` | `system` · `paper` · `dark` |
| `pfm.obligations.lastArea` | `bills` · `cards` · `recurrences` |
| `pfm.quickAdd.lastAccountId` | UUID |
| `pfm.dashboard.period` | `AAAA-MM` |

Todas as leituras e escritas estão protegidas por `try/catch`. Sem LocalStorage, a app usa os valores por omissão, e o tema escolhido mantém-se durante a sessão.

**Tema:** um script inline em `<head>` lê `pfm.theme` e escreve `data-theme` antes da primeira pintura. O `ThemeProvider` mantém o atributo sincronizado com a escolha e com `prefers-color-scheme` quando a preferência é "Sistema", e atualiza o `<meta name="theme-color">`.
