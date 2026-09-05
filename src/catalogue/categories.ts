/**
 * AYROVI Catalogue (P2.1) — hierarchical categories.
 *
 * Before this file the product "category" was a free-text column (`products.category`)
 * and the only real tree in the database was `crm_categories`, which belongs to the CRM
 * arrival classifier (fashion_shoes, beauty_skindcare, …) and is keyed by `code`. Both
 * stay exactly as they are: the classifier is a classification vocabulary, not a
 * merchandising tree, and forcing them onto one table would have rewritten the CRM.
 *
 * The tree is a plain self-referencing table (`parent_id` + `sort_order`), walked to a
 * bounded depth. Men / Women / Kids are rows a human creates, never code: there is no
 * list of category names anywhere in this file.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { propagate, type Check,asObject, explicitSlug, fail, isIdentifier, malformedId, optionalText, requiredText, resolveSlug, slugify, statusOf, wholeNumber } from './validation';
import { CATALOGUE_ERRORS, CATALOGUE_STATUSES, MAX_CATEGORY_DEPTH, type CatalogueCategoryInput, type CatalogueCategoryNode } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';

export type CategoryResult<T> = Check<T>;

const CATEGORY_SELECT = `SELECT id, name, slug, parent_id, status, sort_order, description, created_at, updated_at FROM catalogue_categories`;

export interface CatalogueCategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  status: string;
  sort_order: number;
  description: string;
  created_at: string;
  updated_at: string;
  product_count: number;
}

function mapCategory(row: Record<string, unknown>, count = 0): CatalogueCategoryRow {
  return {
    id: String(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? ''),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    status: String(row.status ?? 'ACTIVE'), sort_order: Number(row.sort_order ?? 100),
    description: String(row.description ?? ''),
    created_at: String(row.created_at ?? ''), updated_at: String(row.updated_at ?? ''),
    product_count: count,
  };
}

export function getCategory(db: QatafoDatabase, id: string): CatalogueCategoryRow | null {
  if (!isIdentifier(id)) return null;
  const row = db.get<Record<string, unknown>>(`${CATEGORY_SELECT} WHERE id=?`, id);
  if (!row) return null;
  const count = Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE category_id=?', id)?.n ?? 0);
  return mapCategory(row, count);
}

export function listCategories(db: QatafoDatabase, options: { status?: unknown; includeArchived?: boolean } = {}): CatalogueCategoryRow[] {
  const where: string[] = [];
  const params: Array<string> = [];
  const status = String(options.status ?? '').trim().toUpperCase();
  if (status && (CATALOGUE_STATUSES as readonly string[]).includes(status)) { where.push('c.status=?'); params.push(status); }
  else if (!options.includeArchived) { where.push("c.status<>'ARCHIVED'"); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.all<Record<string, unknown>>(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS product_count
       FROM catalogue_categories c ${clause} ORDER BY c.sort_order, c.name`, ...params);
  return rows.map((row) => mapCategory(row, Number(row.product_count ?? 0)));
}

/** Flat list + nested tree, because the back office renders both a table and a picker. */
export function categoryTree(db: QatafoDatabase): { flat: CatalogueCategoryRow[]; tree: CatalogueCategoryNode[] } {
  const flat = listCategories(db, { includeArchived: true });
  const byId = new Map<string, CatalogueCategoryNode>();
  for (const row of flat) {
    byId.set(row.id, {
      id: row.id, name: row.name, slug: row.slug, parent_id: row.parent_id, status: row.status,
      sort_order: row.sort_order, depth: 0, product_count: row.product_count, children: [],
    });
  }
  const roots: CatalogueCategoryNode[] = [];
  for (const row of flat) {
    const node = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const stamp = (nodes: CatalogueCategoryNode[], depth: number): void => {
    for (const node of nodes) {
      node.depth = depth;
      if (node.children?.length) stamp(node.children, depth + 1);
    }
  };
  stamp(roots, 0);
  return { flat, tree: roots };
}

/**
 * A parent must exist, must not be the node itself, and must not be one of its own
 * descendants (that is the update that turns a tree into a loop and hangs every walker).
 */
function assertParent(db: QatafoDatabase, id: string | null, parentId: unknown): CategoryResult<string | null> {
  // `undefined` means "do not move this node"; only an explicit null detaches it.
  if (parentId === undefined) return { ok: true, value: null };
  const raw = String(parentId ?? '').trim();
  if (!raw || raw === 'null') return { ok: true, value: null };
  if (!isIdentifier(raw)) {
    return fail(CATALOGUE_ERRORS.PARENT_INVALID, 'Identifiant de parent invalide.', [{ field: 'parent_id', reason: 'FORMAT' }]);
  }
  if (raw === id) {
    return fail(CATALOGUE_ERRORS.PARENT_CYCLE, 'Une catégorie ne peut pas être son propre parent.', [{ field: 'parent_id', reason: 'SELF' }]);
  }
  const parent = db.get<{ id: string; parent_id: string | null }>('SELECT id,parent_id FROM catalogue_categories WHERE id=?', raw);
  if (!parent) return fail(CATALOGUE_ERRORS.CATEGORY_NOT_FOUND, `Catégorie parent « ${raw} » inconnue.`, [{ field: 'parent_id', reason: 'NOT_FOUND' }]);
  let cursor: string | null = parent.parent_id ?? null;
  let hops = 0;
  while (cursor) {
    if (cursor === id) {
      return fail(CATALOGUE_ERRORS.PARENT_CYCLE, 'Ce parent est un descendant de la catégorie: la hiérarchie deviendrait une boucle.', [{ field: 'parent_id', reason: 'CYCLE' }]);
    }
    const next = db.get<{ parent_id: string | null }>('SELECT parent_id FROM catalogue_categories WHERE id=?', cursor);
    cursor = next?.parent_id ? String(next.parent_id) : null;
    hops += 1;
    if (hops > MAX_CATEGORY_DEPTH * 4) break; // a broken chain must never spin the request
  }
  // Depth is bounded for the same reason as any recursive walk: not to decide the
  // taxonomy, but to keep a pathological tree from hanging a request.
  const depth = categoryDepth(db, raw) + 1;
  if (depth > MAX_CATEGORY_DEPTH) {
    return fail(CATALOGUE_ERRORS.DEPTH_EXCEEDED, `Profondeur maximale atteinte (${MAX_CATEGORY_DEPTH} niveaux).`, [{ field: 'parent_id', reason: 'DEPTH' }]);
  }
  return { ok: true, value: raw };
}

/** Number of levels under (and including) a node, without loading the whole table. */
export function categoryDepth(db: QatafoDatabase, id: string): number {
  let depth = 1;
  let cursor: string | null = id;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) return depth;
    seen.add(cursor);
    const row = db.get<{ parent_id: string | null }>('SELECT parent_id FROM catalogue_categories WHERE id=?', cursor);
    if (!row?.parent_id) break;
    cursor = String(row.parent_id);
    depth += 1;
    if (depth > MAX_CATEGORY_DEPTH * 2) break;
  }
  return depth;
}

