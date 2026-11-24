# CLAUDE.md — instruções para agentes neste repositório

@AGENTS.md

Lê também o [README](README.md) e, antes de mexer em interface, o [Design System](docs/design-system/README.md) e as [Regras obrigatórias](docs/design-system/regras.md).

## Regras que nunca se quebram

1. **Sem base de dados, ORM ou serviço de persistência remoto** (Supabase, PostgreSQL, MySQL, MongoDB, Firebase, SQLite, Prisma, Drizzle…). `npm run guard:deps` e o ESLint bloqueiam-nos. IndexedDB (API do navegador) e LocalStorage são o armazenamento local.
2. **A app nunca escreve no GitHub** e nunca contém tokens, credenciais ou a frase-passe. Sem commits nem pushes automáticos.
3. **Nunca publicar dados financeiros em texto simples.** `data/` não é servido; `npm run guard:artifacts` verifica o build.
4. **Não inventar dados reais.** `data/` só tem exemplos fictícios marcados `EJEMPLO-FICTICIO`.
5. **Dinheiro em inteiros (centavos)** com `MinorUnits` (`src/types/money.ts`). Formatar só com `formatMoney`/`<Money>`.
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
| Schemas Zod (fonte de verdade dos dados) | `src/lib/validation/schemas.ts` |
| Validação em quatro camadas | `src/services/data/dataset.ts` |
| IndexedDB | `src/services/storage/local-store.ts` |
| Preferências (LocalStorage) | `src/services/storage/preferences.ts` |
| Cifragem do pacote publicado | `src/services/crypto/bundle.ts` |
| Tokens (não editar o CSS à mão) | `docs/design-system/tokens.json` → `npm run tokens:build` |

## Antes de dar trabalho por terminado

```bash
npm run check          # guardas, lint, tipos, tokens, schemas, dados, testes
npm run build && npm run guard:artifacts
npm run test:e2e
```

Atualiza a documentação em `docs/` quando a implementação mudar, e regista decisões novas em `docs/decisions/`.
