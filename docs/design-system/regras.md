# Regras obrigatórias

Estas regras são **normativas**. Não são recomendações estéticas: definem o que é aceite no PFM. Um ecrã ou componente que viole uma delas **não está concluído**, mesmo que funcione.

- **"É obrigatório"** e **"É proibido"** não têm exceção sem o processo da secção 5.
- Aplicam-se a todos os Steps, a todo o código de interface e a qualquer agente ou pessoa que contribua para o produto.
- Em conflito com uma preferência de implementação (um template, um exemplo do shadcn/ui, uma biblioteca), **as regras prevalecem**.

## 1. Proibições (P)

| ID | É proibido | Como se verifica |
| --- | --- | --- |
| P-01 | Gradientes de qualquer tipo em UI (roxos, azuis, multicoloridos ou decorativos) | Pesquisa por `gradient` / `bg-gradient-*` no código: zero resultados |
| P-02 | Glassmorphism: `backdrop-filter`, `backdrop-blur-*`, fundos translúcidos sobre conteúdo | Pesquisa por `backdrop`: zero, exceto o `scrim` |
| P-03 | Neon, glow, `text-shadow`, sombras coloridas ou luminosas | Pesquisa por `text-shadow`, `drop-shadow`, `shadow-[` |
| P-04 | Sombras em conteúdo. Só `shadow-overlay` (sheets, diálogos, popovers, menus) e `shadow-tabbar` | Só os dois tokens de sombra existem no tema do Tailwind |
| P-05 | Cards como contentor por defeito; dois ou mais blocos de indicadores iguais lado a lado só porque há vários números | Revisão de design (secção 4) |
| P-06 | Layouts perfeitamente simétricos em todas as secções de uma página | Revisão de design |
| P-07 | Bordas à volta de blocos de conteúdo. Separação faz-se com espaço e hairlines `line` | Revisão de design |
| P-08 | Ícones decorativos: em títulos, categorias, indicadores ou cards. Ícones só na tab bar, rail, ações de linha e setas | Revisão de design |
| P-09 | Emojis em qualquer elemento da interface | Pesquisa por intervalo Unicode de emoji nas strings de UI |
| P-10 | Gráficos 3D, donuts e tartes para comparar categorias, ilustrações stock, elementos flutuantes de enchimento | Revisão de design |
| P-11 | Botões com efeitos exagerados: escala, brilho, gradiente, animações de "pulse" | Revisão de design |
| P-12 | Títulos genéricos: "Welcome back", "Bem-vindo de volta", "Overview", "Visão geral das suas finanças", "Gerir o seu dinheiro" e equivalentes | Revisão de conteúdo |
| P-13 | Layouts copiados de templates de dashboards SaaS (fila de 4 KPIs em cards + gráfico de área + tabela) | Revisão de design |
| P-14 | Componentes shadcn/ui com o estilo de origem (raio 8px por defeito, sombras, paleta `slate`/`zinc`) | Os componentes importados são editados no repositório antes do primeiro uso |
| P-15 | Cores fora dos tokens: HEX, `rgb()`, cores do Tailwind (`green-600`, `red-500`…), valores arbitrários `[#…]` | Lint: proíbe cores literais em `className` e estilos; o tema do Tailwind só expõe tokens |
| P-16 | Verde para receitas e vermelho para despesas normais | Revisão; o componente de valor monetário não aceita cor por prop |
| P-17 | Mais de um botão primário (`forest`) visível ao mesmo tempo | Revisão de design |
| P-18 | Instrument Serif abaixo de 32px ou em tabelas, formulários, botões e labels | Revisão; só os estilos `display-*` e `title-*` a usam |
| P-19 | A versão mobile ser o desktop comprimido (mesma grelha, só mais estreita) | Revisão: cada página tem uma composição mobile própria aprovada |
| P-20 | Texto abaixo dos mínimos: 13px para leitura, 12px (`caption`) para texto auxiliar, 11px só para `label` (D5) | Pesquisa por tamanhos abaixo de 11px e revisão dos que estão a 11–12px |
| P-21 | Base de dados ou serviço externo de persistência (PostgreSQL, Supabase, Firebase, MongoDB, SQLite, Prisma ou outro ORM) (ADR-001) | Pesquisa nas dependências e no código |
| P-22 | Publicar dados financeiros em texto simples, escrever no GitHub a partir do frontend, ou incluir tokens, credenciais ou a frase-passe no código ou no LocalStorage (D1, D2) | Pesquisa no código e no bundle publicado; requisitos SEC-01 a SEC-04 |
| P-23 | Carregar fontes de um servidor externo (Google Fonts ou CDN), no build ou em runtime (D3) | Teste T-01: build com os domínios de fontes bloqueados |

