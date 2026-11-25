# AUREON — Marca na interface

A marca estende o Design System existente (não há um sistema paralelo): os componentes continuam os mesmos e recebem a identidade pelos tokens.

## Elementos de marca

| Elemento | Onde | Implementação |
| --- | --- | --- |
| Logótipo | Sidebar (desktop), cabeçalho móvel, página offline, Configuração | `<AureonLogo>` |
| Monograma | Rail (tablet), avatar do perfil local, favicon e ícones | `<AureonMonogram>`, `src/app/icon.svg` |
| *Eyebrow* editorial | Rótulo dos cabeçalhos de página e das secções do Panel | `brand-rule`: filete gold de 24 px antes do rótulo |
| Frase da marca | Panel vazio, Configuração → Acerca de | `brand-statement` (Cormorant itálico, `text-gold-text`) |
| Item ativo | Sidebar: fundo `forest-tint` + filete gold à esquerda; rail: anel gold | `sidebar.tsx`, `rail.tsx` |

## Navegação

- **Sidebar** (≥ 1200 px): logótipo, "Nueva transacción", áreas com ícone + texto (conjunto Lucide, traço 1.5, `nav-icons.ts`), Configuração, estado dos dados, **perfil local** e **interruptor de tema**.
- **Rail** (1024–1199 px): monograma, +, ícones, interruptor de tema e Configuração.
- **Telemóvel/tablet vertical** (< 1024 px): cabeçalho com logótipo, interruptor de tema e avatar do perfil; tab bar inalterada; "Más" com ícones.
- **Perfil**: o AUREON não tem contas online (single-user, local-first). O acesso ao perfil leva a Configuración, onde estão os dados locais, as cópias e a aparência.

## Temas

- Infraestrutura existente: `ThemeProvider` + `THEME_INIT_SCRIPT` (aplica o tema antes da primeira pintura: sem *flash*), preferência `pfm.theme` em LocalStorage (`paper` · `dark` · `system`; por defeito segue o sistema).
- Interruptor rápido (claro ↔ escuro) na navegação; "Sistema" continua em Configuración → Apariencia.
- Diálogos, sheets, formulários, menus e gráficos usam só tokens, por isso funcionam nos dois temas.

## Componentes

- **Superfícies**: limpas, hairlines `line`, raios contidos (3–10 px), sombra só no que flutua (`shadow-overlay`). Sem cartões arredondados nem sombras em conteúdo.
- **Botões**: primário Forest (claro) / verde claro (escuro); secundário com borda; destrutivo `alert`.
- **Badges de estado**: ponto + texto (`positive`, `soon`, `late`, `neutral`).
- **Gráficos** (Recharts): receitas `income`, despesas `expense`, saldo em linha tracejada `gold`; eixos `ink-2`, grelha `line`.
- **Transações recentes**: ponto `income`/`expense`/`stone` por tipo, sinal +/− no valor.
- **Panel**: hero em Cormorant (`display-hero`), demonstração do período em Manrope tabular, faixa de obrigações em `bg-paper-2` com hairlines.
