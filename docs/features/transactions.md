# Transacciones (`/transacciones`)

Implementado no Step 04. Decisões: [D4-01 a D4-17](../decisions/step-04-decisions.md).

## Registar

"Nueva transacción" está em todo o lado: botão da sidebar e do rail, "+" do telemóvel, tecla **N**. Noutra página leva a `/transacciones#nueva`, que abre o formulário.

| Tipo | Campos | Efeito (completado) |
| --- | --- | --- |
| **Gasto** | Importe, categoria (de gasto), descrição, tarjeta (opcional), cuenta, fecha, estado, notas | −importe na conta. Com cartão de **crédito**: não mexe na conta (comprometido); débito/pré-pago: desconta já |
| **Ingreso** | Importe, categoria (de ingresso), descrição, cuenta que recibe, fecha, estado, notas | +importe na conta |
| **Transferencia** | Importe, descrição, desde la cuenta, hacia la cuenta, fecha, estado, notas | −na origem, +no destino; **não** é receita nem despesa; um só registo |

- O importe é sempre positivo; o tipo decide o sentido. Centavos inteiros, formato es-AR.
- A moeda é a da conta. Transferências entre moedas diferentes: bloqueadas com mensagem.
- Categoria: chips com as 4 mais usadas + "Más…". Opcional.
- Com cartão, a conta é a conta de pagamento do cartão (bloqueada).
- Estado: Completado (conta no saldo atual) ou Pendiente (só no projetado).
- Contas arquivadas e cartões inativos não aparecem.
- Um movimento igual a outro (data, tipo, importe, conta, descrição) pede confirmação.

## Consultar

- **Período** (por omissão Este mes): hoy, esta semana, este mes, mes anterior, últimos 30/90 días, este año, personalizado, todo el historial. Calendário de Buenos Aires.
- **Pesquisa** em descrição, notas, conta, instituição e categoria; sem acentos.
- **Filtros** combináveis: tipo, conta (os dois lados de uma transferência), categoria (inclui subcategorias), estado, moeda, cartão. "Quitar filtros". Número de resultados.
- **Ordenação**: mais recentes, mais antigas, maior/menor importe, descrição A–Z.
- **Resumo**: ingresos, gastos e neto por moeda do que está listado (completados; com o filtro "Pendientes", os pendentes).
- **Lista** agrupada por dia com o neto do dia; 100 linhas e "Mostrar más".

## Detalhe, edição, cancelamento, eliminação

Clicar numa linha abre o detalhe. Uma transferência mostra origem, destino, debitado e creditado.

| Estado | Editar | Cancelar | Eliminar |
| --- | --- | --- | --- |
| Completado | Sim (pré-visualiza o efeito nos saldos) | Sim, com confirmação — definitivo | Não (cancelar primeiro) |
| Pendiente | Sim | Sim | Sim, com confirmação |
| Cancelado | Só as notas | — | Sim, com confirmação |

O tipo nunca muda. Todas as regras desta tabela são aplicadas pelo repositório, não só pela interface.

## No detalhe da conta

"Cómo se calcula el saldo": saldo inicial + ingresos − gastos + transferencias recibidas − enviadas = saldo actual, com o que fica de fora (pendentes, cancelados, compras com crédito) e a verificação contra o saldo calculado.

Arquitetura: [transaction-engine.md](../architecture/transaction-engine.md) · Cálculos: [financial-calculations.md](../architecture/financial-calculations.md).
