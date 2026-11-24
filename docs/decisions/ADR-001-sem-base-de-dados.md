# ADR-001 — Sem base de dados

- **Estado:** aceite (Step 00, auditoria final; confirmado no Step 01 §2.1)
- **Substitui:** a stack do brief original (STEP 00 §1), que previa "Cloud-first, com persistência através do Supabase" e PostgreSQL.

## Decisão

O PFM não usa nenhuma base de dados, serviço de base de dados nem ORM: Supabase, PostgreSQL, MySQL, MongoDB, Firebase, SQLite, Prisma, Drizzle ou equivalentes. A fonte oficial de dados são ficheiros JSON versionados num repositório GitHub privado. As atualizações seguem `git commit` → `git push` → GitHub Actions → validação → publicação.

## Consequências

- Cada dispositivo guarda os dados localmente em IndexedDB (ADR-002).
- A stack mantém Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, React Hook Form e Zod. O TanStack Query só entra quando houver dados remotos para ler e pôr em cache (a publicação). No Step 01 não é usado, por isso não está instalado.
- **Aplicação:** `npm run guard:deps` (package.json e lockfile), ESLint `no-restricted-imports` e a regra P-21 do Design System.
