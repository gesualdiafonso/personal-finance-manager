# AUREON — Identidade da marca

**AUREON** é o novo nome do Personal Finance Manager: uma aplicação de **inteligência financeira pessoal**, independente, local-first (os dados ficam no dispositivo, sem conta online nem servidor financeiro).

| | |
| --- | --- |
| Categoria | Personal Financial Intelligence |
| Posicionamento | Premium · *old money* · SaaS independente |
| Tagline principal | *Wealth is built with intention.* |
| Tagline secundária | *Clarity in every financial decision.* |
| Descritor institucional | FINANCIAL INTELLIGENCE |
| Atributos | Sofisticada · Confiável · Inteligente · Minimalista · Discreta · Intemporal |

A identidade comunica **banca privada** e **tecnologia financeira contemporânea**: papel marfim, verde floresta profundo, um ouro contido, uma serifa clássica para os momentos editoriais e uma sans geométrica precisa para os números. Evita a estética fintech genérica (gradientes, neon, ilustrações, ícones de carteira ou moedas).

## Onde aparece na aplicação

- Logótipo horizontal no topo da sidebar (desktop) e do cabeçalho móvel; monograma no rail (tablet), no ícone da app e no favicon.
- Taglines em Configuração → *Acerca de AUREON* e no estado vazio do Panel (em inglês, como frases da marca; a interface continua em espanhol, ADR-005).
- O nome técnico interno `pfm` mantém-se em chaves de LocalStorage, na base IndexedDB `pfm-local`, nos ficheiros de dados (`pfm.accounts`…) e nos caches do service worker: mudar estes nomes perderia dados.

## Documentos

- [COLOR-SYSTEM.md](COLOR-SYSTEM.md) — paleta e semântica financeira, claro e escuro.
- [TYPOGRAPHY.md](TYPOGRAPHY.md) — Cormorant Garamond e Manrope.
- [LOGO-SYSTEM.md](LOGO-SYSTEM.md) — monograma, wordmark e as seis versões.
- [UI-BRANDING.md](UI-BRANDING.md) — como a marca se aplica aos componentes, ao Panel e à navegação.
- Tokens: [docs/design-system/tokens.json](../design-system/tokens.json) → `src/styles/tokens.css` (`npm run tokens:build`).
