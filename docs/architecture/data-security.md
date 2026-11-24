# Segurança dos dados — estado e desenho proposto

> **Estado no Step 02: nenhuma cifragem nova foi ativada.** Esta página descreve o que existe, o que *não* está protegido e um desenho **proposto** para as decisões em aberto. O desenho precisa de revisão e aprovação explícitas antes de ser implementado ou considerado pronto para produção.

## O que existe

| Elemento | Proteção | Estado |
| --- | --- | --- |
| Pacote publicado (`pfm.bundle`) | PBKDF2-HMAC-SHA-256 (600 000 iterações, sal de 16 bytes) → AES-256-GCM (IV de 12 bytes, AAD com `schemaVersion` e `dataRevision`); SHA-256 do texto cifrado verificado antes de derivar a chave | Implementado no Step 01 ([crypto.md](crypto.md)); só Web Crypto, sem algoritmos próprios; ainda sem publicação (OD-1, OD-7) |
| IndexedDB | **Nenhuma.** Os registos ficam legíveis por quem tiver acesso ao perfil do navegador | OD-3 em aberto |
| Exportações e changesets | **Nenhuma.** JSON em texto simples com SHA-256 de integridade (não é autenticação) | D2-07; OD-5 em aberto |
| `data/` no repositório | Repositório privado; só dados fictícios até a OD-2 ser fechada | OD-2 em aberto |
| LocalStorage | Só quatro preferências não financeiras | Implementado |

**O que se garante hoje:** nenhuma chave, frase-passe ou sal é guardado junto dos dados (teste em `tests/unit/data-security.test.ts`); nada é publicado em texto simples (`guard:artifacts`); erros e relatórios não mostram valores, descrições nem a frase-passe; a app não escreve no GitHub (`guard:deps` verifica dependências e endpoints).

**O que NÃO se garante:** confidencialidade dos dados no dispositivo e dos ficheiros exportados. Quem tiver o computador desbloqueado ou um ficheiro exportado lê os dados.

## Testes de segurança — `tests/unit/data-security.test.ts`, `tests/unit/crypto.test.ts`

Texto cifrado alterado com hash recalculado (falha a autenticação GCM), texto cifrado truncado, chave inválida (frase-passe errada, sal alterado), IV alterado, `schemaVersion`/`dataRevision` trocados (AAD), metadados em falta (`kdf`, `cipher`, `sha256`, `schemaVersion`, `dataRevision`), derivação mais fraca, mensagens de erro sem frase-passe nem texto, e três testes que **afirmam** que o IndexedDB e as exportações não estão cifrados.

## Desenho proposto (por aprovar)

Só primitivas da Web Crypto API; nenhum algoritmo próprio.

### A. Exportações cifradas (OD-5)

- Reutilizar o formato do pacote: envelope `pfm.export.enc` = manifesto (`kdf`, `cipher`, `sha256`, `format` interno, `schemaVersion`) + AES-256-GCM do JSON canónico da exportação, chave por PBKDF2-SHA-256 com sal novo e IV novo em cada exportação, AAD = `pfm.export|<format>|<schemaVersion>|<exportedAt>`.
- A frase-passe é pedida no momento e nunca guardada.
- A importação valida o manifesto, o hash, desencripta e só depois corre a pré-visualização normal.

### B. IndexedDB em repouso (OD-3)

Opção 1 — desbloqueio por sessão: uma chave de dados aleatória (DEK, AES-256-GCM, não exportável na sessão) cifra cada registo; a DEK é guardada **embrulhada** (AES-KW ou AES-GCM) por uma chave derivada da frase-passe; a frase-passe nunca é guardada; a DEK vive só em memória durante a sessão. Índices sobre campos cifrados deixam de funcionar: os índices teriam de ser restritos a campos não sensíveis (ids, datas) — a decidir.

Opção 2 — "recordar neste dispositivo": igual, mas a DEK fica embrulhada por uma chave não exportável guardada no próprio IndexedDB. Protege contra cópia dos ficheiros do perfil, **não** contra quem usa o navegador desbloqueado. Tem de ser descrita assim na interface.

### C. Antes de considerar pronto para produção

1. Revisão do desenho por escrito e aprovação explícita do responsável.
2. Vetores de teste conhecidos, testes de falha (como os atuais) e de rotação de frase-passe.
3. Plano de recuperação se a frase-passe se perder (depende da OD-2).
4. Decisão sobre metadados visíveis (tamanhos, datas) e sobre os índices.

Até lá: dados reais não devem entrar em `data/` nem nos dispositivos (OD-2, OD-3), e nenhum botão de exportação aparece na interface.
