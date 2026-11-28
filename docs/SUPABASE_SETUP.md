# Configuração do Supabase (manual, no painel)

Estado: Step 12. Este guia diz **o que tens de fazer no painel do Supabase**. O código não acede a nenhuma conta Supabase nem precisa das tuas credenciais. Os nomes dos menus seguem o painel em novembro de 2026 e podem mudar ligeiramente.

> **Tabelas:** os scripts do Step 13 estão em [`database/sql/`](../database/sql/README.md) e és tu que os executas no SQL Editor. Ficam com RLS ativa e **sem políticas**, ou seja, fechadas à app até ao Step 15. O login Supabase chega no Step 14. Não metas dados financeiros reais no projeto antes do Step 15 (RLS) e do Step 18 (cifragem da aplicação).

## 1. Criar o projeto

1. Em <https://supabase.com/dashboard> → **New project**.
2. Organização: a tua. Nome: `aureon` (produção) — e, de preferência, outro projeto `aureon-dev` para desenvolvimento/previews.
3. **Database password:** gera uma forte e guarda-a num gestor de palavras-passe. Não é usada pela app; serve para a CLI/migrações (Step 13). Nunca a ponhas no repositório nem no Vercel.
4. Plano: Free chega para começar.

## 2. Região

Escolhe **South America (São Paulo) — `sa-east-1`** (OD-15): a mais próxima de Buenos Aires (menor latência). A região não se muda depois sem migrar o projeto.

## 3. URL do projeto

**Project Settings → Data API** (ou o botão **Connect**): copia o **Project URL** (`https://<ref>.supabase.co`). Vai para `NEXT_PUBLIC_SUPABASE_URL`.

## 4. Chave publicável

**Project Settings → API Keys**:

- Copia a **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Se o projeto só mostrar chaves antigas (separador **Legacy API keys**), usa a `anon` `public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Nunca** copies a **Secret key** (`sb_secret_…`) nem a `service_role` para uma variável `NEXT_PUBLIC_`. A app recusa-as e o build falha, mas, se alguma vez foram expostas, **roda-as** (botão de rodar/revogar na mesma página).

## 5. Variáveis de ambiente

- **Local:** `.env.local` (copiado de `.env.example`), com as duas variáveis acima.
- **Vercel:** Project → Settings → Environment Variables → as mesmas duas, em *Production* (e em *Preview*, com o projeto `aureon-dev`). Faz um novo deploy depois de as mudar.
- Detalhe e proteções: [ENVIRONMENT.md](ENVIRONMENT.md).

Verificação: abre a app → **Configuración → Nube (Supabase)** → "Configurada" → **Comprobar conexión** → "Conexión correcta". Se aparecer HTTP 401/403, a chave está errada; "No se pudo contactar" indica rede, URL errado ou projeto em pausa (os projetos Free pausam por inatividade).

## 6. Autenticação por email (preparação do Step 14)

**Authentication → Sign In / Providers → Email:**

| Opção | Valor | Porquê |
| --- | --- | --- |
| Enable Email provider | Ligado | Login por email + password (substitui o login local no Step 14) |
| Confirm email | **Ligado** | Só contas com email verificado |
| Secure email change | Ligado | Mudar email exige confirmar o antigo e o novo |
| Secure password change | Ligado | Mudar password exige sessão recente |
| Minimum password length | 10 ou mais | A conta local exige 8; a da nuvem deve exigir mais |
| Password requirements | Letras + dígitos (ou mais) | Complementa o comprimento |
| Leaked password protection | Ligado, se o plano o permitir | Recusa passwords que aparecem em fugas conhecidas |

**Fluxo de verificação de email (requisitos para o Step 14):**

- registo → email de confirmação com ligação para `<site>/auth/confirm` (PKCE, `token_hash`);
- a página troca o token pela sessão e envia o utilizador para `/perfil`;
- ligação expirada → mensagem e opção de reenviar;
- até confirmar, nada da nuvem é acessível.

**Recuperação de password (requisitos para o Step 14):**

- `/recuperar` pede o email e responde sempre "se existir, enviámos um email", sem revelar se a conta existe;
- a ligação abre `/auth/confirm?type=recovery` e depois um formulário de password nova;
- no fim, terminam as outras sessões.

> **Aviso para o Step 18:** recuperar a password **não** recupera a chave de cifragem da aplicação. Por isso a recuperação da chave tem de ser desenhada à parte (OD-12/13).

**Authentication → Emails → SMTP Settings:** o SMTP incluído no Supabase tem limites muito baixos e serve só para testes. Em produção configura um SMTP próprio (OD-14). Os modelos de email podem ser traduzidos para espanhol aqui.

## 7. URLs de redirecionamento permitidas

**Authentication → URL Configuration:**

- **Site URL:** o domínio de produção, ex. `https://aureon.<teu-dominio>` (sem barra final).
- **Redirect URLs:** só as necessárias, sem curingas largas:

