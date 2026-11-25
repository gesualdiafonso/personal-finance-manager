# Step 10 — adenda multimoeda: decisões (autónomas, documentadas)

| Id | Decisão | Motivo |
| --- | --- | --- |
| D-FX-01 | Moedas ARS, USD, EUR, BRL, UYU, CLP, PYG, GBP, com casas decimais ISO 4217 (CLP e PYG: 0). Lista fechada; nova moeda = alteração de código | Região + pedido do brief; evita moedas sem símbolo/formato testado |
| D-FX-02 | Taxa = string decimal (≤ 10 decimais), "destino por 1 origem"; conversão em BigInt com um único arredondamento meio-para-longe-de-zero | Sem erros de vírgula flutuante; resultado reproduzível |
| D-FX-03 | Configuração em `FinancialSettings.exchange` (opcional, 2.4.0): moedas ativas, modo por omissão, configurações de taxa nomeadas, opt-in do fornecedor | Reutiliza a persistência existente (IndexedDB + `settings.json` + exportação); nenhuma camada nova |
| D-FX-04 | Cotações manuais e automáticas guardadas separadamente em cada configuração | O fornecedor nunca apaga o que o utilizador escreveu; recurso automático→manual possível |
| D-FX-05 | `Transaction.conversion` é uma fotografia imutável em relação às taxas: nunca recalculada; editar mantém a taxa; remoção silenciosa recusada | Consistência histórica pedida no brief |
| D-FX-06 | Fornecedor DolarApi opcional, desligado por omissão, só a pedido, só GET, só base ARS | "Nunca depender de API externa"; "não enviar dados financeiros" |
| D-FX-07 | Configurações iniciais vazias (Oficial, MEP) | "Não inventar cotações" |
| D-FX-08 | Importar uma publicação sem `exchange` mantém a configuração local | Dados pré-2.4.0 não devem apagar configuração do dispositivo |
| D-FX-09 | Totais consolidados: soma por moeda, conversão uma vez por moeda, moedas sem taxa listadas à parte; sempre rotulado como estimativa | D2-02 continua: nada se mistura em silêncio |
| D-FX-10 | Transferências entre moedas continuam recusadas (D4-06) | Fora do âmbito da adenda; exigiria dois montantes por transação |

D2-02 ("não há conversão") passa a ler-se: **não há conversão implícita**; há estimativas explícitas, com taxa, modo, fonte e data, ao lado do valor original.
