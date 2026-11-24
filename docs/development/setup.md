# Instalação e desenvolvimento

## Requisitos

- Node.js **22.12 ou superior** (`.nvmrc`: 22). A CI usa Node 22.
- npm 10 ou superior. Para **instalar** dependências novas, usa o npm 11 (`npx npm@11 install -D <pacote>`): o npm 10.9 incluído no Node 22 falha com o conjunto de dependências opcionais do Vitest 5 (`Cannot read properties of null (reading 'edgesOut')`). Para `npm ci` a partir do lockfile, o npm 10 funciona.

## Primeira vez

```bash
npm ci
npm run dev                # http://localhost:3000
```

Em desenvolvimento o service worker não é registado, para não servir código antigo da cache. Para testar a PWA, usa `npm run build && npm start`.

## Fluxo diário

| Mudei… | Corre |
| --- | --- |
| `docs/design-system/tokens.json` | `npm run tokens:build` (regenera `src/styles/tokens.css`; nunca editar o CSS à mão) |
| `src/lib/validation/schemas.ts` | `npm run schemas:build` e `npm run data:validate` |
| Algo em `data/` | `npm run data:validate` (e atualizar as somas de controlo em `meta.json`) |
| Os ícones | `npm run icons:build` |
| Qualquer coisa | `npm run check` antes de fazer commit |

## Convenções

- **Textos da interface:** só em `src/lib/i18n/es.ts`.
- **Cores, espaços, raios, sombras, tipografia:** só tokens. O tema do Tailwind está fechado: utilitários como `bg-green-600`, `shadow-lg` ou `text-sm` não existem. A tipografia usa `type-<estilo>` (`type-body`, `type-label`, `type-amount`…).
- **Dinheiro:** `MinorUnits` e `<Money>` / `formatMoney`. **Datas:** `LocalDate` e `src/lib/formatting/date.ts`.
- **shadcn/ui:** `components.json` está configurado. Cada componente adicionado com o CLI tem de ser reescrito com os tokens antes de ser usado (regra O-14 do Design System).
- **Sem novas dependências de persistência:** `npm run guard:deps` e o ESLint bloqueiam bases de dados e ORMs.

## Estrutura

Ver [docs/architecture/overview.md](../architecture/overview.md).
