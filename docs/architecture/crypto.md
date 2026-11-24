# Cifragem da publicação — desenho, integridade e limites

**Estado:** o módulo `src/services/crypto/bundle.ts` implementa o desenho aprovado no Step 00 (D2), com testes. **Nenhuma publicação usa este módulo ainda.** A CI não cifra nem publica dados, porque falta decidir onde fica a frase-passe (OD-1) e como se publica (OD-7).

## Desenho

| Elemento | Escolha |
| --- | --- |
| Derivação de chave | PBKDF2-HMAC-SHA-256, **600 000 iterações** (valor recomendado pela OWASP), sal aleatório de 16 bytes por publicação |
| Cifra | AES-256-GCM, IV aleatório de 12 bytes por cifragem, tag de 16 bytes |
| Dados associados (AAD) | `pfm.bundle|<schemaVersion>|rev=<dataRevision>` |
| Chave | `CryptoKey` não exportável, só em memória; a frase-passe não é guardada |
| Integridade de transporte | SHA-256 do texto cifrado no manifesto, verificado antes de derivar a chave |
| Conteúdo | JSON canónico (chaves ordenadas) `{ format: "pfm.bundle.content", files: { <caminho>: <ficheiro> } }`: um único pacote, para não revelar quantos meses ou contas existem |
| API | Web Crypto (`globalThis.crypto.subtle`), igual no navegador e no Node 22 |

O manifesto (`manifestSchema`) não é sensível: formato, versões, nome do ficheiro, tamanho, SHA-256, parâmetros KDF e IV, commit de origem e data. Os parâmetros viajam com os dados, para que as iterações possam subir sem partir publicações antigas. Um manifesto com menos de 600 000 iterações é recusado.

## Verificação ao desencriptar (`decryptBundle` + `createPublishedSource`)

1. O manifesto passa no schema.
2. O tamanho e o SHA-256 do pacote coincidem com o manifesto (`INTEGRITY_FAILED`).
3. A chave é derivada da frase-passe com o sal e as iterações do manifesto.
4. AES-GCM com o AAD reconstruído do manifesto. Uma frase-passe errada, bytes alterados e uma revisão trocada falham da mesma forma (`CRYPTO_FAILED`), de propósito.
5. O conteúdo passa nas quatro camadas de validação.
6. A revisão do conteúdo é igual à do manifesto, e não é inferior à local.

Qualquer falha lança `AppError` e nada é gravado.

## Testado (`tests/unit/crypto.test.ts`, `tests/integration/published-source.test.ts`)

- Ida e volta com manifesto válido; sal e IV diferentes em cada cifragem.
- Frase-passe errada, byte alterado, revisão trocada (AAD) e KDF enfraquecido: todos recusados.
- Fonte publicada completa: manifesto → pacote → desencriptar → validar; revisão mais antiga recusada.

## Limites de segurança

- **Protege:** confidencialidade e autenticidade do pacote num alojamento público; troca por um pacote antigo (com a verificação de revisão).
- **Não protege:** contra uma frase-passe fraca (o pacote é público e pode ser atacado offline); os metadados (tamanho aproximado, datas de publicação); o dispositivo (IndexedDB sem cifragem em repouso: OD-3).
- **Sem recuperação da frase-passe.** É intencional. As consequências da perda dependem da OD-2 (repositório em texto simples ou cifrado). Ver o documento "PFM - Arquitetura de Dados", secção Backup e recuperação.
- **Argon2id** seria mais forte do que PBKDF2, mas não existe na Web Crypto (OD-6).

## Por decidir antes de publicar dados reais

OD-1 (frase-passe no CI), OD-2 (repositório cifrado?), OD-3 (IndexedDB cifrado?), OD-5 (exportações cifradas?), OD-7 (forma de publicar). Ver [open-decisions.md](../decisions/open-decisions.md).
