# Responsivo

Três experiências, com papéis diferentes. Não é o mesmo layout a encolher.

| | Mobile / iPhone | Tablet | Desktop |
| --- | --- | --- | --- |
| Intervalo | < 768px | 768–1199px | ≥ 1200px |
| Papel principal | **Registar e verificar** | Rever no sofá | **Analisar e organizar** |
| Navegação | Tab bar inferior (4 + botão +) | Rail de ícones 72px + labels em tooltip; retrato: tab bar | Sidebar de texto 232px |
| Criar / editar | Bottom sheet a altura total | Sheet lateral 440px | Sheet lateral 440px |
| Tabelas | Listas agrupadas por dia | Tabela de 4 colunas (a conta passa para a área da descrição) | Tabela de 5 colunas |
| Gráficos | Um de cada vez, com tabs | Lado a lado em 6/6 | Na grelha editorial |

## Desktop

- Grelha de 12 colunas, margens de 48px, máximo 1240px.
- Tabela de Transações com **5 colunas**: Data · Descrição (categoria na linha de baixo) · Conta · Estado · Valor (D4). A categoria não tem coluna própria.
- Atalhos: `N` nova transação, `⌘K` comando, `/` pesquisar, `←/→` mês anterior/seguinte, `E` editar a linha em foco, `J/K` navegar linhas.
- Hover revela ações de linha (⋯, "Marcar como paga"); nada essencial depende só de hover.

## Tablet

- **Paisagem (≥1024px):** rail de 72px com ícones Lucide de 20px e o + no topo; grelha de 8 colunas. O Dashboard passa a: herói 8/8 com o extrato do mês por baixo em 3 colunas de texto; depois "A vencer" 4/8 + evolução 4/8; depois categorias 4/8 + orçamento 4/8.
- **Retrato (768–1023px):** usa a tab bar do mobile, mas o conteúdo mantém duas colunas onde cabem (indicadores, A vencer + evolução).
- Tabela de Transações com **4 colunas**: Data · Descrição (conta e categoria na linha de baixo) · Estado · Valor (D4).
- Sheets laterais mantêm 440px; o conteúdo atrás não reflui.

## Mobile / iPhone

Pensado para uma mão e para a PWA instalada (ecrã inteiro, safe areas).

- **Tab bar** (64px + safe-area): Início · Transações · **+** · Obrigações · Mais. "Obrigações" dá acesso a Contas domésticas, Cartões e Recorrências, as três respostas a "o que tenho de pagar". Cada uma continua a ser uma área própria, com rota, título e URL seus; a tab abre a última usada e um controlo segmentado troca entre elas. "Mais" é o índice das nove áreas. Regras completas em **Arquitetura → Mapa das nove áreas por dispositivo**; preview em **NavMobile**.
- **O botão +** é o gesto principal do produto: abre o **Registo rápido** (ver preview QuickAdd). Objetivo: registar uma despesa em menos de 5 segundos com três toques: valor → categoria → Guardar. Conta e data têm valores por defeito (última conta usada, hoje).
- **Valores:** o herói a 52px; valores de lista a 15px tabulares e alinhados à direita. Nunca abreviados.
- **Tabelas → listas:** cada transação é uma linha de 60px: descrição em `body`, "Conta · Categoria" em `body-sm`, valor à direita, estado como texto na linha de metadados quando não é "Paga". Cabeçalhos de dia "sticky" com o subtotal do dia (D4).
- **Gestos:** swipe para a esquerda numa conta a vencer → "Paga"; pull-to-refresh no Início e em Transações.
- **Menos elementos ao mesmo tempo:** no Início, evolução e categorias partilham um bloco com tabs; o orçamento mostra as 3 categorias mais em risco + "Ver orçamento".
- **Teclado:** o campo de valor usa teclado numérico próprio na sheet (não o do sistema) para controlar vírgula decimal e milhares em es-AR.
- **Alvos de toque** ≥ 44px. Tamanhos mínimos (D5): 13px para texto de leitura; 12px (`caption`) para legendas da tab bar, badges e notas de gráficos; 11px só para `label`, incluindo as abreviaturas de mês.
- **Offline e local-first:** a app funciona sem rede; os dados vivem no IndexedDB do dispositivo. Registos criados ou alterados aqui e ainda não publicados aparecem com um ponto `ink-3` e "Só neste dispositivo". Não há sincronização automática entre dispositivos (D1); ver **PFM - Arquitetura de Dados**.
