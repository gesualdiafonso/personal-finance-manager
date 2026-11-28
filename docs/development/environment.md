# Configuração de ambiente

> **Step 12:** a referência atual das variáveis (incluindo Supabase) está em [../ENVIRONMENT.md](../ENVIRONMENT.md) e a configuração do painel em [../SUPABASE_SETUP.md](../SUPABASE_SETUP.md).

**O Step 01 não precisa de nenhuma variável de ambiente.** A app não tem backend, base de dados nem API remota. `.env.example` documenta as variáveis opcionais.

| Variável | Onde | Para quê |
| --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED=1` | CI, local (opcional) | Desliga a telemetria anónima do Next.js |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Local (opcional) | Usa um Chrome existente nos testes E2E |
| `E2E_PORT` | Local (opcional) | Porta do servidor de produção nos E2E (por omissão 3200) |
| `GITHUB_SHA` | CI (automática) | Versão da cache do service worker |

## Regras

- **Nada secreto numa variável `NEXT_PUBLIC_*`**: tudo o que tem esse prefixo vai no JavaScript enviado a todos os visitantes.
- **A frase-passe dos dados nunca é uma variável de ambiente da app.** É introduzida pelo utilizador no navegador. Se a CI vier a precisar dela para cifrar (OD-1), será um segredo do GitHub Actions usado só no passo de cifragem, nunca exposto ao build.
- **Ficheiros `.env*` não são commitados**, exceto `.env.example`.

## Configuração da aplicação

Os valores de produto ficam no código e não em variáveis de ambiente, porque não mudam por ambiente (`src/lib/config/app.ts`):

| Chave | Valor |
| --- | --- |
| `currency` | `ARS` (2 casas decimais, valores em centavos) |
| `locale` | `es-AR` |
| `timeZone` | `America/Argentina/Buenos_Aires` |
| `userModel` | `single-user` |
| `DATA_COMPATIBILITY` | escreve `1.0.0`, lê `1.x` |

## Vercel

`vercel.json` fixa `npm ci` e `npm run build`. A forma de publicar (CLI chamada pelo GitHub Actions ou integração Git do Vercel) é a decisão em aberto OD-7. Até ela ser tomada, não há nenhum projeto Vercel configurado nem deploy automático. Seja qual for a opção, nenhum dado sai de `data/`: só a app é publicada.
