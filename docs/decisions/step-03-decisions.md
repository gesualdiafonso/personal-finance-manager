# Decisões do Step 03 — Accounts & Cards

Propostas na auditoria do Step 03 (fases 00 e 01) e **aprovadas pelo responsável** ("autorizado", 2026-11-24). Não fecham nenhuma decisão em aberto: ADR-005, OD-1, OD-2, OD-4, OD-7, OD-8 continuam em [open-decisions.md](open-decisions.md).

| ID | Decisão |
| --- | --- |
| D3-01 | Cartão **pré-pago** (`cardType: "prepaid"`), schemaVersion **2.1.0**. Mudança só aditiva: os ficheiros 2.0.x são dados 2.1.0 válidos e lêem-se sem migração; as exportações novas são 2.1.0. Débito e pré-pago: sem limite, sem fecho, sem vencimento. |
| D3-02 | Cartões mantêm `status: active · inactive`; a interface mostra `inactive` como "Archivada". |
| D3-03 | A interface exige conta de pagamento ao criar ou editar um cartão. Cartões migrados do 1.x sem conta mostram "Sin cuenta asociada". O schema não muda. |
| D3-04 | O saldo inicial não se altera na edição normal: tem um fluxo próprio ("Corregir saldo inicial") com valor anterior, novo e efeito no saldo atual, e confirmação. O rasto é a operação no `outbox` (revisão anterior + registo completo), que vai no próximo changeset. |
| D3-05 | "Eliminar" (tombstone) só para contas/cartões sem referências, sempre com confirmação. Com referências: só arquivar. |
| D3-06 | Mostram-se o limite e o comprometido, sempre separados; **não** se calcula "crédito disponível" (depende da OD-8). |
| D3-07 | O detalhe do cartão não é organizado por fatura (depende da OD-8): mostra factos, próximas datas, comprometido e compras. |
| D3-08 | Indicadores sem filas de KPIs em cards: um valor herói por moeda base, outras moedas à parte, restantes números numa linha de texto. |
| D3-09 | Sheet e diálogos sobre o `<dialog>` nativo; `<select>` nativo. Sem dependências novas. |
| D3-10 | Rotas de detalhe `/cuentas/[id]` e `/tarjetas/[id]`, com breadcrumb; o id lê-se da barra de endereço. |
| — | Service worker: precache de um shell de detalhe por área (`/cuentas/_`, `/tarjetas/_`) e fallback para ele sem rede, para qualquer id. |

**Decisões de implementação** (sem impacto de segurança ou compatibilidade por decidir):

- Mudar a conta de um cartão com movimentos é recusado pelo **repositório** (`REFERENCE_CONSTRAINT`), não só pela interface.
- As navegações (sidebar, rail, tab bar) foram divididas em `X` + `XView` para poderem ser mostradas num `Suspense` nos shells de detalhe pré-renderizados sem id conhecido. O aspeto e a estrutura não mudam.
- "Contas bancárias" no resumo = `checking` + `savings`.
- "Vencen pronto" = cartões de crédito ativos com vencimento nos próximos 7 dias.
