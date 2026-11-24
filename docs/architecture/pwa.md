# PWA — base (Step 01, Tarefa 06)

**Estado:** base funcional, verificada por testes E2E em Chromium (desktop e viewport de iPhone). **Ainda não se declara funcionamento offline completo**: os testes T-01 a T-14 do documento de dados (incluindo a PWA instalada num iPhone real em modo avião) ainda não foram executados.

## Manifest — `src/app/manifest.ts` → `/manifest.webmanifest`

Nome, `short_name` "PFM", `lang: es-AR`, `display: standalone`, `start_url` e `scope` `/`, cores de papel, atalhos (Nueva transacción, Cuentas domésticas, Tarjetas) e ícones 192, 512 e 512 *maskable*.

**Ícones provisórios:** a palavra PFM em Instrument Serif sobre papel, como o Design System indica enquanto não há logótipo (`npm run icons:build`).

## Service worker — `scripts/pwa/sw.template.js` → `public/sw.js`

Gerado em cada build (`prebuild`) com uma versão única `<versão do package>+<sha do git ou data>`. Registado apenas em produção.

| Pedido | Estratégia |
| --- | --- |
| Instalação | Pré-carrega `/`, `/offline`, o manifest e os ícones; lê o HTML dessas páginas e guarda os recursos `/_next/static/` que elas referem, incluindo as duas fontes WOFF2 |
| `/_next/static/*` (JS, CSS, fontes com hash) | Cache primeiro |
| Navegações | Rede primeiro; guarda a página; offline devolve a cópia guardada ou `/offline` |
| Ícones, manifest | Devolve a cópia guardada e atualiza em segundo plano |
| `/data/*` | Nunca guardado aqui: a publicação cifrada terá a sua própria estratégia |

- **Versões de cache:** `pfm-shell-<versão>` e `pfm-static-<versão>`; as versões antigas são apagadas no `activate`.
- **Atualização:** um worker novo fica à espera; a mensagem `SKIP_WAITING` está pronta para o futuro aviso "Nueva versión disponible" (sem interface ainda).
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
