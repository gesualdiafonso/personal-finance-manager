# Autenticação local e perfil global

Estado: **implementado e validado** (IndexedDB v4). Decisões D-AUTH-01…10 em [auth-decisions.md](../decisions/auth-decisions.md).

> **Limite, dito sem rodeios:** é autenticação **local do dispositivo**, não identidade de servidor. Prova que quem está neste navegador conhece a palavra-passe definida aqui. **Não cifra os dados financeiros** (OD-3 decidida, por implementar): quem tiver acesso ao perfil do navegador (ferramentas de programador, cópia do disco) consegue ler o IndexedDB. Não há sincronização entre dispositivos nem recuperação de palavra-passe.

## Peças

| Peça | Onde |
| --- | --- |
| Perfil (entidade, validação, iniciais) | `src/domain/profile.ts` |
| Verificador de palavra-passe (PBKDF2, Web Crypto) | `src/services/auth/password.ts` |
| Serviço: registo, login, sessões, logout, mudança de palavra-passe, perfil | `src/services/auth/auth-service.ts` |
| Estado global (`AuthProvider`, `useAuth`, `useProfile`) | `src/features/auth/auth-context.tsx` |
| Proteção de rotas (`AuthGate`) | `src/features/auth/auth-gate.tsx`, aplicado em `src/app/(app)/layout.tsx` |
| Ecrãs | `/entrar`, `/registro` (`auth-screens.tsx`), `/perfil` (`profile-page.tsx`), menu de perfil (`ProfileMenu` em `brand-controls.tsx`) |

## Armazenamento (IndexedDB v4, só aditivo)

| Store | Chave | Conteúdo | Exportado? |
| --- | --- | --- | --- |
| `profiles` | `id` (índice único `username`) | Perfil: username, nome, email, telefone, país, região, moeda secundária, idioma, formato de data, datas | Não |
| `credentials` | `userId` | **Só** o verificador PBKDF2 (algoritmo, iterações, sal, hash), tentativas falhadas, bloqueio | Não |
| `sessions` | `id` (índice `userId`) | Id aleatório opaco, criação, última atividade, expiração, "recordar" | Não |

A atualização v3 → v4 só cria estas três stores vazias e regista `{ from: 3, to: 4 }` em `migration_log`. Nenhum registo financeiro é lido para alteração, movido ou apagado; nenhuma base de dados é apagada. "Borrar datos locales" (Configuración) não toca na conta. As exportações e publicações leem só as stores financeiras e `settings` — testado que não contêm verificador, sal, hash, sessão, username nem email.

## Palavra-passe

- PBKDF2-HMAC-SHA-256, **600 000 iterações** (OWASP; o mesmo parâmetro da cifragem de publicações), sal aleatório de 16 bytes por palavra-passe, 32 bytes derivados. Comparação em tempo constante. Um verificador com menos iterações é recusado.
- Política (estilo NIST SP 800-63B): 8–128 caracteres, sem regras de composição; recusa o próprio username e uma pequena lista de palavras-passe óbvias (sem consulta externa).
- Login: utilizador desconhecido e palavra-passe errada falham da mesma forma e demoram o mesmo (derivação com um verificador fictício). Após 5 falhas, espera exponencial: 30 s, 60 s… até 15 min.
- Mudar a palavra-passe exige a atual, gera sal novo e termina as outras sessões.

## Sessões

| | "Recordar sesión" ligado | Desligado |
| --- | --- | --- |
| Duração | 30 dias | Até fechar o navegador, 30 min sem atividade ou 12 h |
| Marcador no navegador | nenhum (o registo em IndexedDB basta) | id opaco em `sessionStorage` (vazio ao fechar o navegador) |

LocalStorage não guarda nada da conta. A sessão é verificada ao abrir, a cada minuto, ao voltar ao separador e após cada alteração de dados; sessões expiradas são apagadas. Logout apaga o registo e avisa os outros separadores (BroadcastChannel).

## Rotas protegidas

