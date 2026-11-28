# Segurança da base de dados (Step 13)

Estado: **fundação estrutural implementada nos scripts; autorização por utilizador ainda NÃO implementada** (Step 15). Nada foi executado num projeto Supabase.

## O que está em vigor depois dos scripts 01–07

| Controlo | Como | Verificado por |
| --- | --- | --- |
| Dono em cada linha | `user_id uuid not null default auth.uid() references auth.users on delete cascade` em todas as tabelas de dados | `08` (colunas, FKs) |
| Sem referências entre utilizadores | 21 FKs **compostas** `(user_id, x_id) → (user_id, id)`; `unique (user_id, id)` em cada tabela referida | Teste local: transação a apontar para a conta de outro utilizador → recusada |
| Clientes sem acesso | RLS ativa nas 17 tabelas, **0 políticas**, `REVOKE ALL` de `anon`/`authenticated` (e de `PUBLIC`) | `07`, `08`; teste local: `anon` e `authenticated` recebem `permission denied` |
| Tabelas futuras fechadas por omissão | `ALTER DEFAULT PRIVILEGES … REVOKE` para tabelas e sequências criadas pelo `postgres` em `public` | `08`; teste local com uma tabela nova |
| Integridade no servidor | CHECK (formas, valores, enums, conversão exata, períodos), triggers de coerência entre tabelas, identidade imutável, `rev` crescente | 53 testes de comportamento locais |
| Sem segredos | Nenhuma coluna de palavra-passe, hash, token ou sessão; `audit_logs` só com nomes de colunas; `backup_metadata` sem ficheiro nem frase | Teste estático e teste local |
| Funções seguras | Todas com `search_path = ''` e nomes qualificados; EXECUTE revogado a clientes, exceto 5 funções puras que as CHECK precisam | `08` (por função) e teste estático |
| Eliminação de conta | Apagar o utilizador em `auth.users` apaga todas as suas linhas, e só as suas | Teste local |

## Funções SECURITY DEFINER (3)

| Função | Porquê privilegiada | Limites |
| --- | --- | --- |
| `initialize_user(uuid, jsonb)` | Cria perfil, preferências e duas configurações de taxa vazias no registo, quando o utilizador ainda não tem sessão nem políticas | Só valores validados dos metadados (username pelo padrão e livre, nome ≤ 80, moeda da lista); valores inválidos são ignorados, nunca fatais; nenhuma cotação inventada; `search_path = ''`; EXECUTE só do dono |
| `handle_new_user()` | Trigger `AFTER INSERT` em `auth.users` que chama a anterior | Não recebe parâmetros do cliente; único objeto do AUREON no schema `auth` é o trigger que a usa |
| `audit_row_change()` | Escreve em `audit_logs`, que nenhum cliente pode escrever, alterar ou apagar | Grava dono, tabela, chave, ação, **nomes** das colunas alteradas, dispositivo e papel; nunca valores |

Os triggers disparam sem que o papel que escreve tenha EXECUTE na função (comportamento do PostgreSQL, confirmado localmente). Por isso o EXECUTE fica revogado a todos os clientes.

## O que NÃO está implementado (e porquê)

- **Políticas RLS** (Step 15). Sem elas, a app não pode usar a base, o que é intencional. Não há políticas permissivas temporárias.
- **GRANTs a `authenticated`** (Step 15, junto com as políticas, tabela a tabela e operação a operação).
- **Cifragem ao nível da aplicação** (Step 18). O fornecedor cifra em repouso; a cifragem dos campos de texto pela app vem depois. Não enviar dados reais antes disso.
- **`FORCE ROW LEVEL SECURITY`:** não é usado. Obrigaria o dono (`postgres`, SQL Editor) a ter políticas e bloquearia os triggers SECURITY DEFINER. Os clientes nunca são donos das tabelas.
- **Regras de fluxo de negócio** (estado das contas domésticas, sobreposição de orçamentos, conclusão de metas): ficam no domínio da app, como pedido.

## Riscos e cuidados

| Risco | Mitigação |
| --- | --- |
| Alguém criar políticas permissivas no painel antes do Step 15 | O `07` aborta se existirem políticas; o `08` mostra o número de políticas por tabela |
| Uma tabela nova criada à mão em `public` | Os privilégios por omissão já não a abrem a `anon`/`authenticated`; mesmo assim, ativar a RLS |
| A `service_role` ignora a RLS | Nunca no browser (guarda de build e de artefactos do Step 12); só em CI/servidor |
| O cursor `server_updated_at` e as transações longas | O pull do Step 17 relê uma janela de sobreposição e aplica por `rev` |
| As CHECK de texto vs. ciphertext (Step 18) | Ajustar os limites quando os campos passarem a ir cifrados |
