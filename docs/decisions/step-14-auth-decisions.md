# Step 14 — Supabase Auth e identidade: decisões (autónomas, documentadas)

Contexto: [ADR-006](ADR-006-supabase-hibrido.md) (Supabase Auth + híbrido nuvem/IndexedDB). Arquitetura: [supabase-auth.md](../architecture/supabase-auth.md). Cada decisão segue a regra do brief: quando há escolha técnica, fica a alternativa mais segura e compatível com o que existe.

| Id | Decisão | Alternativas consideradas | Motivo |
| --- | --- | --- | --- |
| D-SB-01 | **Dois modos fixados no build**: Supabase configurado → Supabase Auth; não configurado → conta local do Step 10, intacta | Só Supabase (sem modo local); alternar em runtime quando o Supabase falha | A app tem de continuar a funcionar sem Supabase (Step 12). Alternar em runtime seria um segundo sistema de passwords e um bypass: o brief proíbe "autenticação simulada como alternativa" |
| D-SB-02 | **Toda a auth no servidor** (Server Actions, rotas, proxy). Cookies **`HttpOnly`** | Cliente do browser `@supabase/ssr` (cookies legíveis por JS, como previsto no Step 12) | O brief pede `HttpOnly`. Com cookies `HttpOnly` o browser não pode usar o cliente Supabase, por isso a interface fala com Server Actions. Bónus: nenhum token alcançável por XSS e sem `@supabase/auth-js` no bundle (testado) |
| D-SB-03 | **Proxy nega por omissão**: toda a página que não esteja na lista pública exige sessão verificada | Lista de rotas protegidas (`PROTECTED_PATH_PREFIXES` do Step 12) | Uma rota nova fica protegida sem ninguém se lembrar disso. As rotas `/api/*` respondem 401 por si |
| D-SB-03b | Auth **inalcançável** + cookie presente → o proxy deixa passar e o cliente decide com o snapshot offline | Redirecionar sempre | PWA offline-first: os dados estão no dispositivo e o servidor não guarda dados financeiros. Sem cookie, redireciona sempre |
| D-SB-04 | **Uma base IndexedDB por identidade**: `pfm-local` para o dono (registo `owner`), `pfm-local~<userId>` para as outras | Coluna `ownerId` em cada registo | Sem reescrever registos nem o formato JSON (2.4.0). Isolamento físico: um bug de filtro não mistura contas. A troca fecha a ligação anterior |
| D-SB-05 | **Migração assistida**, com a password local como prova de posse e uma só transação final. A credencial fica **desativada** (`migratedTo`, `disabledAt`), não apagada | Migração automática no primeiro login; apagar a conta local | O hash PBKDF2 não é reutilizável (brief). Ligar dados sem prova permitiria a qualquer conta Supabase reclamar os dados de um navegador partilhado. Não apagar segue a regra do brief |
| D-SB-05b | Dados **sem** conta local → ligação só com confirmação explícita. "Empezar sin estos datos" → base própria vazia | Ligar automaticamente | Não há segredo para verificar. A confirmação e a alternativa evitam ligações por engano |
| D-SB-06 | O **email de login fica só no Supabase Auth**: não é copiado para `profiles` nem para o perfil local | Copiar para `contact_email` | "Sem duplicação" (brief). `contact_email` (SQL 02) continua a ser um campo de contacto distinto, que a app não escreve |
| D-SB-07 | **SQL 09** novo, opcional: duas políticas (ler/alterar o próprio perfil) e privilégios **por coluna**. Nenhuma tabela nova | Esperar pelo Step 15; abrir `user_preferences` | É o mínimo para "atualização segura do perfil" na nuvem. As preferências financeiras continuam locais porque o brief não pede migração de repositórios. O 08 aceita exatamente estas duas políticas |
| D-SB-08 | Redefinir a password **sem** a atual só numa sessão de recuperação com menos de 15 min (`amr: recovery`). Nos outros casos, re-verificar a atual | Confiar em qualquer sessão | Uma sessão roubada não pode mudar a password |
| D-SB-09 | Password da nuvem: mesma política (NIST), **mínimo 10** | 8, como a local | Recomendação do Step 12 (§6). Coincide com o valor a configurar no painel |
| D-SB-10 | **Snapshot offline de 14 dias** (identidade sem token) em `localStorage` | Sem offline; guardar a sessão | Mantém a PWA utilizável sem rede sem guardar credenciais. Um 401 online apaga-o |
| D-SB-11 | Ligações de email com **`token_hash`** verificado no servidor (`verifyOtp`); `code` PKCE também aceite | Só `{{ .ConfirmationURL }}` (PKCE) | Funciona noutro dispositivo/navegador e não depende do verificador PKCE em cookie |
| D-SB-12 | Registo, recuperação e reenvio respondem **igual** com conta ou sem ela | Mensagens específicas | Sem enumeração de contas |
| D-SB-13 | Origem das ligações: `NEXT_PUBLIC_SITE_URL`, senão a origem do pedido | Só variável obrigatória | Funciona em local e em previews. A *allow list* do Supabase é a barreira real |
| D-SB-14 | E2E do modo Supabase com um **servidor GoTrue falso só de testes**, num build separado (`.next-e2e-supabase`) | Projeto Supabase real no CI; *mocks* do cliente | O brief proíbe pedir credenciais e alterar a base remota. O falso fala a API HTTP real, por isso o `@supabase/ssr` e o `@supabase/supabase-js` correm sem alterações |

## Em aberto / a rever

- **Step 15:** rever as políticas do 09 junto com as de todas as tabelas.
- **Step 16:** o cliente do browser (`src/lib/supabase/client.ts`) deixou de ser usado. A sincronização deve decidir se usa Server Actions/rotas (coerente com `HttpOnly`) ou um cliente com outro desenho de sessão.
- **OD-AUTH-1** (password local esquecida) deixa de se aplicar no modo `cloud`: há recuperação por email. No modo local continua em aberto.
- **Verificação num projeto real:** o comportamento de `amr: recovery` e os modelos de email foram validados contra o servidor falso e a documentação do Supabase, não contra um projeto real (ver o relatório de testes).
