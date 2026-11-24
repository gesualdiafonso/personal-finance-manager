# DashboardDesktop

Composição de referência do Dashboard em desktop (≥1200px): herói, mini-extrato do mês, faixa de obrigações, A vencer, evolução, categorias e orçamento numa grelha assimétrica de 12 colunas.

- **Sem cards.** A hierarquia faz-se com tamanho, tinta, hairlines e a faixa `bg-paper-2`.
- **Diagonal de leitura:** 7·1·4 → faixa inteira → 5·1·6 → 5·1·6. As colunas vazias são espaço negativo deliberado.
- **Um só botão `forest`** visível (na sidebar). As ações da faixa são ghost/secondary.
- Gráfico de evolução: meses passados em `chart-muted`, mês atual em `forest`, média em linha pontilhada `ink-2`.
- Categorias em barras horizontais `sage` ordenadas; "Outras" sempre no fim, em `chart-muted`.
- Orçamento: cor da barra pelo estado (`forest` → `warning` >85% → `alert` >100%); marcador vertical `ink` = ritmo do mês.
- Dados de exemplo fictícios; somas conferidas (saldo = soma das contas; líquido = receitas − despesas; por pagar = soma de A vencer).
