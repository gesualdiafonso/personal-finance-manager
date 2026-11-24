# Produção — Personal Finance Manager

Estado no Step 09. A app é um conjunto de páginas estáticas (Next.js 16, App Router, `cacheComponents`) que lêem e escrevem os dados **só no IndexedDB do navegador**. Não há backend, base de dados, autenticação nem API remota ([ADR-001](decisions/ADR-001-sem-base-de-dados.md), [ADR-002](decisions/ADR-002-local-first.md)).

## Supabase, autenticação e RLS — não aplicável

O brief do Step 09 pede para preservar e rever a integração com Supabase (ligação, sessões, RLS, `service_role`). **Este projeto não tem Supabase e proíbe-o**: regra 1 do `CLAUDE.md`, ADR-001, bloqueado por `npm run guard:deps` e pelo ESLint. Nada foi acrescentado. Consequências:

- Não há chaves (anon ou `service_role`) para expor; a verificação confirma que não há nenhuma no código nem no bundle.
- Não há sessões nem rotas privadas no servidor: cada dispositivo só vê os dados do seu próprio navegador. A proteção depende do bloqueio do dispositivo e do perfil do navegador ([data-security.md](architecture/data-security.md); IndexedDB **não cifrado**, OD-3 por implementar).
- "Transações confirmadas pelo servidor" não existe: uma gravação é confirmada quando a transação do IndexedDB termina (registo + `outbox`), com ou sem rede.

Se o produto vier a precisar de um backend, é uma decisão de arquitetura nova (revoga ADR-001), não um ajuste deste step.

## Variáveis de ambiente

Nenhuma é obrigatória. Ver [`.env.example`](../.env.example) e [development/environment.md](development/environment.md).

| Variável | Ambiente | Para quê |
| --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED=1` | CI, local | Telemetria do Next.js desligada |
| `GITHUB_SHA` | CI (automática) | Versão da cache do service worker |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `E2E_PORT`, `E2E_ALL_BROWSERS` | Só testes locais | E2E |

Desenvolvimento e produção distinguem-se por `NODE_ENV` (definido pelo `next dev` / `next build`): só em produção o service worker é registado e a CSP/HSTS são enviadas. **Nunca** pôr segredos em `NEXT_PUBLIC_*` (vão para o JavaScript público); a frase-passe dos dados é sempre escrita pelo utilizador no navegador.

## Build

```bash
npm ci
npm run check                       # guardas, lint, tipos, tokens, schemas, dados, testes
npm run build                       # gera public/sw.js (prebuild) e .next/
npm run guard:artifacts             # nenhum dado em texto simples nos artefactos
npm start                           # servidor de produção (porta 3000)
```

Todas as rotas são estáticas (`○`); `/cuentas/[id]` e `/tarjetas/[id]` têm um shell pré-renderizado. Erros: `error.tsx`, `global-error.tsx`, `not-found.tsx`, e `/offline` para o service worker.

## Cabeçalhos (`next.config.ts`)

| Cabeçalho | Valor |
| --- | --- |
| `Content-Security-Policy` (só produção) | `default-src 'self'`; `connect-src 'self'` (a página não consegue enviar dados para outro domínio); `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self'`; `worker-src`/`manifest-src 'self'`; `object-src 'none'`; `base-uri`/`form-action 'self'`; `frame-ancestors 'none'` |
| `Strict-Transport-Security` (só produção) | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` | `nosniff`, `DENY`, `strict-origin-when-cross-origin`, sem câmara/micro/localização/pagamento/USB, `same-origin` |
| `/sw.js` | `no-cache`, `Service-Worker-Allowed: /`, CSP própria |

`'unsafe-inline'` nos scripts é necessário para as páginas estáticas (bootstrap do Next.js e o script do tema antes do primeiro paint); nonces obrigariam a renderização dinâmica. O E2E confirma zero violações de CSP.

## Deploy

`vercel.json` fixa `npm ci` e `npm run build`. **A forma de publicar continua em aberto (OD-7)**: não há projeto Vercel nem deploy automático configurado. Qualquer alojamento estático com HTTPS que sirva `next start` (ou a saída do build) serve. Passos:

1. CI verde (`npm run check`, build, `guard:artifacts`, E2E).
2. Deploy por HTTPS (obrigatório para service worker e instalação).
3. Verificar em produção: `/manifest.webmanifest`, `/sw.js` com `no-cache`, cabeçalhos acima, instalação num Chrome e num iPhone.

Nenhum ficheiro de `data/` é servido (`guard:artifacts`); os dados reais nunca entram no repositório enquanto a OD-2 estiver aberta.

## Revisão de segurança e desempenho (Step 09)

| Verificação | Resultado |
| --- | --- |
| Segredos no código/bundle | Nenhum (sem chaves, tokens nem `.env` commitado; `guard:artifacts` ✓) |
| Dependências proibidas | `guard:deps` ✓ |
| Vulnerabilidades conhecidas | `npm audit`: 0 |
| Dados financeiros em logs | Nenhum `console.*` em `src/`; mensagens de erro e feedback sem valores nem descrições |
| Pedidos a terceiros | Nenhum (fontes locais, CSP `connect-src 'self'`, E2E confirma) |
| Exportações | Relatórios em texto simples com aviso (D8-05); exportação de dados continua sem botão (OD-5) |
| Bundles | Divisão automática por rota do Next.js; o Step 09 não acrescentou nenhuma dependência |
| Imagens | Só os ícones PNG (≤ 13 kB) |
