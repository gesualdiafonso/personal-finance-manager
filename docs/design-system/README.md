# PFM — Design System

> **AUREON (24 nov 2026).** O produto passou a chamar-se **AUREON**. A identidade AUREON estende este Design System, sem o substituir: mantém a grelha, as regras, os componentes e a arquitetura de navegação; muda a paleta (Aureon Forest, Heritage Gold, Ivory Paper, Stone Grey, Deep Charcoal, Sage), a tipografia (Cormorant Garamond + Manrope, em vez de Instrument Serif + Instrument Sans), o logótipo (monograma A e wordmark) e acrescenta ícones à navegação. Os tokens continuam em [tokens.json](tokens.json) (versão 2.0.0). Ver [docs/branding](../branding/BRAND-IDENTITY.md). Onde este livro e a identidade AUREON divergem, prevalece AUREON.

**Finanças pessoais com a calma de uma página bem composta.**

Este é o resultado do STEP 00 (Product Discovery, Art Direction & Design System) do Personal Finance Manager: aplicação web responsiva e PWA, single-user, em ARS, em português, com timezone America/Argentina/Buenos_Aires. Nada aqui é código de implementação: os previews são composições estáticas de referência, e os tokens são o contrato que a implementação (Tailwind + shadcn/ui) vai consumir depois de aprovado.

Lê por esta ordem: este livro da marca → **Regras obrigatórias** → **Cores e tokens** → **Tipografia e formatação financeira** → **Modo escuro** → **Arquitetura de navegação** → **Dashboard** → **Responsivo** → os previews em Components.

**Estado:** direção criativa aprovada como identidade oficial do produto (24 nov 2026). Durante a implementação, esta direção não pode ser substituída por componentes ou templates genéricos.

**Dados:** o PFM não usa base de dados (ADR-001). A arquitetura de dados (JSON no GitHub, IndexedDB, cifragem) está no documento independente **PFM - Arquitetura de Dados**; aqui só fica o que afeta a interface.

**Fonte de verdade:** o brief do projeto (STEP 00). Secções 1–10 incorporadas neste sistema. Secções 11–14 (funcionalidades futuras, Definition of Done e decisões técnicas finais): **bloqueadas**. O documento original completo ainda não foi recebido, e o seu conteúdo não foi presumido nem reconstruído.

---

## 1. A ideia: um extrato que se lê como uma revista

O PFM trata o dinheiro como um texto que se lê, não como um painel de controlo. A metáfora de trabalho é **o extrato impresso bem desenhado**: papel quente, tinta escura, números alinhados em coluna, réguas finas a separar blocos, e uma hierarquia que diz em dois segundos *quanto tenho, quanto entrou, quanto saiu, o que vem a seguir*.

Das quatro referências tirámos uma coisa de cada, não o aspeto:

| Referência | O que levamos | O que deixamos |
| --- | --- | --- |
| Design editorial suíço | Grelha de 12 colunas rígida, labels em maiúsculas espaçadas, alinhamento à esquerda, composições assimétricas | Helvetica, rigidez fria |
| Kinfolk | Papel quente (Paper), paleta natural, espaço negativo generoso, uma serifa para os momentos de pausa | Fotografia de lifestyle, ar de revista de luxo |
| Monzo | Números grandes e inequívocos, sinal explícito (+/−), linguagem simples, listas pensadas para o polegar | Cores vivas, ilustração |
| Linear | Hairlines em vez de caixas, estados (hover, foco, vazio, carregamento) definidos para tudo, atalhos de teclado, densidade controlada | O tema escuro por defeito, o roxo |

## 2. Princípios de trabalho

1. **Uma pergunta por secção.** Cada bloco responde a uma pergunta que o utilizador faz ("Quanto posso gastar?", "O que vence esta semana?"). Se não há pergunta, não há secção.
2. **Hierarquia por tamanho e tinta, não por caixas.** O mais importante é maior e mais escuro. Separamos com espaço e hairlines (`line`), não com cards.
3. **Um herói por página.** Só um valor usa `display-hero`. Tudo o resto subordina-se a ele.
4. **Assimetria com intenção.** As secções alternam divisões 7/5 e 5/7 da grelha, com uma coluna vazia de respiro entre elas. Nunca três ou quatro caixas iguais em linha.
5. **A cor é um sinal.** Neutros fazem 90% do ecrã. Forest = ação e progresso; Lake = seleção e foco; Ochre = atenção; Clay (`alert`) = problema. Se uma cor não comunica nada, sai.
6. **Os números vêm primeiro.** Todos os valores em tabular-nums, alinhados à direita em colunas, com sinal explícito e centavos atenuados.
7. **O desktop e o iPhone são composições diferentes.** O desktop é para rever e analisar; o iPhone é para registar e verificar. Ver **Responsivo**.

