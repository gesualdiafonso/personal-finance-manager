# Autenticação local e perfil global — decisões (autónomas, documentadas)

| Id | Decisão | Motivo |
| --- | --- | --- |
| D-AUTH-01 | **Uma conta local por dispositivo.** Um segundo registo é recusado (`ACCOUNT_EXISTS`; `USERNAME_TAKEN` para o mesmo username). A conta que se regista é dona dos dados financeiros já existentes, que não são alterados | A aplicação é single-user e todos os registos vivem num único IndexedDB: várias contas veriam os mesmos dados, e um "login" que não separa nada seria enganador. Adicionar `ownerId` a cada registo mudaria os dados oficiais sem benefício |
| D-AUTH-02 | PBKDF2-HMAC-SHA-256, 600 000 iterações, sal de 16 bytes, Web Crypto | Pedido no brief; mesmo parâmetro já aprovado para as publicações; sem algoritmos próprios |
| D-AUTH-03 | Moeda principal, fuso e formato numérico ficam em `FinancialSettings`; o perfil não os copia | Requisito "sem registos duplicados"; uma alteração vale em toda a aplicação |
| D-AUTH-04 | `AuthProvider` na raiz e `AuthGate` no grupo `(app)`; verificação no cliente | A aplicação é estática e local-first: não há servidor que possa verificar sessões |
| D-AUTH-05 | Stores `profiles`, `credentials`, `sessions` separadas (IndexedDB v4, aditivo) | Verificador separado do perfil; nunca exportado; "Borrar datos locales" não as toca |
| D-AUTH-06 | O perfil **não** entra em exportações nem publicações | Dados pessoais; a publicação vai para um repositório e só deve ter dados financeiros cifrados |
| D-AUTH-07 | Sessões: recordada 30 dias; senão `sessionStorage` + 30 min de inatividade + 12 h | "Remember session" pedido; nada da conta em LocalStorage |
| D-AUTH-08 | O fuso do perfil não muda o calendário financeiro (Buenos Aires) | Mudar o fuso dos cálculos reescreveria o significado das datas guardadas; fora do âmbito |
| D-AUTH-09 | Sem recuperação de palavra-passe nem reposição da conta | Sem servidor não há recuperação segura; repor a conta mantendo os dados anularia o bloqueio. **Decisão em aberto para o utilizador** (OD-AUTH-1) |
| D-AUTH-10 | Idioma e formato numérico com uma só opção (es-AR) | ADR-005 continua em aberto; não resolvido em silêncio |

## Em aberto

- **OD-AUTH-1 — palavra-passe esquecida.** Opções: (a) nenhuma recuperação (atual); (b) "começar de novo" que apaga conta **e** dados locais, depois de exportados; (c) código de recuperação gerado no registo. Cada uma muda o que o bloqueio protege.
- **OD-3 / OD-5** continuam por implementar: o IndexedDB e as exportações não estão cifrados. A palavra-passe da conta poderia vir a desbloquear a chave do IndexedDB, mas isso exige a revisão de desenho que a OD-3 pede antes de ser considerado pronto para produção.
