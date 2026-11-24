# Relatório de testes — Step 03 (Accounts & Cards)

**Data:** 2026-11-24 · **Node** 22 · **Log completo:** [../reports/step-03-logs/ci-sequence.log](../reports/step-03-logs/ci-sequence.log) (mesma ordem que `.github/workflows/ci.yml`, código de saída 0). Todos os dados de teste são fictícios (`EJEMPLO-FICTICIO`).

## Totais

| Conjunto | Antes (Step 02) | Agora | Novos |
| --- | --- | --- | --- |
| Unitários e de integração (Vitest) | 152 | **203**, 20 ficheiros | 51 |
| E2E (Playwright, build de produção; desktop 1440×900 e iPhone 390×844 em Chromium) | 36 + 2 ignorados | **56** + 2 ignorados | 20 |

Os 2 ignorados são, por desenho, um teste só de desktop no projeto iPhone e o inverso (Step 01). Nenhum teste existente foi removido.

## Testes novos

| Ficheiro | Nº | Cobre |
| --- | --- | --- |
| `tests/unit/accounts.test.ts` | 12 | Conta válida em centavos; nome vazio; moeda e tipo inválidos; valores inválidos (letras, 3 decimais, fora do limite, vazio); saldo inicial negativo; número de cartão no nome; edição sem saldo inicial; USD com símbolo próprio; indicadores com a regra central; moedas separadas; arquivadas fora das ativas e dos totais; schema recusa decimais |
| `tests/unit/cards.test.ts` | 10 | Datas de fecho/vencimento (fim de mês, bissexto, mudança de ano); só crédito tem calendário; comprometido por moeda e limite à parte (sem "disponível"); arquivados fora dos indicadores; "vencen pronto"; pré-pago válido sem limite/dias e recusado com eles; schema recusa CVV, PIN, número completo, palavra-passe, 5 dígitos, número no nome; formulário (crédito, débito, pré-pago, conta em falta/inexistente, dígitos, dias, limite) |
| `tests/unit/movements.test.ts` | 4 | Sinal do movimento do ponto de vista da conta (receita, despesa, transferência de saída e de entrada, compra com cartão); ordem; tombstones ignorados; compras de um cartão; filtros de período, tipo e estado |
| `tests/integration/accounts-page.test.tsx` | 11 | Página real + repositórios + IndexedDB (sem mocks da persistência): estado vazio; criar e listar; erros por campo sem gravar; falha de IndexedDB ao gravar mantém o formulário; moedas não somadas; editar, arquivar, reativar; eliminar com confirmação (tombstone); conta com referências só arquiva e bloqueia a moeda; correção do saldo inicial (antes/depois, operação `update` com `baseRev`, transações intocadas); persistência após recarregar; IndexedDB indisponível |
| `tests/integration/cards-page.test.tsx` | 9 | Pede conta primeiro; criar crédito com a moeda da conta; débito/pré-pago sem campos de crédito e em secções próprias; erros por campo; editar e arquivar; cartão com movimentos (sem eliminar, conta bloqueada, limite nunca como dinheiro); persistência; repositório recusa conta inexistente, moeda diferente, campo `cvv`, mudança de conta com movimentos |
| `tests/integration/detail-pages.test.tsx` | 5 | Detalhe da conta (factos, saldo atual e projetado, saldo inicial, cartões, 6 movimentos), filtros, conta sem movimentos, id desconhecido; detalhe do cartão (comprometido, limite rotulado, próximo vencimento, compras, sem filtro de tipo) |
| `tests/e2e/accounts.spec.ts` | 5 × 2 | Estado vazio, criar, erros de validação, persistência após recarregar; moedas separadas; editar, arquivar, eliminar com confirmação; layout (tabela/lista, sheet de 440px/ecrã inteiro, sem overflow horizontal); detalhe e **abertura sem rede** de uma conta nunca visitada |
| `tests/e2e/cards.spec.ts` | 5 × 2 | Conta primeiro; criar com erros, editar, arquivar, persistência; débito e pré-pago, eliminar com confirmação; sem overflow e seletor de Obligaciones no telemóvel; detalhe do cartão e ligação à conta de pagamento |

## Ajustes a testes existentes

| Teste | Alteração | Porquê |
| --- | --- | --- |
| `foundation.spec.ts` › iPhone tab bar | Espera que `/tarjetas` termine de carregar antes de sair | A página passou a cliente; o seletor guarda a área depois de hidratar. A verificação é a mesma |
| `compatibility`, `migrations`, `exchange` | Versão atual 2.0.0 → 2.1.0 | D3-01 |

## Gates

| Gate | Resultado |
| --- | --- |
| Guarda de dependências e endpoints | ✓ 32 declaradas, 620 instaladas; sem dependências novas |
| ESLint · TypeScript strict · tokens | ✓ · ✓ · ✓ |
| JSON Schema em sincronia · `data/` nas 4 camadas · migração · changeset | ✓ · ✓ (2.1.0) · ✓ · ✓ |
| Build de produção | ✓ (`/cuentas/_`, `/tarjetas/_` pré-renderizados) |
| Sem texto simples nos artefactos públicos | ✓ 448 ficheiros |

## Limites conhecidos

- Os E2E "iPhone" correm em Chromium com a viewport do iPhone, não em Safari.
- jsdom não tem `HTMLDialogElement.showModal`: `tests/setup.ts` tem um substituto mínimo; o comportamento real do `<dialog>` (foco, Esc, scrim) é verificado nos E2E.
- A CI no GitHub corre depois do push.
