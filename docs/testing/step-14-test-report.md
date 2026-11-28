# Step 14 — Supabase Auth e gestão de identidade: relatório de testes

Executado em 2026-11-28 · Node 22 · Next.js 16.4.6 · `@supabase/supabase-js` 2.119.2 · `@supabase/ssr` 0.12.7 · PostgreSQL 16 local (só para o SQL 09).

**Sem projeto Supabase real.** A autenticação foi testada contra um servidor GoTrue **falso, só de testes** (`tests/helpers/fake-supabase-server.mjs`). Esse servidor fala a API HTTP que o `@supabase/supabase-js` usa, por isso o código da app, o `@supabase/ssr` e o `@supabase/supabase-js` correram sem alterações, com cookies reais. Todos os utilizadores são fictícios (EJEMPLO-FICTICIO). Nenhum SQL foi executado no Supabase.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `npm run check` (guardas, ESLint, TypeScript, tokens, esquemas, dados, testes) | PASS — **557 testes, 47 ficheiros** (80 novos; eram 477) |
| `npm run build` (modo local) | PASS — páginas estáticas; `ƒ /api/auth/session`, `ƒ /auth/confirm`, `ƒ /api/health/supabase`, `ƒ Proxy` |
| `npm run build:e2e:supabase` (modo Supabase, URL do servidor falso) | PASS — mesmas rotas, 27 páginas estáticas |
| `npm run guard:artifacts` — os dois builds | PASS — sem dados em claro nem chaves privilegiadas |
| `npm audit` | PASS — 0 vulnerabilidades |
| E2E modo local (`npm run test:e2e`, desktop + iPhone) | PASS — **103 passados, 2 ignorados por desenho** (igual ao Step 13: nada mudou no modo local) |
| E2E modo Supabase (`npm run test:e2e:supabase`, desktop + iPhone) | PASS — **16 passados**; também 2 repetições completas sem falhas (`--repeat-each 2`, 28/28) |
| SQL 09 em PostgreSQL 16 local (`database/tests/run-local.sh`), cluster A (postgres superutilizador) e cluster B (postgres não-superutilizador, `auth.users` de outro dono, como no Supabase) | PASS nos dois — Step 13 53/53; 09 aplicado duas vezes (idempotente), autoverificação 8/8 `ok`; `behaviour-09.sql` 15/15; 07 depois do 09 aborta sem alterar nada; **08 depois do 09: 189 verificações, 0 com erro** |
| Testes de mutação manuais | Pôr `httpOnly: false` → 2 testes falham. Retirar a exigência de sessão de recuperação → 1 teste falha. Os testes detetam a regressão |

## Cobertura pedida no brief

| Pedido | Onde | O que prova |
| --- | --- | --- |
| Registo | `supabase-auth.test.ts`, `cloud-auth-ui.test.tsx`, E2E | Email de verificação para `<origem>/auth/confirm`; sem sessão antes de verificar; email já registado → mesma resposta, sem novo email; validação antes da rede |
| Login válido | idem | Cookies de sessão; `/api/auth/session` diz quem é, nunca tokens; a app abre na base local certa |
| Login inválido | idem | Código único `invalid-credentials` (email desconhecido = password errada); password apagada do campo; injeção de objeto (`{ $ne: "" }`) recusada |
| Logout | idem | Sessão terminada no servidor, cookies apagados, 401 a seguir; `global` termina as outras sessões; **dados locais mantidos** |
| Sessão persistente | `supabase-auth.test.ts`, E2E (reload) | A sessão sobrevive a pedidos e recargas; com o access token expirado, o servidor renova com o refresh token e reescreve os cookies |
| Sessão expirada | idem + UI | Revogada no servidor → 401; proxy → `/entrar?…&motivo=expired`; cliente fecha a app, apaga o snapshot e explica |
| Recuperação | idem | Resposta igual com ou sem conta; email só para contas existentes; ligação → `/restablecer` → password nova; a antiga deixa de funcionar |
| Verificação de email | idem | Ligação válida abre sessão (`HttpOnly`, `SameSite=Lax`); ligação usada, forjada ou malformada → `enlace-invalido` sem cookies; `next` externo ignorado |
| Proteção de rotas | `supabase-auth.test.ts` (proxy), E2E | Páginas privadas e desconhecidas → 307 para `/entrar?next=…`, `no-store`; páginas públicas, ligações e APIs sem redirecionamento; modo local sem efeito |
| Acesso não autenticado | idem + `request.get` E2E | O servidor não entrega o HTML da app sem sessão; Server Actions sem sessão → `session-missing` |
| Atualização do perfil | `supabase-auth.test.ts`, `identity-binding.test.ts`, UI | Só a própria linha, só 4 campos (`strictObject`: sem email, password ou token); sem SQL 09 → `profile-unavailable` e o perfil fica no dispositivo; preferências pelo serviço único (FinancialSettings) |
| Associação de dados locais | `identity-binding.test.ts`, UI, E2E | Nada é ligado automaticamente; migração com a password local; dados, outbox, definições e perfil iguais byte a byte; credencial desativada, não apagada |
| Migração interrompida | `identity-binding.test.ts` | Falha entre a verificação e o commit → nada mudou, login local ainda funciona, ecrã "retomar", retoma com sucesso |
| Utilizadores com dados locais | idem | Conta local → password obrigatória (a confirmação não chega); dados sem conta → confirmação explícita; "Empezar sin estos datos" → base própria, dados intactos, decisão lembrada |
| Separação entre duas identidades | idem | Navegador vazio → ligação direta; segunda identidade → `pfm-local~<id>`; nenhuma vê os dados da outra; exportação só com os próprios dados; troca fecha o handle anterior; tomada de posse recusada (`IDENTITY_MISMATCH`) |
| Credenciais privadas fora do bundle | E2E (scripts carregados), `guard:artifacts` nos dois builds | Sem `@supabase/auth-js` (`grant_type=refresh_token`, `signInWithPassword`) no browser; sem `sb_secret_`/`service_role` JWT |
| Sem passwords/tokens no dispositivo | `cloud-auth-ui.test.tsx`, E2E | `localStorage`, `sessionStorage` e IndexedDB sem a password da nuvem, a local ou tokens; `document.cookie` não vê `sb-*`; o snapshot só tem id, email, verificado, nome e hora |
| Cookies seguros | `supabase-auth.test.ts`, E2E | `HttpOnly`, `SameSite=Lax`, `path=/`; `Secure` com `NODE_ENV=production` |
| Erros seguros | `supabase-auth.test.ts`, `auth-step14.test.ts` | Resultados só com `{ ok, code }`; mensagens do fornecedor nunca reencaminhadas |
| Mudança de password | `supabase-auth.test.ts` | Re-verifica a atual; mesma password → `same-password`; fraca → `weak-password`; sem a atual só em sessão de recuperação recente |
| Offline | `cloud-auth-ui.test.tsx`, `auth-step14.test.ts` | Snapshot < 14 dias abre a app com aviso; > 14 dias ou ausente → fora; o SW não guarda navegações redirecionadas nem `/api/*`, `/auth/*` |

