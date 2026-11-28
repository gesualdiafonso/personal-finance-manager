# AUREON — Scripts SQL para o Supabase (Step 13 + 09 do Step 14)

Estes ficheiros criam a base de dados do AUREON no teu projeto Supabase. **És tu que os executas, um a um, no SQL Editor do painel.** Nada aqui é aplicado automaticamente: nem pela app, nem por CLI, nem por CI.

Os scripts foram validados num PostgreSQL 16 **local e descartável**, com uma emulação mínima do Supabase, incluindo uma em que `postgres` não é superutilizador, como no Supabase ([relatório](../../docs/database/STEP-13-VALIDATION.md)). **Não foram executados em nenhum projeto Supabase.**

## 1. Configuração necessária no Supabase

- Um projeto criado ([docs/SUPABASE_SETUP.md](../../docs/SUPABASE_SETUP.md) §1–2, região `sa-east-1`).
- Acesso ao painel com a tua conta (o SQL Editor executa como `postgres`). **Não precisas** da palavra-passe da base, da chave secreta nem da `service_role`.
- Nenhuma extensão a ativar.
- Recomendado: começar num projeto de desenvolvimento (`aureon-dev`) e só depois repetir em produção.

## 2. Como executar um script no SQL Editor

1. Supabase Dashboard → o teu projeto → **SQL Editor** → **New query**.
2. Abre o ficheiro no teu computador, copia **todo** o conteúdo **de um só script** e cola-o.
3. Lê o cabeçalho (o que faz e de que depende).
4. Carrega em **Run**.
5. Confirma o resultado esperado (§4). Só então passas ao seguinte.

> **Nunca coles vários scripts de uma vez**, nem a coleção inteira. Cada script verifica que o anterior foi aplicado e que ele próprio ainda não o foi; executá-los separadamente é o que permite saber exatamente onde algo falhou.

Se o editor mostrar um aviso sobre operações destrutivas ou RLS, lê-o. Os scripts 01–07 não apagam nada; só o 99 é destrutivo.

## 3. Ordem exata

| # | Ficheiro | Escreve? | O que faz |
| --- | --- | --- | --- |
| 1 | `00_preflight_checks.sql` | Não (só leitura) | Verifica a versão, o schema `auth`, os papéis e que ainda não há nada do AUREON |
| 2 | `01_extensions.sql` | Sim | Nenhuma extensão; 4 tipos partilhados, 5 funções puras e privilégios por omissão seguros |
| 3 | `02_identity_schema.sql` | Sim | `profiles`, `user_preferences`, `user_devices`, `exchange_rate_sets`, `exchange_rate_quotes` |
| 4 | `03_financial_schema.sql` | Sim | `accounts`, `categories`, `cards`, `recurrences`, `bills`, `transactions`, `budgets`, `goals`, `goal_contributions` |
| 5 | `04_system_schema.sql` | Sim | `sync_operations`, `audit_logs`, `backup_metadata` |
| 6 | `05_constraints_and_indexes.sql` | Sim | Chaves estrangeiras compostas, índices, uma contribuição viva por transação |
| 7 | `06_functions_and_triggers.sql` | Sim | Triggers de manutenção, integridade e auditoria; inicialização de utilizadores (trigger em `auth.users`) |
| 8 | `07_rls_enablement.sql` | Sim (idempotente) | Confirma RLS ativa, nenhuma concessão a clientes, nenhuma política |
| 9 | `08_verification.sql` | Não (só leitura) | Verificação final de tudo |
| 10 | `09_profile_access.sql` | Sim (idempotente) | **Step 14, opcional:** cada utilizador autenticado lê e altera só o seu perfil (2 políticas em `profiles` e privilégios por coluna). Termina com a sua própria verificação. Depois, volta a correr o 08 (§11) |
| — | `99_uninstall_empty_install.sql` | **Destrutivo** | Só para recuperação de uma instalação **vazia** (§6) |

## 4. Resultado esperado

O SQL Editor mostra apenas o resultado da **última** instrução de cada script, e cada script termina com uma tabela pensada para isso.

| Script | Deves ver |
| --- | --- |
| 00 | 11 linhas, todas `OK` (a 2.ª pode ser `AVISO` se não executares como `postgres`; a 11.ª é `INFO` com o número de utilizadores) |
| 01 | `AUREON 01 aplicado: 4 tipos, 5 funções puras, privilégios por omissão seguros…` |
| 02 | `AUREON 02 aplicado: 5 tabelas de identidade/preferências…` |
| 03 | `AUREON 03 aplicado: 9 tabelas financeiras…` |
| 04 | `AUREON 04 aplicado: 3 tabelas de sistema…` |
| 05 | `AUREON 05 aplicado: FKs compostas, índices…` |
| 06 | `AUREON 06 aplicado: 17 funções, triggers…` |
| 07 | 17 linhas, uma por tabela: `rls = ATIVA`, `politicas = 0`, `anon_select`, `authenticated_select` e `authenticated_insert` a `false`, `estado = OK — fechada até ao Step 15` |
| 08 | 1.ª linha `RESUMO · 189 verificações · 0 com erro · OK`, depois as restantes linhas, todas `OK` |

