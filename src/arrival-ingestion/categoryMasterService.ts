import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import type { CategoryMasterEntry, CategoryMasterSource, CategoryValidation } from './types';

/**
 * Category Master — the official AYROVI product taxonomy used by the Arrival
 * CRM classifier.
 *
 * Design rules:
 * - The taxonomy is DATA, never code. No category list is hardcoded anywhere in
 *   the application; Administration imports/manages it from the official AYROVI
 *   Warehouse Core taxonomy (`importMaster`) or edits single entries.
 * - An empty master is a legitimate state: it simply means nothing can be
 *   classified yet, so every line stays in review instead of receiving an
 *   invented category.
 * - The classifier and the manual picker are validated by the SAME
 *   `validate()` used before a Card is persisted/sent, so "exists + active +
 *   parent/subcategory coherent" is enforced once, server-side, for both paths.
 */

const CODE_MAX = 80;
const NAME_MAX = 160;

/** Codes are matched case-insensitively; the master keeps the canonical form. */
export function normalizeCategoryCode(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CODE_MAX);
}

function cleanName(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function mapCategory(row: any): CategoryMasterEntry {
  return {
    id: row.id,
    code: row.code,
    parentCode: row.parent_code || null,
    name: row.name,
    active: Number(row.active) === 1,
    source: row.source,
    displayOrder: Number(row.display_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CategoryMasterService {
  constructor(private readonly db: QatafoDatabase) {}

  /** True when at least one ACTIVE category exists — i.e. classification is possible. */
  isAvailable(): boolean {
    const row = this.db.get<any>('SELECT COUNT(*) n FROM crm_categories WHERE active=1');
    return Number(row?.n || 0) > 0;
  }

  /** Every entry (active and inactive) — Administration management view. */
  list(includeInactive = true): CategoryMasterEntry[] {
    const sql = includeInactive
      ? 'SELECT * FROM crm_categories ORDER BY display_order, code'
      : 'SELECT * FROM crm_categories WHERE active=1 ORDER BY display_order, code';
    return this.db.all<any>(sql).map(mapCategory);
  }

  /** Only ACTIVE entries, in parent -> child order. This is what the AI sees. */
  listActive(): CategoryMasterEntry[] {
    return this.db.all<any>(`SELECT * FROM crm_categories WHERE active=1
      ORDER BY COALESCE(parent_code, code), display_order, code`).map(mapCategory);
  }

  find(code: string): CategoryMasterEntry | null {
    const wanted = normalizeCategoryCode(code);
    if (!wanted) return null;
    const row = this.db.get<any>('SELECT * FROM crm_categories WHERE code=?', wanted)
      || this.db.get<any>('SELECT * FROM crm_categories WHERE UPPER(code)=UPPER(?) LIMIT 1', wanted);
    return row ? mapCategory(row) : null;
  }

  /**
   * Deterministic validation of a (category, subcategory) pair against the
   * master. Used by BOTH the AI path and the manual path, and again before a
   * Card is approved/sent. The AI is never trusted: whatever it returns goes
   * through here.
   *
   * Accepted shapes:
   *   - a top-level category alone            -> (CATEGORY, null)
   *   - a category + one of its subcategories -> (CATEGORY, SUB) where
   *     SUB.parent_code === CATEGORY.code
   *   - an active entry that has a parent, used on its own, is accepted as the
   *     category itself (it exists and is active in the official master).
   */
  validate(categoryCode: unknown, subcategoryCode: unknown = null): CategoryValidation {
    const wanted = normalizeCategoryCode(categoryCode);
    const wantedSub = normalizeCategoryCode(subcategoryCode);
    if (!wanted) {
      return { valid: false, categoryCode: null, subcategoryCode: null, reasons: ['CATEGORY_REQUIRED'] };
    }
    const category = this.find(wanted);
    if (!category) {
      return { valid: false, categoryCode: null, subcategoryCode: wantedSub || null, reasons: ['CATEGORY_UNKNOWN'] };
    }
    if (!category.active) {
      return { valid: false, categoryCode: category.code, subcategoryCode: wantedSub || null, reasons: ['CATEGORY_INACTIVE'] };
    }
    if (!wantedSub) {
      return { valid: true, categoryCode: category.code, subcategoryCode: null, reasons: [] };
    }
    const sub = this.find(wantedSub);
    if (!sub) {
      return { valid: false, categoryCode: category.code, subcategoryCode: wantedSub, reasons: ['SUBCATEGORY_UNKNOWN'] };
    }
    if (!sub.active) {
      return { valid: false, categoryCode: category.code, subcategoryCode: sub.code, reasons: ['SUBCATEGORY_INACTIVE'] };
    }
    if (normalizeCategoryCode(sub.parentCode) !== normalizeCategoryCode(category.code)) {
      return { valid: false, categoryCode: category.code, subcategoryCode: sub.code, reasons: ['SUBCATEGORY_PARENT_MISMATCH'] };
    }
    const parent = sub.parentCode ? this.find(sub.parentCode) : null;
    if (sub.parentCode && parent && !parent.active) {
      return { valid: false, categoryCode: category.code, subcategoryCode: sub.code, reasons: ['SUBCATEGORY_PARENT_INACTIVE'] };
    }
    return { valid: true, categoryCode: category.code, subcategoryCode: sub.code, reasons: [] };
  }

  /**
   * Compact, prompt-safe rendering of the ACTIVE master. Inactive entries are
   * deliberately excluded so the model cannot even propose them.
   */
  aiSnapshot(maxEntries = 600): string {
    const rows = this.listActive().slice(0, maxEntries);
    if (!rows.length) return 'CATEGORY MASTER: (empty)';
    return [
      'CATEGORY MASTER (code | name | parent; "—" means top-level):',
      ...rows.map((row) => `${row.code} | ${row.name} | ${row.parentCode || '—'}`),
    ].join('\n');
  }

  create(input: Record<string, unknown>, actor: AdminAuditActor): CategoryMasterEntry {
    const code = normalizeCategoryCode(input.code);
    const name = cleanName(input.name);
    if (!code) throw new ArrivalIngestionError('CATEGORY_CODE_REQUIRED', 'Le code de catégorie est obligatoire.', 422);
    if (name.length < 2) throw new ArrivalIngestionError('CATEGORY_NAME_INVALID', 'Le nom de catégorie est obligatoire.', 422);
    if (!/^[A-Za-z0-9_\-./&+ ]+$/.test(code)) {
      throw new ArrivalIngestionError('CATEGORY_CODE_FORMAT', 'Le code ne peut contenir que lettres, chiffres, _ - . / & + et espaces.', 422);
    }
    const parentCode = normalizeCategoryCode(input.parentCode) || null;
    if (parentCode) {
      const parent = this.find(parentCode);
      if (!parent) throw new ArrivalIngestionError('CATEGORY_PARENT_UNKNOWN', 'La catégorie parente n’existe pas dans le Category Master.', 422);
      if (normalizeCategoryCode(parent.code) === code) {
        throw new ArrivalIngestionError('CATEGORY_PARENT_SELF', 'Une catégorie ne peut pas être son propre parent.', 422);
      }
    }
    const existing = this.find(code);
    if (existing) throw new ArrivalIngestionError('CATEGORY_CODE_EXISTS', 'Ce code existe déjà dans le Category Master.', 409);
    const id = `crm_category_${randomUUID()}`;
    const now = new Date().toISOString();
    const active = input.active === undefined ? true : Boolean(input.active);
    const source = this.resolveSource(input.source);
    const displayOrder = Number(input.displayOrder) || 0;
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_categories (id,code,parent_code,name,active,source,display_order,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, code, parentCode ? this.find(parentCode)!.code : null, name, active ? 1 : 0, source, displayOrder, actor.id, now, now);
      recordAdminAudit(this.db, actor, 'CRM_CATEGORY_CREATED', 'CRM_ARRIVALS', id, null, {
        code, parentCode, name, active, source,
      });
    });
    return this.find(code)!;
  }

  update(code: string, input: Record<string, unknown>, actor: AdminAuditActor): CategoryMasterEntry {
    const entry = this.find(code);
    if (!entry) throw new ArrivalIngestionError('CATEGORY_NOT_FOUND', 'Catégorie introuvable dans le Category Master.', 404);
    const name = input.name === undefined ? entry.name : cleanName(input.name);
    if (name.length < 2) throw new ArrivalIngestionError('CATEGORY_NAME_INVALID', 'Le nom de catégorie est obligatoire.', 422);
    const active = input.active === undefined ? entry.active : Boolean(input.active);
    const displayOrder = input.displayOrder === undefined ? entry.displayOrder : Number(input.displayOrder) || 0;
    let parentCode = entry.parentCode;
    if (Object.prototype.hasOwnProperty.call(input, 'parentCode')) {
      const wanted = normalizeCategoryCode(input.parentCode) || null;
      if (wanted) {
        const parent = this.find(wanted);
        if (!parent) throw new ArrivalIngestionError('CATEGORY_PARENT_UNKNOWN', 'La catégorie parente n’existe pas dans le Category Master.', 422);
        if (normalizeCategoryCode(parent.code) === normalizeCategoryCode(entry.code)) {
          throw new ArrivalIngestionError('CATEGORY_PARENT_SELF', 'Une catégorie ne peut pas être son propre parent.', 422);
        }
        // A parent cannot become a child of one of its own descendants.
        const descendant = this.isDescendant(wanted, entry.code);
        if (descendant) {
          throw new ArrivalIngestionError('CATEGORY_PARENT_CYCLE', 'Ce rattachement créerait une boucle parent/enfant.', 422);
        }
        parentCode = parent.code;
      } else {
        parentCode = null;
      }
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE crm_categories SET name=?,active=?,parent_code=?,display_order=?,updated_at=? WHERE id=?',
        name, active ? 1 : 0, parentCode, displayOrder, now, entry.id);
      recordAdminAudit(this.db, actor, 'CRM_CATEGORY_UPDATED', 'CRM_ARRIVALS', entry.id,
        { name: entry.name, active: entry.active, parentCode: entry.parentCode },
        { name, active, parentCode });
    });
    return this.find(entry.code)!;
  }

  /**
   * Bulk upsert of the official master (Administration import). Idempotent on
   * `code`, so re-importing the same taxonomy never creates duplicates and
   * never loses the categories already referenced by existing Cards.
   */
  importMaster(entries: unknown, actor: AdminAuditActor): { imported: number; skipped: number; updated: number } {
    if (!Array.isArray(entries)) {
      throw new ArrivalIngestionError('CATEGORY_IMPORT_INVALID', 'Le Category Master doit être fourni sous forme de liste.', 422);
    }
    if (entries.length > 2000) {
      throw new ArrivalIngestionError('CATEGORY_IMPORT_TOO_LARGE', 'Import limité à 2000 catégories.', 422);
    }
    const now = new Date().toISOString();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    this.db.transaction(() => {
      // Two passes: parents first so a child never points at a missing parent.
      for (const pass of [0, 1] as const) {
        for (const raw of entries) {
          const item = (raw || {}) as Record<string, unknown>;
          const code = normalizeCategoryCode(item.code);
          const name = cleanName(item.name ?? item.label);
          const parentCode = normalizeCategoryCode(item.parentCode ?? item.parent_code ?? item.parent) || null;
          if (!code || name.length < 2) { skipped += 1; continue; }
          const hasParent = Boolean(parentCode);
          if (pass === 0 && hasParent) continue;
          if (pass === 1 && !hasParent) continue;
          if (hasParent && !this.find(parentCode!)) { skipped += 1; continue; }
          const active = item.active === undefined ? true : Boolean(item.active);
          const source = this.resolveSource(item.source, 'IMPORT');
          const displayOrder = Number(item.displayOrder ?? item.display_order) || 0;
          const existing = this.find(code);
          if (existing) {
            updated += 1;
            this.db.run('UPDATE crm_categories SET name=?,parent_code=?,active=?,source=?,display_order=?,updated_at=? WHERE id=?',
              name, hasParent ? this.find(parentCode!)!.code : null, active ? 1 : 0, source, displayOrder, now, existing.id);
            continue;
          }
          imported += 1;
          this.db.run(`INSERT INTO crm_categories (id,code,parent_code,name,active,source,display_order,created_by,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
          `crm_category_${randomUUID()}`, code, hasParent ? this.find(parentCode!)!.code : null,
          name, active ? 1 : 0, source, displayOrder, actor.id, now, now);
        }
      }
      recordAdminAudit(this.db, actor, 'CRM_CATEGORY_MASTER_IMPORTED', 'CRM_ARRIVALS', null, null, {
        submitted: entries.length, imported, updated, skipped,
      });
    });
    return { imported, skipped, updated };
  }

  private resolveSource(value: unknown, fallback: CategoryMasterSource = 'MANUAL'): CategoryMasterSource {
    const raw = String(value ?? '').toUpperCase();
    return raw === 'IMPORT' || raw === 'WAREHOUSE_CORE' || raw === 'MANUAL' ? (raw as CategoryMasterSource) : fallback;
  }

  private isDescendant(candidateParent: string, entryCode: string): boolean {
    let cursor: string | null = normalizeCategoryCode(candidateParent);
    let guard = 0;
    while (cursor && guard < 50) {
      if (normalizeCategoryCode(cursor) === normalizeCategoryCode(entryCode)) return true;
      const row = this.find(cursor);
      cursor = row?.parentCode ? normalizeCategoryCode(row.parentCode) : null;
      guard += 1;
    }
    return false;
  }
}
