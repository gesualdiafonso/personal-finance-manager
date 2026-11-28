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

## 6. Autenticação por email (Step 14 — em uso)

**Authentication → Sign In / Providers → Email:**

| Opção | Valor | Porquê |
| --- | --- | --- |
| Enable Email provider | Ligado | Login por email + password (o ingresso da app quando o Supabase está configurado) |
| Confirm email | **Ligado** | Só contas com email verificado. Se estiver desligado, a app mostra na mesma "Verificá tu correo" e não abre os dados |
| Secure email change | Ligado | Mudar o email exige confirmar o antigo e o novo |
| Secure password change | Ligado | Mudar a password exige sessão recente. A app re-verifica a password atual antes de mudar |
| Minimum password length | **10** | Igual à validação da app (`CLOUD_PASSWORD_MIN_LENGTH`) |
| Password requirements | Sem requisitos extra, ou letras + dígitos | A app segue o NIST (comprimento, sem regras de composição). Se ligares requisitos, o Supabase recusa e a app mostra "La contraseña no cumple los requisitos" |
| Leaked password protection | Ligado, se o plano o permitir | Recusa passwords que aparecem em fugas conhecidas |

**Authentication → Emails → Templates** (obrigatório: a app verifica as ligações no servidor por `token_hash`):

| Modelo | Ligação a pôr no corpo do email |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Magic link / Invite / Change email | Não usados pela app (podem ficar como estão) |

Os textos podem ser traduzidos para espanhol (es-AR). Exemplo para "Confirm signup": `<h2>Confirmá tu correo</h2><p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Verificar mi correo</a></p>`. Para previews com outro domínio, usa `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`: a app envia `redirectTo = <origem>/auth/confirm`.

> A ligação por omissão (`{{ .ConfirmationURL }}`) também funciona no mesmo navegador do registo (fluxo PKCE com `code`). Falha noutro dispositivo, por isso usa os modelos acima.

**Authentication → Emails → SMTP Settings:** o SMTP incluído no Supabase tem limites muito baixos (poucos emails por hora) e serve só para testes. Em produção configura um SMTP próprio (OD-14).

> **Aviso para o Step 18:** recuperar a password **não** recupera a chave de cifragem da aplicação. A recuperação da chave tem de ser desenhada à parte (OD-12/13).

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

A app pede sempre `redirectTo = <origem>/auth/confirm`, onde `<origem>` é `NEXT_PUBLIC_SITE_URL` ou, se não estiver definida, a origem do pedido. A entrada mínima por ambiente é `<origem>/auth/confirm`. O padrão `/**` também a cobre.

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

## 11. Checklist manual do Step 14 (alterações exatas no painel)

Nada disto é feito pela app nem pelos scripts: és tu que fazes no painel. Marca à medida que avanças.

1. **Authentication → Sign In / Providers → Email**: ligar o provider, **Confirm email** ligado, **Minimum password length = 10**, Secure email change e Secure password change ligados (§6).
2. **Authentication → URL Configuration**: Site URL = domínio de produção. Redirect URLs = `https://<produção>/auth/confirm` (ou `/**`) e `http://localhost:3000/auth/confirm` para desenvolvimento (§7).
3. **Authentication → Emails → Templates**: substituir a ligação em **Confirm signup** e **Reset password** pelos modelos `token_hash` (§6).
4. **Authentication → Emails → SMTP**: SMTP próprio antes de convidar alguém (OD-14).
5. **Authentication → Rate Limits**: manter os valores por omissão ou mais baixos.
6. **Authentication → Sessions**: refresh token rotation ligado (por omissão). Opcional: limitar a duração das sessões ("Time-box user sessions").
7. **SQL Editor** (opcional, recomendado): executar `database/sql/09_profile_access.sql` depois de 01–08. Confirmar que todas as linhas do resultado têm `ok = true` e voltar a correr `08_verification.sql` (deve dar 0 falhas). Sem o 09, o perfil fica só no dispositivo.
8. **Vercel** (ou `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SITE_URL`. Depois, novo deploy (o modo de autenticação é decidido no build).
9. Depois de criares a tua conta, se a app for só tua: **Authentication → Sign In / Providers → Allow new users to sign up = desligado** (§10).
10. Verificar: abrir a app → `/entrar` → registar → email → ligação → app aberta. Configuración → Nube mostra "Activa para el ingreso".

## Código Supabase (Step 12 → Step 14)

| Peça | Ficheiro | Estado |
| --- | --- | --- |
| Configuração validada | `src/lib/supabase/config.ts` | Em uso (escolhe o modo de autenticação) |
| Serviço de auth (servidor) | `src/lib/supabase/auth-service.ts`, `src/features/auth/cloud-actions.ts` | Step 14 |
| Ligações de email | `src/app/auth/confirm/route.ts` | Step 14 |
| Estado da sessão | `src/app/api/auth/session/route.ts` | Step 14 |
| Cliente do servidor (`createServerClient`, cookies `getAll`/`setAll`) | `src/lib/supabase/server.ts` | Em uso |
| Proxy (refresca a sessão e protege as rotas) | `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Step 14: `protectRequest` + `isProtectedPath` (nega por omissão) |
| Cookies de sessão | `src/lib/supabase/cookies.ts` | Step 14: `HttpOnly`, `SameSite=Lax`, `Secure` em produção |
| Cliente do browser (`createBrowserClient`) | `src/lib/supabase/client.ts` | **Não usado** desde o Step 14: a auth corre no servidor. Fica para o Step 16 (dados), a rever então |
| Tipos da base | `src/lib/supabase/types.ts` | Tipos; uso em 16 |
| Health check | `src/lib/supabase/health.ts`, `GET /api/health/supabase` | Em uso |

**Sessões (Step 14):** os cookies `sb-<ref>-auth-token` são **`HttpOnly`**. Só o servidor (Server Actions, rotas, proxy) os lê e escreve, por isso um XSS já não consegue ler a sessão. O proxy e as rotas verificam com `getClaims()`/`getUser()`, nunca com `getSession()`. Detalhes: [architecture/supabase-auth.md](architecture/supabase-auth.md).
