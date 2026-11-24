# Step 01 — Relatório de implementação e validação

**Data:** 24 nov 2026 · **Âmbito:** fundação técnica (Step 01). O Step 02 não foi iniciado.
**Ambiente de verificação:** Node 22.23.5 (requisito: ^22.22.2 ou ^24.15.0), npm 10.9.9 (`npm ci`), Next.js 16.4.6, Chrome 153 (E2E), instalação limpa (`rm -rf node_modules .next` e depois `npm ci`).

## 1. Critérios de aceitação

| # | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| 1 | A aplicação arranca | **PASS** | `next start` arrancado pelo Playwright; as 9 áreas, `/configuracion` e `/` respondem 200 (E2E `foundation.spec.ts`, 2 projetos) |
| 2 | O build de produção conclui | **PASS** | `npm run build`: "Compiled successfully", 13/13 páginas estáticas. Repetido com a rede bloqueada (proxy para 127.0.0.1:9): também passa |
| 3 | TypeScript strict passa | **PASS** | `npm run typecheck` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) sem erros |
| 4 | ESLint passa | **PASS** | `npm run lint` sem erros nem avisos |
| 5 | Testes unitários passam | **PASS** | Vitest: 9 ficheiros, **87/87** testes (unitários e de integração), com `TZ=Asia/Tokyo` |
| 6 | Os JSON Schema validam os dados de exemplo | **PASS** | `npm run data:validate` (4 camadas, 7 ficheiros, 13 registos); `npm run schemas:check` (8 schemas sem divergências); testes `data-validation.test.ts` |
| 7 | O IndexedDB inicializa | **PASS** | `local-store.test.ts` (stores, índices, versão 1); E2E: `indexedDB.databases()` contém `pfm-local@1`, ecrã "Listo · versión 1", integridade "Correcta" |
| 8 | A preferência de tema persiste localmente | **PASS** | `theme.test.tsx` (6 testes); E2E: escolher "Oscuro" → recarregar → `data-theme="dark"` no primeiro documento, fundo `rgb(22, 26, 23)` |
| 9 | A formatação ARS está correta | **PASS** | `money.test.ts`: `$ 4.812.340,56`, `−$ 48.300,00` (U+2212), `+$ 3.450.000`, espaço não separável, modos de centavos, limite de `MAX_SAFE_INTEGER`, decimais recusados |
| 10 | O fuso de Buenos Aires está configurado | **PASS** | `date.test.ts` corre em `Asia/Tokyo` e obtém datas de Buenos Aires (02:00Z → dia anterior; offset `-03:00`); E2E com `timezoneId: Asia/Tokyo` mostra a data de hoje em Buenos Aires |
| 11 | As fontes locais carregam sem pedidos ao Google Fonts | **PASS** | E2E: as duas famílias com estado `loaded`, todos os pedidos de fonte são `/_next/static/media/*.woff2`, **zero pedidos a outros domínios**; build sem rede passa; 0 ocorrências de `fonts.googleapis`/`gstatic` em `.next/` |
| 12 | O manifest da PWA é válido | **PASS** | Chrome DevTools Protocol `Page.getAppManifest`: `errors: []`; instalabilidade só reporta `in-incognito` (o contexto de teste é anónimo); E2E confirma os campos e os 4 ícones |
| 13 | A base do service worker funciona | **PASS** | E2E: o worker ativa; a cache contém `/`, `/offline`, o manifest e 2 ficheiros `.woff2`; offline, `/` recarrega com Instrument Serif carregada e uma rota nunca visitada mostra "Sin conexión"; `/sw.js` com `no-cache` e versão substituída. **Não se declara funcionamento offline completo** (ver §4) |
| 14 | O GitHub Actions corre com sucesso | **PASS** | Execução CI #3 no commit `154626f` (`main`): sucesso em 1 min 32 s — https://github.com/gesualdiafonso/personal-finance-manager/actions/runs/45375986848. As execuções #1 e #2 falharam no `npm ci` porque o `package-lock.json` tinha sido regenerado fora do projeto; ver §6 |
| 15 | A documentação reflete a implementação | **PASS** | README, CLAUDE.md, `docs/architecture/*` (5), `docs/development/*` (3), `docs/decisions/*` (6) escritos depois da implementação; todos os comandos `npm run …` citados existem em `package.json` (verificado por script) |
| 16 | Não existe dependência de base de dados nem ORM | **PASS** | `npm run guard:deps`: 32 dependências declaradas e 620 instaladas verificadas. Teste negativo: com `@supabase/supabase-js` adicionado, a verificação falha (exit 1) |
| 17 | Nenhuma informação financeira publicada em texto simples | **PASS** | Nada é publicado no Step 01. `npm run guard:artifacts` analisa `public/` e `.next/` (357 ficheiros): limpo. Teste negativo: com `data/accounts.json` copiado para `public/data/`, falha (exit 1). `data/` só tem dados fictícios |
| 18 | Nenhum requisito aprovado do Design System foi removido em silêncio | **PASS** | Tokens gerados de `tokens.json` com verificação de divergências; tema do Tailwind fechado; navegação, tipografia e temas conforme os previews. O que ficou para depois está listado explicitamente em §5 |

## 2. Relatório de execução (instalação limpa, ordem da CI)

