# AUREON — Sistema de logótipo

## Monograma

Um **A geométrico** reproduzido a partir do monograma aprovado: duas **asas** paralelas inclinadas (60°) e, ao centro, o **A em chevron** aberto, todos com a mesma espessura; entre as pernas do A, uma **base** num tom mais escuro da cor do monograma, como um chão em perspetiva. Simétrico no eixo vertical, sem símbolos de moeda, gráficos, carteiras ou escudos.

Geometria (grelha 64×64): `src/components/brand/aureon-paths.ts` (`AUREON_MARK`, `AUREON_BASE`).

## Wordmark e descritor

- **AUREON** em Cormorant Garamond SemiBold, maiúsculas, *tracking* +160, convertido em contornos (não depende da fonte instalada).
- Descritor institucional opcional **FINANCIAL INTELLIGENCE** em Manrope SemiBold, *tracking* +320.
- Composição horizontal: monograma (altura 64) + 16 de espaço + wordmark (altura de maiúsculas 25), descritor por baixo.

## Versões (SVG em `public/brand/`)

| # | Versão | Ficheiro | Cores |
| --- | --- | --- | --- |
| 1 | Horizontal principal | `aureon-logo.svg` | Monograma Forest com base gold, wordmark Charcoal, descritor |
| 2 | Monograma isolado | `aureon-monogram.svg` | Gold com base sombreada sobre Forest (como o original) |
| 3 | Fundo claro | `aureon-logo-light.svg`, `aureon-monogram-light.svg` | Forest + Charcoal |
| 4 | Fundo escuro | `aureon-logo-dark.svg`, `aureon-monogram-dark.svg` | Monograma gold, wordmark Ivory |
| 5 | Acento dourado | `aureon-logo-gold.svg` | Monograma gold, wordmark Forest, descritor gold |
| 6 | Monocromático | `aureon-logo-mono.svg`, `aureon-monogram-mono.svg` | Uma cor (base a 55 %) |

## Na aplicação

- Componentes React em `src/components/brand/aureon-logo.tsx`: `<AureonLogo tone descriptor />` e `<AureonMonogram tone />`, com `tone` = `theme` (por defeito: segue o tema via `--brand-mark`, `--brand-base`, `--brand-word`), `light`, `dark`, `gold`, `mono`.
- Ícone da app: `src/app/icon.svg` (favicon vetorial) e os PNG `public/icons/*` gerados com `npm run icons:build` (monograma gold sobre Forest; versão *maskable* dentro da zona segura).

## Uso

- Área de proteção: metade da altura do monograma à volta do logótipo.
- Tamanho mínimo: monograma 16 px; logótipo horizontal 24 px de altura (sem descritor) ou 40 px (com descritor).
- Não alterar proporções, não rodar, não aplicar sombras, gradientes ou contornos; sobre fotografias, usar a versão monocromática.
