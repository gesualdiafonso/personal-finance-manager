# Step 09 — Relatório de testes (PWA e produção)

Executado em 2026-11-24, build de produção, só dados fictícios. Chromium = Google Chrome local; Firefox e WebKit = navegadores do Playwright.

| Gate | Resultado |
| --- | --- |
| `npm run check` (dependências proibidas, ESLint, TypeScript, tokens, schemas, dados, migrações, changeset, testes) | ✓ código 0 |
| Unitários + integração | ✓ **367 testes, 37 ficheiros** (Step 08: 358) |
| `npm run build` | ✓ todas as rotas estáticas |
| `npm run guard:artifacts` | ✓ 487 ficheiros sem dados em texto simples |
| `npm audit` | ✓ 0 vulnerabilidades |
| Varredura de segredos (`src`, `public`, `.next/static`) | ✓ nada encontrado |
| E2E Chromium (desktop 1440×900, iPhone 390×844) | ✓ **84 passados**, 2 ignorados por desenho |
| E2E Firefox, Safari desktop, Safari iPhone (`E2E_ALL_BROWSERS=1`) | ✓ **121 passados**, 8 ignorados (6 por desenho; 2 offline no Firefox por limitação do Playwright) |

## Testes novos ou alterados

- `tests/unit/pwa.test.tsx` (9): estados de instalação, captura de `beforeinstallprompt`, prompt de uso único, `appinstalled`; aviso de ligação; atualização do worker (espera, `SKIP_WAITING`, uma recarga; primeira instalação não é atualização); template do worker.
- `tests/e2e/platform.spec.ts`: pré-carga das nove áreas e do favicon; aviso offline; área não visitada abre offline (antes esperava "Sin conexión" em `/informes`; agora isso só acontece para um endereço desconhecido); cabeçalhos de produção e CSP sem violações; secção de instalação.
- `playwright.config.ts`: projetos opcionais Firefox/WebKit; `isPhone` dos specs reconhece `webkit-iphone`.
