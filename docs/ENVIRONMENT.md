# Variáveis de ambiente

Estado: Step 12 (2026-11-28). Fonte única no código: `src/lib/supabase/config.ts` (validação com Zod). Modelo: [`.env.example`](../.env.example).

## Variáveis

| Variável | Pública? | Obrigatória? | Usada por | Notas |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Não (opcional no Step 12) | Clientes Supabase, health check, CSP `connect-src` | URL do projeto, só origem: `https://<ref>.supabase.co`. `http://` só para `localhost`/`127.0.0.1` (Supabase local) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sim | Não | Clientes Supabase | Chave publicável recomendada (`sb_publishable_…`). Só é segura com RLS (Step 15) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Não | Clientes Supabase | Chave anon antiga (JWT com `role: anon`), aceite só se não houver publicável |
| `SUPABASE_SECRET_KEY` | **Não** | Não | Nada no Step 12 | Reservada para CI/migrações. Nunca `NEXT_PUBLIC_`, nunca no browser, nunca no Git |
| `NEXT_TELEMETRY_DISABLED` | — | Não | Next.js | `1` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `E2E_PORT` | — | Não | Testes E2E locais | — |

A palavra-passe da conta local e as frases de cifragem são escritas pelo utilizador no navegador. **Nunca** são variáveis de ambiente.

## Estados da configuração

| Estado | Quando | Efeito |
| --- | --- | --- |
| `not-configured` | URL e chave vazias | Normal. A app funciona como antes (dados locais e login local). Configuración → Nube mostra "No configurada" |
| `configured` | URL https válida + chave publicável/anon válida | Os clientes inicializam; o health check contacta o projeto |
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
