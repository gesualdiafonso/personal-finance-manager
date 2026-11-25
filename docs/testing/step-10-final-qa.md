# Step 10 — QA final e fecho (AUREON)

Executado em 2026-11-24, Node 22.23.5, npm, Playwright 1.65.1 (Chromium; desktop 1440×900, 1280×800, 1024×768, 768×1024 e iPhone 390×844), build de produção. Só dados fictícios.

Estados: **PASS** · **PARTIAL** · **FAIL** · **NOT VERIFIED** · **N/A** (não existe no projeto).

| Área | Estado | Notas |
| --- | --- | --- |
| Build de produção | PASS | `npm run build` sem erros; 20 rotas estáticas |
| Lint · TypeScript strict | PASS | `npm run check` |
| Testes unitários + integração | PASS | 392 testes, 37 ficheiros (inclui a adenda multimoeda) |
| E2E | PASS | 92 passados, 2 ignorados por desenho (testes só de um projeto); QA e branding repetidos 4× sem falhas |
| Cálculos financeiros | PASS | Verificação cruzada independente (abaixo) |
| Multimoeda e câmbio (adenda) | PASS | Conversão decimal exata, modos automático/manual/personalizado, configurações nomeadas, fotografia histórica, saldos e total estimado, Configuración → Moneda y cambio; [currency-exchange.md](../features/currency-exchange.md) |
| Fornecedor de cotações (DolarApi) | NOT VERIFIED | Testado só com `fetch` simulado (sucesso, falha, timeout, dados inválidos); o pedido real não foi executado. Opcional e desligado por omissão |
| Supabase / RLS / migrações SQL para moedas | N/A | Não existe base de dados remota; a configuração vive em IndexedDB e em `settings.json` |
| Transações, contas, orçamentos, metas, Panel | PASS | Fluxos E2E e de integração dos Steps 03–07 |
| Contas domésticas | PARTIAL | Só a fase 1 do Step 05 (sem pagamentos nem recorrências) |
| Relatórios (Informes) | N/A | Área ainda em placeholder: não há relatórios a validar; filtros e gráficos validados no Panel e em Transacciones |
| Supabase · base de dados remota · RLS | N/A | O projeto não tem Supabase nem servidor de dados (ADR-001); `guard:deps` recusa essas dependências |
| Autenticação (login, logout, sessões, rotas protegidas) | N/A | Não há contas de utilizador: aplicação single-user local; o "perfil" é o perfil local do dispositivo |
| Segurança | PASS | Sem segredos, auditoria de dependências limpa (abaixo) |
| Armazenamento local cifrado | NOT VERIFIED | OD-3 decidida mas não implementada: o IndexedDB **não** está cifrado |
| PWA | PARTIAL | Manifest, ícones, SW, offline e cabeçalhos verificados em Chromium; Safari/iOS e instalação real não verificados |
| Marca AUREON e temas | PASS | Logótipos, ícones, tokens e as dez rotas nos dois temas |
| Responsivo e acessibilidade básica | PASS | Sem overflow em cinco larguras; nomes acessíveis, um `h1`, `lang`, foco visível |
| Deploy na Vercel | NOT VERIFIED | Preparado e documentado ([VERCEL.md](../deployment/VERCEL.md)); nenhum deploy real foi feito |

## Defeitos encontrados e corrigidos