## 2. Obrigações (O)

| ID | É obrigatório | Como se verifica |
| --- | --- | --- |
| O-01 | Cada secção responde a uma pergunta do utilizador, escrita no ficheiro da página ou no PR | Presente na descrição do PR |
| O-02 | Um único valor herói por página; hierarquia por tamanho e tinta | Revisão de design |
| O-03 | Assimetria controlada nas páginas editoriais (divisões 7/5 ↔ 5/7, coluna de respiro) | Comparação com **Dashboard** |
| O-04 | Espaço negativo intencional: espaçamentos só da escala `space-*` | Lint: sem espaçamentos arbitrários `[…px]` |
| O-05 | Valores monetários sempre pelo componente/formatador do PFM: tabulares, alinhados à direita, sinal explícito com U+2212, centavos em `ink-2` | Pesquisa por formatação manual de moeda: zero |
| O-06 | Contraste WCAG 2.2 AA nos dois temas (tabela em **Cores e tokens**) | Verificação automática (axe) + tabela |
| O-07 | Foco de teclado sempre visível (`focus-ring`), alvos de toque ≥ 44px no mobile | Navegação só por teclado; inspeção no iPhone |
| O-08 | Estados definidos para todos os componentes interativos: repouso, hover, pressionado, foco, desativado, erro, carregamento, vazio | Cada componente documenta os seus estados |
| O-09 | Carregamento com esqueletos da forma do conteúdo, não spinners de página | Revisão |
| O-10 | Estados vazios dizem o próximo passo | Revisão de conteúdo |
| O-11 | Cor só com função escrita na tabela de funções semânticas | Revisão |
| O-12 | Desktop e mobile com composições próprias; tabelas viram listas no iPhone | Capturas dos dois formatos no PR |
| O-13 | As nove áreas acessíveis em todos os formatos (ver **Arquitetura**, mapa por dispositivo) | Teste de navegação por formato |
| O-14 | Todos os componentes shadcn/ui personalizados com os tokens do PFM antes de serem usados | Revisão do diff de `components/ui` |
| O-15 | A interface diz sempre de que publicação vêm os dados ("Dados de 23 nov, 09:10") e quantas alterações há por exportar; registos locais marcados "Só neste dispositivo" (D1) | Revisão |
| O-16 | Tabela de Transações com 5 colunas no desktop, 4 no tablet e lista no iPhone (D4) | Comparação com o preview Ledger |

## 3. Pontos de controlo técnicos (a criar no Step 01)

Para estas regras não dependerem só de boa vontade:

- **Tema do Tailwind fechado:** `theme.colors`, `boxShadow`, `borderRadius`, `fontFamily` e `spacing` substituídos (não estendidos) pelos tokens. Assim, `bg-green-600`, `shadow-lg` ou `rounded-2xl` deixam de existir.
- **Lint:** regra que falha com cores literais, valores arbitrários de cor/sombra, `bg-gradient-*`, `backdrop-blur-*`.
- **Componente de valor monetário único**, sem prop de cor livre; o estado (vencido/excedido) é uma prop semântica.
- **Verificação de acessibilidade automática** (axe) nos ecrãs de referência, nos dois temas.

## 4. Revisão de design (Definition of Done de interface)

Antes de um ecrã ser considerado concluído, a revisão responde "sim" a todas:

1. Cumpre todas as proibições P-01 a P-23 e obrigações O-01 a O-16?
2. Tem capturas desktop e iPhone, nos dois temas quando o modo escuro estiver ativo?
3. Comparado lado a lado com os previews deste Design System, parece o mesmo produto?
4. Se tapar o logótipo, ainda é reconhecível como PFM e não como um template?
5. Cada cor no ecrã tem uma função escrita?

## 5. Exceções

Uma exceção só é válida se:

1. For pedida por escrito no PR, citando o ID da regra e a razão funcional (não estética).
2. For aprovada pelo responsável do produto.
3. Esta página for atualizada na mesma alteração, com a exceção e o seu âmbito.

Sem os três passos, a exceção não existe e a regra aplica-se.
