# Importação e exportação

Código: [`src/services/exchange/exchange.ts`](../../src/services/exchange/exchange.ts) e [`scripts/data/check-changeset.ts`](../../scripts/data/check-changeset.ts).

> **Todos estes formatos são JSON em texto simples (D2-07).** Servem para o responsável rever e integrar alterações. O Step 02 **não tem botão de descarga** na interface. As exportações cifradas fazem parte do desenho da fase 07 ([segurança dos dados](data-security.md)) e precisam de aprovação explícita antes de serem implementadas (OD-5).

## Integridade

Cada ficheiro traz `integrity = { algorithm: "SHA-256", sha256, counts }`: o SHA-256 do JSON canónico sem o bloco `integrity`, e as contagens de registos. Deteta corrupção e truncagem acidentais. **Não autentica:** quem edita o ficheiro pode recalcular o hash.

## Formatos

| Formato | Conteúdo | Para quê |
| --- | --- | --- |
| `pfm.export` · `scope: "full"` | Todas as entidades (com tombstones), Financial Settings, `outbox` pendente e `meta` da última publicação | Cópia de segurança (`buildBackup`) |
| `pfm.export` · `scope: "selected"` | Só as entidades pedidas | Levar registos escolhidos para outro dispositivo |
| `pfm.changeset` | `changesetId`, `basedOnRevision`, `deviceId`, operações pendentes (`create` · `update` · `delete` com `baseRev` e registo completo) | O responsável integra-o em `data/` à mão (D2-08) |

Todos têm `format`, `formatVersion` (1) e `schemaVersion`. Um ficheiro 1.x tem de ser migrado primeiro; um ficheiro de uma versão mais nova pede para atualizar a app.

## Exportar

- `exportData(db, { entities?, includeDeleted?, now? })` e `buildBackup(db)`.
- `exportChangeset(db)` — junta as operações pendentes sem conflito e marca-as com o `changesetId` (numa transação). Devolve `null` se não houver nada. `unmarkChangeset(db, id)` desfaz a marcação se o ficheiro foi deitado fora sem ser integrado.

## Importar

1. `previewImport(db, ficheiro, modo)` — verifica formato, hash, contagens e versão; valida cada registo; classifica cada um como `new`, `identical`, `update`, `older` ou `conflict`; valida o conjunto resultante (referências, moedas, árvore, duplicados). **Não escreve nada.**
2. `applyImport(db, ficheiro, { mode })`:
   - `merge` (por omissão): acrescenta registos novos e atualiza os que têm `rev` maior. **Um único conflito ou erro recusa o ficheiro inteiro** (`IMPORT_REJECTED`). Conflito = o registo foi alterado localmente e ainda não exportado, ou tem a mesma revisão com conteúdo diferente.
   - `replace`: só com uma exportação completa e a confirmação literal `REEMPLAZAR-DATOS-LOCALES`; recusa se houver alterações locais por exportar e o ficheiro não trouxer `outbox`, salvo `discardPendingChanges`.
   - Na mesma transação, guarda primeiro um ponto de recuperação (`rollback`) e cria operações no `outbox` para os registos escritos, para irem no próximo changeset.
3. `rollbackLastImport(db)` — repõe o estado anterior à última importação, numa transação. Um nível.

`restoreBackup(db, ficheiro)` = `replace` confirmado (mantém o nome do Step 01).

## Verificar um changeset antes de o integrar

```bash
npm run data:changeset -- caminho/changeset.json [data]
```

Verifica formato, hash, versão e o `baseRev` de cada operação contra `data/`, aplica-as **em memória** e valida o resultado nas quatro camadas. Não escreve nada. Um changeset já listado em `meta.appliedChangesets` é assinalado. A CI corre-o sobre o exemplo fictício `tests/fixtures/changesets/sample.changeset.json`.

**Integração manual (D2-08):** aplicar as operações aos ficheiros de `data/`, acrescentar o `changesetId` a `meta.appliedChangesets`, subir `dataRevision`, correr `npm run data:checksums` e `npm run data:validate`, fazer commit e push. A automatização da integração depende da OD-4.
