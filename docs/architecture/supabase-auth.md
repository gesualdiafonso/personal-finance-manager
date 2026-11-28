# Supabase Auth e gestão de identidade (Step 14)

Estado: implementado em 2026-11-28. Decisões: [step-14-auth-decisions.md](../decisions/step-14-auth-decisions.md). Configuração manual do painel: [SUPABASE_SETUP.md](../SUPABASE_SETUP.md) §6, §7 e §11. Relatório de testes: [step-14-test-report.md](../testing/step-14-test-report.md).

## Em resumo

- Com o Supabase configurado, **o ingresso é Supabase Auth**: email e password, email verificado obrigatório, recuperação por email.
- **Toda a autenticação corre no servidor** (Server Actions, `GET /auth/confirm`, `GET /api/auth/session`, proxy). A sessão vive em cookies `HttpOnly`. O JavaScript do browser nunca vê um token.
- O **proxy recusa no servidor** qualquer página privada sem sessão verificada e redireciona para `/entrar`.
- Os **dados financeiros continuam no dispositivo** (IndexedDB), intactos. Cada identidade tem a sua base local, sem mistura entre contas.
- A **conta local** (PBKDF2, Step 10) é migrada de forma assistida. A password local prova a posse dos dados. Depois disso, a conta local fica desativada mas não é apagada. O hash **nunca** é enviado nem reutilizado.
- Sem o Supabase configurado, a app funciona **exatamente como no Step 10** (modo local).

## Modos

| Modo | Quando | Ingresso | Proteção das rotas |
| --- | --- | --- | --- |
| `cloud` | `parseSupabaseConfig()` = `configured` no build | Supabase Auth (email) | Proxy (servidor) + `AuthGate` (cliente: PWA offline, estados intermédios) |
| `local` | Supabase não configurado | Conta local do Step 10 | `AuthGate` (cliente), como antes |

