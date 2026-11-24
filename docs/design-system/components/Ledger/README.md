# Ledger

O extrato de Transações: tabela agrupada por dia no desktop, lista agrupada no iPhone.

- Tabela sobre `bg-surface` com `radius-md` e contorno `line`; sem bordas verticais; cabeçalho em `label`.
- Cabeçalho de dia em `bg-paper-2` com o subtotal do dia alinhado com a coluna de valores.
- Valores à direita, `tabular-nums`, sinal explícito, centavos em `ink-2`.
- Hover em tom quase branco; seleção em `lake-tint`. Clicar abre a sheet lateral de edição.
- No iPhone a conta e a categoria passam para a linha de metadados; os centavos desaparecem se forem ,00.
- Registos criados ou alterados neste dispositivo e ainda não publicados mostram "Só neste dispositivo" com ponto `ink-3` (D1).
- Colunas (D4): desktop 5 (Data · Descrição com categoria · Conta · Estado · Valor); tablet 4 (conta e categoria na linha da descrição); iPhone em lista.
