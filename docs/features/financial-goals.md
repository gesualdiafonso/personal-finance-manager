# Metas (`/presupuesto#metas`)

Implementado no Step 06, na área Presupuesto. Orçamentos: [budgets.md](budgets.md).

## Modelo (schema 2.3.0, entidades novas)

**`Goal`** — ficheiro opcional `data/goals.json`, store `goals`.

| Campo | Regra |
| --- | --- |
| `name`, `description?` | 1–80 / até 200 caracteres, sem números de cartão |
| `kind` | `emergency` · `purchase` · `vehicle` · `travel` · `home` · `reserve` · `other` |
| `amount` | Objetivo, > 0, centavos |
| `initialAmount` | Já poupado antes de registar aportes, ≥ 0 |
| `currency` | ARS ou USD |
| `startDate`, `targetDate?` | Datas de calendário; a prevista não pode ser anterior ao início |
| `status` | `active` · `completed` · `cancelled` |
| `completedAt` | Preenchido exatamente quando está cumprida |
| `archivedAt` | Só para metas cumpridas ou canceladas |

**`GoalContribution`** — ficheiro opcional `data/goal-contributions.json`, store `goalContributions`.

| Campo | Regra |
| --- | --- |
| `id`, `goalId` | Identificador e meta |
| `amount`, `currency` | > 0; a moeda da meta |
| `date`, `description?` | |
| `accountId?` | Conta de origem (referência; tem de estar ativa e na mesma moeda) |
| `transactionId?` | Transferência ou despesa já registada que apartou o dinheiro |
| `cancelledAt` | Anulação: fica no histórico, deixa de contar |

## Contribuições sem dupla contagem

- Um aporte é um **registo próprio**: não cria receitas nem despesas fictícias e **não mexe em nenhum saldo**.
- Se o dinheiro já foi movido por uma transação, o aporte pode **apontar para ela** (`transactionId`), preservando a referência. Só transferências ou despesas da mesma moeda, não canceladas; **nunca uma receita** (a mesma operação não pode ser aporte e receita nova).
- Cada transação apoia **no máximo um** aporte ativo (verificado no repositório e na validação do conjunto de dados).
- Uma transação ligada a um aporte ativo não se cancela nem elimina: primeiro cancela-se o aporte.
- Duplo envio ou o mesmo aporte escrito duas vezes (mesma meta, data, importe e descrição) pede confirmação ("Registrar igual").
- Aportes não se editam (só a descrição) nem se eliminam: cancelam-se.

## Progresso — [`src/domain/rules/goals.ts`](../../src/domain/rules/goals.ts)

- Ahorrado = `initialAmount` + aportes não cancelados; falta = objetivo − ahorrado (nunca negativo); percentagem arredondada para baixo (pode passar de 100).
- **Ritmo necessário**: falta ÷ blocos de 30 dias (por mês) e de 7 dias (por semana) até à data prevista, arredondado **para cima**. Sem data prevista, já atingida ou data passada: "no se puede calcular".
- **Data prevista passada**: aparece "Fecha prevista pasada" e uma nota; a meta **não muda** sozinha.
- **Objetivo atingido**: aparece "Objetivo alcanzado" e o botão "Marcar como cumplida". A meta nunca se conclui automaticamente; o repositório recusa concluir antes de atingir o objetivo.

## Gestão

| Ação | Quando |
| --- | --- |
| Criar, consultar | Sempre |
| Editar | Ativa: todos os campos (moeda só sem aportes). Cumprida/cancelada: só a descrição |
| Registar aporte, cancelar aporte | Só em metas ativas |
| Concluir | Ativa e com o objetivo atingido |
| Cancelar | Ativa; definitivo; os aportes ficam no histórico |
| Arquivar / desarquivar | Cumprida ou cancelada |
| Eliminar | Só sem nenhum aporte (nem cancelado) |

## Interface

- **Lista** em cartões: Activas · Cumplidas · Canceladas · Archivadas. Cada cartão: nome, tipo, estado, ahorrado, barra de progresso, percentagem do objetivo e data prevista.
- **Detalhe** na sheet: ahorrado, estado, barra, objetivo, já poupado, aportes, falta, datas (com dias em falta), ritmo, moeda, descrição e o **histórico de aportes** (conta de origem, ligação, cancelados riscados).
- **Registar aporte** na mesma sheet: importe, data, descrição, conta de origem, transação ligada (as 50 mais recentes por ligar, da moeda da meta).
- **Resumen**: ahorrado nas metas ativas por moeda (nunca somado entre moedas), ativas, cumpridas, prontas para marcar como cumpridas e as próximas datas previstas.

## Ficheiros

`src/domain/rules/goals.ts`, `src/features/planning/goal-form.tsx`, `goal-detail.tsx`, `data.ts`, `forms.ts`; repositório em `src/services/repositories/repositories.ts`; validação do conjunto em `src/services/data/dataset.ts`.
