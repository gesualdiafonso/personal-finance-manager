import { CATEGORY_MAX_DEPTH, type Category } from "../schemas";

/**
 * Category hierarchy rules: a child has the same type (income/expense) as its parent, the
 * tree has at most CATEGORY_MAX_DEPTH levels (parent → child), and there are no cycles.
 */
export interface CategoryIssue {
  id: string;
  message: string;
}

export function validateCategoryTree(categories: readonly Category[]): CategoryIssue[] {
  const issues: CategoryIssue[] = [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  for (const c of categories) {
    if (c.deletedAt !== null || c.parentId === null) continue;
    const parent = byId.get(c.parentId);
    if (!parent || parent.deletedAt !== null) {
      issues.push({ id: c.id, message: "parentId points to a missing or deleted category" });
      continue;
    }
    if (parent.type !== c.type) issues.push({ id: c.id, message: "A child category must have the same type as its parent" });
    // Walk up: detect cycles and depth.
    const seen = new Set<string>([c.id]);
    let depth = 1;
    let cursor: Category | undefined = parent;
    while (cursor) {
      if (seen.has(cursor.id)) {
        issues.push({ id: c.id, message: "Category hierarchy contains a cycle" });
        break;
      }
      seen.add(cursor.id);
      depth++;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    if (depth > CATEGORY_MAX_DEPTH && !issues.some((i) => i.id === c.id && i.message.includes("cycle"))) {
      issues.push({ id: c.id, message: `Category hierarchy is deeper than ${CATEGORY_MAX_DEPTH} levels` });
    }
  }
  return issues;
}

export interface CategoryNode {
  category: Category;
  children: Category[];
}

/** Active top-level categories with their active children, in name order (es-AR collation). */
export function buildCategoryTree(categories: readonly Category[]): CategoryNode[] {
  const active = categories.filter((c) => c.deletedAt === null && c.isActive);
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, "es-AR");
  return active
    .filter((c) => c.parentId === null)
    .sort(byName)
    .map((category) => ({ category, children: active.filter((c) => c.parentId === category.id).sort(byName) }));
}
