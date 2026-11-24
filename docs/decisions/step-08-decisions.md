# Decisões do Step 08 — Reports & Analytics

Tomadas durante a implementação autónoma pedida no brief do Step 08 (2026-11-24). Para rever pelo responsável.

| ID | Decisão |
| --- | --- |
| D8-01 | Cálculos centralizados em `src/domain/rules/reports.ts` (puros) e montados uma vez em `buildReport`; página, CSV, JSON e impressão usam o mesmo objeto. Só combinam regras existentes (`periodFlow`, `deriveAccountBalance`, `budgetUsage`, `budgetHistory`, `goalProgress`, `billBalance`, `occurrencesBetween`). |
| D8-02 | Uma moeda de cada vez na interface (seletor quando há mais de uma); as exportações trazem todas as moedas, sempre separadas. Sem conversão. |
| D8-03 | Fluxo de caixa = efeito nos saldos das contas (completados): compras a crédito não saem da conta (D4-08); transferências internas anulam-se; com filtro de conta, transferências entram/saem. Identidade testada: saldo final = inicial + variação. |
| D8-04 | Comparações: período anterior equivalente (personalizado → mesmo nº de dias antes) ou mesmo período do ano anterior (semana: −364 dias; 29/02 → 28/02). Percentagem contra zero não é mostrada. |
| D8-05 | **Exportação de relatórios em texto simples (CSV/JSON) e impressão/PDF**, pedida explicitamente no brief. É distinta da exportação de dados/backup (`pfm.export`, OD-5/D2-07), que continua sem botão até à cifragem do desenho A. Os ficheiros contêm dados financeiros e **não estão cifrados**; a interface di-lo junto aos botões e no cabeçalho impresso; o JSON tem `encrypted: false`. Exceção registada em [data-security.md](../architecture/data-security.md). |
| D8-06 | Sem donut/pie (regra P-10 prevalece sobre o brief): distribuição por categoria como ranking de barras com percentagens. |
| D8-07 | Filtros de categoria/tipo não se aplicam a contas, fluxo de caixa, orçamentos e metas (saldos completos); aviso visível quando ativos. |
| D8-08 | "Previsto" (só no fluxo de caixa, nunca nos totais): pendentes do período, falta pagar de contas domésticas que vencem no período, ocorrências de recorrências de despesa de hoje até ao fim do período ainda não representadas por conta doméstica ou transação. |
| D8-09 | Pagamentos de fatura de cartão: não existem no modelo (OD-8 por implementar); a secção Tarjetas diz que não há pagamentos a informar. |
| D8-10 | Ritmo de uma meta: aportes vivos dos últimos 90 dias ÷ 3 (por mês), só com ≥ 2 aportes; estimativa de data marcada como estimativa. |
| D8-11 | Impressão: `beforeprint`/`afterprint` mostram todas as secções; navegações com `print:hidden`; gráficos com largura fixa (680 px) na impressão porque o `ResponsiveContainer` não volta a medir. |
| D8-12 | Seleções dos Informes não ficam em LocalStorage (a lista fechada de preferências não muda). |
