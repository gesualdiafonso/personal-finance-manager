# Variáveis de ambiente

Estado: Step 14 (2026-11-28; Step 12 na origem). Fonte única no código: `src/lib/supabase/config.ts` (validação com Zod). Modelo: [`.env.example`](../.env.example).

## Variáveis

| Variável | Pública? | Obrigatória? | Usada por | Notas |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Não (sem ela: modo local) | Supabase Auth no servidor (Step 14), health check, CSP `connect-src`, escolha do modo de autenticação | URL do projeto, só origem: `https://<ref>.supabase.co`. `http://` só para `localhost`/`127.0.0.1` (Supabase local) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sim | Não | Clientes Supabase | Chave publicável recomendada (`sb_publishable_…`). Só é segura com RLS (Step 15) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Não | Clientes Supabase | Chave anon antiga (JWT com `role: anon`), aceite só se não houver publicável |
| `NEXT_PUBLIC_SITE_URL` | Sim | Recomendada em produção (Step 14) | Ligações dos emails de verificação e recuperação (`<origem>/auth/confirm`) | Só a origem, `https://…`. Sem ela, usa a origem do pedido. Tem de estar nas *Redirect URLs* do Supabase (docs/SUPABASE_SETUP.md §7) |
| `SUPABASE_SECRET_KEY` | **Não** | Não | Nada (Step 14 incluído) | Reservada para CI/migrações. Nunca `NEXT_PUBLIC_`, nunca no browser, nunca no Git |
| `NEXT_TELEMETRY_DISABLED` | — | Não | Next.js | `1` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `E2E_PORT`, `E2E_SUPABASE_PORT` | — | Não | Testes E2E locais | — |
| `NEXT_DIST_DIR` | — | Não | Só o build da suíte E2E em modo Supabase (`.next-e2e-supabase`) | Tem de começar por `.next`; por omissão `.next` |

A palavra-passe da conta local e as frases de cifragem são escritas pelo utilizador no navegador. **Nunca** são variáveis de ambiente.

**Modo de autenticação (Step 14).** É decidido no build pelo estado da configuração: `configured` → **Supabase Auth** (email + password, email verificado, sessão em cookies `HttpOnly` geridos pelo servidor); `not-configured` → **conta local** do Step 10, sem alterações. Mudar as variáveis exige novo build/deploy. Ver [architecture/supabase-auth.md](architecture/supabase-auth.md).

## Estados da configuração

| Estado | Quando | Efeito |
| --- | --- | --- |
| `not-configured` | URL e chave vazias | Normal. A app funciona como antes (dados locais e login local). Configuración → Nube mostra "No configurada" |
| `configured` | URL https válida + chave publicável/anon válida | O ingresso passa a ser Supabase Auth (Step 14); o proxy protege as rotas no servidor; o health check contacta o projeto |
| `invalid` | URL inválida, http fora de localhost, URL com caminho/credenciais, chave com formato inválido, **só uma das duas variáveis**, ou **chave privilegiada numa variável pública** | Os clientes devolvem `null` (a app continua local); Configuración → Nube mostra "Configuración inválida"; o health check devolve `invalid-config` com mensagens que nomeiam a variável e o problema, **nunca o valor** |

Uma configuração meio preenchida é tratada como `invalid` e não como "local", para que o erro não passe despercebido.

## Proteções contra fuga de segredos

| Proteção | Onde | O que faz |
| --- | --- | --- |
| Validação | `parseSupabaseConfig()` | Recusa `sb_secret_…` e JWT com `role: service_role`/`supabase_admin` em variáveis públicas |
| Guarda de build | `next.config.ts` → `findPrivilegedPublicVariables()` | **O build falha** se qualquer `NEXT_PUBLIC_*` tiver um valor privilegiado (mostra só o nome da variável) |
| Guarda de artefactos | `npm run guard:artifacts` (após o build) | Falha se `.next/static`, `.next/server` ou `public/` contiverem uma chave secreta ou um JWT `service_role` |
| Guarda de dependências | `npm run guard:deps` | Só os pacotes oficiais `@supabase/supabase-js`, `@supabase/ssr` (e subpacotes oficiais); nenhum URL `supabase.co` escrito no código (o URL vem do ambiente) |
| Ponto único | ESLint `no-restricted-imports` | `@supabase/*` só pode ser importado em `src/lib/supabase/**` e `src/proxy.ts` |
| Git | `.gitignore` | `.env*` ignorados, exceto `.env.example` |
| Logs | Mensagens de config e health | Nomes de variáveis e hosts; nunca chaves |

## Desenvolvimento local

1. `cp .env.example .env.local`
2. Deixar as variáveis Supabase vazias → tudo continua local (é o estado por omissão, inclusive nos testes).
3. Para testar a ligação: preencher URL e chave publicável de um projeto de desenvolvimento ([SUPABASE_SETUP.md](SUPABASE_SETUP.md)), reiniciar `npm run dev`, abrir Configuración → Nube → "Comprobar conexión".

## Vercel

Project → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em Production (e Preview, de preferência com outro projeto Supabase). As variáveis `NEXT_PUBLIC_` são incorporadas **no build**: depois de as mudar, é preciso um novo deploy. Não definir `SUPABASE_SECRET_KEY` no Vercel enquanto a app não a usar.
