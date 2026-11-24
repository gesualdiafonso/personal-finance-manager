# Cores e tokens

Referência completa da paleta: valores HEX nos dois temas, função semântica de cada token, estados dos componentes e rácios de contraste WCAG 2.2 AA. Os valores vêm de `tokens.json`, que é a fonte única; as tabelas desta página foram geradas a partir dele e verificadas por script.

**Regras de uso** (normativas, ver **Regras obrigatórias**):

- A implementação usa **só tokens**. Nenhum HEX, `rgb()` ou cor do Tailwind (`slate-500`, `green-600`…) aparece em componentes.
- Os nomes dos tokens são semânticos (`ink-2`, `alert-text`), nunca descritivos (`grey-600`). Um tema muda os valores, não os nomes.
- Texto só em tokens marcados para texto: `ink`, `ink-2`, `forest`, `lake`, `alert-text`, `warning-text`, `on-primary`, `on-alert`. `ink-3`, `sage`, `alert`, `warning` e `chart-muted` nunca são cor de texto que se precise de ler.

## 1. Paleta completa

| Token | Claro | Escuro | Função |
| --- | --- | --- | --- |
| `bg-paper` | #F5F3ED | #161A17 | Background principal de todas as páginas. |
| `bg-paper-2` | #ECE9E1 | #1D221E | Background secundário: sidebar, faixa de indicadores secundários, linha de cabeçalho de grupo no extrato, hover de linhas. |
| `bg-surface` | #FFFFFF | #232924 | Superfícies elevadas: painéis laterais (sheets), diálogos, inputs, popovers e a tabela de Transações. |
| `bg-surface-hover` | #FAF9F5 | #2A312C | Hover de linha sobre bg-surface (tabela de Transações, itens de menu). |
| `ink` | #202622 | #ECE9E1 | Texto principal e todos os valores monetários. |
| `ink-2` | #66665E | #A9A79D | Texto secundário: metadados, labels, legendas, eixos. |
| `ink-3` | #8A8679 | #767569 | Placeholder, estados desativados e bordas de controlos (inputs, checkbox). |
| `line` | #DDDAD1 | #313833 | Separadores e hairlines de 1px (Stone original). |
| `line-strong` | #8A8679 | #767569 | {ink-3} — Borda de inputs, selects e checkboxes (≥3:1). |
| `forest` | #344B3C | #8DB09A | Cor primária: botão primário, item ativo da navegação, série principal dos gráficos, orçamento dentro do limite, estado 'pago'. |
| `forest-hover` | #2A3D31 | #A3C1AD | Hover/pressed do botão primário. |
| `forest-pressed` | #22332A | #B5CDBB | Estado pressionado do botão primário. |
| `on-primary` | #F5F3ED | #161A17 | Texto e ícones sobre forest (botão primário, botão + da tab bar). |
| `forest-tint` | #E3E7DE | #243329 | Fundo do item ativo na sidebar e badge 'Pago'. |
| `sage` | #7A8873 | #7E8C77 | Apenas visualização de dados e elementos não-textuais (barras de categoria, progresso neutro). |
| `lake` | #46606E | #93AEBC | Cor de destaque (nova): seleção, período em foco, links, anel de foco, filtros ativos. |
| `lake-tint` | #E2E8EA | #1F2B31 | Fundo de filtro ativo e de linha selecionada. |
| `focus-ring` | #46606E | #93AEBC | {lake} — Anel de foco de 2px em todos os controlos focáveis (offset 2px). |
| `success` | #344B3C | #8DB09A | {forest} — Sucesso partilha o Forest. |
| `alert` | #B75C4B | #D07A68 | Erro e excesso, como preenchimento: barra de orçamento estourada, ponto de conta vencida, ícone de erro. |
| `alert-text` | #9A4A3A | #E59C8C | Texto de erro, valores de contas vencidas, mensagens de validação. |
| `alert-tint` | #F4E4DF | #3A231E | Fundo de badge 'Vencida' e de banner de erro. |
| `on-alert` | #FFFFFF | #161A17 | Texto sobre alert (botão destrutivo). |
| `warning` | #AD7B28 | #C99A4A | Aviso como preenchimento (ocre): orçamento acima de 85%, conta a vencer em ≤3 dias. |
| `warning-text` | #7D560E | #DDB36A | Texto de aviso. |
| `warning-tint` | #F3E9D3 | #352B1A | Fundo de badge 'Vence em breve'. |
| `chart-muted` | #C8C3B6 | #454D47 | Barras de períodos passados e séries de contexto nos gráficos, para o período atual em forest se destacar. |
| `scrim` | rgba(32, 38, 34, 0.32) | rgba(0, 0, 0, 0.55) | Véu atrás de sheets e diálogos. |