Uma mensagem de erro do tipo `AUREON 0X já foi aplicado` significa que esse script já tinha sido executado com sucesso. Não é um problema: nada foi alterado.

## 5. Verificação

1. Executa o `08_verification.sql`.
2. Lê a 1.ª linha (`RESUMO`). Com `0 com erro` e estado `OK`, a estrutura está completa e correta.
3. Se houver erros, aparecem logo a seguir ao resumo, com estado `ERRO`. A coluna `encontrado` diz o que falta ou está errado (por exemplo `em falta: transactions_account_fk`, `DESATIVADA`, `anon TEM privilégios`).
4. Também podes confirmar no painel: **Table Editor** (17 tabelas, todas com o cadeado de RLS) e **Advisors → Security Advisor**. É normal o Advisor avisar que há tabelas com RLS e sem políticas: é intencional até ao Step 15 (§8).

O `08` compara com uma lista gerada a partir do esquema validado localmente (`scripts/db/generate-verification.mjs`) e cobre:

- tabelas e colunas, com tipos e nulidade;
- chaves primárias, estrangeiras, de unicidade e checks;
- índices, triggers e funções (SECURITY DEFINER, `search_path`, EXECUTE);
- tipos partilhados;
- RLS e privilégios, incluindo os privilégios por omissão;
- perfis dos utilizadores existentes.

## 6. Recuperação se um script falhar

Os scripts 01–07 correm cada um **numa única transação**: se uma instrução falhar, **tudo o que esse script fez é desfeito automaticamente** e a base fica como estava antes dele.

1. Lê a mensagem de erro. Os erros previstos começam por `AUREON` ou `Falta o script…` e dizem o que fazer.
2. Corrige a causa (por exemplo, executar primeiro o script em falta).
3. Executa de novo **o mesmo script**.
4. Executa o `00` ou o `08` para confirmar o estado.

Erros comuns:

| Mensagem | Causa | O que fazer |
| --- | --- | --- |
| `Falta o script 0X…` | Ordem trocada | Executar os scripts em falta, por ordem |
| `AUREON 0X já foi aplicado…` | Script repetido | Nada; passar ao seguinte |
| `permission denied` / `must be owner` | Não estás a executar como `postgres` | Confirmar o papel do SQL Editor (linha 2 do `00`) |
| `Existem N políticas RLS…` (07) | Alguém criou políticas antes do Step 15 | Rever e remover essas políticas no painel (Authentication → Policies) e repetir o 07 |
| `00` com `ERRO` na linha 8 ou 9 | Já existem tabelas ou tipos com estes nomes | Ver §7 |

## 7. Scripts executados em parte

- **Um script interrompido a meio** (erro, separador fechado, rede) **não deixa nada a meio**: a transação é revertida. Basta executá-lo de novo.
- **Vários scripts, mas não todos:** executa o `00`. A linha 8 lista as tabelas que já existem. Continua a partir do primeiro script que ainda não correu; cada script recusa correr se faltar o anterior.
- **Instalação errada ou incompleta, sem dados reais:** executa o `99_uninstall_empty_install.sql`. Ele recusa correr se houver qualquer dado financeiro (contas, movimentos, cotações, sincronização, backups). Remove tudo o que 01–07 criaram, sem tocar nos utilizadores de `auth.users`. Depois recomeça no `00`.
- **Com dados reais:** não uses o `99`. Pede ajuda antes de alterar a estrutura.
- **Repor os privilégios por omissão originais do Supabase** (não recomendado; reabre tabelas novas à chave publicável):
  ```sql
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
  ```

## 8. Registar os scripts executados

Mantém um registo simples, por projeto (dev e produção), por exemplo em `docs/database/EXECUTION-LOG.md` ou numa nota tua:

| Script | Projeto | Data e hora | Por quem | Resultado | Observações |
| --- | --- | --- | --- | --- | --- |
| 00 | aureon-dev | 2026-11-29 10:05 | (tu) | 11 OK | — |
| 01 | aureon-dev | … | … | "AUREON 01 aplicado…" | — |
| … | | | | | |
| 08 | aureon-dev | … | … | RESUMO 189 / 0 erros | — |

Guarda também a versão dos ficheiros que usaste: o commit do repositório ou a data do ZIP.

## 9. RLS ativa sem políticas (intencional)

Todas as 17 tabelas têm **Row Level Security ativa** e **nenhuma política**, e os papéis `anon` e `authenticated` **não têm privilégios** nelas.

