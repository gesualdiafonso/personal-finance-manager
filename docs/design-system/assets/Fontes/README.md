# Fontes

Licenças das duas famílias usadas pelo PFM. Ambas estão sob a SIL Open Font License 1.1 (confirmado no texto da licença e nos metadados dos ficheiros, campo de licença `nameID 13`), que permite incluí-las no repositório e servi-las a partir do próprio domínio.

| Família | Ficheiro no Design System | Licença |
| --- | --- | --- |
| Instrument Sans (variável, `wght` 400–700, `wdth` 75–100) | `fonts/InstrumentSans-Variable.woff2` | `OFL-InstrumentSans.txt` |
| Instrument Serif (regular) | `fonts/InstrumentSerif-Regular.woff2` | `OFL-InstrumentSerif.txt` |

Os WOFF2 foram gerados a partir dos ficheiros oficiais do repositório google/fonts, com os subconjuntos latin e latin-ext (inclui U+00A0 e U+2212). São os mesmos ficheiros que o Step 01 deve carregar com `next/font/local` (D3). O itálico da Instrument Serif não é usado e não está incluído.