## 2. Funções semânticas

| Função | Token(s) | Onde aparece | Onde não aparece |
| --- | --- | --- | --- |
| Background principal | `bg-paper` | Fundo de todas as páginas | — |
| Background secundário | `bg-paper-2` | Sidebar, faixa de obrigações, cabeçalhos de dia, esqueletos de carregamento | Áreas grandes de conteúdo |
| Superfícies | `bg-surface` | Tabela de Transações, sheets, diálogos, popovers, inputs | Secções do Dashboard (não há cards) |
| Texto principal | `ink` | Todo o texto corrente e **todos os valores monetários** | — |
| Texto secundário | `ink-2` | Metadados, labels, eixos, centavos | Valores principais |
| Primária | `forest` | Um botão primário por ecrã, navegação ativa, série atual nos gráficos, orçamento dentro do limite | Receitas, fundos de secção, ícones decorativos |
| Destaque | `lake` | Seleção, foco, filtros ativos, links | Estados bons ou maus |
| Sucesso | `success` → `forest` | Badge "Paga"/"Recebida", toast de gravação | Valores de receita |
| Erro | `alert`, `alert-text`, `alert-tint` | Conta vencida, orçamento excedido, validação, ação destrutiva | Despesas normais |
| Aviso | `warning`, `warning-text`, `warning-tint` | Vence em ≤3 dias, orçamento >85% | Decoração |
| Bordas e separadores | `line` (hairline), `line-strong` (controlos) | Separar secções e linhas; contornar inputs | Contornar blocos de conteúdo |
| Dados | `sage`, `chart-muted` | Barras e séries de contexto | Texto |
| Véu | `scrim` | Atrás de sheets e diálogos | — |

## 3. Estados dos componentes

| Componente | Repouso | Hover | Pressionado | Foco (teclado) | Desativado | Ativo / selecionado |
| --- | --- | --- | --- | --- | --- | --- |
| Botão primário | `forest` + `on-primary` | `forest-hover` | `forest-pressed` | anel 2px `focus-ring`, offset 2px | `bg-paper-2` + texto `ink-3` | — |
| Botão secundário | transparente, borda `line-strong`, texto `ink` | fundo `bg-paper-2` | fundo `line` | anel `focus-ring` | borda `line`, texto `ink-3` | — |
| Botão ghost | transparente, texto `ink` | fundo `bg-paper-2` | fundo `line` | anel `focus-ring` | texto `ink-3` | — |
| Botão destrutivo | `alert` + `on-alert` | `alert-text` + `on-alert` | `alert-text` | anel `focus-ring` | `bg-paper-2` + `ink-3` | — |
| Input | `bg-surface`, borda `line-strong` | borda `ink-2` | — | borda `lake` + anel `focus-ring` 2px | `bg-paper-2`, borda `line`, texto `ink-3` | Erro: borda `alert` + mensagem `alert-text` |
| Item de navegação | texto `ink-2` | texto `ink` | — | anel `focus-ring` | — | `forest-tint` + texto `forest` 600 |
| Linha de tabela | `bg-surface` | `bg-surface-hover` | — | anel interior `focus-ring` | — | `lake-tint` |
| Chip de filtro | borda `line`, texto `ink` | fundo `bg-paper-2` | — | anel `focus-ring` | texto `ink-3` | `lake-tint` + texto `lake` |
| Checkbox / switch | borda `line-strong` | borda `ink-2` | — | anel `focus-ring` | borda `line` | preenchido `forest` + marca `on-primary` |
| Link | texto `lake` | sublinhado 1px | — | anel `focus-ring` | — | — |
| Tab sublinhada | texto `ink-2` | texto `ink` | — | anel `focus-ring` | — | texto `ink` + sublinhado 2px `ink` |

O foco é **sempre visível com teclado** (`:focus-visible`) e nunca é removido. O estado de erro nunca depende só da cor: a mensagem diz o que corrigir.

## 4. Contraste WCAG 2.2 AA

Mínimos aplicados: **4.5:1** para texto (até 24px, ou 18.66px a negrito), **3:1** para texto grande, objetos gráficos que transmitem informação (barras, ícones), bordas de controlos e anéis de foco (critérios 1.4.3 e 1.4.11).

