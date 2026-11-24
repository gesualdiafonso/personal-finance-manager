# Decisões do Step 02 — Core Data Engine

Propostas na auditoria e plano do Step 02 (fases 00 e 01) e **aprovadas pelo responsável** ("ok") antes da implementação. Não fecham nenhuma decisão em aberto: ADR-005 e OD-1 a OD-8 continuam em [open-decisions.md](open-decisions.md).

| ID | Decisão | Substitui / relação |
| --- | --- | --- |
| D2-01 | Nomes de campos do Step 02 (`amount`, `initialBalance`, `creditLimit`, `type`, `lastFourDigits`…) e `schemaVersion` **2.0.0**, com migração 1.0.0 → 2.0.0 | Formato 1.x do Step 01 |
| D2-02 | Moedas **ARS e USD**, ambas com 2 casas. Cada transação, fatura, recorrência e orçamento tem a moeda da sua conta/cartão. Transferências entre moedas diferentes são recusadas. Totais sempre por moeda; não há conversão | Substitui o invariante I-02 (moeda única ARS) |
| D2-03 | Transferência = **um registo** com `destinationAccountId` | Substitui o invariante I-03 (duas pernas) |
| D2-04 | `completed` conta no saldo atual; `pending` só no projetado; `cancelled` nunca | — |
| D2-05 | Os stores do IndexedDB guardam a publicação **com** as alterações locais aplicadas; o `snapshot` guarda a publicação tal como veio; uma importação reconstrói tudo numa transação | Muda o Step 01 (stores oficiais só com a publicação) |
| D2-06 | Apagar = tombstone. Contas, cartões e categorias com referências não se apagam: arquivam-se/desativam-se | — |
| D2-07 | Exportação de changesets em JSON simples, para revisão; sem interface de descarga no Step 02; a cifragem das exportações vem com o desenho da fase 07 aprovado | Relacionada com OD-5 (continua aberta) |
| D2-08 | Só exportação: o responsável integra os changesets em `data/` à mão; o formato é validado pela CI (`npm run data:changeset`) | Relacionada com OD-4 (continua aberta) |
| D2-09 | `icon` e `color` das categorias guardam-se (opcionais) mas nunca se mostram | Design System: P-08, O-11 |
| D2-10 | `currentBalance` e `nextOccurrence` são derivados, não persistidos | — |
| D2-11 | Compras com cartão não mexem no saldo da conta e aparecem como "comprometido em cartões", até a OD-8 ser decidida | Provisória: depende da OD-8 |

**Aprovações não bloqueantes:** `data/settings.json` com ARS, `America/Argentina/Buenos_Aires`, `es-AR`, segunda-feira como primeiro dia, formato `es-AR`; estados — conta `active|archived`, cartão `active|inactive` e `credit|debit`, fatura `pending|paid|cancelled`, orçamento `monthly|yearly|custom`, recorrência `weekly|monthly|yearly`.

**Decisões de implementação** (dentro do que foi aprovado, sem impacto de segurança ou compatibilidade por decidir):

- Transferências 1.x sem direção: a migração exige a direção por transferência e pára sem ela (não adivinha).
- Cartões 1.x sem conta pagadora: `accountId: null` com aviso de validação.
- IndexedDB 1 → 2: registos v1 copiados para `legacy_v1`, nunca apagados.
- Possíveis duplicados: aviso em `data/`; recusa por omissão nos repositórios, com opção explícita para aceitar.
- Um nível de anular para importações (`rollback`).
