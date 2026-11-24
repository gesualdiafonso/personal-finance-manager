# Relatório do Step 03 — Accounts & Cards

**Data:** 2026-11-24 · **Base:** `8ae9652` (Step 02 concluído, CI #4–#6 verdes) · **schemaVersion:** 2.1.0 · **IndexedDB:** versão 2 (sem alterações)

O Step 03 seguiu a ordem do brief, com aprovação explícita entre fases: auditoria e contrato de domínio (D3-01 a D3-10 aprovados) → gestão de contas → gestão de cartões → detalhes, indicadores, testes, documentação. O Step 04 não foi iniciado.

## 1. Resumo

O utilizador consegue ver, criar, editar, arquivar, reativar e (sem referências) eliminar contas e cartões; corrigir o saldo inicial por um fluxo explícito; consultar o detalhe de cada conta e cartão com os movimentos filtráveis; e ver indicadores derivados dos dados guardados, sempre por moeda. Tudo usa os repositórios e as regras do Step 02.

## 2. Arquitetura final

```text
app/(app)/cuentas, cuentas/[id], tarjetas, tarjetas/[id]   shells estáticos; dados lidos no cliente
features/accounts · features/cards · features/movements    páginas, sheets, formulários (Zod), leitores
hooks/use-local-data   getLocalDb · useLocalQuery · mutate · notifyDataChanged (BroadcastChannel local)
hooks/use-detail-id    id da barra de endereço (o mesmo shell serve qualquer id, também sem rede)
components/ui          sheet e confirmação (<dialog> nativo), campos, badge, skeleton, feedback
domain/rules           accounts.ts (summarizeAccounts) · cards.ts (datas, summarizeCards)
services/repositories  Step 02 + countReferences + conta de cartão com movimentos bloqueada
```

Leituras: uma transação IndexedDB só de leitura por ecrã, registos inválidos contados e não mostrados, saldos e indicadores pelas funções centrais do domínio. Escritas: só pelos repositórios (registo + `outbox` numa transação) e depois atualização de todas as consultas.

## 3–4. Ficheiros

**Criados (52):** `src/features/accounts/*` (7), `src/features/cards/*` (6), `src/features/movements/*` (2), `src/components/ui/{sheet,confirm-dialog,field,badge,skeleton,feedback}.tsx`, `src/components/layout/breadcrumb.tsx`, `src/hooks/{use-local-data,use-detail-id}.ts`, `src/domain/rules/{accounts,cards}.ts`, `src/app/(app)/{cuentas,tarjetas}/[id]/page.tsx`, 8 ficheiros de teste, `docs/features/{accounts,cards}.md`, `docs/architecture/{account,card}-management.md`, `docs/testing/step-03-test-report.md`, `docs/decisions/step-03-decisions.md`, este relatório, log e capturas.

**Modificados (36):** páginas `/cuentas` e `/tarjetas`; `domain/schemas.ts` (pré-pago, 2.1.0); `lib/config/app.ts`; `lib/formatting/money.ts` (moeda, sinal opcional); `components/shared/money.tsx` (moeda); `lib/i18n/es.ts`; `services/repositories/repositories.ts`; `components/layout/{app-shell,sidebar,rail,mobile-nav,data-status}.tsx`; `scripts/pwa/sw.template.js`; `schemas/card.schema.json`; `data/*` (versão 2.1.0, mesmos registos); 5 testes; 7 documentos. **Sem alterações:** `package.json`, `package-lock.json`, tokens, fontes, navegação (itens e rotas), Design System.

## 5–6. Funcionalidades e regras de negócio

Ver [docs/features/accounts.md](../features/accounts.md), [docs/features/cards.md](../features/cards.md) e [decisões D3](../decisions/step-03-decisions.md). Em resumo: centavos inteiros; nunca somar moedas; saldo atual derivado (completados) e projetado (com pendentes); saldo inicial só por correção confirmada; arquivar em vez de apagar quando há referências; eliminar = tombstone com confirmação; cartão sempre com conta de pagamento e a moeda dela; limite só em crédito e nunca tratado como dinheiro; nenhum dado sensível de cartão.

## 7–8. Testes e resultados

[Relatório de testes](../testing/step-03-test-report.md) · [log](step-03-logs/ci-sequence.log)

| Conjunto | Resultado |
| --- | --- |
| Unitários + integração | **203 passam** (51 novos), 20 ficheiros |
| E2E (build de produção, desktop + iPhone/Chromium) | **56 passam** (20 novos), 2 ignorados por desenho |
| Lint · tipos · tokens · schemas · dados (4 camadas) · migração · changeset · guardas · build | ✓ |

## 9. Critérios de aceitação

| ID | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| ACC-01 | Página de contas funcional | **PASS** | `accounts-page.test.tsx` (11), E2E `accounts.spec.ts`, captura `step-03-ecras/desktop-3-lista.png` |
| ACC-02 | Criação de contas | **PASS** | Teste "creates an account through the repository"; E2E com erros de validação e recarregar |
| ACC-03 | Edição de contas | **PASS** | Integração e E2E "edit, archive and delete"; correção do saldo inicial (D3-04) |
| ACC-04 | Arquivo de contas | **PASS** | Arquivar/reativar; "Archivadas (N)"; arquivadas fora dos indicadores ativos (`accounts.test.ts`) |
| ACC-05 | Detalhes de conta | **PASS** | `detail-pages.test.tsx`; E2E de detalhe, incluindo sem rede |
| ACC-06 | Precisão monetária | **PASS** | Formulário em centavos, recusa 3 decimais e valores fora do limite; schema recusa decimais; `Money` sem vírgula flutuante |
| ACC-07 | Moedas não somadas | **PASS** | `summarizeAccounts` por moeda; testes de integração e E2E "currencies are never added together" |
| ACC-08 | Integridade referencial | **PASS** | Eliminar só sem referências; moeda bloqueada; tombstone; testes de repositório e de página |
| CARD-01 | Página de cartões | **PASS** | `cards-page.test.tsx` (9), E2E `cards.spec.ts`, capturas |
| CARD-02 | Criação de cartões | **PASS** | Crédito, débito, pré-pago; campos condicionais |
| CARD-03 | Edição de cartões | **PASS** | Integração e E2E; conta bloqueada com movimentos (também no repositório) |
| CARD-04 | Arquivo de cartões | **PASS** | "Archivadas"; arquivados fora dos indicadores |
| CARD-05 | Validação da conta associada | **PASS** | Formulário exige conta; repositório recusa conta inexistente e moeda diferente |
| CARD-06 | Dados sensíveis não armazenados | **PASS** | Sem campos; schema estrito recusa `cvv`, `pin`, número completo, palavra-passe; 4 dígitos exatos; textos recusam números de cartão (`cards.test.ts`, repositório) |
| FIN-01 | Indicadores corretos | **PASS** | `summarizeAccounts`/`summarizeCards` com as regras centrais; valores conferidos com os dados de exemplo; atualizam após criar/editar/arquivar |
| FIN-02 | Limite ≠ saldo | **PASS** | Limite separado e rotulado "no dinero disponible"; sem "crédito disponible"; teste dedicado |
| UX-01 | Design System preservado | **PASS** | Só tokens e utilidades `type-*`; um valor herói; sem cards de KPI, sem ícones decorativos; sheet de 440px / bottom sheet; tabelas → listas no telemóvel; capturas desktop e iPhone. Revisão visual feita por mim — falta a tua revisão |
| UX-02 | Responsividade | **PASS** | E2E desktop 1440 e iPhone 390 sem overflow horizontal; tablet com colunas reduzidas (verificado só no código, sem E2E de tablet) |
| QA-01 | Testes unitários | **PASS** | 26 novos, todos a passar |
| QA-02 | Testes de integração | **PASS** | 25 novos, sem mocks da persistência |
| QA-03 | Testes E2E | **PASS** | 56 passam; corridos várias vezes seguidas |
| QA-04 | Build de produção | **PASS** | `npm run build` ✓ |
| SEC-01 | Sem dados em texto simples publicados | **PASS** | `guard:artifacts` ✓ (448 ficheiros) |
| SEC-02 | Sem comunicação financeira externa | **PASS** | `guard:deps` (endpoints em `src/`); a única comunicação nova é `BroadcastChannel`, local ao dispositivo |
| ARCH-01 | IndexedDB pelos repositórios existentes | **PASS** | Todas as escritas por `mutate` → repositórios; leituras pelos serviços do Step 02 |
| ARCH-02 | Sem base de dados/ORM | **PASS** | `guard:deps` ✓; nenhuma dependência nova |

## 10. Problemas encontrados (e resolvidos)

- Navegações com `usePathname` impediam o pré-render do shell de detalhe sem id conhecido: divididas em `X`/`XView` e mostradas dentro de `Suspense` (sem mudança visual).
- Corridas nos E2E entre a gravação e a releitura da lista: os testes esperam pelo estado seguinte; páginas anteriores ficam montadas escondidas (Activity do Next), por isso os testes procuram a mensagem visível.
- Um teste do Step 01 (seletor de Obligaciones) passou a esperar a hidratação de `/tarjetas`.
- Formatação automática tocou em ficheiros fora do âmbito; foram repostos.

## 11. Pendências

- Commit e push (não tenho escrita no repositório) e CI no GitHub.
- Tua revisão visual das capturas.
- Vista do cartão por fatura e crédito disponível — OD-8.

## 12. Riscos técnicos

- **Dados não cifrados no dispositivo** (OD-3 decidida, não implementada): continuar só com dados fictícios.
- **D2-11 para débito e pré-pago**: compras com cartão de débito não descontam da conta até a OD-8.
- **Leituras completas**: cada ecrã lê todas as transações; adequado ao volume de um utilizador, a rever com milhares de registos (índices já existem).
- **Safari real não testado** (E2E em Chromium).

## 13. Dependências para o Step 04

- Registo de transações pela interface (os detalhes já listam e filtram movimentos; `useLocalQuery`/`mutate` atualizam tudo automaticamente).
- Decisão OD-8 antes de faturas de cartão e de mudar D2-11.
- Categorias na interface (as transações referem-nas).

## 14. Preservação

Todos os E2E do Step 01 passam (um com espera de hidratação acrescentada); tokens, tipografia, cores, espaçamentos, raios, componentes base, itens e rotas de navegação e layout estrutural inalterados; `Button` sem alterações; o motor do Step 02 mantém todos os testes (alterada apenas a versão atual para 2.1.0).
