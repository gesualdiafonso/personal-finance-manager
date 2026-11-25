# AUREON — Sistema de cor

Fonte única: [docs/design-system/tokens.json](../design-system/tokens.json) (gera `src/styles/tokens.css`; `npm run tokens:check` falha se divergirem). Dois temas: `paper` (claro, Ivory) e `dark` (escuro, Deep Forest).

## Cores da marca

| Marca | Hex | Token | Uso |
| --- | --- | --- | --- |
| Aureon Forest | `#17251F` | `forest` (claro), `brand-mark` (claro) | Ação primária, item ativo, monograma |
| Heritage Gold | `#B99A60` | `gold`, `brand-mark` (escuro), `brand-base` (claro) | Acentos contidos: monograma, filete das *eyebrows*, item ativo, linha de saldo do gráfico |
| Ivory Paper | `#F4F0E7` | `bg-paper` (claro), `on-primary` | Fundo claro |
| Stone Grey | `#AAA69B` | `stone` | Elementos secundários não-textuais |
| Deep Charcoal | `#252923` | `ink` (claro), `brand-word` | Texto e valores |
| Sage | `#899585` | `sage` | Indicadores positivos e séries de dados |

## Superfícies e texto

| Token | Claro | Escuro |
| --- | --- | --- |
| `bg-paper` | `#F4F0E7` Ivory | `#0E1612` Deep Forest |
| `bg-paper-2` | `#EAE5D9` | `#131E19` |
| `bg-surface` | `#FBF9F4` | `#1A2822` (verde elevado) |
| `ink` / `ink-2` / `ink-3` | `#252923` / `#5D6058` / `#868379` | `#F1ECE1` / `#B6B2A6` / `#827F74` |
| `line` | `#DBD5C7` | `#2A3832` |
| `forest` (ação) | `#17251F` | `#9DBBA5` |

## Semântica financeira (distinta das cores da marca)

| Significado | Token | Claro | Escuro |
| --- | --- | --- | --- |
| Receitas | `income` | `#3F6E4F` | `#8FC29F` |
| Despesas | `expense` | `#9A5B43` (argila) | `#D99A7E` |
| Aviso | `warning`, `warning-text`, `warning-tint` | `#B86A22` laranja âmbar | `#D9924A` |
| Erro / excedido | `alert`, `alert-text`, `alert-tint` | `#B04A3B` | `#E07A68` |
| Informação / foco | `lake`, `focus-ring` | `#46606E` | `#93AEBC` |

Regras:
- **O ouro nunca é indicador positivo nem estado.** Positivo/dentro do ritmo usa `forest`/`sage`; aviso usa o laranja `warning`, claramente distinto do Heritage Gold.
- Os valores monetários ficam em `ink` (a cor não é o único sinal: sinal +/−, rótulos e pontos de tipo).
- Contrastes (WCAG): texto principal ≥ 13:1; `ink-2` ≥ 5:1 em todos os fundos; textos semânticos ≥ 4.5:1 sobre `bg-paper`, `bg-paper-2` e `bg-surface`; `ink-3` (bordas de controlos) ≥ 3:1.
- Os gráficos usam as variáveis CSS (`var(--income)`, `var(--expense)`, `var(--gold)`), por isso mudam com o tema sem recarregar.
