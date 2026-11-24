# Tipografia e formatação financeira

Duas famílias, aprovadas: **Instrument Sans** (interface, texto, todos os números) e **Instrument Serif** (só display: título de página e valor herói). Esta secção diz como se carregam, o que acontece se falharem, como se ativam os números tabulares e como se escrevem valores em ARS.

## 1. Famílias e papéis

| Família | Estilos usados | Papel | Proibido |
| --- | --- | --- | --- |
| Instrument Sans (variável) | `wght` 400–700, `wdth` 75–100, normal | Toda a interface, texto, labels, tabelas, **todos os valores monetários exceto o herói** | Pesos abaixo de 400; `wdth` < 90 em texto corrente |
| Instrument Serif | 400 normal | `display-hero`, `display-hero-mobile`, `title-page`, `title-page-mobile`, a palavra PFM | Abaixo de 32px; tabelas, botões, labels, formulários; mais de um valor herói por página |

Pesos de Instrument Sans em uso: **400** (texto), **500** (números, navegação, botões), **600** (títulos de secção, labels, estados ativos). O 700 fica disponível mas não tem uso previsto.

## 2. Carregamento

**Self-hosted com `next/font/local`** (D3, aprovado). Os ficheiros WOFF2 ficam no repositório e o build não faz nenhum pedido à rede para obter fontes.

| Família | Ficheiro | Tamanho medido | Conteúdo |
| --- | --- | --- | --- |
| Instrument Sans | `InstrumentSans-Variable.woff2` | 81 KB (83.176 bytes) | Variável: `wght` 400–700, `wdth` 75–100; latin + latin-ext; algarismos tabulares (`tnum`) |
| Instrument Serif | `InstrumentSerif-Regular.woff2` | 24 KB (24.440 bytes) | Regular; latin + latin-ext; sem `tnum` (só é usada no valor herói e nos títulos) |

- **Origem:** ficheiros oficiais do repositório google/fonts, convertidos para WOFF2 com os subconjuntos latin e latin-ext (á, ã, ç, ñ, «», U+00A0 e U+2212 incluídos). Os mesmos ficheiros estão no Design System em `fonts/`.
- **Licença:** SIL Open Font License 1.1, confirmada no texto da licença e nos metadados dos ficheiros. Os textos da licença ficam no repositório junto das fontes (`assets/Fontes/` no Design System).
- **Configuração prevista:** `localFont({ src: [...], variable: "--font-sans", display: "swap", preload: true })` para a Sans, com `weight: "400 700"`; o equivalente para a Serif com `--font-serif`. O itálico da Instrument Serif não é usado e não é incluído.
- **Preload** das duas: ambas aparecem acima da dobra no Dashboard (título e herói).
- As variáveis `--font-sans` e `--font-serif` são aplicadas no `<html>`; o Tailwind usa-as em `fontFamily.sans` e `fontFamily.serif`. Nenhum componente declara `font-family` diretamente.
- **Offline:** o `next/font/local` serve os ficheiros a partir de `/_next/static/media/`. O service worker pré-carrega esses ficheiros juntamente com o resto da app. Os testes T-01 a T-04 do documento **PFM - Arquitetura de Dados** verificam o build sem acesso ao Google Fonts e as fontes certas em modo avião.

## 3. Fallbacks

| Família | Pilha completa | Notas |
| --- | --- | --- |
| Sans | `"Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | O `next/font/local` gera uma fonte de substituição ajustada em métrica (`adjustFontFallback: "Arial"`), para o texto não saltar quando a fonte carrega. |
| Serif | `"Instrument Serif", ui-serif, "New York", Georgia, "Times New Roman", serif` | Fallback ajustado com `adjustFontFallback: "Times New Roman"`. A Instrument Serif é condensada: no fallback o herói fica mais largo, e por isso o bloco do herói tem `min-width: 0` e quebra antes dos centavos se for preciso. |

**Números no fallback:** `system-ui` (SF Pro, Segoe UI, Roboto) tem algarismos tabulares, por isso o alinhamento das colunas mantém-se mesmo que a Instrument Sans não carregue.

## 4. Números tabulares

**Regra:** todo o valor numérico que se possa comparar (dinheiro, percentagens, datas em lista, contadores) usa algarismos tabulares e lining.

```css
.num {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1; /* reforço para Safari antigo */
  white-space: nowrap;
}
```

- No Tailwind: utilitário `tabular-nums` mais `lining-nums`, encapsulado num componente/utilitário de valor monetário. Nenhum valor é escrito à mão fora dele.
- Colunas de valores alinham **à direita**. Os cabeçalhos dessas colunas também.
- O valor herói (Instrument Serif) usa algarismos proporcionais: está sozinho e não precisa de alinhar com nada.
- Percentagens: `28%` sem espaço; tabulares.

## 5. Formatação financeira ARS

O idioma da interface é português, mas **os números seguem a convenção es-AR**, porque são pesos argentinos lidos na Argentina: ponto para milhares, vírgula para decimais.

### Formato

| Caso | Exemplo | Regra |
| --- | --- | --- |
| Valor base | `$ 4.812.340,56` | Símbolo `$`, espaço não separável, ponto de milhar, vírgula decimal |
| Receita | `+$ 3.450.000` | Sinal `+` explícito em listas e extratos |
| Despesa | `−$ 48.300` | Sinal **U+2212 (−)**, nunca o hífen `-` |
| Saldo (sem sinal) | `$ 1.262.580` | Saldos e totais não levam `+` |
| Zero | `$ 0` | Nunca `+$ 0` ou `−$ 0` |
| Negativo num saldo | `−$ 12.400` em `alert-text` | Só saldos de conta negativos e excessos ficam a barro |
| Compacto (eixos de gráfico) | `2,1 M`, `312 mil` | Só em eixos e rótulos de gráfico; nunca em valores comparáveis |

### Centavos

| Modo | Onde | Comportamento |
| --- | --- | --- |
| `sempre` | Tabelas, extrato, formulários | Sempre `,00`, para manter o alinhamento; centavos em `ink-2` |
| `auto` | Herói, indicadores, listas do Dashboard, mobile | Omite se forem `,00`; se existirem, mostra-os em `ink-2` (no herói a 0.42em, elevados) |
| `nunca` | Gráficos, rótulos compactos | Arredonda ao peso |

### Implementação de referência (comportamento esperado)

O `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", signDisplay: "exceptZero" })` produz `+$ 4.812.340,56` e `-$ 48.300,00`, com U+00A0 depois do `$`. O formatador do PFM parte daí e corrige três coisas:

