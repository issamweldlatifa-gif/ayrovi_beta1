/** Storefront read boundary. Prices and public response mapping remain with their existing owners. */
import type { QatafoDatabase } from '../db/database';
type ProductReader = Pick<QatafoDatabase, 'all'>;
export interface PublicProductRow {
  id: string;
  updated_at: string;
  arrival_ids: string | null;
  [column: string]: unknown;
}
export interface PublicProductRead {
  /** Home historically includes active CONTENT products; catalog does not. Preserve that distinction. */
  scope: 'catalog' | 'home';
  limit: number;
  arrivalId?: string;
}
export function publicProductQuery(options: PublicProductRead): { sql: string; params: unknown[] } {
  if (options.scope !== 'catalog' && options.scope !== 'home') throw new RangeError('Invalid product read scope');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) throw new RangeError('Invalid product read limit');
  const params: unknown[] = [];
  const visibility = options.scope === 'catalog' ? " AND p.visibility='CATALOG'" : '';
  const arrival = options.arrivalId
    ? ' AND EXISTS (SELECT 1 FROM product_arrivals f WHERE f.product_id=p.id AND f.arrival_id=?)' : '';
  if (options.arrivalId) params.push(options.arrivalId);
  params.push(options.limit);
  // Indexed ordering selects the page, with arrival aggregation only for returned rows.
  // id ASC makes the old GROUP BY's observed tie order explicit and stable.
  return { sql: `SELECT p.*,
    (SELECT GROUP_CONCAT(pa.arrival_id) FROM product_arrivals pa WHERE pa.product_id=p.id) AS arrival_ids
    FROM products p WHERE p.status='ACTIVE'${visibility}${arrival}
    ORDER BY p.updated_at DESC,p.id ASC LIMIT ?`, params };
}
export function readPublicProducts(db: ProductReader, options: PublicProductRead): PublicProductRow[] {
  const { sql, params } = publicProductQuery(options);
  return db.all<PublicProductRow>(sql, ...params);
}
