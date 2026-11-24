# Contas (`/cuentas`)

Pergunta da área: **onde está o dinheiro?** (Patrimonio). Implementado no Step 03.

## O que o utilizador faz

| Ação | Onde | Regra |
| --- | --- | --- |
| Ver as contas | Lista (tabela no tablet/desktop, lista no telemóvel) | Ativas primeiro, arquivadas numa secção própria |
| Criar | "Nueva cuenta" → sheet | Nome, instituição (opcional), tipo, moeda (ARS/USD), saldo inicial (pode ser negativo) |
| Editar | "Editar" na linha ou no detalhe | Nome, instituição, tipo, estado; a moeda só se a conta não tiver referências |
| Corrigir o saldo inicial | Sheet de edição → "Corregir saldo inicial" | Mostra antes/depois e o efeito no saldo atual; pede confirmação (D3-04) |
| Arquivar / reativar | "Archivar"/"Reactivar" na linha, ou Estado no formulário | A conta continua visível em "Archivadas" e no histórico |
| Eliminar | Sheet de edição, só sem referências | Confirmação; tombstone (D3-05) |
| Ver o detalhe | Nome da conta (desktop) ou toque na linha (telemóvel) | `/cuentas/<id>` |

**Tipos:** Cuenta corriente (`checking`), Caja de ahorro (`savings`), Efectivo (`cash`), Inversiones (`investment`), Otra (`other`).

## Resumo da página

- **Valor herói:** saldo atual das contas **ativas** na moeda base (ARS). Outras moedas aparecem por baixo, "sin convertir". Nunca se somam moedas.
- **Linha de factos:** ativas · bancárias (corrente + poupança) · em efetivo · arquivadas.
- **Nota:** os saldos usam movimentos completados; compras com cartão de crédito não descontam da conta (D4-08).

## Detalhe (`/cuentas/<id>`)

Breadcrumb "Cuentas ›", saldo atual (herói), saldo projetado (com pendentes), saldo inicial, moeda, tipo, instituição, estado, datas de criação e de atualização, cartões associados (com ligação), **"Cómo se calcula el saldo"** (reconciliação, Step 04) e **movimentos** com filtros de período, tipo e estado. Para registar, editar ou cancelar movimentos: [Transacciones](transactions.md).

## Estados

A carregar (esqueletos), vazio (com "Crear la primera cuenta"), erro (com "Reintentar"; mensagem própria se o IndexedDB não existir), lista, arquivadas, dados inválidos (contados, nunca mostrados), conta não encontrada (detalhe), mensagem de sucesso depois de cada operação. Registos alterados neste dispositivo e por exportar: "Solo en este dispositivo".

Arquitetura: [account-management.md](../architecture/account-management.md).
