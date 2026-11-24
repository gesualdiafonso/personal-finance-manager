# Step 06 — Relatório de testes (Budgets & Financial Goals)

Executado em 2026-11-24, Node 22.23.5, Playwright 1.65.1 (Chromium), build de produção. Só dados fictícios (EJEMPLO-FICTICIO).

## Resultado

| Gate | Comando | Resultado |
| --- | --- | --- |
| Dependências proibidas | `npm run guard:deps` | ✓ |
| ESLint | `npm run lint` | ✓ |
| TypeScript strict | `npm run typecheck` | ✓ |
| Tokens do Design System | `npm run tokens:check` | ✓ sem alterações |
| JSON Schemas | `npm run schemas:check` | ✓ 11 ficheiros (novos: `goal.schema.json`, `goal-contribution.schema.json`) |
| Dados de exemplo | `npm run data:validate` | ✓ (`data/` marcado 2.3.0) |
| Migrações / changeset | `data:migrate -- --check`, `data:changeset` | ✓ |
| Unitários + integração | `npm test` | ✓ **320 testes, 32 ficheiros** (Step 05 fase 1: 293) |
| Build de produção | `npm run build` | ✓ (`/presupuesto` estática) |
| Artefactos públicos | `npm run guard:artifacts` | ✓ sem dados em texto simples |
| E2E | `npm run test:e2e` | ✓ **72 passados**, 2 ignorados por desenho (testes só de desktop/iPhone no outro projeto) |

`npm run check` corre os sete primeiros e os testes, numa só sequência; terminou com código 0.

## Testes novos

**Unitários — `tests/unit/planning.test.ts` (16)**
- Schema 2.3.0: orçamento 2.2 continua válido; geral, semanal e trimestral; datas que não batem com o período são recusadas; centavos inteiros; invariantes de metas e aportes.
- Gasto: só despesas completadas da categoria e subcategorias, na moeda e nas datas; transferências, receitas, canceladas, eliminadas, outra moeda e fora do período excluídas; a mesma transação nunca conta duas vezes.
- Estados nos limiares 85 / 95 / 100 %, aritmética inteira, limite 0, percentagem arredondada para baixo, excedido com restante negativo.
- Períodos (semana com segunda ou domingo, trimestre, fevereiro bissexto), períodos anteriores e histórico.
- Resumo por moeda sem misturar ARS e USD, sem contar pai e filho duas vezes; categorias com mais gasto; deteção de sobreposição.
- Formulários: encaixe do período, mensagens em espanhol.
- Metas: progresso, ritmo arredondado para cima, data passada só mostrada, conclusão só com o objetivo atingido, resumo por moeda.

**Integração — `tests/integration/planning-repository.test.ts` (7)**
- Persistência com operação no `outbox`; indicadores acompanham a criação e o cancelamento de transações; integridade local OK.
- Orçamento geral, limite > 0, categoria de gasto, sem duplicado sobreposto (também ao reativar), categoria referida não se elimina.
- Metas: criada ativa; conclusão recusada antes do objetivo e nunca automática; fechada só muda descrição e arquivo; com aportes não se elimina.
- Aportes: não criam transações, duplicado pede confirmação, não se editam nem eliminam, anulação definitiva, moedas verificadas.
- Transação ligada: só transferência/despesa, uma vez, não se cancela enquanto ligada.
- Conjunto de dados: ficheiros opcionais, checksums, validação e referências; uma pasta sem os ficheiros de metas continua válida.

**Integração — `tests/integration/planning-page.test.tsx` (3)**: estados vazios das três secções; criar orçamento pela interface e ver o uso calculado; filtro sem resultados; criar meta, registar aporte e concluir.

**Integração — `tests/integration/local-store.test.ts` (+1)**: atualização IndexedDB v2 → v3 cria as duas stores e mantém todos os registos.

**E2E — `tests/e2e/planning.spec.ts` (2 × desktop e iPhone)**: os 10 fluxos do brief — criar, consultar e editar orçamento, ver as despesas incluídas, criar meta, registar aporte, ver o progresso, concluir, persistência após recarregar, e interface móvel sem scroll horizontal nos três separadores. Confirma também que o aporte não alterou o saldo da conta.

## Testes anteriores ajustados (sem remover nenhum)

| Teste | Ajuste | Motivo |
| --- | --- | --- |
| `compatibility`, `migrations`, `bills`, `exchange` | Versão atual 2.3.0 | Schema 2.3.0 (aditivo) |
| `local-store` (2) | IndexedDB versão 3 | Duas stores novas |
| `e2e/platform.spec.ts` | "Listo · versión 3", `pfm-local@3` | Idem |

## Ecrãs

`docs/reports/step-06-ecras/`: resumo, lista de orçamentos, detalhe de orçamento, metas e detalhe de meta, em desktop (1440×900) e iPhone (390×844).