1. Substitui o hífen `-` pelo menos tipográfico `−` (U+2212).
2. Mantém o U+00A0 entre `$` e o número, para o valor nunca partir em duas linhas.
3. Aplica o modo de centavos (`sempre` / `auto` / `nunca`) e o modo de sinal (`explícito` em extratos, `nenhum` em saldos).

Para o compacto, o `Intl` com `notation: "compact"` em es-AR devolve `312 k`; o PFM escreve `312 mil` e `2,1 M`.

**Valores em centavos:** o formatador recebe sempre um inteiro em centavos (`amountMinor` nos ficheiros JSON), nunca um número decimal. O formato dos dados está no documento **PFM - Arquitetura de Dados**.

### Introdução de valores

- O campo de valor aceita `1.234,56`, `1234,56` e `1234`. A vírgula é sempre decimal; os pontos são ignorados como separadores de milhar.
- Formata enquanto se escreve (`18450` → `18.450`), com o cursor no fim.
- No iPhone, teclado próprio no Registo rápido; noutros campos `inputmode="decimal"`.
- O sinal não se escreve: vem do tipo (Despesa / Receita / Transferência).

### Datas e horas

- Fuso **sempre** `America/Argentina/Buenos_Aires`, também para decidir em que dia ou mês cai uma transação feita perto da meia-noite.
- Língua das datas: português (`pt-PT`): "segunda-feira, 23 de novembro", abreviado "23 nov".
- Relativas até 7 dias ("hoje", "amanhã", "sexta"); depois absolutas. Datas em formulário: `dd/mm/aaaa`.

## 6. Escala tipográfica (resumo)

| Estilo | Família | Tamanho / linha | Peso | Uso |
| --- | --- | --- | --- | --- |
| `display-hero` | Serif | 76 / 0.95 | 400 | Saldo disponível (desktop) |
| `display-hero-mobile` | Serif | 52 / 1 | 400 | Saldo disponível (iPhone) |
| `title-page` | Serif | 44 / 1 | 400 | Título de página (desktop) |
| `title-page-mobile` | Serif | 34 / 1.05 | 400 | Título de página (iPhone) |
| `heading` | Sans | 17 / 24 | 600 | Título de secção |
| `subheading` | Sans | 15 / 22 | 600 | Nome de conta, cartão, conta doméstica |
| `body` | Sans | 15 / 22 | 400 | Texto, descrições |
| `body-sm` | Sans | 13 / 18 | 400 | Metadados |
| `caption` | Sans | 12 / 16 | 500 | Legendas da tab bar, badges, notas de gráficos, teclas de atalho |
| `label` | Sans | 11 / 14, +8%, MAIÚSCULAS | 600 | Rótulos e abreviaturas de mês |
| `nav` | Sans | 14 / 20 | 500 | Navegação, tabs |
| `amount-xl` | Sans tnum | 32 / 36 | 500 | Líquido do mês, total de fatura |
| `amount-lg` | Sans tnum | 22 / 28 | 500 | Indicadores secundários |
| `amount` | Sans tnum | 15 / 22 | 500 | Valores em listas e tabelas |
| `amount-sm` | Sans tnum | 13 / 18 | 500 | Legendas, eixos |
| `date-day` | Sans tnum | 22 / 24 | 500 | Dia na lista "A vencer" |

**Tamanhos mínimos (D5, sem exceções):**

| Mínimo | Para quê |
| --- | --- |
| 13px | Todo o texto de leitura: frases, metadados, descrições, valores em listas |
| 12px (`caption`) | Texto auxiliar curto: legendas da tab bar, badges de estado, eixos e notas de gráficos, teclas de atalho |
| 11px (`label`) | Só rótulos em maiúsculas, incluindo as abreviaturas de mês (NOV) |

Nada fica abaixo de 11px.
