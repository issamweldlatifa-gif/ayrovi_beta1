import { foldCatalogSearch, type CatalogSearchFacets, type CatalogSearchFilters } from '../../shared/catalogSearch';
import type { QatafoDatabase } from '../db/database';
import type { PublicProductRow } from './publicProducts';

type Reader = Pick<QatafoDatabase, 'all' | 'get'>;
interface Search extends CatalogSearchFilters { q: string; arrivalId?: string; offset: number; suggest: boolean }

export function parsePublicCatalogSearch(input: Record<string, unknown>): Search | null {
  for (const [key, max] of Object.entries({ q: 100, arrivalId: 120, categoryId: 120, brandId: 120, size: 120, min: 14, max: 14, offset: 10, available: 1, suggest: 1 })) {
    const v = input[key];
    if (v !== undefined && (typeof v !== 'string' || v.length > max)) return null;
  }
  const string = (key: string) => typeof input[key] === 'string' ? (input[key] as string).trim() : '';
  const price = (key: string) => string(key) ? (/^\d{1,9}(?:\.\d{1,3})?$/.test(string(key)) ? Number(string(key)) : NaN) : undefined;
  const min = price('min'), max = price('max');
  const offset = string('offset') ? (/^\d+$/.test(string('offset')) ? Number(string('offset')) : NaN) : 0;
  if (Number.isNaN(min) || Number.isNaN(max) || (min !== undefined && max !== undefined && min > max)
    || !Number.isSafeInteger(offset) || offset < 0 || !['', '1'].includes(string('available')) || !['', '1'].includes(string('suggest'))) return null;
  return { q: string('q'), arrivalId: string('arrivalId') || undefined, categoryId: string('categoryId') || undefined,
    brandId: string('brandId') || undefined, size: string('size') || undefined, min, max, offset, available: string('available') === '1', suggest: string('suggest') === '1' };
}

const PAGE = 30;
const published = "p.status='ACTIVE' AND p.visibility='CATALOG'";
const joins = `LEFT JOIN catalogue_categories c ON c.id=p.category_id AND c.status='ACTIVE'
  LEFT JOIN brands b ON b.id=p.brand_id AND b.active=1`;
const variantStock = `COALESCE((SELECT SUM(s.quantity) FROM inventory_stock_items s WHERE s.product_id=p.id AND s.variant_id=v.id AND s.status='ACTIVE'),0)>0`;

// A tracked row must match an active variant when the product has active variants.
// This is a discovery filter, not the decision to let an untracked item be ordered.
const confirmedStock = `UPPER(TRIM(COALESCE(p.stock_status,''))) NOT IN ('OUT_OF_STOCK','SOLDOUT','SOLD_OUT')
  AND p.final_price>0 AND (
    (NOT EXISTS(SELECT 1 FROM catalogue_variants v WHERE v.product_id=p.id AND v.status='ACTIVE')
      AND EXISTS(SELECT 1 FROM inventory_stock_items s WHERE s.product_id=p.id AND s.status='ACTIVE' AND s.variant_id IS NULL AND s.quantity>0))
    OR EXISTS(SELECT 1 FROM catalogue_variants v WHERE v.product_id=p.id AND v.status='ACTIVE' AND ${variantStock})
  )`;

/** Only reports the public search flag; it does not expose inventory counts to catalogue readers. */
export function publicCatalogStockConfirmed(db: Reader, id: string): boolean {
  return Boolean(db.get(`SELECT 1 FROM products p WHERE p.id=? AND ${published} AND ${confirmedStock}`, id));
}

/** Facets use the matching published catalogue, never just the products on page one. */
export function readCatalogSearch(db: Reader, input: Search) {
  const base = [published];
  const baseParams: unknown[] = [];
  if (input.arrivalId) {
    base.push('EXISTS(SELECT 1 FROM product_arrivals a WHERE a.product_id=p.id AND a.arrival_id=?)');
    baseParams.push(input.arrivalId);
  }
  const terms = foldCatalogSearch(input.q).split(/\s+/).filter(Boolean);
  for (const term of terms) {
    base.push(`instr(catalog_search_fold(p.name || ' ' || COALESCE(b.name,p.brand_name,'') || ' ' || COALESCE(c.name,p.category,'')),?)>0`);
    baseParams.push(term);
  }
  const where = [...base], params = [...baseParams];
  if (input.categoryId) { where.push('c.id=?'); params.push(input.categoryId); }
  if (input.brandId) { where.push('b.id=?'); params.push(input.brandId); }
  if (input.size) {
    where.push(`EXISTS(SELECT 1 FROM catalogue_variants v WHERE v.product_id=p.id AND v.status='ACTIVE' AND trim(v.size)=? COLLATE NOCASE${input.available ? ` AND ${variantStock}` : ''})`);
    params.push(input.size);
  }
  if (input.min !== undefined || input.max !== undefined) where.push('p.final_price>0');
  if (input.min !== undefined) { where.push('p.final_price>=?'); params.push(input.min); }
  if (input.max !== undefined) { where.push('p.final_price<=?'); params.push(input.max); }
  if (input.available) where.push(confirmedStock);
  const source = `FROM products p ${joins} WHERE ${where.join(' AND ')}`;
  const pageSize = input.suggest ? 5 : PAGE;
  const items = db.all<PublicProductRow>(`SELECT p.*,(SELECT GROUP_CONCAT(pa.arrival_id) FROM product_arrivals pa WHERE pa.product_id=p.id) arrival_ids
    ${source} ORDER BY p.updated_at DESC,p.id ASC LIMIT ? OFFSET ?`, ...params, pageSize, input.suggest ? 0 : input.offset);
  if (input.suggest) return { items, total: items.length, nextOffset: null, facets: null };
  const total = db.get<{ count: number }>(`SELECT COUNT(*) count ${source}`, ...params)?.count ?? 0;
  let facets: CatalogSearchFacets | null = null;
  if (!input.offset) {
    // Size choices follow category/brand; category/brand alternatives stay switchable.
    const eligible = `FROM products p ${joins} WHERE ${base.join(' AND ')}`;
    const sizeWhere = [...base];
    const sizeParams = [...baseParams];
    if (input.categoryId) { sizeWhere.push('c.id=?'); sizeParams.push(input.categoryId); }
    if (input.brandId) { sizeWhere.push('b.id=?'); sizeParams.push(input.brandId); }
    facets = {
      categories: db.all<{ id: string; label: string }>(`SELECT DISTINCT c.id id,c.name label ${eligible} AND c.id IS NOT NULL ORDER BY label COLLATE NOCASE,id LIMIT 200`, ...baseParams),
      brands: db.all<{ id: string; label: string }>(`SELECT DISTINCT b.id id,b.name label ${eligible} AND b.id IS NOT NULL ORDER BY label COLLATE NOCASE,id LIMIT 200`, ...baseParams),
      sizes: db.all<{ label: string }>(`SELECT MIN(trim(v.size)) label FROM products p ${joins}
        JOIN catalogue_variants v ON v.product_id=p.id AND v.status='ACTIVE'
        WHERE ${sizeWhere.join(' AND ')} AND trim(v.size)<>'' GROUP BY trim(v.size) COLLATE NOCASE ORDER BY label COLLATE NOCASE LIMIT 200`, ...sizeParams).map(row => row.label),
    };
  }
  return { items, total, nextOffset: input.offset + items.length < total && items.length ? input.offset + items.length : null, facets };
}
