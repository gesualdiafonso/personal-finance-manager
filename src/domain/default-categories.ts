import type { Category } from "./schemas";

/**
 * Initial categories (D4-09), created once on a device that has NO categories. Fixed ids, so
 * two devices seeding them produce the same records (no duplicates when the changesets are
 * integrated into data/). Never replaces or renames categories the owner already has; managing
 * categories is outside Step 04. Names are es-AR (ADR-005 pending).
 */
const id = (n: number) =>
  `0193c8a0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

export const DEFAULT_CATEGORIES: readonly Pick<
  Category,
  "id" | "name" | "type"
>[] = [
  { id: id(0x101), name: "Sueldo", type: "income" },
  { id: id(0x102), name: "Trabajo independiente", type: "income" },
  { id: id(0x103), name: "Inversiones", type: "income" },
  { id: id(0x104), name: "Ventas", type: "income" },
  { id: id(0x105), name: "Reintegros", type: "income" },
  { id: id(0x106), name: "Otros ingresos", type: "income" },
  { id: id(0x201), name: "Vivienda", type: "expense" },
  { id: id(0x202), name: "Alimentación", type: "expense" },
  { id: id(0x203), name: "Transporte", type: "expense" },
  { id: id(0x204), name: "Salud", type: "expense" },
  { id: id(0x205), name: "Educación", type: "expense" },
  { id: id(0x206), name: "Compras", type: "expense" },
  { id: id(0x207), name: "Entretenimiento", type: "expense" },
  { id: id(0x208), name: "Servicios", type: "expense" },
  { id: id(0x209), name: "Impuestos", type: "expense" },
  { id: id(0x20a), name: "Otros gastos", type: "expense" },
];
