# Modo escuro

**Estado:** a estratégia e os valores estão definidos e aprovados com o resto do sistema. A implementação fica para uma fase posterior, mas a arquitetura de tokens do Step 01 tem de a suportar desde o início, para que ativar o tema seja só uma mudança de valores.

## 1. A ideia: a mesma página, à noite

O modo claro é papel e tinta. O modo escuro **não é o negativo** disso nem um "dark mode SaaS" azul-acinzentado. É a mesma página editorial lida com pouca luz: fundo de tinta verde-escura (o Ink do sistema), texto cor de papel, e os mesmos acentos, mais claros e menos saturados para não vibrarem.

O que se mantém igual nos dois temas:

- A composição, a grelha, a tipografia, os tamanhos e o espaço.
- O significado de cada cor (Forest = ação/progresso, Lake = seleção, ocre = atenção, barro = problema).
- As regras: um herói por página, sem cards, hairlines em vez de caixas, receitas e despesas em tinta.

## 2. Princípios

1. **Nunca preto puro.** O fundo é `#161A17`, derivado do Ink (#202622). O preto puro faz o texto claro "tremer" (halation) e perde o calor do papel.
2. **Nunca branco puro no texto.** O texto principal é `#ECE9E1`, o papel com menos luz.
3. **A elevação faz-se clareando, não com sombra.** Por ordem de profundidade: `bg-paper` #161A17 → `bg-paper-2` #1D221E → `bg-surface` #232924 → `bg-surface-hover` #2A312C. As sombras quase não se veem no escuro, por isso `shadow-overlay` ganha uma hairline `line` de 1px.
4. **Acentos mais claros e dessaturados.** Forest passa de #344B3C a #8DB09A, Lake de #46606E a #93AEBC, o barro de #B75C4B a #D07A68. As tonalidades mantêm-se, sobe a luminosidade.
5. **O texto sobre cor inverte-se.** No escuro, o botão primário é Forest claro com texto escuro (`on-primary` #161A17, 7.38:1). Nunca texto claro sobre Forest claro.
6. **Os tints são escuros.** `forest-tint`, `lake-tint`, `alert-tint` e `warning-tint` passam a ser fundos escuros com um pouco de cor, para os badges não acenderem.
7. **Os gráficos mantêm a hierarquia.** Meses passados em `chart-muted` #454D47 (quase fundo), mês atual em Forest claro: a distinção é de luminosidade (3.66:1), não só de tom.

## 3. Mapa de valores

| Token | Claro | Escuro | Nota |
| --- | --- | --- | --- |
| `bg-paper` | #F5F3ED | #161A17 | Tinta verde-escura |
| `bg-paper-2` | #ECE9E1 | #1D221E | Sidebar, faixas |
| `bg-surface` | #FFFFFF | #232924 | Superfícies sobem em luz |
| `bg-surface-hover` | #FAF9F5 | #2A312C | |
| `ink` | #202622 | #ECE9E1 | 14.49:1 |
| `ink-2` | #66665E | #A9A79D | 7.29:1 |
| `ink-3` | #8A8679 | #767569 | Bordas de controlos, 3.78:1 |
| `line` | #DDDAD1 | #313833 | Hairlines discretas |
| `forest` | #344B3C | #8DB09A | |
| `forest-tint` | #E3E7DE | #243329 | |
| `lake` | #46606E | #93AEBC | |
| `alert` / `alert-text` | #B75C4B / #9A4A3A | #D07A68 / #E59C8C | |
| `warning` / `warning-text` | #AD7B28 / #7D560E | #C99A4A / #DDB36A | |
| `sage` | #7A8873 | #7E8C77 | |
| `chart-muted` | #C8C3B6 | #454D47 | |
| `on-primary` | #F5F3ED | #161A17 | Inverte |
| `on-alert` | #FFFFFF | #161A17 | Inverte |

Todos os rácios dos dois temas estão em **Cores e tokens**, secção 4. Nenhum par falha AA.

## 4. Tipografia no escuro

- Texto claro sobre fundo escuro parece mais pesado. Mantêm-se os pesos (não se usa 300), mas aplica-se `-webkit-font-smoothing: antialiased` e `-moz-osx-font-smoothing: grayscale` em todo o lado.
- O valor herói em Instrument Serif mantém-se igual: a serifa a 76px aguenta bem o fundo escuro.
- Os centavos e metadados em `ink-2` sobem para #A9A79D, para continuarem legíveis em ecrãs OLED com brilho baixo.

## 5. Comportamento

- **Preferência em Configurações → Aparência:** *Sistema* (por defeito) · *Claro* · *Escuro*. Guardada no LocalStorage (`pfm.theme`), por dispositivo, e aplicada antes do primeiro render. Não há base de dados nem sincronização de preferências entre dispositivos (ADR-001, D1).
- **Sem flash ao carregar:** o tema é aplicado no `<html data-theme="…">` antes de pintar (script inline mínimo ou `next-themes` com `attribute="data-theme"`).
- **PWA / iPhone:** `<meta name="theme-color">` com dois valores por `prefers-color-scheme` (#F5F3ED e #161A17), para a barra de estado e o ecrã de arranque acompanharem o tema. O ícone da app é o mesmo nos dois temas.
- **Transição:** a mudança de tema é instantânea. Não se anima a cor de fundo.

## 6. Requisitos para o Step 01 (para não bloquear o modo escuro)

- Todas as cores entram como variáveis CSS geradas de `tokens.json`: `:root, [data-theme="paper"]` e `[data-theme="dark"]`.
- O Tailwind lê as variáveis (`colors: { ink: "var(--ink)", … }`) e usa `darkMode: ["selector", '[data-theme="dark"]']`. **É proibido** usar prefixos `dark:` com cores literais: o tema vive nos tokens, não nos componentes.
- As variáveis do shadcn/ui (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--border`, `--ring`…) são aliases dos tokens do PFM, definidas uma vez.
- O Recharts recebe cores através de `var(--token)` (ou lidas com `getComputedStyle`), nunca HEX no código dos gráficos.
- Os previews deste Design System já seguem esta regra: alternam entre os temas Claro e Escuro sem alterações.

## 7. Critério de aceitação (quando for implementado)

- Todos os ecrãs de referência renderizados em escuro passam a tabela de contraste.
- Nenhum componente tem uma cor que não venha de um token.
- O Dashboard em escuro lê-se pela mesma ordem do claro (herói → mês → obrigações → gráficos), verificado lado a lado.