Todo o grupo `src/app/(app)` (Panel, Transacciones, Cuentas, Tarjetas, Cuentas domésticas, Recurrencias, Presupuesto, Informes, Configuración, Perfil) passa pelo `AuthGate`: **nada** — nem a navegação — é renderizado antes de uma sessão válida ser confirmada. O HTML estático dessas rotas contém só o ecrã "Verificando la sesión…". Sem sessão, o utilizador vai **sempre** para o login (`/entrar?next=<página>`). Num navegador sem conta, o login mantém-se e explica que as contas são locais (criadas noutro navegador, dispositivo ou endereço não aparecem aqui), com a ligação «Crear una cuenta». O `next` só aceita caminhos desta aplicação (nunca `//outro-sitio`).

## Perfil global — uma só fonte por valor

- Campos pessoais e de apresentação vivem no registo `profiles`.
- **Moeda principal, fuso horário e formato numérico vivem em `FinancialSettings`** (já existiam): o perfil lê-os e escreve-os lá, na mesma transação. Mudar a moeda no perfil ou em Moneda y cambio é a mesma alteração.
- `useProfile()` dá a todos os módulos o mesmo objeto; guardar o perfil atualiza o contexto e emite `notifyDataChanged()`, pelo que cada módulo volta a ler moeda e região (também noutros separadores).

| Módulo | Como usa o perfil |
| --- | --- |
| Navegação (sidebar, rail, cabeçalho móvel) | Menu de perfil: iniciais, nome, @username, Mi perfil, Configuración, Cerrar sesión |
| Panel | Saudação com o primeiro nome; totais na moeda principal |
| Cuentas | Moeda por omissão de uma conta nova = moeda principal; equivalentes na moeda principal |
| Tarjetas, Transacciones (ingresos e gastos) | Moedas disponíveis incluem a secundária; equivalentes estimados na moeda principal; datas numéricas no formato do perfil |
| Presupuesto (orçamentos e metas), Cuentas domésticas | Moeda por omissão = moeda principal; datas no formato do perfil |
| Informes | Resumo do perfil e das preferências que os informes usarão (a área ainda é um placeholder) |
| Configuración | Resumo do perfil; a moeda principal de Moneda y cambio é a do perfil; o conversor começa na moeda secundária |
| Deudas | **N/A** — não existe um módulo de dívidas nesta aplicação |

**Limites do perfil:** idioma e formato numérico só têm a opção es-AR (ADR-005 continua em aberto). O fuso horário guarda-se e usa-se na saudação; o calendário financeiro continua em hora de Buenos Aires (D-AUTH-08). O formato de data aplica-se às datas numéricas ("27/11/2026" ↔ "2026-11-27"); datas por extenso ("27 nov") não mudam.

## PWA

`/entrar` e `/registro` estão no precache do service worker: com a aplicação instalada, o ecrã de entrada abre sem rede (testado em Chromium). A autenticação não usa rede em nenhum momento.

## Testes

- `tests/integration/auth-service.test.ts` (15): hashing e verificação, política, registo, username duplicado e segunda conta, validação, preservação dos dados existentes, login válido/inválido, espera após falhas, persistência e expiração de sessões, logout, mudança de palavra-passe, atualização do perfil e das definições, exportação sem segredos, "Borrar datos locales" não apaga a conta, atualização real v3 → v4.
- `tests/integration/auth-ui.test.tsx` (10): rotas protegidas (sem sessão, com conta, sessão recordada), ecrã de registo, ecrã de login (inválido, válido, mostrar/ocultar, `next`, recusa de redirecionamento externo), propagação do perfil (menu, resumo, datas, moeda, uma só ficha), moeda por omissão em Cuentas, logout, mudança de palavra-passe.
- `tests/e2e/auth.spec.ts` (desktop e iPhone, build de produção): o percurso completo dos critérios de aceitação e o ecrã de entrada offline. Os restantes testes E2E correm com sessão iniciada através de `tests/e2e/auth.setup.ts`.
