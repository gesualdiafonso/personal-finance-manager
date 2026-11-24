# Tarjetas (`/tarjetas`)

Pergunta da área: **quanto devo nos cartões e quando fecha?** (Obligaciones). Implementado no Step 03.

## O que o utilizador faz

| Ação | Regra |
| --- | --- |
| Ver os cartões | Secções Crédito · Débito · Prepagas · Archivadas |
| Criar | Nome, tipo, **conta de pagamento (obrigatória)**, últimos 4 dígitos (opcional). Só crédito: limite (opcional), dia de fecho e dia de vencimento (1–31). A moeda é sempre a da conta |
| Editar | Os mesmos campos e o estado; a conta fica bloqueada se o cartão tiver movimentos |
| Arquivar / reativar | Continua visível em "Archivadas" |
| Eliminar | Só sem movimentos, com confirmação (tombstone) |
| Ver o detalhe | `/tarjetas/<id>` |

Sem contas ativas, a página pede para criar uma conta primeiro ("Ir a Cuentas").

## O que nunca se guarda

Número completo, CVV, PIN, palavras-passe, credenciais. O formulário não tem campos para eles, o schema é estrito (recusa qualquer campo a mais), `lastFourDigits` aceita exatamente 4 dígitos e nenhum texto livre aceita uma sequência que pareça um número de cartão.

## Resumo e indicadores

- **Valor herói:** "Comprometido en tarjetas" — compras com cartão de **crédito** não canceladas, cartões ativos, por moeda. Débito e pré-pago descontam da conta (D4-08).
- **Límite de crédito total:** soma dos limites dos cartões de crédito ativos, por moeda, com a nota "es el límite acordado con el emisor, no dinero disponible". Não há "crédito disponível" (D3-06, OD-8).
- **Vencen pronto:** cartões de crédito ativos cujo próximo vencimento é nos próximos 7 dias (dias 29–31 ajustados ao fim do mês).

## Detalhe (`/tarjetas/<id>`)

Comprometido (herói), tipo, conta de pagamento (com ligação), moeda, limite, dias e próximas datas de fecho e vencimento, estado, datas, e as compras do cartão com filtros de período e estado. A vista por fatura do Design System fica para quando a OD-8 for decidida (D3-07).

Arquitetura: [card-management.md](../architecture/card-management.md).