| Passo | Comando | Resultado | Tempo |
| --- | --- | --- | --- |
| 1 | `npm ci` | 0 vulnerabilidades | 11 s |
| — | `npm run guard:deps` | ✓ sem BD/ORM | <1 s |
| 2 | `npm run lint` | sem problemas | 3 s |
| 3 | `npm run typecheck` | sem erros | 4 s |
| — | `npm run tokens:check` | `tokens.css` igual a `tokens.json` | <1 s |
| 4 | `npm test` | 87/87 | 7 s |
| 5 | `npm run schemas:check` e `npm run data:validate` | 8 schemas sem divergências; dados válidos | 1 s |
| 6 | `npm run build` | 13/13 estáticas | 12 s |
| — | `npm run guard:artifacts` | ✓ 357 ficheiros, limpo | <1 s |
| 7 | `npm run test:e2e` | **36 passaram, 2 ignorados por desenho** (cada teste de navegação corre só no seu formato: desktop ou iPhone) | 20 s |

**Testes por ficheiro:** `money` 25 · `date` 8 · `data-validation` 13 · `compatibility` 4 · `crypto` 7 · `local-store` 11 · `published-source` 3 · `theme` 9 · `design-system` 7 = 87 · E2E 38 (36 passaram e 2 ignorados por desenho).

## 3. Relatório do build de produção

- Next.js 16.4.6 com Turbopack; `cacheComponents` e `partialPrefetching` ativos.
- **13 rotas, todas estáticas** (○): `/`, 8 áreas, `/configuracion`, `/offline`, `/manifest.webmanifest`, `/_not-found`.
- `.next/static`: 964 KB no total. Fontes: Instrument Sans 83 176 bytes e Instrument Serif 24 440 bytes (WOFF2 locais, com hash).
- `public/sw.js` gerado com versão `0.1.0+<build>`.
- O build não precisa de rede (repetido com o proxy apontado para uma porta fechada).

## 4. Limites da verificação

- **Safari/iPhone real:** os projetos "iphone" simulam a viewport e o toque em Chromium. O comportamento em WebKit, a PWA instalada no ecrã principal e a política de armazenamento do Safari não foram testados.
- **Offline completo:** só estão verificados a cache do shell, as fontes e o fallback. Os testes T-05 a T-14 do documento de dados dependem de funcionalidades dos steps seguintes.

## 5. Problemas por resolver

| # | Problema | Tipo |
| --- | --- | --- |
| 1 | **Secções 11–14 do brief original: não verificadas.** O documento completo não foi recebido; nada foi presumido | Bloqueio documental |
| 3 | Idioma: o Step 01 pede espanhol, o Step 00 dizia português; terminologia e rotas em espanhol por aprovar (ADR-005) | Decisão de produto |
| 4 | OD-1 a OD-8 em aberto; a publicação cifrada na CI não está implementada (OD-1, OD-7); o IndexedDB não está cifrado em repouso (OD-3) | Decisões técnicas |
| 5 | Ícones da PWA provisórios (a palavra PFM) | Design |
| 6 | Instalação de dependências novas exige npm 11 (falha do npm 10.9 com o Vitest 5); `npm ci` funciona com o npm 10 e o npm 11. Nunca regenerar o lockfile com `npm install` sem necessidade | Ferramentas |
| 7 | `@playwright/test` ficou em 1.65.1 (publicada a 13 nov, menos de duas semanas antes); o resto da stack tem pelo menos duas semanas | Ferramentas |
| 8 | Recharts e React Hook Form estão instalados mas ainda não são usados (sem gráficos nem formulários no Step 01); o TanStack Query não foi instalado por não ser justificado ainda | Stack |
| 9 | CSP global (SEC-05) por aplicar: precisa de um hash ou nonce para o script inline do tema. A pin das actions por SHA (SEC-06) fica para quando o repositório existir | Segurança |
| 10 | `docs/design-system/tipografia.md` lista uma pilha de fontes de substituição mais longa do que `tokens.json`. A implementação segue `tokens.json` (fonte de verdade); a documentação do Design System deve ser alinhada | Documentação do Design System |
| 11 | Adiado por estar fora do Step 01, mas registado: composição completa do Dashboard, Registo rápido, folhas laterais de edição, atalhos ⌘K, `/`, ←/→, J/K e E, aviso "Nueva versión disponible", interface de exportação | Steps seguintes |

## 6. Integração no GitHub

| Execução | Commit | Resultado | Causa |
| --- | --- | --- | --- |
| CI #1 | `eeae4be` first commit | Falhou em 24 s, no `npm ci` | `package-lock.json` regenerado localmente com Node 25 / npm 11.6.2, sem pacotes opcionais `@emnapi/*` |
| CI #2 | `170af66` | Falhou em 9 s, no `npm ci` | Lockfile regenerado outra vez; continuava a faltar `@emnapi/runtime` |
| CI #3 | `154626f` | **Sucesso em 1 min 32 s** | Lockfile do projeto reposto; `engines` corrigido para `^22.22.2 \|\| ^24.15.0` (o jsdom exige pelo menos 22.22.2) |

**Lição registada:** usar `npm ci` para instalar. O lockfile só se altera ao acrescentar dependências, com Node 22 e npm 11 (`docs/development/setup.md`). O Node 25 não é suportado.

Antes do push do commit `154626f`, a sequência completa da CI foi repetida localmente sobre esse mesmo commit: tudo com código de saída 0, 87/87 testes unitários e de integração, E2E com 36 passaram e 2 ignorados por desenho.