O modo é fixado no build (`AUTH_MODE` em `src/features/auth/auth-context.tsx`). **Não há alternância silenciosa em tempo de execução** e não existe nenhuma autenticação simulada. Se o Supabase estiver em baixo, o modo `cloud` não cai para o login local (ver [Offline](#offline)).

## Peças

| Camada | Ficheiro | Papel |
| --- | --- | --- |
| Serviço de auth (servidor) | `src/lib/supabase/auth-service.ts` | Registo, login, logout, verificação, recuperação, mudança de password, estado da sessão, perfil na nuvem. Devolve **só códigos seguros** |
| Server Actions | `src/features/auth/cloud-actions.ts` | Única porta da interface para o Supabase Auth. Validam o formato das entradas (Zod). O Next.js verifica a origem (CSRF) |
| Ligações de email | `src/app/auth/confirm/route.ts` | `token_hash` + `type` (ou `code` PKCE) → sessão em cookies → app ou `/restablecer` |
| Estado da sessão | `src/app/api/auth/session/route.ts` | 200 (quem é: id, email, verificado, nome), 401 sem sessão, 503 Auth inalcançável. **Nunca tokens.** `no-store` |
| Proxy | `src/proxy.ts`, `src/lib/supabase/proxy.ts` (`protectRequest`, `isProtectedPath`) | Refresca a sessão (`getClaims()`) e redireciona páginas privadas sem sessão |
| Cookies | `src/lib/supabase/cookies.ts` | `HttpOnly`, `SameSite=Lax`, `Secure` em produção, `path=/` |
| Origem das ligações | `src/lib/supabase/site-url.ts` | `NEXT_PUBLIC_SITE_URL`, senão a origem do pedido. O Supabase só aceita URLs da *allow list* |
| Estado no cliente | `src/features/auth/auth-state.ts` (contexto), `cloud-auth-provider.tsx`, `auth-context.tsx` (modo local + escolha do modo) | `useAuth()`/`useProfile()` iguais nos dois modos. Os componentes nunca chamam o Supabase |
| Ecrãs | `src/features/auth/cloud-screens.tsx`, `auth-screens.tsx`, `auth-ui.tsx`, `auth-gate.tsx`, `profile-page.tsx` | Login, registo, verificar, recuperar, restabelecer, vincular dados, verificação pendente, perfil |
| Ligação identidade ↔ dados | `src/services/auth/identity-binding.ts` | Regras de separação, migração, interrupção |
| Base local por identidade | `src/hooks/use-local-data.ts` (`setActiveLocalDb`), `src/services/storage/local-store.ts` (`localDbNameFor`, `OwnerRecord`) | Fecha a ligação anterior antes de mudar de identidade |
| SQL manual | `database/sql/09_profile_access.sql` | Cada utilizador lê e altera só o seu perfil (por coluna). Opcional |

Regra de importação mantida: `@supabase/*` só em `src/lib/supabase/**` e `src/proxy.ts` (ESLint).

## Fluxos

### Registo e verificação de email

1. `/registro`: nome, email, password (≥ 10, mesma política da conta local), moeda principal.
2. A Server Action `cloudSignUp` valida e chama `auth.signUp`. Os metadados `full_name` e `preferred_currency` são lidos pelo trigger `initialize_user` (SQL 06), que cria `profiles` e `user_preferences`.
3. A resposta é **igual** para um email novo e para um já registado (sem enumeração). A app vai para `/verificar`. O email fica só em `sessionStorage`, fora do URL.
4. O email leva a `<site>/auth/confirm?token_hash=…&type=email`. A rota verifica o token **no servidor**, abre a sessão (cookies) e redireciona para `/?verificado=1`.
5. Ligação usada, expirada ou forjada → `/entrar?motivo=enlace-invalido`. O botão "Reenviar enlace" tem uma espera de 60 s e a resposta não revela se a conta existe.
6. Se o projeto tiver "Confirm email" desligado e der sessão sem verificação, a app mostra **Verificación pendiente** em vez da app (`status = needs-verification`).

### Login e logout

- `/entrar`: email + password → `cloudSignIn`. Erro único e neutro "Correo o contraseña incorrectos." para email desconhecido ou password errada. Email por verificar → mensagem + reenviar.
- Depois do login, a identidade é ligada à sua base local (ver abaixo) e a app abre em `next` (só caminhos internos: `safeNext`).
- **Cerrar sesión** → `signOut({ scope: "local" })`. Os cookies são apagados e o snapshot offline também. A ligação à base local fecha. **Nenhum dado local é apagado.**
- **Cerrar sesión en todos los dispositivos** (Perfil → Seguridad) → `scope: "global"`.

### Recuperação e redefinição

1. `/recuperar` → `cloudRequestReset`. Responde sempre "Si existe una cuenta…".
2. O email leva a `<site>/auth/confirm?token_hash=…&type=recovery`. É aberta uma sessão de recuperação e a app vai para `/restablecer`.
3. A password nova é aceite **sem a atual só se** o JWT da sessão tiver `amr` com o método `recovery` com menos de 15 minutos (`isRecentRecoverySession`). Uma sessão roubada vulgar não consegue mudar a password.
4. As outras sessões terminam (`signOut({ scope: "others" })`).
5. Em Perfil → Seguridad, mudar a password pede sempre a atual, que é re-verificada no servidor.

> Dependência externa assinalada: a verificação do `amr: recovery` segue a referência de claims do Supabase. Foi testada contra o servidor falso, não contra um projeto real (ver o relatório de testes). Se um projeto real não emitir esse método, a redefinição falha de forma **segura**: aparece "pede um novo enlace" e nunca há uma mudança sem prova.

### Sessões

| Aspeto | Comportamento |
| --- | --- |
| Persistência | Cookies `sb-<ref>-auth-token` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). Duração controlada pelo Supabase (refresh token) |
| Renovação | O proxy e as rotas do servidor chamam `getClaims()`/`getUser()`. Se o access token expirou, o `@supabase/ssr` usa o refresh token e reescreve os cookies (`Cache-Control: private, no-store`) |
| Validação | No servidor, `getUser()` (pergunta ao Auth: uma conta revogada ou apagada é detetada logo) e `getClaims()` (JWT verificado). Nunca `getSession()` |
| Expiração | Proxy: cookie presente mas inválido → `/entrar?next=…&motivo=expired`. Cliente: verificação ao voltar ao separador, quando a rede volta e a cada 5 min; 401 → app fechada + "Tu sesión terminó o expiró" |
| Entre separadores | `BroadcastChannel("aureon-auth")`: login, logout e mudanças propagam-se |
| Tokens no browser | Nenhum. `document.cookie` não os vê, `localStorage`/`IndexedDB` não os guardam (testado) |

### Offline

A app é uma PWA offline-first, por isso precisa de um caminho seguro para abrir sem rede:

- depois de cada verificação **online** bem-sucedida, o cliente guarda em `localStorage` um **snapshot de identidade** (`aureon.cloud.identity`: id, email, verificado, nome, hora). **Sem token, sem password**;
- se `/api/auth/session` não responder (offline ou Auth em baixo), um snapshot com menos de **14 dias** abre a app nessa identidade, com o aviso "Sin conexión…";
- um **401** do servidor ganha sempre ao snapshot e apaga-o;
- o proxy deixa passar um pedido com cookie de sessão quando o Auth não responde (`unavailable`). Sem cookie, redireciona sempre;
- o service worker **nunca** guarda uma navegação redirecionada (uma página protegida respondida com `/entrar`) e nunca guarda `/api/*` nem `/auth/*`.

Este modo protege o acesso casual. Não é cifragem: quem tiver o dispositivo desbloqueado e acesso ao perfil do navegador lê o IndexedDB, como antes (a cifragem chega no Step 18).

## Separação de dados por identidade

Regras em `resolveIdentity` (`identity-binding.ts`):

1. `pfm-local` pertence à identidade (registo `owner` na store `device`) → usa `pfm-local`.
2. `pfm-local` pertence a **outra** identidade → usa `pfm-local~<userId>` (criada vazia).
3. `pfm-local` sem dono e vazia (sem registos nem conta local) → ligada diretamente.
4. `pfm-local` sem dono **com** dados ou conta local → **nada é ligado sem decisão**. Aparece o ecrã **Vincular los datos de este dispositivo**:
   - **com conta local**: username + password local + confirmação → migração;
   - **sem conta local** (ex.: dados importados de um backup): confirmação explícita;
   - **Empezar sin estos datos** → `pfm-local~<userId>` vazia. Os dados existentes ficam intactos e sem dono.

Mudar de identidade (`setActiveLocalDb`) **fecha primeiro a ligação aberta**. Um handle antigo deixa de conseguir ler a base da outra identidade (testado). A exportação JSON de cada identidade contém só os seus dados.

## Migração da conta local (assistida)

O modo automático não é seguro porque o hash PBKDF2 não pode ser importado nem reutilizado como password. Por isso a migração é assistida:

1. O utilizador **cria a conta Supabase** com email e **password nova**, e verifica o email.
2. Ao entrar, a app deteta a conta local sem dono e mostra o ecrã de vinculação (com aviso prévio em `/entrar` e `/registro`: "Este navegador tiene una cuenta local…").
3. **Prova de posse:** `verifyLocalOwnership` compara a password local com o verificador PBKDF2 **no dispositivo**, com o mesmo *back-off* do login. Não abre sessão local e não envia nada.
4. É gravado um registo `cloud-migration` (início verificado). Se houver interrupção aqui, nada mais mudou.
5. **Uma só transação IndexedDB** grava o registo `owner` (userId, perfil, data, via), marca a credencial local com `migratedTo`/`disabledAt` (o verificador fica guardado, sem uso), termina as sessões locais dessa conta e apaga o registo `cloud-migration`.
6. Resultado: nenhum dado financeiro foi lido, movido, reescrito ou apagado. O perfil local (nome, telefone, preferências) passa a ser o perfil dessa identidade no dispositivo.

**Interrupção** (separador fechado, falha entre 4 e 5): os dados e a conta local ficam como estavam (o login local continua a funcionar no modo local). No próximo ingresso, o ecrã mostra "Una vinculación anterior se interrumpió… podés retomarla".

**Depois da migração:** o login local recusa essa conta com `ACCOUNT_MIGRATED` (só depois de a password estar certa, para não servir de oráculo). As sessões locais "recordadas" deixam de abrir a app. Se o Supabase for retirado da configuração, os dados continuam no dispositivo e o backup JSON continua disponível. Voltar a configurar o Supabase devolve o acesso.

## Perfil

| Valor | Onde vive | Notas |
| --- | --- | --- |
| Email de login | `auth.users.email` (Supabase Auth) | Só leitura no Perfil, com o selo "Verificado". **Não é copiado** para `profiles` nem para o perfil local |
| Nome, telefone, país, região | Perfil local do dispositivo + `public.profiles` (cópia na nuvem, melhor esforço) | `cloudUpdateProfile` só aceita estes 4 campos (`strictObject`) |
| Moeda principal, fuso, formato de números | `FinancialSettings` locais (fonte única, D-AUTH-03) | A moeda inicial vem do registo (metadado `preferred_currency`) |
| Moeda secundária, idioma, formato de data | Perfil local | Idioma: só `es-AR` (ADR-005 continua aberta) |

`profiles.id = auth.users.id` (SQL 02). A tabela `profiles` não tem nem terá passwords, hashes ou tokens. Sem o SQL 09, gravar o perfil continua a funcionar no dispositivo e a página avisa "La copia en la nube no está disponible todavía".

## Segurança — o que **não** acontece

- Não há `service_role` nem chave secreta em código do cliente (guard de build, guard de artefactos, teste E2E ao bundle).
- Não se guardam passwords, hashes ou tokens em `localStorage`, `sessionStorage`, IndexedDB nem `profiles`. A credencial local que já existia fica como estava, desativada.
- Não há um sistema paralelo de passwords: no modo `cloud`, a única password de acesso é a do Supabase Auth.
- A proteção não é só visual: o proxy recusa no servidor.
- Os tokens nunca aparecem em logs nem em respostas (`/api/auth/session`, resultados das Server Actions: testado).
- Não há autenticação simulada: o servidor falso existe só nos testes (`tests/helpers/fake-supabase-server.mjs`) e nunca é empacotado.
- Não há redirecionamento aberto: `safeNext` e a *allow list* do Supabase.
- Não há enumeração de contas no registo, na recuperação nem no reenvio.

## Procedimentos de teste

| Suíte | Comando | Cobre |
| --- | --- | --- |
| Unitários + integração | `npm test` | Serviço de auth contra um GoTrue falso, com o `@supabase/ssr` e o `@supabase/supabase-js` reais (`tests/integration/supabase-auth.test.ts`); separação e migração sobre `fake-indexeddb` (`identity-binding.test.ts`); provider, ecrãs e perfil (`cloud-auth-ui.test.tsx`); regras puras (`tests/unit/auth-step14.test.ts`) |
| E2E modo local (inalterado) | `npm run build && npx playwright test` | Toda a app no modo local |
| E2E modo Supabase | ver o cabeçalho de `playwright.supabase.config.ts` (build em `.next-e2e-supabase` + servidor falso na porta 54329) | Proteção no servidor, registo → verificação, cookies `HttpOnly`, login/logout, sessão expirada, recuperação, ligação reutilizada, migração local, bundle sem cliente Auth |
| SQL 09 | `PGHOST=… database/tests/run-local.sh` (PostgreSQL **local**) | Aplicação, idempotência, autoverificação, comportamento por papel, 08 continua a 0 falhas |
| Artefactos | `NEXT_DIST_DIR=.next-e2e-supabase npm run guard:artifacts` | Nenhuma chave privilegiada nos dois builds |

Para testar contra um **projeto Supabase real** (manual, fora do CI): configura o painel conforme o §11 do SUPABASE_SETUP, define as variáveis em `.env.local`, faz `npm run build && npm start` e percorre os fluxos acima com um email teu.
