# Decisões do Step 04 — Transactions Management

Propostas na auditoria do Step 04 e **aprovadas pelo responsável** ("sim", 2026-11-24). Continuam em aberto: ADR-005, OD-1, OD-2, OD-4, OD-7 e as secções 11–14 do brief original. A OD-8 está decidida ([od-8-cartoes.md](od-8-cartoes.md)) e implementada **em parte** (D4-08).

| ID | Decisão |
| --- | --- |
| D4-01 | Reutilizar o modelo `Transaction` sem mudar o schema (2.1.0). O **tipo não se altera** depois de criado — garantido pelo repositório. |
| D4-02 | Pendentes: mantém-se D2-04. "Saldo actual" (completados) e "Saldo proyectado" (com pendentes) sempre com o nome à vista. |
| D4-03 | **Cancelar** = estado `cancelled` pelo repositório, com confirmação; o registo fica; o impacto desaparece porque o saldo é derivado; a operação fica no `outbox` com `baseRev`. **Definitivo**: num cancelado só as notas mudam — garantido pelo repositório. |
| D4-04 | **Eliminar** (tombstone) só pendentes ou cancelados, com confirmação. Um completado tem de ser cancelado primeiro — garantido pelo repositório (`PROTECTED_OPERATION`). |
| D4-05 | Editar um completado: descrição, valor, data, conta, categoria, cartão, estado e notas, com pré-visualização do efeito nos saldos (antes → depois) calculada pelo domínio. A moeda é a da conta. |
| D4-06 | Transferências entre moedas diferentes continuam bloqueadas, com mensagem. |
| D4-07 | Contas arquivadas e cartões inativos não servem para movimentos novos (repositório e interface); os existentes continuam editáveis. |
| D4-08 | OD-8 nesta parte: compras com **débito e pré-pago** descontam da conta na data da compra; **crédito** fica como comprometido, sem mexer na conta. Faturas, cuotas, pagamento de fatura, crédito disponível e devoluções: step próprio. |
| D4-09 | Categorias iniciais (16, ids fixos, `isDefault`) criadas uma vez num dispositivo sem categorias; nunca sobre categorias existentes. |
| D4-10 | Detalhe na sheet lateral (clique numa linha), sem rota própria. |
| D4-11 | Leitura por período com o índice `date`; "Este mes" por omissão; lista de 100 em 100. Sem TanStack Query. |
| D4-12 | Pesquisa sem acentos nem maiúsculas, todas as palavras, 250 ms; filtros combináveis; 5 ordenações. |
| D4-13 | Períodos rápidos no calendário de Buenos Aires; semana desde `settings.firstDayOfWeek`. |
| D4-14 | Resumo por moeda sobre o que está listado; completados por omissão; transferências e cancelados nunca. |
| D4-15 | "Nueva transacción" global (sidebar, rail, "+", N) abre a sheet ao estilo QuickAdd. **Desvio aprovado:** teclado decimal do sistema em vez do teclado próprio do Design System. |
| D4-16 | Possível duplicado → confirmação "¿Guardar igual?". |
| D4-17 | Reconciliação por conta (decomposição do saldo conferida com a derivação) no detalhe da conta e na verificação de integridade local. |

**Ajuste a um teste anterior:** o teste do Step 02 "deletes as a tombstone" passou a usar uma transação pendente, porque a D4-04 proíbe eliminar uma completada.
