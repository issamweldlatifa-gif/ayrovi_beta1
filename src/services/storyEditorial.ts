import type { QatafoDatabase } from '../db/database';
import { isStoryId, normalizeStoryEditorial, readStoryEditorial } from '../../shared/storyEditorial';
import { effectiveProductIds, invalidLinkedProducts, MAX_CONTENT_PRODUCTS, normalizeContentProductIds, publicProductsForContent, readContentProductIds } from './contentProducts';

/** Public and CRM list projection: neither list needs all article blocks. */
export const STORY_CARD_COLUMNS = ['id', 'media_type', 'media_url', 'title', 'description', 'cta', 'target_url', 'product_id',
  'arrival_id', 'promotion_id', 'publish_at', 'expires_at', 'priority', 'status', 'created_at', 'updated_at', 'content_mode',
  'category', 'secondary_images', 'title_ar', 'description_ar'] as const;

/** Prepare the existing Story row and links for a single transaction. Omissions keep stored content intact. */
export function prepareStoryEditorial(db: QatafoDatabase, raw: Record<string, unknown>, payload: Record<string, any>, existing?: Record<string, any>) {
  let newIds: string[] | undefined;
  if (raw.product_ids !== undefined) {
    if (!Array.isArray(raw.product_ids) || raw.product_ids.length > MAX_CONTENT_PRODUCTS ||
        raw.product_ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Liste de produits Story invalide.');
    newIds = normalizeContentProductIds(raw.product_ids);
    if (invalidLinkedProducts(db, newIds).length) throw new Error('Un des produits Story n’est plus vendable.');
    payload.content_mode = newIds.length ? 'shoppable' : 'normal';
    payload.product_id = newIds[0] ?? null;
  }
  const editorial = raw.editorial === undefined ? readStoryEditorial(existing?.editorial_json) : normalizeStoryEditorial(raw.editorial);
  if (raw.editorial !== undefined) payload.editorial_json = JSON.stringify(editorial);
  if (editorial?.slides.some(slide => slide.productId)) {
    const ids = newIds ?? effectiveProductIds(existing ? readContentProductIds(db, 'story', existing.id) : [],
      payload.product_id === undefined ? existing?.product_id : payload.product_id);
    if ((payload.content_mode ?? existing?.content_mode) !== 'shoppable' || editorial.slides.some(slide => slide.productId && !ids.includes(slide.productId))) {
      throw new Error('Associez à la Story le produit utilisé sur chaque écran Produit.');
    }
  }
  return newIds;
}

/** The gallery's published/active rule also applies to direct viewer and article links. */
export function readPublishedStoryEditorial(db: QatafoDatabase, id: unknown, now: string) {
  const row = isStoryId(id) ? db.get<any>(`SELECT id,title,title_ar,description,description_ar,media_type,media_url,
    publish_at,expires_at,editorial_json,content_mode,product_id FROM stories
    WHERE id=? AND status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?)`, id, now, now) : null;
  if (!row) return null;
  const { editorial_json, content_mode: _mode, product_id: _product, ...story } = row;
  return { ...story, editorial: readStoryEditorial(editorial_json), products: publicProductsForContent(db, 'story', row) };
}
