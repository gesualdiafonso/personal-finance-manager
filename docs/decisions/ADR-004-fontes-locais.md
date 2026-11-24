# ADR-004 — Fontes locais com next/font/local

- **Estado:** aceite (decisão D3, Step 00; Step 01 §2.4)

## Decisão

Instrument Sans (variável, `wght` 400–700, `wdth` 75–100) e Instrument Serif (regular) em WOFF2, com os subconjuntos latin e latin-ext, ficam no repositório (`src/styles/fonts/`) e são carregadas com `next/font/local`. Nenhum pedido ao Google Fonts, nem no build nem em runtime. Licença: SIL Open Font License 1.1, com os textos junto das fontes.

## Verificação

E2E "local fonts": as duas famílias carregam, todos os pedidos de fonte são `/_next/static/media/*.woff2` e não há pedidos a outros domínios. O ESLint proíbe `next/font/google`. O service worker pré-carrega os dois ficheiros.
