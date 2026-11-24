# Arquitetura — visão geral

O PFM é uma aplicação Next.js (App Router) **sem servidor de dados**. Todas as páginas são pré-renderizadas como estáticas. Os dados financeiros nunca passam pelo servidor: vivem no IndexedDB do dispositivo e chegam lá a partir de ficheiros JSON oficiais (no futuro, de uma publicação cifrada).

```text
           repositório privado                         dispositivo (navegador)
  data/*.json ──validação (CI)──► [publicação cifrada]  ──► IndexedDB (stores oficiais)
       ▲                           (não implementada:        outbox (alterações locais)
       │                            OD-1, OD-7)                    │
       └──── git commit / push ◄── exportação ◄────────────────────┘ (Step 02+)
```

## Camadas

| Camada | Pasta | Responsabilidade |
| --- | --- | --- |
| Rotas | `src/app/` | As nove áreas, `offline`, `manifest`, páginas de erro. Só composição. |
| Funcionalidades | `src/features/` | Só existem as do Step 01: `dashboard/` (estado vazio) e `settings/` (aparência, dados locais). |
| Componentes | `src/components/` | `ui/` (base shadcn/ui personalizada), `layout/` (AppShell, sidebar, rail, tab bar, cabeçalho), `shared/` (tema, `<Money>`, datas, registo do service worker). |
| Biblioteca | `src/lib/` | `config/`, `formatting/` (ARS, datas), `validation/` (Zod, compatibilidade), `errors/`, `i18n/`, `utils/`, `fonts.ts`. |
| Serviços | `src/services/` | `data/` (conjunto de dados oficial, validação, fontes), `storage/` (IndexedDB, LocalStorage), `crypto/` (pacote cifrado). |
| Estilos | `src/styles/` | `tokens.css` gerado e as fontes WOFF2 com licença. |

Regra de dependência: `app → features → components → lib/services → types`. Os serviços não importam componentes. O `lib/` não depende de `services/`, exceto `i18n`, que importa o tipo `AppErrorCode`.

## Diferenças em relação à estrutura sugerida no Step 01

| Sugerido | Implementado | Porquê |
| --- | --- | --- |
| `public/fonts/` | `src/styles/fonts/` | O `next/font/local` processa as fontes no build e serve-as em `/_next/static/media/` com hash. Uma cópia em `public/` seria servida em duplicado e sem cache imutável. |
| `public/manifest.json` | `src/app/manifest.ts` → `/manifest.webmanifest` | Convenção de metadados do Next.js: tipada, validada no build e com a extensão correta. |
| `schemas/account.schema.json`, `transaction.schema.json`… | `schemas/<ficheiro>.schema.json` (8 ficheiros) | Um schema por **ficheiro** de dados (envelope + registos), gerado a partir do Zod, que é a fonte de verdade. |
| `features/transactions`, `accounts`, `budgets` | Não criadas | O Step 01 exclui essas funcionalidades e pede que não se criem módulos vazios. |
| `src/hooks/` | Não criada | Os únicos hooks (`useTheme`, `useToday`, `useLocalStoreStatus`) vivem junto do componente que os usa. |
| — | `src/lib/errors/`, `src/lib/i18n/` | Base de erros (Tarefa 03) e um único dicionário de textos, para o idioma poder ser revisto (ADR-005). |
| — | `docs/design-system/` | Cópia do Design System aprovado, para ser a fonte dos tokens e das referências visuais dentro do repositório. |

## Configuração relevante do Next.js 16.4

- `cacheComponents` e `partialPrefetching` ficam ativos (valores por omissão do `create-next-app` 16.4). Como nenhuma página lê dados no servidor, todas as rotas são estáticas.
- "Hoje" é calculado só no cliente (`useToday`), no fuso de Buenos Aires, porque uma página pré-renderizada no build não pode conter a data atual.
- O tema é aplicado por um script inline no `<head>` antes da primeira pintura (guia "Preventing flash before hydration" do Next.js).
- Cabeçalhos de segurança e de `/sw.js` em `next.config.ts`.

## Documentos relacionados

- [Dados JSON](json-data-architecture.md) · [Modelos de domínio](domain-models.md) · [Repositórios](data-repositories.md) · [Persistência local](local-persistence.md) · [Importação/exportação](data-import-export.md) · [Versionamento](data-versioning.md) · [Segurança dos dados](data-security.md) · [Gestão de contas](account-management.md) · [Gestão de cartões](card-management.md) · [Cifragem](crypto.md) · [PWA](pwa.md)
- [Decisões](../decisions/) · [Design System](../design-system/README.md)
