# Decisões em aberto e pontos não verificados

Nada nesta lista foi decidido por omissão. Cada item tem de ser fechado antes de o código correspondente ser implementado. As decisões aprovadas no Step 02 (D2-01 a D2-11) estão em [step-02-decisions.md](step-02-decisions.md) e **não** fecham nenhum destes itens.

## Brief original — secções 11–14: NÃO VERIFICADAS

O brief original do Step 00 tem, segundo o responsável do produto, as secções 11 a 14 (funcionalidades futuras, Definition of Done e decisões técnicas finais). **O documento completo não foi recebido**: o único exemplar disponível termina na secção 10. O conteúdo dessas secções **não foi presumido, reconstruído nem marcado como verificado**. Quando o documento chegar, tem de ser verificado contra este repositório, sobretudo contra a OD-8 e os campos provisórios dos schemas.

## Decisões técnicas (do documento "PFM - Arquitetura de Dados")

| ID | Pergunta | Opções | Recomendação registada | Bloqueia |
| --- | --- | --- | --- | --- |
| OD-1 | Onde é que a CI obtém a frase-passe para cifrar? | Segredo do GitHub Actions · cifragem no computador antes do push | Segredo do Actions (é a única que permite "validar antes de cifrar") | Publicação na CI |
| OD-2 | O repositório guarda os JSON em texto simples ou cifrados? | Texto simples · cifrados | Texto simples (diffs legíveis, recuperação se a frase-passe se perder) | Dados reais no repositório |
| OD-3 | O IndexedDB guarda os dados cifrados em repouso? | Desbloqueio por sessão · "recordar neste dispositivo" · em claro | **Decidida em 2026-11-24: "recordar neste dispositivo"** (opção 2 do desenho B em [data-security.md](../architecture/data-security.md)). Não protege contra quem usa o computador desbloqueado. Por implementar | Implementação da cifragem do IndexedDB |
| OD-4 | Onde se aplicam os conjuntos de alterações exportados? | Script local antes do commit · CI com commit automático | Script local (os conflitos precisam de uma pessoa). Step 02 (D2-08): integração manual, verificada por `npm run data:changeset` | Automatizar a integração |
| OD-5 | As exportações vão cifradas? | Sim · não | **Decidida em 2026-11-24: sim**, conforme o desenho A aprovado em [data-security.md](../architecture/data-security.md). Por implementar; até lá vale D2-07 (JSON simples, sem interface de descarga) | Implementação da exportação cifrada |
| OD-6 | Derivação de chave | PBKDF2 nativo · Argon2id (WASM) | PBKDF2 (implementado) | — |
| OD-7 | Como se publica no Vercel? | CLI pelo Actions · integração Git do Vercel | CLI pelo Actions | Deploy |
| OD-8 | Como afetam as compras no cartão os saldos e as faturas? | A definir | Esperar pelas secções 11–14 do brief. Regra provisória D2-11: não mexem no saldo da conta, aparecem como "comprometido em cartões" | Cartões, saldos, faturas de cartão |

## Produto

| ID | Pergunta | Estado |
| --- | --- | --- |
| ADR-005 | Espanhol como idioma inicial, terminologia e rotas em espanhol | Implementado conforme o Step 01; por aprovar |
| Ícones | Ícone definitivo da PWA (hoje: a palavra PFM provisória) | Por desenhar (fora do âmbito do Step 01) |

## Propostas de segurança ainda não aplicadas

| ID | Proposta | Estado no Step 01 |
| --- | --- | --- |
| SEC-05 | CSP restrita em toda a app | Só em `/sw.js`. A CSP global exige um hash ou nonce para o script inline do tema; fica para quando houver deploy. |
| SEC-06 | Actions fixadas por SHA | Usa `@v4`; fixar quando o repositório existir |
| SEC-07 | Só a revisão atual do pacote no alojamento | Depende da publicação (OD-7) |
| SEC-08 | 2FA na conta GitHub; repositório sem colaboradores | Configuração da conta, fora do código |
