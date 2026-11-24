# Relatório do Step 04 — Transactions Management

**Data:** 2026-11-24 · **Base:** `62565c0` (Step 03 + OD-8, CI verde) · **schemaVersion:** 2.1.0 (sem alterações) · **IndexedDB:** versão 2 (sem alterações)

Ordem do brief, com aprovação entre fases: auditoria e contrato (D4-01 a D4-17 aprovados) → registo → lista, pesquisa e filtros → detalhe, edição, cancelamento, consistência, testes, documentação. O Step 05 não foi iniciado.

## 1. Resumo

O utilizador regista receitas, despesas e transferências a partir de qualquer ecrã; consulta-as por período com pesquisa, filtros combináveis, ordenação e um resumo por moeda; abre cada uma para ver o detalhe, editar (com o efeito nos saldos antes de gravar), cancelar ou eliminar segundo a política aprovada; e confere o saldo de cada conta numa reconciliação. As compras com débito e pré-pago passaram a descontar da conta (OD-8, parte das transações).

## 2. Arquitetura final

Ver [transaction-engine.md](../architecture/transaction-engine.md) e [financial-calculations.md](../architecture/financial-calculations.md). Em resumo: a interface (`src/features/transactions/`) só lê pelo `useLocalQuery` e escreve pelo `mutate` → repositórios do Step 02; todos os cálculos (saldos, períodos, pesquisa, filtros, ordenação, resumo, impacto de edição, reconciliação) são funções puras em `src/domain/rules/`; a política de edição/cancelamento/eliminação está no repositório.

## 3–4. Ficheiros

**Criados (33):** `src/features/transactions/` (12 ficheiros), `src/domain/rules/{transactions,reconciliation}.ts`, `src/domain/default-categories.ts`, `src/hooks/use-debounced-value.ts`, 6 ficheiros de teste, `docs/features/transactions.md`, `docs/architecture/{transaction-engine,financial-calculations}.md`, `docs/testing/step-04-test-report.md`, `docs/decisions/step-04-decisions.md`, este relatório, log e 4 capturas.

**Modificados (29):** `balances.ts` (débito/pré-pago, D4-08), `accounts.ts`, `repositories.ts` (D4-01/03/04/07, categorias iniciais), `local-store.ts` (reconciliação na integridade), leitores e detalhe de contas e cartões, `movements.ts`, navegação e atalho N (entrada global), `sheet.tsx` (foco), `/transacciones`, `es.ts`, 1 teste do Step 02, documentação existente. **Sem alterações:** `package.json`, `package-lock.json`, tokens, schema, migrações, CI.

## 5–6. Funcionalidades e regras financeiras

[docs/features/transactions.md](../features/transactions.md). Regras: centavos inteiros; valor sempre positivo, o tipo dá o sentido; moeda da conta; nunca somar moedas; transferência = um registo, −origem +destino, nunca receita/despesa, sem moedas diferentes; completado no saldo atual, pendente só no projetado, cancelado nunca; edição recalculada pela derivação central; cancelamento definitivo e auditável; eliminar só pendente/cancelado; tipo imutável; contas arquivadas e cartões inativos fora de movimentos novos.

## 7. Saldos

Nunca guardados: `initialBalance` + Σ efeitos (`deriveAccountBalance`). Editar ou cancelar muda o registo; o saldo muda porque é derivado de novo. A reconciliação (`reconcileAccount`) reconstrói-o como decomposição e confere-o — no detalhe da conta e na verificação de integridade local.

## 8. Transferências

Um único registo com `accountId` e `destinationAccountId`. Uma falha nunca deixa metade aplicada (não há metades; várias escritas usam `unitOfWork`, testado com falha a meio). Entre moedas: bloqueadas (D4-06).

## 9–10. Integração com contas e cartões

Contas: referências e moeda verificadas pelo repositório; arquivadas fora de movimentos novos; detalhe da conta com "Cómo se calcula el saldo". Cartões: só em despesas; a conta é a de pagamento do cartão; débito/pré-pago descontam já; crédito fica como comprometido e **não** é tratado como saída imediata; o pagamento da fatura (futuro) não será despesa — sem dupla contagem.

## 11–12. Testes e resultados

[Relatório de testes](../testing/step-04-test-report.md) · [log](step-04-logs/ci-sequence.log)

| Conjunto | Resultado |
| --- | --- |
| Unitários + integração | **260 passam** (57 novos), 26 ficheiros |
| E2E (build de produção, desktop + iPhone/Chromium) | **64 passam** (8 novos), 2 ignorados por desenho |
| Lint · tipos · tokens · schemas · dados · migração · changeset · guardas · build | ✓ |

## 13. Critérios de aceitação

