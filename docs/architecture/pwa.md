# PWA — base (Step 01, Tarefa 06)

**Estado:** base funcional, verificada por testes E2E em Chromium (desktop e viewport de iPhone). **Ainda não se declara funcionamento offline completo**: os testes T-01 a T-14 do documento de dados (incluindo a PWA instalada num iPhone real em modo avião) ainda não foram executados.

## Manifest — `src/app/manifest.ts` → `/manifest.webmanifest`

Nome "AUREON — Personal Financial Intelligence", `short_name` "AUREON", `lang: es-AR`, `display: standalone`, `start_url` e `scope` `/`, `background_color` Ivory `#F4F0E7`, `theme_color` Aureon Forest `#17251F`, atalhos (Nueva transacción, Cuentas domésticas, Tarjetas) e ícones: `/icon.svg` (vetorial), 192, 512 e 512 *maskable* (monograma AUREON gold sobre Forest, `npm run icons:build`). Favicon `src/app/icon.svg`; `apple-touch-icon` 180 px.

## Service worker — `scripts/pwa/sw.template.js` → `public/sw.js`

Gerado em cada build (`prebuild`) com uma versão única `<versão do package>+<sha do git ou data>`. Registado apenas em produção.

| Pedido | Estratégia |
| --- | --- |
| Instalação | Pré-carrega `/`, `/offline`, as páginas-modelo de detalhe, o manifest, `/icon.svg` e os ícones; lê o HTML dessas páginas e guarda os recursos `/_next/static/` que elas referem, incluindo as fontes WOFF2 (Manrope, Cormorant Garamond) |
| `/_next/static/*` (JS, CSS, fontes com hash) | Cache primeiro |
| Navegações | Rede primeiro; guarda a página; offline devolve a cópia guardada ou `/offline` |
| Ícones, `/brand/*`, `/icon.svg`, manifest | Devolve a cópia guardada e atualiza em segundo plano |
| `/data/*` | Nunca guardado aqui: a publicação cifrada terá a sua própria estratégia |

- **Versões de cache:** `pfm-shell-<versão>` e `pfm-static-<versão>`; as versões antigas são apagadas no `activate`.
- **Atualização:** as páginas são pedidas à rede primeiro, por isso um utilizador online recebe o HTML novo de imediato e, com ele, os novos recursos com hash. O worker novo fica à espera até todas as abas fecharem (não há `skipWaiting` automático); a mensagem `SKIP_WAITING` está pronta para o futuro aviso "Nueva versión disponible" (sem interface ainda).
- **Segurança:** o HTML nunca contém dados financeiros (que vivem no IndexedDB), por isso guardar páginas é seguro. `/sw.js` é servido com `Cache-Control: no-cache` e uma CSP restrita.

## Verificado por E2E (`tests/e2e/platform.spec.ts`)

- O manifest é válido e todos os ícones respondem.
- O worker instala e ativa; a cache contém `/`, `/offline`, o manifest e pelo menos duas fontes `.woff2`.
- Offline: recarregar `/` mostra o Dashboard com Instrument Serif carregada; uma página nunca visitada mostra "Sin conexión".
- `/sw.js` não é guardado pelo navegador e não contém o marcador de versão por substituir.

## Por fazer

- Testes T-01 a T-14 completos, incluindo Safari no iPhone com a PWA instalada (a política de armazenamento do Safari tem de ser verificada).
- Interface "Nueva versión disponible".
- Estratégia de cache da publicação cifrada (`/data/manifest.json`: rede primeiro; `pfm-data.<rev>.enc`: cache primeiro).

## Páginas de detalhe sem rede (Step 03)
`/cuentas/[id]` e `/tarjetas/[id]` são o **mesmo shell estático** para qualquer id: a página lê o id da barra de endereço (`useDetailId`) e os dados do IndexedDB.

- `generateStaticParams` pré-renderiza o id marcador `_` (`/cuentas/_`, `/tarjetas/_`).
- O service worker (`scripts/pwa/sw.template.js`) guarda esses dois shells no precache. Sem rede, uma navegação para `/cuentas/<qualquer id>` usa a cópia exata se já foi visitada, senão o shell da área; só depois cai em `/offline`.
- As navegações (sidebar, rail, tab bar) leem o pathname dentro de um `Suspense`: no shell pré-renderizado sem id conhecido aparecem sem item ativo até a página hidratar.

Coberto pelo E2E "detail page: … opens offline for any account".
