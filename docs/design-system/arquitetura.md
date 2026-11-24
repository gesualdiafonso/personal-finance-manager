# Arquitetura de navegação

## As nove áreas, agrupadas por intenção

O utilizador não pensa em "módulos", pensa em perguntas. A navegação agrupa as nove áreas por essas perguntas, e a ordem segue a frequência de uso.

| Grupo (label) | Área | Pergunta a que responde | Frequência |
| --- | --- | --- | --- |
| — | **Dashboard** | Como estou este mês? | diária |
| — | **Transações** | Onde foi o dinheiro? | diária |
| OBRIGAÇÕES | **Contas domésticas** | O que tenho de pagar e quando? | semanal |
| | **Cartões** | Quanto devo nos cartões e quando fecha a fatura? | semanal |
| | **Recorrências** | O que se repete sozinho? | mensal |
| PATRIMÓNIO | **Contas** | Onde está o dinheiro? | semanal |
| PLANO | **Orçamento** | Estou dentro do que planeei? | semanal |
| | **Relatórios** | Como evoluí? | mensal |
| (rodapé) | **Configurações** | — | rara |

## Mapa das nove áreas por dispositivo

As nove áreas são **nove destinos próprios**, cada um com a sua rota, em todos os formatos. O agrupamento "Obrigações" no iPhone é só uma forma de chegar a três delas com o polegar: não as funde nem lhes tira a identidade.

| Área | Rota própria | Desktop (sidebar) | Tablet (rail) | iPhone: acesso principal | iPhone: acesso alternativo |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `/` | Item | Ícone | Tab **Início** | Mais → Dashboard |
| Transações | `/transacoes` | Item | Ícone | Tab **Transações** | Mais → Transações |
| Contas domésticas | `/contas-domesticas` | Item (grupo Obrigações) | Ícone | Tab **Obrigações** → segmento *Contas domésticas* | Mais → Contas domésticas |
| Cartões | `/cartoes` | Item (grupo Obrigações) | Ícone | Tab **Obrigações** → segmento *Cartões* | Mais → Cartões |
| Recorrências | `/recorrencias` | Item (grupo Obrigações) | Ícone | Tab **Obrigações** → segmento *Recorrências* | Mais → Recorrências |
| Contas | `/contas` | Item | Ícone | Mais → Contas | Toque na barra das contas, no Início |
| Orçamento | `/orcamento` | Item | Ícone | Mais → Orçamento | "Orçamento em risco" no Início |
| Relatórios | `/relatorios` | Item | Ícone | Mais → Relatórios | — |
| Configurações | `/configuracoes` | Rodapé | Rodapé do rail | Mais → Configurações | — |

**Garantias do agrupamento "Obrigações" no iPhone:**

1. **Sem página "Obrigações" própria.** A tab abre diretamente uma das três áreas: a última usada (por defeito, *Contas domésticas*). Não há um ecrã intermédio de escolha.
2. **Cada área tem a sua rota.** O URL muda com o segmento (`/cartoes`, não `/obrigacoes?tab=2`). Links profundos, partilhas, atalhos da PWA e notificações abrem a área certa, e o botão voltar funciona.
3. **O controlo segmentado no topo** (*Contas domésticas · Cartões · Recorrências*) troca entre elas com um toque. O título da página é o nome da área, não "Obrigações".
4. **Pressão longa na tab** mostra as três áreas para saltar diretamente.
5. **"Mais" lista as nove áreas**, incluindo as que já estão na tab bar, como índice completo. Nenhuma área existe só dentro de outra.
6. **Atalhos da PWA** (manifest `shortcuts`): Nova transação, Contas domésticas, Cartões.

## Arquétipos de página

Nem todas as páginas têm a mesma estrutura. Há seis arquétipos, cada um com a sua composição:

| Arquétipo | Páginas | Estrutura |
| --- | --- | --- |
| **Editorial** | Dashboard | Grelha assimétrica 7/5 ↔ 5/7, um herói, secções separadas por hairlines. Ver **Dashboard**. |
| **Extrato** | Transações | Barra de filtros fixa + tabela densa agrupada por dia, com subtotal por dia. Detalhe abre em sheet lateral, sem sair da lista. |
| **Coleção → detalhe** | Contas, Cartões | Lista de objetos com saldo/limite; o detalhe é uma página própria (com breadcrumb) com cabeçalho-resumo e o extrato filtrado. No Cartão, o detalhe é organizado por **fatura** (aberta, fechada, paga). |
| **Calendário de obrigações** | Contas domésticas, Recorrências | Lista temporal agrupada por "Vencidas / Esta semana / Este mês / Depois", com estado e ação "Marcar como paga" na própria linha. |
| **Plano** | Orçamento | Uma linha por categoria: orçado, gasto, barra de progresso com marcador do dia do mês ("ritmo esperado"). Edição inline. |
| **Análise** | Relatórios | Gráfico primeiro, a toda a largura, com seletor de período e comparação; tabela de suporte por baixo. |
| **Formulário** | Configurações | Duas colunas: explicação à esquerda (4 col.), controlos à direita (6 col.). Secções separadas por hairline. |

