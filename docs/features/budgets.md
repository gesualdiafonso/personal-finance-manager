# Presupuestos (`/presupuesto`, secção "Presupuestos")

Implementado no Step 06. A área **Presupuesto** (grupo Plan) tem três secções em separadores: **Resumen**, **Presupuestos** e **Metas** (`#presupuestos`, `#metas` no endereço). Navegação, tokens e componentes globais não mudaram. Metas: [financial-goals.md](financial-goals.md).

## Modelo (`Budget`, schema 2.3.0)

| Campo | Regra |
| --- | --- |
| `name` | 1–80 caracteres, sem números de cartão |
| `categoryId` | Categoria de **gasto** (inclui as subcategorias) ou `null` = **geral** (todos os gastos da moeda) |
| `amount` | Limite em centavos inteiros; > 0 ao criar |
| `currency` | ARS ou USD — nunca se mistura |
| `period` | `weekly` (7 dias desde o primeiro dia da semana das definições) · `monthly` · `quarterly` (jan/abr/jul/out) · `yearly` · `custom` (datas livres) |
| `startDate`, `endDate` | Datas de calendário de Buenos Aires; o schema confirma que batem com o período |
| `description?` | Opcional, até 200 caracteres |
| `status?` | `active` (ausente = ativo) · `archived` |

Ficheiros: `data/budgets/AAAA.json`, pelo ano de `startDate` (já existia).

## O que conta como gasto — [`src/domain/rules/budgets.ts`](../../src/domain/rules/budgets.ts)

- Só **despesas**: transferências e receitas nunca.
- Nem canceladas nem eliminadas; **gasto = completadas**. As pendentes aparecem à parte ("no incluidos") e não mudam o estado.
- Só na moeda do orçamento e com data dentro do período.
- Compras com cartão de crédito contam na data da compra (é consumo, mesmo sem mexer na conta: D4-08).
- Cada transação conta uma vez por orçamento.
- Nada fica guardado: os indicadores recalculam-se a cada leitura, por isso acompanham qualquer criação, edição ou cancelamento de transações.

## Estados (constantes `BUDGET_THRESHOLDS`, um só sítio)

| Estado | Usado | Cor (Design System) |
| --- | --- | --- |
| Dentro del presupuesto | < 85 % | forest |
| Atención | ≥ 85 % | warning |
| Cerca del límite | ≥ 95 % e ≤ 100 % | warning |
| Excedido | > 100 % | alert |

Os limiares seguem a regra do Design System ("> 85 % warning, > 100 % alert"). A comparação é feita em inteiros (`gasto × 100` contra `limite × limiar`), sem vírgula flutuante. A percentagem mostrada é arredondada para baixo.

## Interface

- **Lista** em secções: En curso · Próximos · Terminados · Archivados. Cada linha: nome, período e datas, estado (ponto + texto), gasto e limite, barra fina com o marcador do **ritmo esperado** (parte do período já decorrida), "Quedan …" ou "Excedido por …" e a percentagem.
- **Filtro** "Mostrar": todos, atenção ou perto do limite, excedidos, dentro. Sem resultados → mensagem e "Ver todos".
- **Criar / editar** na sheet lateral. O período encaixa as datas (a semana, mês, trimestre ou ano que contém a data inicial) e mostra o intervalo antes de guardar; personalizado pede as duas datas.
- **Detalhe**: disponível ou excedido, estado, barra com ritmo, limite, gasto, usado, pendentes, datas, estado, moeda, a regra do que conta, **histórico** (os 5 períodos anteriores com o mesmo limite, em colunas) e os **gastos incluídos** (20 primeiros).
- Ações: editar, arquivar / reativar, eliminar (com confirmação; os gastos ficam em Transacciones).
- **Resumen**: gasto e orçamentado por moeda, número de ativos, excedidos e perto do limite, as **categorias com mais gasto** do mês (agrupadas pela categoria de topo, com o limite quando há orçamento) e os orçamentos em curso.

### Totais do resumo

Por moeda: soma dos limites dos orçamentos **por categoria** em curso e o gasto deles contado **uma vez** (um orçamento de "Alimentación" e outro da subcategoria "Supermercado" não somam o mesmo gasto duas vezes). Os orçamentos gerais não entram nesse total para não duplicar; se uma moeda só tem gerais, mostram-se esses, com a indicação "Límite general".

## Regras no repositório

- Novo orçamento: ativo e com limite > 0.
- Categoria tem de existir e ser de gasto.
- **Sem duplicados**: dois orçamentos ativos com a mesma categoria (ou ambos gerais), moeda e tipo de período não se podem sobrepor (`POSSIBLE_DUPLICATE`), nem ao reativar um arquivado.
- Uma categoria usada por um orçamento não se elimina (desativa-se).
- Eliminar é um tombstone com operação no `outbox`, como em todas as entidades.

## Ficheiros

`src/domain/rules/budgets.ts`, `src/features/planning/` (`planning-page.tsx`, `budget-form.tsx`, `budget-detail.tsx`, `data.ts`, `forms.ts`, `ui.tsx`), `src/services/repositories/repositories.ts`.
