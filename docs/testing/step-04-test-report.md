# Relatório de testes — Step 04 (Transactions Management)

**Data:** 2026-11-24 · **Node** 22 · **Log completo:** [../reports/step-04-logs/ci-sequence.log](../reports/step-04-logs/ci-sequence.log) (ordem do `.github/workflows/ci.yml`, código de saída 0). Só dados fictícios (`EJEMPLO-FICTICIO`).

## Totais

| Conjunto | Antes (Step 03) | Agora | Novos |
| --- | --- | --- | --- |
| Unitários + integração (Vitest) | 203 | **260**, 26 ficheiros | 57 |
| E2E (build de produção; desktop 1440×900 e iPhone 390×844 em Chromium) | 56 + 2 ignorados | **64** + 2 ignorados | 8 |

## Testes novos, pelo que o brief pede (§16–18)

| Área | Ficheiro | Cobre |
| --- | --- | --- |
| Receitas, despesas, transferências (unit.) | `tests/unit/transactions.test.ts` (8) | Formulário: válidos; valor 0/negativo/3 decimais/letras; descrição vazia; número de cartão; data inválida; conta inexistente; categoria incompatível; cartão inexistente; transferência para a mesma conta, sem destino, entre moedas. Cartões: débito/pré-pago descontam, crédito não, tipo desconhecido = crédito; comprometido só crédito; totais sem transferências |
| Lista, pesquisa, filtros (unit.) | `tests/unit/transaction-list.test.ts` (11) | Períodos (semana segunda/domingo, mês, mês anterior incl. janeiro, fevereiro bissexto, 30/90 dias, ano, personalizado aberto e invertido, independente do relógio); pesquisa sem acentos em descrição, notas, conta, destino, instituição, categoria; cada filtro e combinações; contagem de filtros ativos; tombstones fora; 5 ordenações sem alterar dados; resumo por moeda (completados, pendentes, cancelados, moeda base primeiro); sinal listado |
| Edição, reversão, reconciliação (unit.) | `tests/unit/transaction-consistency.test.ts` (7) | Reconciliação que bate com a derivação (incl. exclusões) e deteta outra moeda; impacto de mudar valor, conta (as duas contas), estado (reversão), data/categoria (sem efeito), transferência (duas contas); política cancelar/eliminar/editar |
| Criação (integr.) | `tests/integration/transactions-create.test.tsx` (14) | Conta primeiro; categorias iniciais uma vez e nunca sobre existentes; receita e despesa com saldo lido do store; pendente só no projetado; transferência (um registo, duas contas, fora dos totais); entre moedas recusada; débito vs crédito; duplicado com confirmação; duplo clique = um registo; falha de escrita mantém o formulário; entradas globais (#nueva e evento); conta arquivada recusada; persistência; movimento antigo editável depois de arquivar a conta |
| Lista (integr.) | `tests/integration/transactions-list.test.tsx` (7) | Só o período lido (índice `date`), personalizado; colunas Ledger e grupos por dia; resumo igual ao listado e segundo os filtros; pesquisa com espera, combinada com filtros, sem resultados, limpar; conta (dois lados) e categoria-mãe; ordenação sem mexer nos dados; 100 + "Mostrar más" |
| Detalhe, edição, cancelamento (integr.) | `tests/integration/transactions-edit.test.tsx` (10) | Detalhe de transferência; edição com pré-visualização e recálculo; mudar de conta (duas contas); data/categoria sem efeito; falha de escrita; cancelar (registo mantido, saldo revertido, `outbox` com `baseRev`, definitivo, só notas); segundo cancelamento com a mesma versão recusado; eliminar pendente, completado recusado, tipo imutável; **transferência atómica** (falha a meio da unidade de trabalho = nada aplicado), duplicados; reconciliação no detalhe da conta e na verificação de integridade |
| E2E | `tests/e2e/transactions.spec.ts` (4 × 2) | Criar receita, despesa e transferência e ver os saldos em Cuentas; erros; N e "+" abrem a sheet; pesquisa, tipo, período, conta, combinação, limpar, totais, recarregar; detalhe, edição com impacto, cancelar, eliminar, recarregar; sem overflow horizontal |

## Ajustes a testes anteriores

| Teste | Alteração | Porquê |
| --- | --- | --- |
| `repositories.test.ts` › tombstone | Usa uma transação pendente | D4-04: um completado não se elimina |

## Gates

Guarda de dependências ✓ (nenhuma nova) · ESLint ✓ · TypeScript ✓ · tokens ✓ · JSON Schema ✓ · `data/` nas 4 camadas ✓ · migração ✓ · changeset ✓ · build ✓ · artefactos públicos sem dados ✓ (457 ficheiros).

## Limites

- E2E "iPhone" em Chromium, não Safari.
- O campo de data usa o seletor nativo do navegador; nos E2E o navegador está em inglês (mm/dd), num navegador em espanhol aparece dd/mm.
- jsdom não tem `<dialog>` modal (substituto mínimo em `tests/setup.ts`); o comportamento real é verificado nos E2E.