| Primeiro plano | Fundo | Uso | Mínimo AA | Claro | Escuro |
| --- | --- | --- | --- | --- | --- |
| `ink` | `bg-paper` | Texto principal | 4.5:1 | 13.90:1 ✓ | 14.49:1 ✓ |
| `ink` | `bg-paper-2` | Texto na sidebar e faixas | 4.5:1 | 12.71:1 ✓ | 13.32:1 ✓ |
| `ink` | `bg-surface` | Texto em tabelas, sheets, inputs | 4.5:1 | 15.42:1 ✓ | 12.24:1 ✓ |
| `ink-2` | `bg-paper` | Texto secundário | 4.5:1 | 5.22:1 ✓ | 7.29:1 ✓ |
| `ink-2` | `bg-paper-2` | Labels na sidebar e faixas | 4.5:1 | 4.77:1 ✓ | 6.69:1 ✓ |
| `ink-2` | `bg-surface` | Metadados em tabelas | 4.5:1 | 5.79:1 ✓ | 6.15:1 ✓ |
| `ink-3` | `bg-paper` | Bordas de controlos, placeholder | 3:1 | 3.28:1 ✓ | 3.78:1 ✓ |
| `ink-3` | `bg-surface` | Borda de input sobre superfície | 3:1 | 3.64:1 ✓ | 3.20:1 ✓ |
| `forest` | `bg-paper` | Navegação ativa, ligação primária | 4.5:1 | 8.53:1 ✓ | 7.38:1 ✓ |
| `forest` | `forest-tint` | Item ativo da sidebar, badge Pago | 4.5:1 | 7.55:1 ✓ | 5.57:1 ✓ |
| `on-primary` | `forest` | Texto do botão primário | 4.5:1 | 8.53:1 ✓ | 7.38:1 ✓ |
| `on-primary` | `forest-hover` | Botão primário em hover | 4.5:1 | 10.45:1 ✓ | 9.03:1 ✓ |
| `on-primary` | `forest-pressed` | Botão primário pressionado | 4.5:1 | 12.02:1 ✓ | 10.40:1 ✓ |
| `lake` | `bg-paper` | Links, anel de foco | 4.5:1 | 5.99:1 ✓ | 7.55:1 ✓ |
| `lake` | `lake-tint` | Chip de filtro ativo | 4.5:1 | 5.37:1 ✓ | 6.23:1 ✓ |
| `lake` | `bg-surface` | Anel de foco sobre superfície | 3:1 | 6.65:1 ✓ | 6.38:1 ✓ |
| `alert-text` | `bg-paper` | Valor vencido, erro de validação | 4.5:1 | 5.54:1 ✓ | 7.93:1 ✓ |
| `alert-text` | `alert-tint` | Badge Vencida | 4.5:1 | 4.98:1 ✓ | 6.58:1 ✓ |
| `on-alert` | `alert` | Botão destrutivo | 4.5:1 | 4.52:1 ✓ | 5.58:1 ✓ |
| `alert` | `bg-paper` | Barra de orçamento excedido | 3:1 | 4.07:1 ✓ | 5.58:1 ✓ |
| `warning-text` | `bg-paper` | Texto de aviso | 4.5:1 | 5.90:1 ✓ | 8.99:1 ✓ |
| `warning-text` | `warning-tint` | Badge Vence em breve | 4.5:1 | 5.42:1 ✓ | 7.10:1 ✓ |
| `warning` | `bg-paper` | Barra de orçamento acima de 85% | 3:1 | 3.36:1 ✓ | 6.87:1 ✓ |
| `sage` | `bg-paper` | Barras de categoria | 3:1 | 3.38:1 ✓ | 4.94:1 ✓ |
| `forest` | `chart-muted` | Mês atual vs. meses anteriores | 3:1 | 5.38:1 ✓ | 3.66:1 ✓ |
| `ink` | `bg-surface-hover` | Linha em hover | 4.5:1 | 14.64:1 ✓ | 11.00:1 ✓ |
| `ink-2` | `bg-surface-hover` | Metadados em linha com hover | 4.5:1 | 5.50:1 ✓ | 5.53:1 ✓ |

**Ajustes feitos para cumprir AA** (face à paleta inicial): Muted #77776F → `ink-2` #66665E; texto de erro #B75C4B → `alert-text` #9A4A3A; Sage #84917D → #7A8873 (objeto gráfico abaixo de 3:1); ocre de aviso escurecido para #AD7B28; `line-strong` #8A8679 criado para bordas de controlos, porque o Stone (#DDDAD1) só serve para hairlines decorativas.

**Distinção que não depende só da cor:** aviso (`warning`) e erro (`alert`) diferem pouco em luminosidade (1.21:1). Por isso nunca aparecem sozinhos: o valor excedido passa a `alert-text`, há um badge com texto ("Vencida", "2 dias") e a percentagem está sempre escrita.
