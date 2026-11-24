# PWA — Personal Finance Manager

**Estado (Step 09):** instalável, funciona sem rede em todas as áreas depois da primeira visita, com aviso de nova versão e de ligação. Verificado por E2E em Chromium (desktop e iPhone 390×844), Firefox, Safari desktop e Safari iPhone (WebKit do Playwright). **Ainda não verificado num iPhone físico com a PWA instalada** (política de armazenamento do Safari: ver "Limitações").

## Como funciona offline

A app é **local-first** ([ADR-002](decisions/ADR-002-local-first.md)): todas as leituras e escritas vão ao IndexedDB deste dispositivo, através dos repositórios. Não há servidor, conta nem sincronização. Por isso:

- **Sem rede, tudo continua a funcionar**, incluindo registar movimentos: a gravação é a mesma transação local de sempre (registo + `outbox`), validada pelos repositórios. Nenhuma gravação "espera pelo servidor" nem é mostrada como confirmada por um servidor, porque não existe nenhum.
- A linha de estado diz "Sin conexión. Todo sigue funcionando: tus datos están en este dispositivo…" e, quando a rede volta, "Conexión restablecida." durante 4 s. Nunca diz "sincronizado".
- O HTML das páginas nunca contém dados financeiros (são shells estáticos), por isso é seguro guardá-lo em cache.

## Manifest — `src/app/manifest.ts` → `/manifest.webmanifest`

`id`, `name` "Personal Finance Manager", `short_name` "PFM", `description`, `lang: es-AR`, `start_url` e `scope` `/`, `display: standalone`, `orientation: any`, `background_color`/`theme_color` papel (`#F5F3ED`; o tema escuro troca a `theme-color` em tempo real), `categories`, `prefer_related_applications: false`, atalhos (Nueva transacción → `/transacciones#nueva`, Cuentas domésticas, Tarjetas, Informes; sem ícones: P-08).

## Ícones — `public/icons/`, `public/favicon.ico`

| Ficheiro | Uso |
| --- | --- |
| `icon-192.png`, `icon-512.png` | Manifest (`any`) |
| `icon-maskable-512.png` | Manifest (`maskable`, conteúdo na zona segura de 80 %) |
| `apple-touch-icon.png` (180) | iOS, ecrã principal |
| `favicon-32.png`, `favicon.ico` (PNG em ICO) | Separador do navegador (Step 09) |

Provisórios: a palavra PFM em Instrument Serif sobre papel, como o Design System indica até haver logótipo. Gerados por `npm run icons:build` (precisa de um Chromium); os ícones aprovados no Step 01 não foram alterados.

## Service worker — `scripts/pwa/sw.template.js` → `public/sw.js`

Gerado em cada build (`prebuild`) com a versão `<versão do package>+<sha do git ou data>`; registado só em produção (`src/components/shared/pwa-runtime.tsx`).

| Pedido | Estratégia |
| --- | --- |
| Instalação | Pré-carrega as **nove áreas**, `/offline`, os shells de detalhe `/cuentas/_` e `/tarjetas/_`, o manifest, o favicon e os ícones; lê o HTML e guarda os recursos `/_next/static/` referidos (inclui as fontes WOFF2) |
| `/_next/static/*` | Cache primeiro; sem rede e sem cópia → 504 limpo |
| Navegações | Rede primeiro (só respostas 200 do próprio site); sem rede → cópia guardada → shell da área de detalhe → `/offline` |
| Ícones, manifest, favicon | Cópia guardada e atualização em segundo plano |
| Outros métodos, outros domínios, `/data/*` | Nunca interceptados nem guardados |

- **Versões:** `pfm-shell-<versão>` e `pfm-static-<versão>`; as antigas apagam-se no `activate`.
- **Atualização:** a app procura uma versão nova ao voltar ao primeiro plano e quando a rede volta. Um worker novo **fica à espera**; aparece "Hay una nueva versión de la aplicación · Actualizar" (canto inferior esquerdo no desktop, acima da tab bar no telemóvel). Só ao tocar em Actualizar recebe `SKIP_WAITING` e a página recarrega uma vez — nunca a meio de um formulário sem o utilizador pedir.
- **Segurança:** nenhuma resposta com dados financeiros passa pelo worker (os dados vivem no IndexedDB). `/sw.js` é servido com `Cache-Control: no-cache` e CSP própria.

## Instalação

Em **Configuración → Instalar la aplicación** (contextual; a app nunca mostra um banner sozinha — o `beforeinstallprompt` é capturado no arranque e a mini-infobar do navegador é suprimida):

| Situação | O que aparece |
| --- | --- |
| Já instalada (standalone, `navigator.standalone` no iOS, ou `appinstalled`) | Nada: a secção não aparece |
| Chrome/Edge (desktop, Android) com instalação disponível | Botão "Instalar PFM" → diálogo nativo |
| iPhone/iPad | "Toca Compartir y luego Agregar a inicio" |
| Firefox desktop e outros sem instalação | Frase a indicar Chrome/Edge ou Safari no iOS |

Instalar à mão: **Chrome/Edge** — ícone de instalar na barra de endereço ou menu → "Instalar PFM". **Android** — menu ⋮ → "Instalar app". **iPhone/iPad (Safari)** — Compartir → "Agregar a inicio".

## Limitações

- **Safari/iOS:** o armazenamento de um site pode ser apagado pelo sistema após inatividade prolongada se a app não estiver instalada; instalada no ecrã principal, a política é mais permissiva. Como não há cópia remota, **exportar regularmente** é a salvaguarda (OD-5: exportação cifrada por implementar). Não verificado num iPhone físico.
- Firefox desktop não instala PWAs.
- Um endereço desconhecido sem rede mostra "Sin conexión" (não há como saber se existe).
- Os testes E2E de offline no Firefox estão saltados: a emulação offline do Playwright não se aplica aos pedidos do service worker nesse navegador (limitação da ferramenta). Em Chromium e WebKit passam.
- Sem notificações push nem sincronização em segundo plano (não há servidor).

## Testes

- `tests/unit/pwa.test.tsx`: estados de instalação (instalada, disponível, iOS, sem suporte), captura do evento, prompt de uso único, `appinstalled`; estado da ligação; atualização (worker à espera, `SKIP_WAITING`, uma única recarga, primeira instalação não é atualização); o template pré-carrega exatamente as áreas de `AREAS`, nunca `/data/`, só GET do próprio site.
- `tests/e2e/platform.spec.ts`: manifest e ícones; o worker instala, pré-carrega as nove áreas e as fontes; offline: aviso de ligação, área nunca visitada abre, endereço desconhecido → "Sin conexión"; `/sw.js` sem cache; cabeçalhos de produção e CSP sem violações; secção de instalação.
- Compatibilidade: `E2E_ALL_BROWSERS=1 npm run test:e2e` acrescenta Firefox, Safari desktop e Safari iPhone (`npx playwright install firefox webkit`).