function buildCategoryPayload(db: QatafoDatabase, input: CatalogueCategoryInput, existing: CatalogueCategoryRow | null): CategoryResult<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  if (existing === null || input.name !== undefined) {
    const name = requiredText(input.name, 'name', 2, 80);
    if (!name.ok) return propagate(name);
    payload.name = name.value;
  }
  if (input.status !== undefined) {
    const status = statusOf(input.status, 'status', CATALOGUE_STATUSES, existing?.status ?? 'ACTIVE');
    if (!status.ok) return propagate(status);
    payload.status = status.value;
  } else if (existing === null) {
    payload.status = 'ACTIVE';
  }
  if (input.sort_order !== undefined || existing === null) {
    const sort = wholeNumber(input.sort_order, 'sort_order', 0, 9999, existing?.sort_order ?? 100);
    if (!sort.ok) return propagate(sort);
    payload.sort_order = sort.value;
  }
  if (input.description !== undefined) {
    const description = optionalText(input.description, 'description', 1000);
    if (!description.ok) return propagate(description);
    payload.description = description.value ?? '';
  }
  if (input.slug !== undefined) {
    const slug = explicitSlug(input.slug);
    if (!slug.ok) return propagate(slug);
    const wanted = slug.value ?? slugify(String(payload.name ?? existing?.name ?? 'categorie'));
    const resolved = resolveSlug(db, 'catalogue_categories', wanted, existing?.id ?? null, slug.value ? 'explicit' : 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  } else if (existing === null) {
    const resolved = resolveSlug(db, 'catalogue_categories', slugify(String(payload.name ?? 'categorie')), null, 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  }
  return { ok: true, value: payload };
}

export interface CategoryMutationOptions {
  actor: CatalogueActor;
  context?: Parameters<typeof auditCatalogue>[1]['context'];
}

export function createCategory(db: QatafoDatabase, rawInput: unknown, options: CategoryMutationOptions): CategoryResult<CatalogueCategoryRow> {
  const input = asObject(rawInput) as CatalogueCategoryInput;
  const built = buildCategoryPayload(db, input, null);
  if (!built.ok) return propagate(built);
  const parent = assertParent(db, null, input.parent_id ?? null);
  if (!parent.ok) return propagate(parent);
  const id = `cat_${randomUUID()}`;
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { ...built.value, id, parent_id: parent.value, created_at: now, updated_at: now };
  const columns = Object.keys(payload);
  try {
    db.run(`INSERT INTO catalogue_categories (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(payload) as any[]);
  } catch (error: any) {
    return translate(error, String(payload.slug));
  }
  const created = getCategory(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'CREATE', resourceType: 'category', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>, context: options.context ?? null,
  });
  return { ok: true, value: created };
}

export function updateCategory(db: QatafoDatabase, id: string, rawInput: unknown, options: CategoryMutationOptions): CategoryResult<CatalogueCategoryRow> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getCategory(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Catégorie introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueCategoryInput;
  const built = buildCategoryPayload(db, input, existing);
  if (!built.ok) return propagate(built);
  const payload = built.value;
  if (input.parent_id !== undefined) {
    const parent = assertParent(db, id, input.parent_id);
    if (!parent.ok) return propagate(parent);
    payload.parent_id = parent.value;
  }
  payload.updated_at = new Date().toISOString();
  const assignments = Object.keys(payload).map((column) => `${column}=?`);
  try {
    db.run(`UPDATE catalogue_categories SET ${assignments.join(',')} WHERE id=?`, ...Object.values(payload) as any[], id);
  } catch (error: any) {
    return translate(error, String(payload.slug ?? existing.slug));
  }
  const updated = getCategory(db, id)!;
  const statusChanged = payload.status !== undefined && payload.status !== existing.status;
  auditCatalogue(db, {
    actor: options.actor, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE', resourceType: 'category', resourceId: id,
    before: existing as unknown as Record<string, unknown>, after: updated as unknown as Record<string, unknown>,
    context: options.context ?? null,
  });
  return { ok: true, value: updated };
}

/** Archiving keeps the subtree: children stay attached and readable, they just stop being pickable. */
export function archiveCategory(db: QatafoDatabase, id: string, options: CategoryMutationOptions): CategoryResult<{ id: string; status: string }> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getCategory(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Catégorie introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const bound = Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE category_id=?', id)?.n ?? 0);
  if (bound > 0) {
    return fail(CATALOGUE_ERRORS.CONFLICT, `${bound} produit(s) sont rattachés à cette catégorie; réaffectez-les d’abord.`, [{ field: 'id', reason: 'STILL_USED' }]);
  }
  db.run("UPDATE catalogue_categories SET status='ARCHIVED', updated_at=? WHERE id=?", new Date().toISOString(), id);
  auditCatalogue(db, {
    actor: options.actor, action: 'ARCHIVE', resourceType: 'category', resourceId: id,
    before: { status: existing.status }, after: { status: 'ARCHIVED' }, context: options.context ?? null,
  });
  return { ok: true, value: { id, status: 'ARCHIVED' } };
}

function translate(error: any, slug: string): CategoryResult<never> {
  const text = String(error?.message || error || '');
  if (/UNIQUE.*catalogue_categories\.slug|catalogue_categories.slug/i.test(text)) {
    return fail(CATALOGUE_ERRORS.SLUG_TAKEN, `Le slug « ${slug} » est déjà utilisé.`, [{ field: 'slug', reason: 'TAKEN' }]);
  }
  if (/CHECK/i.test(text)) {
    return fail(CATALOGUE_ERRORS.STATUS_INVALID, 'Valeur refusée par une contrainte de la base.', [{ field: 'status', reason: 'CHECK' }]);
  }
  return fail(CATALOGUE_ERRORS.CONFLICT, text.slice(0, 300) || 'Conflit d’enregistrement.');
}
