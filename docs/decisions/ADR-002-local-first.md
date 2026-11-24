# ADR-002 — Local-first, sem escrita no GitHub a partir da app

- **Estado:** aceite (decisão D1, Step 00)

## Decisão

- **IndexedDB** guarda os dados financeiros no dispositivo; o **LocalStorage** só guarda preferências leves.
- A app exporta e importa ficheiros JSON. As alterações entram no repositório por `git commit` e `git push`; o GitHub Actions valida e prepara a publicação.
- A app **nunca** escreve no GitHub, não contém credenciais e não sincroniza automaticamente entre dispositivos.
- O fluxo inclui identificação de versões (`schemaVersion`, `dataRevision`), prevenção de duplicações (ids UUID criados no dispositivo, `changesetId`) e tratamento de conflitos (`baseRev`).

## Implementado no Step 01

Stores oficiais separados do `outbox`; `replaceOfficialData` numa única transação; recusa de revisões antigas; base de exportação e restauro. Ver [persistência local](../architecture/local-persistence.md).

## Por implementar

Formato e aplicação dos conjuntos de alterações, deteção de conflitos na aplicação e exportação cifrada (OD-4, OD-5).
