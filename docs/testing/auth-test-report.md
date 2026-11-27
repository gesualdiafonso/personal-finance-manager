# Autenticação local e perfil global — relatório de testes

Executado em 2026-11-27, Node 22, Playwright 1.65 (Chromium; desktop 1440×900 e iPhone 390×844), build de produção. Só dados fictícios (EJEMPLO-FICTICIO).

Estados: **PASS** · **PARTIAL** · **NOT VERIFIED** · **N/A**.

| Requisito | Estado | Evidência |
| --- | --- | --- |
| Registo | PASS | `auth-service.test.ts`, `auth-ui.test.tsx`, `auth.spec.ts` |
| Username duplicado recusado | PASS | `USERNAME_TAKEN` (sem distinção de maiúsculas); segunda conta → `ACCOUNT_EXISTS` |
| Login válido / inválido | PASS | Mesma mensagem e mesmo custo para utilizador desconhecido; espera exponencial após 5 falhas |
| Hashing e verificação | PASS | PBKDF2-SHA-256, 600 000 iterações, sal único, comparação em tempo constante; verificador enfraquecido recusado |
| Logout | PASS | Registo da sessão apagado; outros separadores avisados |
| Persistência e expiração de sessão | PASS | Recordada 30 dias; de separador: `sessionStorage`, 30 min de inatividade, 12 h |
| Rotas protegidas | PASS | Nada renderiza antes da sessão; `next` só aceita caminhos internos |
| Atualização do perfil | PASS | Perfil + `FinancialSettings` numa só transação |
| Propagação global do perfil | PASS | Menu, Panel, Cuentas, Configuración, Informes, datas numéricas, moeda |
| Preservação dos dados financeiros existentes | PASS | Registos intactos no registo; atualização real v3 → v4 sem tocar em registos |
| Exportação sem segredos | PASS | Sem verificador, sal, hash, sessão, username nem email (nível de serviço: a app não tem botão de exportar, D2-07) |
| PWA | PARTIAL | `/entrar` e `/registro` em precache e abertos offline em Chromium; Safari/iOS não verificados |
| Cifragem dos dados locais | NOT VERIFIED | Não implementada (OD-3): a palavra-passe protege a interface, não o IndexedDB |
| Recuperação de palavra-passe | N/A | Não existe (D-AUTH-09, decisão em aberto OD-AUTH-1) |
| Módulo de dívidas | N/A | Não existe nesta aplicação |
| Supabase, RLS, fornecedor de identidade | N/A | Proibidos pelo brief e ausentes |
