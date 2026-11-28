# Step 12 — Fundações Supabase: relatório de testes

Executado em 2026-11-28 · Node 22.23 · Next.js 16.4.6 · `@supabase/supabase-js` 2.119.2 · `@supabase/ssr` 0.12.7. Sem projeto Supabase real: valores fictícios e rede simulada nos testes unitários e de integração. Os resultados que o código reporta são reais (sem sucessos simulados).

| Verificação | Resultado |
| --- | --- |
| `npm run check` (guardas, lint, TypeScript, tokens, esquemas, dados, testes) | PASS — **443 testes, 42 ficheiros** (25 novos) |
| `npm run build` sem Supabase | PASS — páginas continuam estáticas; `/api/health/supabase` dinâmica; proxy registado |
| `npm run build` com valores fictícios | PASS — CSP `connect-src` inclui só esse projeto (https + wss) e a DolarApi |
| Build com chave privilegiada numa variável pública | **Recusado**, como pretendido; a mensagem nomeia a variável, sem o valor |
| `npm run guard:artifacts` | PASS — 591 ficheiros, sem dados nem chaves privilegiadas |
| `npm audit` | PASS — 0 vulnerabilidades |
| E2E (build de produção, desktop + iPhone) | PASS — **103 passados**, 2 ignorados por desenho (inclui o novo teste de CSP/health/Configuración) |
| Health route num servidor de produção com projeto inexistente | `503` `{"status":"unreachable","reason":"network"}`, `Cache-Control: no-store` — resposta honesta |

## Cobertura pedida

| Pedido | Testes |
| --- | --- |
| Inicialização do cliente do browser | `supabase-browser.test.tsx` (singleton, `null` sem configuração, sem pedidos de rede) |
| Inicialização do cliente do servidor | `supabase-foundation.test.ts` (cookies via `next/headers` simulado, `null` sem configuração) |
| Validação do ambiente / variáveis em falta / configuração inválida | `supabase-config.test.ts` (estados, URL inválido/inseguro/com caminho/com credenciais, chave inválida, meia configuração) |
| Health check | `supabase-foundation.test.ts` (não configurado, inválido, rede, timeout, HTTP 401, sucesso, só `/auth/v1/health`, sem a chave no resultado, rota com `no-store`) |
| Prevenção de exposição de segredos | Recusa de `sb_secret_`/`service_role` em variáveis públicas, guarda de build, guarda de artefactos (passa com a chave publicável, falha com secreta/`service_role` sem a imprimir) |
| Compatibilidade com a autenticação existente | Registo → logout → login local com Supabase configurado, sem pedidos de rede; verificador PBKDF2 e sessões intactos; proxy deixa `/`, `/entrar`, `/registro`… passar sem redirecionar; todos os testes de auth anteriores e E2E verdes |

## Alterações de teste não ligadas a funcionalidades

- `tests/setup.ts`: a parte que depende de `window` só corre em ambiente jsdom, para que os testes de código de servidor (`@vitest-environment node`) possam usar o mesmo setup. Nenhum teste existente mudou de comportamento.
