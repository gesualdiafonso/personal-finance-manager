# Multimoeda e câmbio (Step 10 — adenda)

Estado: **implementado e validado** (schemaVersion 2.4.0). Decisões D-FX-01…D-FX-10 em [step-10-currency-decisions.md](../decisions/step-10-currency-decisions.md).

## O que existe

| Peça | Onde |
| --- | --- |
| Moedas suportadas (ISO 4217, casas decimais próprias) | `src/domain/currency.ts` — ARS, USD, EUR, BRL, UYU, GBP (2 casas); CLP, PYG (0 casas) |
| Serviço de conversão (decimal exato, BigInt) | `src/domain/fx.ts` — `convertMinor`, `invertRate`, `resolveRate`, `consolidate`, `parseRateInput`, `formatRate` |
| Conversão guardada na transação | `Transaction.conversion` (opcional) — `conversionSnapshotSchema` |
| Configuração | `FinancialSettings.exchange` (opcional) — `exchangeSettingsSchema` |
| Planeamento no formulário | `src/features/exchange/conversion.ts` — `planConversion` |
| Fornecedor automático opcional | `src/services/fx/dolarapi.ts` |
| Interface | Configuración → **Moneda y cambio** (`currency-settings.tsx`, `converter.tsx`); painel no formulário de transação (`conversion-panel.tsx`); `≈` em Cuentas e total estimado em Cuentas e no Panel (`estimates.tsx`) |

## Regras

- **Fórmula:** `convertido = original × taxa`, em que a taxa é *unidades da moeda de destino por 1 unidade da de origem*. USD 100 × 1.450 = ARS 145.000.
- **Precisão:** a taxa é uma string decimal (até 12 dígitos inteiros e 10 decimais); nunca passa por `number`. A conversão faz-se em BigInt e arredonda **uma vez**, meio para longe de zero, à unidade menor do destino (centavos; pesos inteiros em CLP).
- **Nada inventado:** as configurações começam **sem cotações**. Sem taxa, o resultado é "sem cotização" — o movimento grava-se sem equivalente e os totais listam a moeda à parte.
- **Original intocável:** `amount` e `currency` da transação são sempre os originais. O equivalente fica ao lado, marcado como estimativa (`≈`, "Estimado").
- **Histórico:** a conversão é uma fotografia (`from`, `to`, `amount`, `converted`, `rate`, `mode`, `rateSetId`, `source`, `rateAt`, `overridden`). Mudar taxas **nunca** a recalcula; editar um movimento mantém a taxa guardada (só o montante pode ser corrigido, com a mesma taxa). O repositório recusa removê-la em silêncio e recusa uma fotografia incoerente (`converted ≠ amount × rate`, moeda ou montante diferentes da transação).
- **Modos:** *Automático* (cotações do fornecedor, com recurso às manuais quando falta alguma — assinalado), *Manual* (só as introduzidas), *Personalizada* (taxa escrita no próprio movimento ou no conversor = override).
- **Configurações de taxa nomeadas:** "Oficial" e "MEP" por omissão, e outras criadas pelo utilizador (Blue, Tarjeta, Personalizada…). Cada uma tem uma moeda base e cotações "1 X = n base". Taxas cruzadas (EUR→USD) e inversas (ARS→USD) calculam-se a partir delas.
- **Totais consolidados:** cada moeda soma-se primeiro na sua unidade e converte-se uma vez; o total é sempre rotulado "Total estimado en ARS", com as taxas usadas, o modo e a data.
- **Transferências entre moedas** continuam recusadas (D4-06): fora do âmbito.

## Fornecedor automático (opcional)

DolarApi.com (API pública, MIT; cotações de fontes públicas argentinas). Só é chamado se o utilizador **ativar** "Permitir consultar el proveedor" **e** carregar em "Actualizar cotizaciones". Apenas GET, sem dados do utilizador. Valor "venta"; endpoints `/v1/dolares/{oficial,bolsa,blue,tarjeta}` para USD e `/v1/cotizaciones/{eur,brl,clp,uyu}` só na configuração Oficial; só com base ARS. Resposta validada com Zod; timeout de 8 s; qualquer falha deixa tudo como estava. O service worker ignora pedidos de outra origem. A aplicação funciona sem ele.

**Não verificado:** o pedido real ao DolarApi (o ambiente de testes não tem rede para esse domínio e os testes usam `fetch` simulado). A correspondência MEP = `/dolares/bolsa` segue a nomenclatura do DolarApi, não uma documentação explícita.

## Persistência

Tudo local, em IndexedDB (`settings`, chave `financial`), validado antes de gravar. A configuração entra nas exportações completas (`settings.exchange`) e em `data/settings.json` quando publicada. Uma publicação anterior a 2.4.0 (sem `exchange`) **não apaga** a configuração do dispositivo. Não há Supabase, RLS nem migrações SQL — N/A neste projeto (ADR-001).

## Testes

- `tests/unit/fx.test.ts` (32): USD→ARS, EUR→ARS, ARS→USD, CLP sem decimais, arredondamento, negativos, zero, mesma moeda, taxas em falta/inválidas, valores muito grandes, parsing/formatação es-AR, conjuntos manual/automático com recurso, taxas cruzadas, validação, fotografia, `planConversion` (atual, personalizada, guardada, sem taxa), `consolidate`, dinheiro por moeda, fornecedor simulado (sucesso, falha, timeout, dados inválidos, desativado), rascunho de configuração.
- `tests/integration/currency-exchange.test.tsx` (12): histórico preservado após mudança de taxas, recusas do repositório, exportação/importação 2.4.0, publicação sem `exchange`, dados 2.3.0, saldos multimoeda e total estimado em Cuentas, formulário de transação (taxa ativa, personalizada, sem taxa), Configuración (editar, persistir, conversor em direto, taxa inválida).
- `tests/e2e/currency.spec.ts` (desktop e iPhone, build de produção): fluxo completo e confirmação de que o fornecedor nunca é chamado sem opt-in.
