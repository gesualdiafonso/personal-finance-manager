# Dashboard — composição editorial

O Dashboard responde, por esta ordem, a quatro perguntas. A composição segue essa ordem, e o tamanho de cada bloco é proporcional à importância da pergunta.

1. **Quanto tenho?** (saldo disponível)
2. **Como está o mês?** (receitas, despesas, líquido)
3. **O que vem a seguir?** (por pagar, cartões, a vencer)
4. **Para onde vai o dinheiro?** (evolução, categorias, orçamento)

## Níveis de importância

| Nível | Conteúdo | Tratamento |
| --- | --- | --- |
| **1. Principal** | Saldo total disponível | `display-hero` em serifa, 76px. Único na página. Sem caixa. |
| **2. Mês** | Receitas, despesas, saldo líquido | Um **mini-extrato** em três linhas com réguas, valores alinhados à direita; o líquido em `amount-xl` após uma régua dupla, como num balanço. Não são três cards. |
| **3. Obrigações** | Despesas pendentes, total comprometido nos cartões, próximas contas | Faixa `bg-paper-2` com dois indicadores em `amount-lg` separados por hairline vertical + lista "A vencer" com o dia em destaque. |
| **4. Evolução** | Despesas dos últimos 6 meses | Barras verticais; meses passados em `chart-muted`, mês atual em `forest`; média como linha pontilhada em `ink-2`. |
| **5. Distribuição** | Despesas por categoria | Barras horizontais ordenadas, todas em `sage`, com valor e % à direita. **Sem donut** (comparar ângulos é mais difícil do que comparar comprimentos). |
| **6. Plano** | Orçamento vs. real | Uma linha por categoria: barra de progresso fina, marcador vertical do "ritmo do mês" (dia 23 de 30 = 77%). Dentro do ritmo: `forest`. >85%: `warning`. >100%: `alert`. |
| **7. Atalhos** | Operações frequentes | Três ações em texto na faixa de obrigações: "Registar despesa", "Pagar conta", "Ver fatura". Não é uma grelha de botões. |

## Grelha desktop (12 colunas, 1240px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEGUNDA, 23 DE NOVEMBRO                     ‹ Nov 2026 ›  [Nova  N] │
│ Novembro                                                            │
├────────────────────────────────────────────┬──┬──────────────────────┤
│ SALDO DISPONÍVEL                           │  │ NOVEMBRO ATÉ HOJE    │
│ $ 4.812.340,56            (col 1–7)        │  │ Receitas   +3.450.000│
│ ████████▓▓▓▓▓░░░ 4 contas                  │  │ Despesas   −2.187.420│
│                                            │  │ ════════════════════ │
│                                            │  │ Líquido     1.262.580│ (col 9–12)
├────────────────────────────────────────────┴──┴──────────────────────┤
│ ▒ POR PAGAR $ 684.200 │ CARTÕES $ 1.126.900 │ Registar · Pagar · Ver ▒│ faixa paper-2
├──────────────────────────────┬──┬─────────────────────────────────────┤
│ A VENCER     (col 1–5)       │  │ DESPESAS, ÚLTIMOS SEIS MESES        │
│ 25 Expensas        $ 210.000 │  │  ▁ ▃ ▂ ▅ ▃ █      (col 7–12)        │
│ 27 Electricidade    $ 48.700 │  │                                     │
├──────────────────────────────┴──┴─────────────────────────────────────┤
│ POR CATEGORIA (col 1–5)      │  │ ORÇAMENTO VS. REAL (col 7–12)       │
└──────────────────────────────────────────────────────────────────────┘
```

A alternância 7·1·4 → faixa inteira → 5·1·6 → 5·1·6 cria uma diagonal de leitura: herói em cima à esquerda, depois obrigações e evolução, e por fim o detalhe. A coluna vazia (col 8 ou col 6) é espaço negativo deliberado; não se preenche.

## Comportamentos

- **Seletor de período** muda tudo exceto o saldo disponível (que é sempre "agora"); quando o mês não é o corrente, o título muda para "Outubro 2026" e o herói passa a "Saldo no fim do mês".
- **Clicar num valor** leva ao Extrato já filtrado (ex.: "Despesas" → Transações, novembro, tipo = despesa).
- **Barra das contas** sob o herói: proporção do saldo por conta; hover mostra conta e valor. É a única visualização junto do herói.
- **Carregamento:** esqueletos em `bg-paper-2` com a forma exata do conteúdo (linhas do extrato, barras), nunca spinners de página.
- **Vazio (primeiro uso):** o herói mostra "$ 0" em `ink-2` (texto secundário; `ink-3` não é token de texto) e por baixo a frase "Adiciona a primeira conta para começar." com o botão secundário "Adicionar conta". As secções inferiores não aparecem até haver dados.

## Mobile

Ver o preview **DashboardMobile** e a secção **Responsivo**. Em resumo, a ordem mantém-se mas cada nível ocupa a largura toda; os gráficos de evolução e categorias passam para um único bloco com tabs; o orçamento mostra só as três categorias mais próximas do limite.