## 3. Cor

O ponto de partida foi a paleta proposta. Mantivemos as oito cores e fizemos cinco ajustes, todos por razões de contraste ou de equilíbrio.

| Papel | Token | Valor | Nota |
| --- | --- | --- | --- |
| Background principal | `bg-paper` | #F5F3ED | Paper, sem alterações |
| Background secundário | `bg-paper-2` | #ECE9E1 | **Novo.** Entre Paper e Stone; Stone é escuro demais para uma sidebar inteira |
| Superfícies | `bg-surface` | #FFFFFF | Só para o que se eleva: sheets, diálogos, inputs, tabela |
| Texto principal | `ink` | #202622 | 13.9:1 sobre Paper |
| Texto secundário | `ink-2` | #66665E | **Ajustado** de #77776F (4.07:1, falhava AA) para 5.22:1 |
| Primária | `forest` | #344B3C | Botão primário, navegação ativa, série principal |
| Destaque | `lake` | #46606E | **Novo.** Azul-ardósia dessaturado: seleção, foco, links |
| Sucesso | `success` → `forest` | — | Raro: "Pago", toast de gravação |
| Erro | `alert` / `alert-text` | #B75C4B / #9A4A3A | **Ajustado**: o Alert original dá 4.07:1 em texto; o tom de texto dá 5.54:1 |
| Aviso | `warning` / `warning-text` | #AD7B28 / #7D560E | **Novo**, ocre. A paleta não tinha aviso |
| Bordas e separadores | `line` / `line-strong` | #DDDAD1 / #8A8679 | Stone para hairlines; um tom mais forte (3.28:1) para bordas de inputs |
| Dados | `sage`, `chart-muted` | #7A8873 / #C8C3B6 | **Ajustado**: Sage escurece ligeiramente (#84917D → #7A8873) para cumprir 3:1 em gráficos; nunca texto |

**Porquê o Lake.** Valores completos nos dois temas, estados e todos os rácios de contraste em **Cores e tokens**.

Com Forest, Sage e Alert, a paleta fica toda num eixo quente-verde: cada estado de UI acabaria verde ou vermelho. O Lake é frio, calmo e semanticamente neutro: diz "isto está selecionado", não "isto é bom". Tem a mesma saturação baixa do resto, por isso não parece uma cor de SaaS.

**Regras do verde.** O verde não significa "dinheiro". Receitas aparecem em `ink` com `+`, não a verde. Despesas aparecem em `ink` com `−`, não a vermelho. O vermelho fica para o que exige ação (conta vencida, orçamento estourado). Assim, quando algo aparece a cor, merece atenção.

**Proporção no ecrã:** Paper/Paper-2 ~70%, Ink/Ink-2 ~22%, Line ~4%, Forest ~3%, o resto <1%.

## 4. Tipografia

Avaliámos as seis candidatas propostas contra três critérios: personalidade sem ruído, qualidade dos algarismos tabulares, e se a escolha fica associada a outro produto.

| Fonte | Avaliação |
| --- | --- |
| Inter | Excelente tecnicamente, mas é a escolha por defeito de quase todos os dashboards gerados. Não traz identidade. |
| Geist | Precisa, mas é a voz da Vercel; o PFM pareceria uma ferramenta de programador. |
| IBM Plex Sans | Bons tabulares, mas carrega o tom corporativo da IBM e é larga para tabelas densas. |
| Manrope | Geométrica e simpática, mas os algarismos são largos e redondos; associada a apps cripto. |
| DM Sans | Agradável, mas de contraste baixo: os valores perdem firmeza em tamanhos pequenos. |
| **Instrument Sans** | **Escolhida.** Grotesca contemporânea com precisão e pormenores calorosos (terminais, o `a`, o `&`). Variável em peso e largura, com algarismos tabulares e lining (`tnum`, `lnum`). Lê-se suíça sem ser fria. |

**Fonte secundária: Instrument Serif**, só para display: o título de página e o valor herói. É condensada e tem a voz editorial do Kinfolk, e o par Sans/Serif foi desenhado em conjunto, por isso as proporções combinam. Serve para os momentos de pausa (o mês, o saldo). Fica fora de tabelas, botões, labels e de qualquer coisa abaixo de 32px.