- **Efeito:** a app, através da chave publicável, não consegue ler nem escrever **nada**. Uma consulta devolve `permission denied`. É o estado pretendido até ao Step 15.
- **Porquê:** criar as tabelas sem RLS deixá-las-ia abertas a qualquer pessoa com a chave publicável. Criar políticas incompletas agora seria pior do que não as ter.
- **Quem continua a aceder:** o SQL Editor (`postgres`, dono das tabelas) e a `service_role` (servidor; nunca no browser).
- **Não se usa `FORCE ROW LEVEL SECURITY`:** bloquearia o próprio dono e os triggers de auditoria e de inicialização.
- **No Step 15** entram as políticas por operação (`user_id = auth.uid()`) e os GRANTs mínimos a `authenticated`, com testes de isolamento entre dois utilizadores.

## 10. Limitações conhecidas até ao Step 15

- **Sem autorização por utilizador:** não há políticas, por isso a app ainda não usa estas tabelas. A autenticação local e o IndexedDB continuam a ser o que a app usa.
- **O trigger de novos utilizadores** (`on_auth_user_created_aureon`) já cria perfil, preferências e duas configurações de taxa vazias (Oficial, MEP) para cada registo no Supabase Auth, incluindo os utilizadores que já existiam quando o 06 correu.
- **Sincronização:**
  - `sync_operations` exige que o dispositivo esteja registado em `user_devices`;
  - o cursor `server_updated_at` tem a limitação clássica de transações longas, e o pull do Step 17 deve reler uma pequena janela de sobreposição.
- **Cifragem (Step 18):** as CHECK de comprimento e de "sem número de cartão" valem para texto em claro. Quando os campos passarem a ir cifrados, o Step 18 terá de ajustar esses limites.
- **Taxas e `bigint`:**
  - as taxas são texto exato, para não passarem por vírgula flutuante;
  - os valores `bigint` cabem num número JavaScript (garantido pelo tipo `money_minor`).
- **Fica na aplicação:** as regras de fluxo (estado das contas domésticas, sobreposição de orçamentos, conclusão de metas, edição de movimentos cancelados, duplicados) continuam no domínio da app, não na base.
- **Versão:** validado em PostgreSQL 16; os projetos Supabase usam 15 ou 17, e não foram usadas funcionalidades exclusivas de uma versão.

Mais detalhe:

- [Diagrama de entidades](../../docs/database/ERD.md)
- [Mapeamento TypeScript ↔ PostgreSQL](../../docs/database/TYPESCRIPT-POSTGRES-MAPPING.md)
- [Segurança da base](../../docs/database/SECURITY.md)
- [Validação](../../docs/database/STEP-13-VALIDATION.md)

## 11. Script 09 — acesso ao próprio perfil (Step 14)

Para que serve: com Supabase Auth ativo, a página Perfil grava também na nuvem o nome, o telefone, o país e a região (`public.profiles`), sempre com a sessão do próprio utilizador e a chave publicável. Sem o 09, a app funciona na mesma: o perfil fica só no dispositivo e a página avisa disso.

- **Quando:** depois de 01–08 aplicados e com o 08 a mostrar 0 falhas.
- **Como:** igual aos outros (§2). É idempotente, por isso pode ser repetido.
- **Resultado esperado:** 8 linhas, todas com `ok = true`:
  - RLS ativa;
  - as 2 políticas `aureon_profiles_select_own` e `aureon_profiles_update_own`, só para `authenticated`;
  - nenhum privilégio de tabela;
  - `SELECT` só nas colunas `id, username, full_name, phone, country, region, created_at, updated_at`;
  - `UPDATE` só em `full_name, phone, country, region`;
  - sem `INSERT`/`DELETE`/`contact_email`;
  - nada para `anon`;
  - as outras 16 tabelas com 0 políticas.
- **Depois:** volta a correr `08_verification.sql`. Deve continuar a mostrar `RESUMO … 0 com erro`, porque o 08 aceita exatamente estas 2 políticas em `profiles`.
- **Se abortar com "já tem outras políticas":** alguém criou políticas em `profiles`. Nada foi alterado. Revê-as antes de continuar.
- **Atenção:** depois do 09, **não voltes a correr o 07**. O 07 aborta se existirem políticas, e nesse caso não muda nada.
- **Reverter:** o bloco no cabeçalho do ficheiro (2 `drop policy` + `revoke`).
- **Validação local:** `database/tests/run-local.sh` aplica o 09 duas vezes, corre `database/tests/behaviour-09.sql` (15 verificações por papel: A só vê e altera a sua linha, não muda `username`/`contact_email`/`id`, não insere nem apaga, `anon` sem acesso) e confirma o 08 com 0 falhas. Isto foi feito em PostgreSQL 16 local, nos dois clusters de emulação. **Não foi executado em nenhum projeto Supabase.**
