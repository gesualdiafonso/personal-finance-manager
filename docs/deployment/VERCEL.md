# Deploy do AUREON na Vercel

O AUREON é um projeto **Next.js 16 (App Router) só com páginas estáticas**: não tem backend, base de dados, autenticação nem variáveis de ambiente obrigatórias. Os dados financeiros vivem no IndexedDB de cada navegador e nunca passam pelo servidor. A Vercel só serve HTML, JS, CSS, fontes, ícones e o service worker.

> **Supabase, login e RLS não se aplicam.** O projeto não tem Supabase nem contas de utilizador (decisões ADR-001/ADR-002; a CI recusa dependências de base de dados). Por isso **não há Site URL nem Redirect URLs a configurar**. Se um dia se acrescentar autenticação, será um step próprio, com a sua revisão de segurança.

## Configuração já incluída

| Item | Valor | Onde |
| --- | --- | --- |
| Framework | Next.js (deteção automática) | `vercel.json` → `"framework": "nextjs"` |
| Root directory | raiz do repositório (`./`) | — |
| Install command | `npm ci` | `vercel.json` |
| Build command | `npm run build` (o `prebuild` gera `public/sw.js`) | `vercel.json`, `package.json` |
| Output | `.next` (gerido pela Vercel; não alterar) | — |
| Node.js | 22.x (`engines`: `^22.22.2 \|\| ^24.15.0`; `.nvmrc` = 22) | Project Settings → Node.js Version: **22.x** |
| Cabeçalhos | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; `/sw.js` com `Cache-Control: no-cache` e CSP própria | `next.config.ts` |

Não é preciso `vercel.json` adicional, rewrites nem `output: "export"`.

## Variáveis de ambiente

Nenhuma obrigatória. Opcional:

| Variável | Ambientes | Valor | Porquê |
| --- | --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED` | Production, Preview | `1` | Desliga a telemetria anónima do Next.js no build |

**Nunca** criar variáveis `NEXT_PUBLIC_*` com segredos: tudo o que começa por `NEXT_PUBLIC_` vai para o JavaScript enviado a todos os visitantes. A frase-passe dos dados (cifragem) é escrita pelo utilizador no navegador e nunca é uma variável de ambiente.

## Procedimento

1. **Repositório no GitHub.** Extrair `AUREON-FINAL-RELEASE.zip`, criar um repositório (privado recomendado), `git init`, `git add .`, `git commit`, `git push`. Confirmar que `.env*` (exceto `.env.example`), `node_modules`, `.next` e `delivery/` não foram enviados (o `.gitignore` já os exclui).
2. **Importar na Vercel.** *Add New… → Project → Import Git Repository*, escolher o repositório. A Vercel deteta Next.js e lê `vercel.json`. Deixar *Root Directory* na raiz.
3. **Node.js 22.x** em *Settings → Build and Deployment → Node.js Version*.
4. **Variáveis**: opcionalmente `NEXT_TELEMETRY_DISABLED=1`.
5. **Deploy.** Cada push para o ramo de produção (por defeito `main`) gera um deploy de produção; cada pull request, um *Preview*.
6. **Domínio** (opcional): *Settings → Domains → Add*, criar os registos DNS indicados (CNAME `cname.vercel-dns.com` para subdomínios ou A/ALIAS para o domínio raiz). A Vercel emite o certificado HTTPS automaticamente — necessário para o service worker e para a instalação da PWA.

## Validação depois do deploy

No URL de produção (HTTPS):

- [ ] `/` abre o Panel vazio ("Agrega la primera cuenta para empezar.") com o logótipo AUREON; as nove áreas abrem pela navegação.
- [ ] `/manifest.webmanifest` responde com `short_name: "AUREON"`; `/icon.svg`, `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png` e `/icons/apple-touch-icon.png` respondem 200.
- [ ] `/sw.js` responde com `Cache-Control: no-cache, no-store, must-revalidate`; em DevTools → Application → Service Workers o worker fica *activated*; a cache `pfm-shell-…` contém `/` e `/offline`.
- [ ] Chrome/Edge mostram "Instalar app"; no Safari iOS, *Partilhar → Adicionar ao ecrã principal* usa o ícone AUREON.
- [ ] Modo offline (DevTools → Network → Offline): recarregar `/` mostra a app guardada; uma página nunca visitada mostra `/offline`.
- [ ] Tema: o interruptor muda claro/escuro e a escolha mantém-se ao recarregar; numa primeira visita segue o sistema.
- [ ] Criar uma conta e uma transação **fictícias** num navegador de teste; confirmar que aparecem no Panel e que, noutro navegador, não aparecem (os dados são locais).
- [ ] Cabeçalhos de `/` incluem `X-Frame-Options: DENY` e `X-Content-Type-Options: nosniff`.

## Atualizações

Cada build gera um `sw.js` com nova versão; as páginas são pedidas à rede primeiro, por isso utilizadores online recebem logo a versão nova, e as caches antigas são apagadas quando o worker novo ativa (depois de fechar as abas antigas). Os dados no IndexedDB não são afetados por deploys.

## Limitações conhecidas

- O armazenamento local **não está cifrado** (OD-3 por implementar): em produção, usar só dados fictícios até a cifragem estar implementada e revista.
- Não há sincronização entre dispositivos (por desenho): cada navegador tem os seus dados.