| Ambiente | URLs |
| --- | --- |
| Desenvolvimento local | `http://localhost:3000/**` (e `http://127.0.0.1:3000/**` se usares esse endereço) |
| Produção | `https://aureon.<teu-dominio>/**` |
| Previews Vercel (opcional, no projeto `aureon-dev`) | `https://*-<tua-equipa>.vercel.app/**` |

O Supabase só redireciona para URLs desta lista. Sem isto, as ligações de confirmação e recuperação falham, e é isso que impede redirecionamentos abertos.

## 8. URLs de desenvolvimento local

- App: `http://localhost:3000` (`npm run dev`).
- Opcional, Supabase local com a CLI (Step 13): API em `http://127.0.0.1:54321`, já aceite pela validação (http só para localhost). A CLI imprime a sua própria chave publicável/anon local.

## 9. URLs de produção

- Domínio final no **Site URL** e nas **Redirect URLs**.
- `NEXT_PUBLIC_SUPABASE_URL` de produção no Vercel (*Production*).
- A CSP da app (`next.config.ts`) inclui automaticamente esse projeto em `connect-src` no build. Se mudares de projeto, faz um novo deploy.

## 10. Definições iniciais de segurança recomendadas

| Onde | Recomendação |
| --- | --- |
| Authentication → Sign In / Providers | Desativar os fornecedores que não usas (OAuth). Depois de criares a tua conta, se a app for só tua, **desligar "Allow new users to sign up"** |
| Authentication → Sessions / JWT | Acesso curto (JWT ≤ 1 h, o valor por omissão); *refresh token rotation* ligado, com intervalo de reutilização curto |
| Authentication → Rate Limits | Manter ou baixar os limites de emails, tentativas de login e verificação |
| Authentication → Multi-Factor | Considerar TOTP depois do Step 14 |
| Project Settings → Data API | Expor só o schema `public`. **Nenhuma tabela sem RLS** a partir do Step 13: as tabelas no `public` ficam acessíveis pela chave publicável se a RLS não estiver ativa |
| Database → Network restrictions / SSL | "Enforce SSL" ligado; restrições de rede para ligações diretas, se usares a CLI de IPs fixos |
| Advisors → Security Advisor | Correr depois de cada migração (Step 13+) |
| Organização | MFA na tua conta do Supabase; acesso mínimo para colaboradores |
| Chaves | Nunca partilhar a Secret key; rodar se houver suspeita; usá-la só em CI/servidor |

## Integração futura (o que já está pronto no código)

| Peça | Ficheiro | Step em que entra em uso |
| --- | --- | --- |
| Configuração validada | `src/lib/supabase/config.ts` | Já |
| Cliente do browser (`createBrowserClient`, PKCE) | `src/lib/supabase/client.ts` | 14 |
| Cliente do servidor (`createServerClient`, cookies `getAll`/`setAll`) | `src/lib/supabase/server.ts` | 14 |
| Proxy Next.js 16 (refresca a sessão se existir; sem redirecionamentos) | `src/proxy.ts`, `src/lib/supabase/proxy.ts` | 14 (proteção de rotas no servidor com `getClaims()` e `PROTECTED_PATH_PREFIXES`) |
| Tipos da base | `src/lib/supabase/types.ts` (gerado do esquema do Step 13) | Já (tipos); uso em 16 |
| Health check | `src/lib/supabase/health.ts`, `GET /api/health/supabase`, Configuración → Nube | Já |
| Cookies de sessão | `src/lib/supabase/cookies.ts` (`SameSite=Lax`, `Secure` em produção) | 14 |

**Sessões (arquitetura para o Step 14):**

- o browser usa `createBrowserClient`, com sessão em cookies `sb-<ref>-auth-token` legíveis por JavaScript (é assim que o `@supabase/ssr` funciona);
- o proxy verifica o JWT com `getClaims()` e refresca os tokens, escrevendo os cookies novos no pedido e na resposta (`Cache-Control: private, no-store`);
- no servidor, só se confia em `getClaims()`/`getUser()`, nunca em `getSession()`;
- a proteção contra roubo de sessão assenta na CSP, em tokens curtos e na rotação do *refresh token*.