1. **Hidratação no tema escuro (React #418), intermitente.** O tema era distribuído por contexto; quando o contexto mudava para "escuro" antes de uma fronteira Suspense hidratar (sidebar, cabeçalho móvel, Configuración), o botão de tema e as opções de aparência renderizavam marcação diferente do HTML do servidor. Correção: cada consumidor lê o tema com `useSyncExternalStore` (`useTheme`), que usa o valor do servidor durante a sua própria hidratação. O teste `release-qa.spec.ts` falhava em 2 de 4 execuções; depois da correção, 16 execuções sem erros.
2. **Dependências sem uso:** `react-hook-form` e `@hookform/resolvers` (zero imports) removidas; `package-lock.json` atualizado só nessas entradas.
3. **Documentação desatualizada:** README, `.env.example`, `docs/architecture/pwa.md` e `overview.md` ainda falavam de PFM, Instrument e ícones provisórios; atualizados. Novo guia [docs/deployment/VERCEL.md](../deployment/VERCEL.md).

4. **Adenda multimoeda:** a mensagem "Configuración de moneda guardada" não aparecia (a página de Configuración não tinha `FeedbackProvider`); corrigido. Um teste de integração (`transactions-edit`) falhou uma vez sob carga numa execução de `npm run check` e passou nas sete execuções seguintes — registado como intermitente, não reproduzido.

## Auditoria

- **Imports e código morto:** nenhum ficheiro de `src/` sem referência; `tsc` e ESLint sem erros.
- **Segredos:** nenhum padrão de chave, token ou credencial no repositório nem no bundle do cliente (`.next/static`); a única variável de ambiente lida é `NODE_ENV`. `.env*` ignorado, exceto `.env.example`.
- **Registos e armazenamento:** nenhum `console.*` em `src/`; LocalStorage só com preferências validadas por Zod (tema, granularidade do Panel, última área); dados financeiros só no IndexedDB.
- **Dependências:** `npm audit` → 0 vulnerabilidades (produção e desenvolvimento). Nenhuma versão alterada.
- **Cabeçalhos:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `/sw.js` com `no-cache` e CSP.
- **Service worker e dados sensíveis:** o HTML guardado em cache nunca contém dados financeiros (lidos no cliente do IndexedDB); `/data/*` nunca é guardado; não há páginas autenticadas.
- **CORS:** N/A (sem API).

## Verificação cruzada dos cálculos (`tests/unit/financial-crosscheck.test.ts`)

Um gerador determinístico cria 600 transações fictícias por semente (3 sementes): ARS e USD, receitas, despesas, transferências, pendentes, canceladas, eliminadas, compras com cartão de crédito e de débito, datas em fins de mês e em 29/02/2028. Uma implementação independente (ciclos simples em centavos inteiros) recalcula e compara com as funções da app:

- receitas, despesas e resultado por moeda em fevereiro bissexto, num só dia, num mês e num ano (`periodFlow`, `summarizeTransactions`);
- saldo de cada conta em cada data-limite (`deriveAccountBalance`), incluindo saldo inicial negativo; as transferências não mudam o total da moeda;
- soma das barras diárias do gráfico = totais do período; saldo do último dia (`flowSeries`);
- consumo do orçamento com subcategoria, pendentes à parte, restante e percentagem (`budgetUsage`);
- progresso de uma meta com 200 aportes, 20 % cancelados (`goalProgress`);
- formatação de zero, negativos, centavos e valores grandes; `0,10 + 0,20` exato; três decimais recusados;
- datas de Buenos Aires às 23:59 e 00:00 com o dispositivo em Asia/Tokyo.

Todas as comparações coincidem.

## QA de interface (`tests/e2e/release-qa.spec.ts`, `branding.spec.ts`)

- As dez rotas respondem 200, nos temas claro e escuro, sem erros na consola.
- Cada uma tem `lang`, um único `h1`, nenhum controlo sem nome acessível e nenhum overflow horizontal a 1440, 1280, 1024, 768 e 390 px.
- O teclado chega primeiro a "Ir al contenido", com anel de foco visível.
- Manifest (AUREON, cores), ícones PNG e SVG, `apple-touch-icon` e favicon SVG no HTML; `sw.js` com `no-cache`.
- O tema segue o sistema na primeira visita, a escolha persiste e é aplicada antes da hidratação (sem *flash*); os nove SVG do logótipo são servidos.

## Pendente (não bloqueia o lançamento técnico, mas limita o uso real)

- **Cifragem local (OD-3)** por implementar: usar só dados fictícios.
- Step 05 incompleto (pagamentos de contas domésticas, recorrências), faturas de cartão (OD-8), Informes.
- PWA não verificada em Safari/iOS nem com instalação real; sem aviso "Nueva versión" (o worker novo ativa ao fechar as abas).
- Deploy real na Vercel por fazer (manual).
- Decisões em aberto: ADR-005, OD-1, OD-2, OD-4, OD-7 e secções 11–14 do brief original.