| ID | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| TRX-01 | Modelo reutilizado | **PASS** | `Transaction` do Step 02 sem alterações de schema (2.1.0) |
| TRX-02 | Criar receitas | **PASS** | `transactions-create` "income…"; E2E registo |
| TRX-03 | Criar despesas | **PASS** | "expense…", cartões; E2E |
| TRX-04 | Criar transferências | **PASS** | "transfer: one record…"; E2E (saldos das duas contas) |
| TRX-05 | Editar | **PASS** | `transactions-edit` (valor, conta, data, categoria, falha); E2E com impacto |
| TRX-06 | Cancelamento consistente | **PASS** | Registo mantido, saldo revertido, `outbox` com `baseRev`, definitivo (repositório), segundo cancelamento recusado |
| TRX-07 | Detalhes | **PASS** | Detalhe de transferência (origem, destino, debitado, creditado); E2E |
| TRX-08 | Pesquisa | **PASS** | Descrição, notas, conta, instituição, categoria, sem acentos, 250 ms |
| TRX-09 | Filtros combináveis | **PASS** | Unit. e integração com combinações e limpeza; E2E |
| TRX-10 | Ordenação | **PASS** | 5 ordens; dados guardados inalterados (teste) |
| FIN-01 | Unidades inteiras | **PASS** | Formulário e schema recusam decimais/3 casas; `Money` |
| FIN-02 | Receitas atualizam saldos | **PASS** | Saldo lido do store após criar |
| FIN-03 | Despesas atualizam saldos | **PASS** | Idem; débito vs crédito |
| FIN-04 | Transferências nas duas contas | **PASS** | Integração e E2E |
| FIN-05 | Transferências fora de receitas/despesas | **PASS** | `incomeAndExpenses`, resumo, neto do dia |
| FIN-06 | Moedas não misturadas | **PASS** | Resumo por moeda; transferências entre moedas recusadas; reconciliação deteta outra moeda |
| FIN-07 | Cancelamentos revertem | **PASS** | Teste de cancelamento e `editImpact` (estado) |
| FIN-08 | Edições consistentes | **PASS** | `editImpact` (conta antiga e nova, transferência); recálculo verificado |
| FIN-09 | Operações atómicas | **PASS** | Registo + `outbox` numa transação; `unitOfWork` com falha a meio = nada aplicado |
| ACC-01 | Integridade com contas | **PASS** | Referências, moeda, arquivadas (D4-07), reconciliação na integridade |
| CARD-01 | Cartões respeitam o domínio | **PASS** (âmbito D4-08) | Débito/pré-pago/crédito testados; conta = conta do cartão; cartão inativo recusado. Faturas de crédito ficam explicitamente para step próprio (aprovado) |
| CAT-01 | Categorias compatíveis | **PASS** | Formulário e repositório; categorias iniciais sem duplicação |
| UX-01 | Design System preservado | **PASS** | Ledger (5/4 colunas, lista), sheet 440px/ecrã inteiro, um valor por linha sem cards de KPI, tokens; desvio aprovado do teclado (D4-15); capturas. Revisão visual feita por mim — falta a tua |
| UX-02 | Responsividade | **PASS** | E2E desktop e iPhone sem overflow; filtros dobráveis no telemóvel; tablet só verificado no código |
| QA-01 | Unitários | **PASS** | 26 novos |
| QA-02 | Integração | **PASS** | 31 novos, sem mocks da persistência |
| QA-03 | E2E | **PASS** | 64 passam |
| QA-04 | Build | **PASS** | ✓ |
| SEC-01 | Sem texto simples publicado | **PASS** | `guard:artifacts` ✓ |
| SEC-02 | Sem comunicação externa | **PASS** | `guard:deps` (endpoints); nenhuma chamada de rede nova |
| ARCH-01 | IndexedDB pelos repositórios | **PASS** | Todas as escritas por `mutate` → repositórios |
| ARCH-02 | Sem BD/ORM | **PASS** | `guard:deps` ✓, nenhuma dependência nova |

## 14. Problemas encontrados (resolvidos)

- `new Date()` no render quebrava o pré-render: a data de hoje passou a ser lida só no cliente.
- `showModal()` tirava o foco do importe: a sheet foca o campo marcado `data-autofocus`.
- Corridas nos testes entre gravar e reler a lista: os testes usam o evento global ou esperam pelo estado seguinte.
- Rótulos ambíguos ("Buscar", "Período"): região de pesquisa com nome próprio; E2E com `exact`.
- Formatação automática tocou em ficheiros fora do âmbito; foram repostos.

## 15. Pendências

- Commit, push e CI no GitHub; tua revisão visual.
- Faturas de cartão de crédito (OD-8): faturas, cuotas, pagamento (parcial, juros à mão), crédito disponível, devoluções.

## 16. Riscos técnicos

- **IndexedDB sem cifragem** (OD-3 decidida, por implementar): só dados fictícios.
- **Volume:** o período escolhido é lido inteiro e filtrado em memória; "Todo el historial" lê tudo. Adequado a um utilizador; a rever com dezenas de milhares de registos.
- **Leitores de contas e cartões** ainda leem todas as transações para os saldos (necessário para derivar).
- **Safari real** não testado.

## 17. Dependências para o Step 05

- Faturas de crédito precisam do modelo de fatura (provavelmente schema 2.2.0) e substituem a parte "comprometido" de D4-08.
- Contas domésticas e recorrências podem usar `billId`/`recurrenceId` (já no modelo) e o formulário de transação.
- Dashboard e relatórios podem usar `summarizeTransactions`, `periodRange` e `incomeAndExpenses`.

## 18. Preservação

Todos os testes dos Steps 01–03 passam (um teste do Step 02 adaptado à D4-04, documentado). Design System, tokens, tipografia, navegação (itens e rotas) e layout inalterados; a navegação só mudou o destino de "Nueva transacción" (D4-15). Motor de dados, schema e migrações inalterados.