| Uso | Estilo | Especificação |
| --- | --- | --- |
| Valor herói (1 por página) | `display-hero` | Serif 76/0.95, −2% |
| Título de página | `title-page` | Serif 44/1 |
| Título de secção | `heading` | Sans 600 17/24 |
| Subtítulo / nome de entidade | `subheading` | Sans 600 15/22 |
| Texto | `body` | Sans 400 15/22 |
| Metadados | `body-sm` | Sans 400 13/18, `ink-2` |
| Labels | `label` | Sans 600 11/14, MAIÚSCULAS, +8% de tracking, `ink-2` |
| Tabelas | `body` + `amount` | linha de 52px, valores à direita |
| Valores monetários | `amount-xl` → `amount-sm` | Sans 500, **sempre** `font-variant-numeric: tabular-nums lining-nums` |

**Formato de valores (ARS, es-AR):**

- `$ 4.812.340,56`: símbolo, espaço não separável (U+00A0, o que o Intl es-AR já produz), ponto de milhar, vírgula decimal.
- Sinal explícito com o menos tipográfico: `+$ 3.450.000` / `−$ 48.300` (U+2212, nunca hífen).
- Centavos em `ink-2` a 0.4–0.7em no herói e em indicadores; em tabelas mantêm o tamanho e só mudam de cor.
- O herói e os indicadores omitem centavos se forem ,00. Tabelas mostram sempre ,00 para manter o alinhamento.
- Abreviações (`$ 4,8 M`) só em eixos de gráficos e nunca em valores que se possam comparar.

## 5. Espaço, grelha e forma

- **Base 4px.** Escala `space-1`…`space-9` (4 → 96). O ritmo vertical entre secções é `space-7` (48px), dentro de secções `space-6` (32px).
- **Grelha desktop:** 12 colunas, gutter 24px, margens de 48px, máximo de 1240px. Em ecrãs maiores cresce o espaço vazio à direita, não as colunas.
- **Raios pequenos.** 6px em controlos, 10px em superfícies. A forma é sóbria; o arredondamento grande fica para a bottom sheet do iPhone e para os chips.
- **Sem sombras em conteúdo.** Só o que flutua (sheet, diálogo, menu) leva `shadow-overlay`.
- **Hairlines, não caixas.** Uma régua de 1px em `line` separa secções. Linhas de tabela levam hairline entre si, sem bordas verticais.

## 6. Iconografia

- Uma família de traço fino (Lucide, já presente com shadcn/ui) a **1.5px de traço, 16px no desktop, 20px no mobile**, sempre em `ink-2` ou na cor do texto que acompanham.
- Ícones só onde substituem palavras ou ajudam a encontrar algo: tab bar mobile, rail do tablet, ações de linha (⋯), setas de período. **A sidebar desktop é só texto.**
- Categorias **não** levam ícones nem emojis. Distinguem-se pelo nome e, nos gráficos, pela posição.
- Não há logótipo ainda: a marca é a palavra **PFM** em Instrument Serif. Fica para um step próprio.

## 7. Voz e conteúdo

- Português claro, frases curtas, tratamento implícito (sem "você"/"tu" quando dá para evitar).
- Títulos dizem o que está lá: **"Novembro"**, **"A vencer"**, **"Despesas, últimos seis meses"**. Nunca "Bem-vindo de volta", "Visão geral das suas finanças" ou "Gerir o seu dinheiro".
- Os números falam primeiro, as palavras explicam depois: "**$ 684.200** por pagar em 5 contas até 30 nov".
- Estados vazios dizem o próximo passo: "Ainda não há transações em novembro. Regista a primeira com **N**."
- Datas relativas até 7 dias ("amanhã", "sexta"), depois absolutas ("25 nov"). Sempre no fuso de Buenos Aires.

## 8. Regras anti-AI-slop: obrigatórias

As regras anti-slop são **normativas**, não recomendações estéticas. Estão na secção **Regras obrigatórias**, numeradas (P-01 a P-23, O-01 a O-16), cada uma com a forma de verificação, a revisão de design que serve de Definition of Done de interface e o processo de exceção. Um ecrã que viole uma delas não está concluído.

## 9. O que fica fora deste step

- **Implementação do modo escuro:** a estratégia e os valores estão definidos (**Modo escuro**); a ativação fica para uma fase posterior.
- **Logótipo e ícone da PWA.**
- **Microinterações e motion**: ficam definidas na implementação dos componentes.
