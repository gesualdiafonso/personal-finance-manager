# Decisões do Step 09 — PWA & Production Readiness

Tomadas durante a implementação autónoma (2026-11-24). Para rever pelo responsável.

| ID | Decisão |
| --- | --- |
| D9-01 | **Supabase não aplicável.** O brief pede para preservar/rever Supabase, sessões, RLS e `service_role`; o projeto proíbe-o (CLAUDE.md regra 1, ADR-001, `guard:deps`) e não o tem. Nada foi acrescentado; documentado em `docs/PRODUCTION.md`. |
| D9-02 | **Escritas offline continuam permitidas.** Em local-first não há servidor a confirmar nem estado remoto a divergir: a gravação é a transação local de sempre, validada pelos repositórios. O aviso de ligação nunca fala em sincronização. |
| D9-03 | O service worker pré-carrega as nove áreas (todas são shells estáticos sem dados), não só `/`. |
| D9-04 | Atualizações: o worker novo espera; "Hay una nueva versión · Actualizar" aplica-a só a pedido (`SKIP_WAITING` → uma recarga). |
| D9-05 | Instalação contextual em Configuración; `beforeinstallprompt` capturado no arranque com `preventDefault` (sem mini-infobar); secção escondida quando já instalada; instruções no iOS; frase para navegadores sem suporte. |
| D9-06 | Favicon 32 px + `favicon.ico` (PNG em ICO) gerados pelo mesmo script e no mesmo estilo; os ícones aprovados não mudaram. |
| D9-07 | CSP e HSTS só em produção; `connect-src 'self'`; `'unsafe-inline'` nos scripts por causa das páginas estáticas (nonces obrigariam a renderização dinâmica). |
| D9-08 | Compatibilidade: projetos Playwright opcionais Firefox, Safari desktop e Safari iPhone (`E2E_ALL_BROWSERS=1`). Os 2 E2E offline são saltados no Firefox por limitação da ferramenta. |
