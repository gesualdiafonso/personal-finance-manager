# ADR-005 — Idioma inicial: espanhol

- **Estado:** **por aprovar** — a implementação segue o Step 01; a mudança está assinalada.
- **Origem:** o brief do Step 00 dizia "Idioma inicial: Português", e o Design System foi escrito em português. O Step 01 (§3) define "Initial language: Spanish".

## O que foi feito

- `<html lang="es">`, locale de formatação `es-AR` (números e datas).
- Todos os textos estão num único dicionário (`src/lib/i18n/es.ts`). Os rótulos aprovados do Design System foram **traduzidos diretamente**, sem mudar a sua estrutura: Panel, Transacciones, Cuentas domésticas, Tarjetas, Recurrencias, Cuentas, Presupuesto, Informes, Configuración; grupos Obligaciones, Patrimonio, Plan; tab bar Inicio, Transacciones, +, Obligaciones, Más.
- As rotas seguem o idioma da interface (`/transacciones`, `/cuentas-domesticas`, `/tarjetas`…). O Design System listava rotas em português (`/transacoes`, `/cartoes`).

## A aprovar

1. O espanhol como idioma inicial (substitui o português do Step 00).
2. A terminologia: por exemplo, se "Cuentas domésticas" deve ser "Servicios" ou "Gastos del hogar" no uso argentino, e "Transacciones" ou "Movimientos".
3. As rotas em espanhol.
