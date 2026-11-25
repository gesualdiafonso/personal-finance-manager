# AUREON — Tipografia

| Família | Papel | Ficheiro | Variável |
| --- | --- | --- | --- |
| **Cormorant Garamond** (variável 300–700, romano e itálico) | Títulos editoriais, título das páginas, hero do Panel, frases da marca | `src/styles/fonts/CormorantGaramond-*.woff2` | `--font-cormorant-garamond` → `--pfm-font-serif` |
| **Manrope** (variável 200–800) | Navegação, texto, formulários, botões, tabelas e **todos os valores financeiros** | `src/styles/fonts/Manrope-Variable.woff2` | `--font-manrope` → `--pfm-font-sans` |

- Auto-alojadas com `next/font/local` (subconjunto latino, Fontsource 5.3.0, SIL OFL 1.1, licenças em `src/styles/fonts/OFL-*.txt`). Nenhum pedido ao Google Fonts — há um teste E2E que o confirma.
- Números: `tabular-nums` e `lining-nums` em todos os estilos `type-amount*` e na classe `num` (`<Money>`), para colunas alinhadas.
- Escala (tokens.json → utilitários `type-*`):
  - Display (Cormorant, 500, -0.01em): `display-hero` 80/80 · `display-hero-mobile` 54 · `title-page` 46 · `title-page-mobile` 36.
  - Text (Manrope): `heading` 17/600 · `subheading` 15/600 · `body` 15/400 · `body-sm` 13 · `caption` 12/500 · `label` 11/600 maiúsculas espaçadas · `nav` 14/500.
  - Numbers (Manrope, tabular): `amount-xl` 32/600 · `amount-lg` 22/600 · `amount` 15/500 · `amount-sm` 13/500 · `date-day` 22/600.
- `brand-statement`: Cormorant Garamond itálico 500, 20/26, para as taglines.