## Sidebar (desktop ≥1200px)

- 232px, fundo `bg-paper-2`, separada do conteúdo por uma hairline `line`. Fixa, sem scroll próprio salvo em alturas pequenas.
- **Topo:** a palavra PFM (Instrument Serif 22px) e, por baixo, o botão primário **Nova transação** a toda a largura com o atalho `N` visível.
- **Itens só em texto** (estilo `nav`), 36px de altura, sem ícones. Ativo: fundo `forest-tint`, texto `forest`, peso 600. Hover: texto `ink`.
- Labels de grupo em `label` (maiúsculas, `ink-2`), com 24px de espaço antes.
- Contadores discretos à direita só quando pedem ação: número de contas vencidas em `alert-text`, a vencer esta semana em `ink-2`. Nunca contadores decorativos.
- **Rodapé:** Configurações e o estado dos dados locais (D1, sem sincronização automática): "Dados de 23 nov, 09:10" (data da publicação importada) e, quando existem, "3 alterações por exportar" com a ação **Exportar**. No iPhone, o mesmo estado aparece em Configurações.

## Cabeçalho

Não há uma barra de topo global. Cada página tem um **cabeçalho editorial** dentro do conteúdo:

- À esquerda: `label` de contexto (ex.: "SEGUNDA, 23 DE NOVEMBRO" ou o breadcrumb) e o título em `title-page`.
- À direita: o **seletor de período** (‹ Novembro 2026 ›) quando a página depende do mês, e **uma** ação primária contextual (no Dashboard e em Transações, "Nova transação"; em Cartões, "Novo cartão"; em Orçamento, "Editar orçamento").
- Ao fazer scroll, o cabeçalho colapsa para uma barra de 56px com o título em `heading` e o seletor de período, sobre `bg-paper` com hairline inferior.

## Breadcrumbs

Só onde há profundidade real: **Contas › Conta corrente**, **Cartões › Visa ··4417 › Fatura de dezembro**, **Relatórios › Despesas por categoria**. Substituem o `label` de contexto acima do título. As páginas de primeiro nível não têm breadcrumb.

## Navegação contextual

- **Tabs sublinhadas** (texto `nav`, sublinhado de 2px em `ink`) dentro de uma página com vistas paralelas: Cartão → *Fatura atual · Próximas · Histórico*; Relatórios → *Despesas · Receitas · Património*.
- **Chips de filtro** (`radius-full`, ativo em `lake-tint` + texto `lake`) no Extrato: período, conta, categoria, tipo, estado.
- **Menu de comando ⌘K** (desktop): saltar para qualquer área, conta ou cartão; criar transação; mudar de mês.

## Ações primárias

| Contexto | Ação | Onde |
| --- | --- | --- |
| Global desktop | Nova transação | Sidebar + atalho `N` em qualquer página |
| Global mobile | Registo rápido | Botão + no centro da tab bar |
| Conta doméstica / Fatura | Marcar como paga | Na própria linha (desktop: botão de texto no hover; mobile: swipe para a esquerda + botão) |
| Página | Uma única ação primária | Canto superior direito do cabeçalho |

Só existe **um** botão `forest` visível de cada vez. Ações secundárias são botões de texto ou ficam no menu ⋯.

## Menus e diálogos

- **Criar / editar** (transação, conta, cartão, recorrência): **sheet lateral direita** de 440px no desktop, com o ecrã por trás visível sob `scrim`. Preserva o contexto: o utilizador vê a lista a que está a acrescentar. No mobile: **bottom sheet** a altura total.
- **Confirmar ações destrutivas**: diálogo central pequeno (400px), título que diz a consequência ("Apagar 3 transações?"), botão destrutivo em `alert` à direita.
- **Menus de linha (⋯)**: popover `bg-surface`, `radius-md`, `shadow-overlay`, itens de 36px, destrutivos no fim, separados por hairline.
- **Toasts**: canto inferior esquerdo no desktop (longe das ações primárias), acima da tab bar no mobile. Sempre com "Anular" quando a ação é reversível.

## Personalização de shadcn/ui

Os componentes shadcn/ui são a base técnica, não a aparência. Antes de qualquer uso:

- Mapear as variáveis do shadcn (`--background`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`) para os tokens deste sistema; `--ring` → `lake`, `--radius` → 6px.
- Remover sombras por defeito de Card, Popover e Select (só `shadow-overlay` onde flutua).
- **Não usar `Card` como contentor por defeito.** No Dashboard não há cards.
- Table: sem bordas verticais, cabeçalho em `label`, linhas de 52px, hover em `bg-paper-2`.
- Button: variantes reduzidas a `primary` (forest), `secondary` (borda `line-strong`, fundo transparente), `ghost` (texto) e `destructive` (alert).
