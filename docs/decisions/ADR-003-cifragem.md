# ADR-003 — Repositório privado e publicação cifrada

- **Estado:** aceite (decisão D2, Step 00)

## Decisão

Repositório privado **e** cifragem de tudo o que é publicado: PBKDF2-HMAC-SHA-256 (600 000 iterações) e AES-256-GCM com AAD, pela Web Crypto API. A frase-passe é introduzida pelo utilizador e nunca é guardada no código, no LocalStorage, em ficheiros de configuração públicos, em registos ou em URLs. A integridade é verificada antes de aceitar dados. Um repositório privado não protege ficheiros servidos por um alojamento público.

## Implementado no Step 01

`src/services/crypto/bundle.ts` (cifrar, verificar, desencriptar), `createPublishedSource` e testes. A CI verifica que nenhum artefacto público contém dados em texto simples (`guard:artifacts`). Desenho completo e limites: [crypto.md](../architecture/crypto.md).

## Por implementar

A cifragem e publicação na CI dependem da OD-1 (onde a CI obtém a frase-passe) e da OD-7 (forma de publicar).
