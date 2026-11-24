# CLAUDE.md — instruções para agentes neste repositório

@AGENTS.md

Lê também o [README](README.md) e, antes de mexer em interface, o [Design System](docs/design-system/README.md) e as [Regras obrigatórias](docs/design-system/regras.md).

## Regras que nunca se quebram

1. **Sem base de dados, ORM ou serviço de persistência remoto** (Supabase, PostgreSQL, MySQL, MongoDB, Firebase, SQLite, Prisma, Drizzle, Redis…). `npm run guard:deps` e o ESLint bloqueiam-nos. IndexedDB (API do navegador) e LocalStorage são o armazenamento local. Sem sincronização automática entre dispositivos.
2. **A app nunca escreve no GitHub** e nunca contém tokens, credenciais ou a frase-passe. Sem commits nem pushes automáticos.
3. **Nunca publicar dados financeiros em texto simples.** `data/` não é servido; `npm run guard:artifacts` verifica o build.
4. **Não inventar dados reais.** `data/` só tem exemplos fictícios marcados `EJEMPLO-FICTICIO`.
5. **Dinheiro em inteiros (centavos)**, sempre com moeda (`Money` em `src/domain/money.ts`; ARS e USD, nunca somadas entre si). Formatar só com `formatMoney`/`formatCurrencyAmount`/`<Money>`.
5b. **O IndexedDB não está cifrado** (OD-3 decidida: "recordar neste dispositivo", por implementar). Não o afirmar, não guardar chaves nem frase-passe junto dos dados, não inventar algoritmos de cifragem. Qualquer cifragem nova precisa de desenho revisto e aprovado ([data-security.md](docs/architecture/data-security.md)).
5c. **Escritas só pelos repositórios** (`src/services/repositories/`): validam, verificam referências e moedas e gravam registo + `outbox` numa transação. Apagar = tombstone.
6. **Datas financeiras são datas de calendário em Buenos Aires** (`src/lib/formatting/date.ts`), nunca a hora do dispositivo.
7. **Design System:** só tokens (o tema do Tailwind está fechado: não há `bg-green-600`, `shadow-lg`, `text-sm`). Tipografia com as utilidades `type-*`. Sem gradientes, glassmorphism, sombras em conteúdo, cards por defeito, ícones decorativos ou emojis. Fontes só por `next/font/local`.
8. **Não redesenhar ecrãs aprovados.** As referências visuais estão em `docs/design-system/components/*/preview.html` e no PDF.
9. **As secções 11–14 do brief original não foram recebidas.** Não presumir o conteúdo nem as marcar como verificadas.
10. **Não começar o step seguinte sem autorização.**

## Onde está cada coisa

| Preciso de… | Ficheiro |
| --- | --- |
| Configuração (moeda, locale, fuso, versões de dados) | `src/lib/config/app.ts` |
| Textos da interface (espanhol) | `src/lib/i18n/es.ts` |
| Áreas e rotas | `src/lib/config/navigation.ts` |
| Modelos de domínio (Zod, fonte de verdade) | `src/domain/schemas.ts` (reexportados em `src/lib/validation/schemas.ts`) |
| Dinheiro, moedas, regras (saldos, categorias, recorrências) | `src/domain/` |
| Repositórios e unidade de trabalho | `src/services/repositories/repositories.ts` |
| Importação, exportação, changesets | `src/services/exchange/exchange.ts` |
| Migrações de dados | `src/services/versioning/data-migrations.ts` |
| Validação em quatro camadas | `src/services/data/dataset.ts` |
| Decisões do Step 02 (D2-01…D2-11) | `docs/decisions/step-02-decisions.md` |
| Decisões do Step 03 (D3-01…D3-10) | `docs/decisions/step-03-decisions.md` |
| Ler/escrever dados a partir da interface | `src/hooks/use-local-data.ts` (`useLocalQuery`, `mutate`) — nunca abrir o IndexedDB num componente |
| Componentes de formulário, sheet, diálogo, badge | `src/components/ui/` (`<dialog>` nativo, sem dependências) |
| Contas e cartões | `src/features/accounts/`, `src/features/cards/`, `docs/features/` |
| IndexedDB | `src/services/storage/local-store.ts` |
| Preferências (LocalStorage) | `src/services/storage/preferences.ts` |
| Cifragem do pacote publicado | `src/services/crypto/bundle.ts` |
| Tokens (não editar o CSS à mão) | `docs/design-system/tokens.json` → `npm run tokens:build` |

## Antes de dar trabalho por terminado

```bash
npm run check          # guardas, lint, tipos, tokens, schemas, dados, migração, changeset, testes
npm run build && npm run guard:artifacts
npm run test:e2e
```

Atualiza a documentação em `docs/` quando a implementação mudar, e regista decisões novas em `docs/decisions/`.
