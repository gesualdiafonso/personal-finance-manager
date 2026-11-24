# Relatório do Step 02 — Core Data Engine

**Data:** 2026-11-24 · **schemaVersion:** 2.0.0 · **IndexedDB:** versão 2 · **Base:** commit `154626f` (Step 01, CI #3 verde)

O Step 02 seguiu as fases 00 a 09 do brief. As fases 00 e 01 (auditoria e plano) foram aprovadas antes de qualquer alteração, com as decisões D2-01 a D2-11 ([step-02-decisions.md](../decisions/step-02-decisions.md)). **Nenhuma decisão em aberto foi resolvida em silêncio:** ADR-005 e OD-1 a OD-8 continuam abertas. As secções 11–14 do brief original continuam por verificar. O Step 03 não foi iniciado.

## Resultado da sequência da CI (local)

Log completo: [step-02-logs/ci-sequence.log](step-02-logs/ci-sequence.log) (Node 22, mesma ordem que `.github/workflows/ci.yml`; saída: código 0).

| Passo | Resultado |
| --- | --- |
| Guarda de dependências e endpoints | ✓ 32 declaradas, 620 instaladas, `src/` sem endpoints de escrita remota |
| Lint · tipos (strict) · tokens | ✓ 0 erros, 0 avisos · ✓ · ✓ |
| Domínio e aritmética (`test:domain`) | ✓ 40 testes |
| JSON Schemas em sincronia | ✓ 9 ficheiros |
| `data/` — estrutura, referências, unicidade, invariantes | ✓ ✓ ✓ ✓ (2.0.0, revisão 2) |
| Migrações (`data:migrate --check` + `test:migrations`) | ✓ + 10 testes |
| Repositórios e IndexedDB | ✓ 25 testes |
| Importação/exportação + changeset fictício | ✓ 15 testes + ✓ aplica-se sem conflitos |
| Segurança | ✓ 16 testes |
| Todos os testes unitários e de integração | ✓ **152 testes, 14 ficheiros** |
| Build de produção | ✓ 13 páginas estáticas |
| Sem texto simples nos artefactos públicos | ✓ 366 ficheiros verificados |
| E2E (build de produção, desktop + iPhone/Chromium) | ✓ **36 passaram**, 2 ignorados por desenho (testes só de desktop/só de iPhone) |

A CI no GitHub só corre depois do push (não tenho acesso de escrita ao repositório).

## Critérios de aceitação

| # | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| 1 | Todos os modelos de domínio definidos | **PASS** | `src/domain/schemas.ts`: Account, Card, Transaction, Category, Bill, Recurrence, Budget, FinancialSettings, Meta; [domain-models.md](../architecture/domain-models.md) |
| 2 | Todos os schemas validados | **PASS** | Zod estrito + `schemas/*.schema.json` gerados (`schemas:check` ✓); `data:validate` nas 4 camadas ✓; `tests/unit/data-validation.test.ts` |
| 3 | Valores monetários em centavos inteiros | **PASS** | `amountMinor` recusa decimais; `Money` com moeda e operações que recusam misturar ARS/USD; `domain.test.ts`, teste "rejects a decimal amount" |
| 4 | Relações entre entidades validadas | **PASS** | Camada 2 (referências, moeda, tipo de categoria, conta pagadora do cartão, árvore); repositórios: `REFERENCE_CONSTRAINT`, `CURRENCY_MISMATCH`; `repositories.test.ts` |
| 5 | Repositórios com operações tipadas | **PASS** | `src/services/repositories/repositories.ts`: `getAll`, `getById`, `create`, `update(expectedRev)`, `delete` (tombstone) por entidade |
| 6 | Persistência IndexedDB funciona | **PASS** | IndexedDB v2 com snapshot, stores de trabalho, outbox, settings, `legacy_v1`, `rollback`; atualização v1 → v2 sem perder registos; `local-store.test.ts` (11) + E2E "IndexedDB" (versão 2) |
| 7 | Escritas multi-entidade consistentes | **PASS** | `unitOfWork`: uma transação para registos + outbox; teste "writes nothing when any step fails"; importação de publicação e de ficheiros numa transação |
| 8 | Importação/exportação funciona | **PASS** | Exportação completa/seletiva, changeset, pré-visualização, `merge`/`replace`, `rollbackLastImport`, SHA-256 + contagens; `exchange.test.ts` (12); `data:changeset` na CI. JSON simples e sem interface de descarga (D2-07) |
| 9 | Deteção de duplicados funciona | **PASS** | `DUPLICATE_ID`; `POSSIBLE_DUPLICATE` nos repositórios; avisos em `data/`; ids repetidos no ficheiro importado; testes em `repositories.test.ts` e `data-validation.test.ts` |
| 10 | Compatibilidade de versões funciona | **PASS** | `classifySchemaVersion` (atual / migrar / atualizar app), `dataRevision` só sobe; `compatibility.test.ts`, importação recusa versões antigas/novas |
| 11 | Infraestrutura de migração testada | **PASS** | `data-migrations.ts` + `npm run data:migrate`; `migrations.test.ts` (10): nada descartado, montantes preservados, idempotente, sem downgrade, sem adivinhar direções |
| 12 | Desenho de segurança documentado | **PASS** | [data-security.md](../architecture/data-security.md): estado real (IndexedDB e exportações **não** cifrados), desenho proposto para OD-3/OD-5, condições para produção. **Porta de aprovação:** nenhuma cifragem nova foi ativada; o desenho aguarda revisão e aprovação |
| 13 | Nenhuma dependência de base de dados | **PASS** | `guard:deps` alargado (Redis, Upstash, Vercel KV, RxDB, PouchDB, Octokit) + verificação de endpoints em `src/` ✓ |
| 14 | Nenhum artefacto financeiro em texto simples publicado | **PASS** | `guard:artifacts` ✓ (366 ficheiros); `data/` não é servido; só dados fictícios |
| 15 | A CI valida a nova camada de dados | **PASS** | `.github/workflows/ci.yml`: passos 4a–4j com nome (domínio, schemas, 4 camadas, migrações, repositórios, importação/exportação + changeset, segurança). Nenhum passo anterior removido. Execução no GitHub pendente do push |
| 16 | Funcionalidade do Step 01 intacta | **PASS** | Todos os E2E do Step 01 passam; `DataStatus` e o painel de dados locais funcionam (atualizado de "versão 1" para "versão 2"); `buildBackup`/`restoreBackup` mantêm o nome. `appendLocalOperation` e `replaceOfficialData` foram substituídos pelos repositórios e por `importPublication` (o segundo mantém-se como compatibilidade) |
| 17 | Documentação corresponde à implementação | **PASS** | Os 7 documentos pedidos em `docs/architecture/`, `README.md`, `CLAUDE.md`, `data/README.md`, `testing.md`, decisões; `data.md` passou a apontar para as novas páginas |

## O que mudou

```text
src/domain/                    NOVO — currency, money, ids, schemas (v2), settings, rules/{balances,categories,recurrence}
src/services/repositories/     NOVO — repositórios, unidade de trabalho, clearLocalData
src/services/exchange/         NOVO — exportação, changesets, importação, rollback, checkChangeset
src/services/versioning/       NOVO — migrações (1.0.0 → 2.0.0), schemas 1.x congelados
src/services/storage/local-store.ts   reescrito — IndexedDB v2
src/services/data/dataset.ts          reescrito — validação v2
src/lib/validation/                   schemas → reexporta src/domain; compatibility com classificação
scripts/data/                  migrate-data, update-checksums, check-changeset (novos); validate-data com --only
data/                          migrado para 2.0.0 + settings.json (fictício)
schemas/                       9 JSON Schema com os nomes do Step 02 (os antigos, no plural, foram removidos)
tests/                         domain, migrations, data-security, repositories, exchange (novos); restantes atualizados;
                               fixtures/v1 e fixtures/changesets
```

## Limitações e pontos honestos

- **Nada está cifrado no dispositivo nem nas exportações.** É intencional enquanto a OD-3 e a OD-5 estiverem abertas; está escrito na documentação e coberto por testes. Por isso, continuam a não dever entrar dados reais.
- **A integração de changesets é manual** (D2-08). O script só verifica.
- **Anular importações tem um nível.**
- **Os E2E "iPhone" correm em Chromium**, não em Safari (limite já registado no Step 01).
- **Na atualização v1 → v2, os stores de trabalho ficam vazios** até à próxima publicação ou importação 2.x; os registos v1 ficam em `legacy_v1` (não há ainda um conversor automático desse store, porque os dados v1 nos dispositivos eram só de teste).
- **D2-11 é provisória:** as compras com cartão podem mudar de regra quando a OD-8 for decidida.

## Decisões em aberto (inalteradas)

ADR-005 (idioma) · OD-1 (frase-passe na CI) · OD-2 (repositório em claro ou cifrado) · OD-3 (cifragem do IndexedDB — desenho proposto) · OD-4 (onde se aplicam changesets) · OD-5 (exportações cifradas — desenho proposto) · OD-6 (fechada no Step 00: PBKDF2) · OD-7 (publicação no Vercel) · OD-8 (cartões e saldos) · Brief §11–14 por verificar.

**Para aprovação:** o desenho de segurança da fase 07 ([data-security.md](../architecture/data-security.md), secções A–C).