## Alterações a testes existentes (nenhuma enfraquece uma verificação)

- `tests/unit/database-schema.test.ts`: as verificações do Step 13 ("sem políticas", "só 5 GRANT a authenticated") passam a aplicar-se aos ficheiros do Step 13 (00–08, 99), **com o mesmo rigor**. O 09 tem testes próprios, mais estritos: exatamente 2 políticas, GRANT por coluna exatos, nada para `anon`, sem `service_role`, sem tabelas. A lista de ficheiros esperados inclui o 09.
- `src/features/auth/auth-gate.tsx`: o redirecionamento passou a ser construído com `URLSearchParams`. Os testes existentes (`/entrar?next=%2Fcuentas%3Fx%3D1`) continuam iguais e verdes.

## Limitações honestas

- **Não testado num projeto Supabase real** (o brief proíbe pedir credenciais e alterar a base remota). O servidor falso segue a API e a documentação do Supabase. Dois pontos dependem do comportamento real e devem ser confirmados no primeiro uso com o teu projeto (checklist em SUPABASE_SETUP §11):
  1. o JWT de uma sessão de recuperação ter `amr` com `method: "recovery"` (se não tiver, a redefinição falha de forma segura e pede um novo enlace);
  2. os modelos de email com `token_hash`.
- O SMTP incluído no Supabase limita muito os emails por hora: usa um SMTP próprio antes de convidar alguém (OD-14).
- A proteção offline (snapshot de 14 dias) é um controlo de acesso à interface, não cifragem (Step 18).

---

# Relatório de funcionalidades preservadas

| Funcionalidade | Estado | Evidência |
| --- | --- | --- |
| Modo local completo (registo, login, sessões, perfil, PBKDF2) sem Supabase configurado | Preservado | Todos os testes do Step 10 verdes; E2E modo local 103/103 (+2 ignorados por desenho) |
| Dados financeiros no IndexedDB (`pfm-local` v4), repositórios, outbox | Preservado; **sem migração de esquema** (as novas chaves vivem na store `device`, que já existia) | `local-store.test.ts`, `repositories.test.ts`; a migração não lê, move nem reescreve registos (`identity-binding.test.ts`) |
| Formato JSON 2.4.0, importação/exportação | Preservado, compatível | `data:validate`, `data:migrate --check`, changeset, exportação por identidade |
| Módulos (Panel, Transacciones, Cuentas, Tarjetas, Cuentas domésticas, Presupuesto, Metas, Configuración, Perfil) | Preservados | E2E nos dois modos |
| Multimoeda e conversões | Preservado | `currency.spec.ts`, testes fx |
| PWA (manifest, service worker, offline) | Preservado + endurecido (não guarda redirecionamentos nem `/auth/*`) | `platform.spec.ts`, `auth-step14.test.ts` |
| Design AUREON (tokens, temas, tipografia) | Preservado; os ecrãs novos usam os mesmos componentes (`AuthFrame`, `Field`, `Button`) | `tokens:check`, `branding.spec.ts` |
| Fundações Supabase (config validada, health check, CSP, guardas) | Preservadas | `supabase-config`, `supabase-foundation`, `supabase-browser` (testes do Step 12) verdes |
| SQL do Step 13 | Inalterado (01–07, 99). O 08 foi regenerado e só aceita as 2 políticas conhecidas do 09 | `run-local.sh` nos dois clusters |
| Nada apagado | Dados locais, credenciais locais (desativadas, não apagadas), backup JSON independente | Testes de migração e de logout |
