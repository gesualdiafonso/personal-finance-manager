# Segurança dos dados — estado e desenho aprovado

> **Estado: desenho A–C aprovado pelo responsável em 2026-11-24; nenhuma cifragem nova está implementada.** A aprovação é do desenho, não de uma implementação: o código terá de ser feito num step autorizado, seguir este desenho e cumprir a secção C antes de ser considerado pronto para produção. Na secção B foi escolhida a **opção 2, "recordar neste dispositivo"** (OD-3, 2026-11-24).

## O que existe

| Elemento | Proteção | Estado |
| --- | --- | --- |
| Pacote publicado (`pfm.bundle`) | PBKDF2-HMAC-SHA-256 (600 000 iterações, sal de 16 bytes) → AES-256-GCM (IV de 12 bytes, AAD com `schemaVersion` e `dataRevision`); SHA-256 do texto cifrado verificado antes de derivar a chave | Implementado no Step 01 ([crypto.md](crypto.md)); só Web Crypto, sem algoritmos próprios; ainda sem publicação (OD-1, OD-7) |
| IndexedDB | **Nenhuma.** Os registos ficam legíveis por quem tiver acesso ao perfil do navegador | Decidido: opção 2 do desenho B ("recordar neste dispositivo"), por implementar (OD-3) |
| Exportações e changesets | **Nenhuma.** JSON em texto simples com SHA-256 de integridade (não é autenticação) | D2-07; cifragem aprovada (desenho A), por implementar |
| `data/` no repositório | Repositório privado; só dados fictícios até a OD-2 ser fechada | OD-2 em aberto |
| LocalStorage | Só quatro preferências não financeiras | Implementado |

**O que se garante hoje:** nenhuma chave, frase-passe ou sal é guardado junto dos dados (teste em `tests/unit/data-security.test.ts`); nada é publicado em texto simples (`guard:artifacts`); erros e relatórios não mostram valores, descrições nem a frase-passe; a app não escreve no GitHub (`guard:deps` verifica dependências e endpoints).

**O que NÃO se garante:** confidencialidade dos dados no dispositivo e dos ficheiros exportados. Quem tiver o computador desbloqueado ou um ficheiro exportado lê os dados.

## Conta local (autenticação)

A palavra-passe guarda-se só como verificador PBKDF2 (600 000 iterações, sal próprio) numa store separada, nunca exportada; as sessões têm ids aleatórios e expiram. **Isto protege o acesso à interface, não os dados**: o IndexedDB continua sem cifragem (OD-3). Ver [authentication.md](authentication.md).

## Testes de segurança — `tests/unit/data-security.test.ts`, `tests/unit/crypto.test.ts`

Texto cifrado alterado com hash recalculado (falha a autenticação GCM), texto cifrado truncado, chave inválida (frase-passe errada, sal alterado), IV alterado, `schemaVersion`/`dataRevision` trocados (AAD), metadados em falta (`kdf`, `cipher`, `sha256`, `schemaVersion`, `dataRevision`), derivação mais fraca, mensagens de erro sem frase-passe nem texto, e três testes que **afirmam** que o IndexedDB e as exportações não estão cifrados.

## Desenho aprovado (2026-11-24) — por implementar

Só primitivas da Web Crypto API; nenhum algoritmo próprio.

### A. Exportações cifradas (OD-5)

- Reutilizar o formato do pacote: envelope `pfm.export.enc` = manifesto (`kdf`, `cipher`, `sha256`, `format` interno, `schemaVersion`) + AES-256-GCM do JSON canónico da exportação, chave por PBKDF2-SHA-256 com sal novo e IV novo em cada exportação, AAD = `pfm.export|<format>|<schemaVersion>|<exportedAt>`.
- A frase-passe é pedida no momento e nunca guardada.
- A importação valida o manifesto, o hash, desencripta e só depois corre a pré-visualização normal.

### B. IndexedDB em repouso (OD-3 — escolhida a opção 2)

Opção 1 — desbloqueio por sessão (não escolhida): uma chave de dados aleatória (DEK, AES-256-GCM, não exportável na sessão) cifra cada registo; a DEK é guardada **embrulhada** (AES-KW ou AES-GCM) por uma chave derivada da frase-passe; a frase-passe nunca é guardada; a DEK vive só em memória durante a sessão. Índices sobre campos cifrados deixam de funcionar: os índices teriam de ser restritos a campos não sensíveis (ids, datas) — a decidir.

**Opção 2 — "recordar neste dispositivo" (ESCOLHIDA):** igual, mas a DEK fica embrulhada por uma chave não exportável guardada no próprio IndexedDB. Protege contra cópia dos ficheiros do perfil, **não** contra quem usa o navegador desbloqueado. Tem de ser descrita assim na interface.

**Consequência aceite pelo responsável:** com a opção 2, quem usar o computador com a sessão do navegador desbloqueada consegue ver os dados. A proteção depende do bloqueio do próprio computador (palavra-passe do sistema, bloqueio automático) e do perfil do navegador. A frase-passe continua necessária para configurar um dispositivo novo, recuperar e importar exportações cifradas, e nunca é guardada.

### C. Antes de considerar pronto para produção

1. ~~Revisão do desenho por escrito e aprovação explícita do responsável.~~ Feito em 2026-11-24. Qualquer desvio a este desenho volta a precisar de aprovação.
2. Vetores de teste conhecidos, testes de falha (como os atuais) e de rotação de frase-passe.
3. Plano de recuperação se a frase-passe se perder (depende da OD-2).
4. Decisão sobre metadados visíveis (tamanhos, datas) e sobre os índices.

Até a implementação estar feita e verificada (secção C): dados reais não devem entrar em `data/` nem nos dispositivos (OD-2; OD-3 por implementar), e nenhum botão de exportação aparece na interface.
