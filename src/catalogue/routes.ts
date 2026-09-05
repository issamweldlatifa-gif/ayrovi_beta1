/**
 * AYROVI Catalogue (P2.1) — back-office API.
 *
 * Mounted at `/api/admin/catalogue` inside the existing admin router, so it inherits the
 * session cookie (`Path=/api/admin`) and nothing here is reachable anonymously. Every
 * route composes two existing guards instead of a new one: `requireAdmin(db)` for the
 * session + the CSRF rule on writes, then the ERP permission engine for
 * `catalog:<action>` on the right resource (refusal audited, see erp-core/permissions).
 *
 * Existing routes are untouched: `/api/admin/products` and `/api/admin/brands` (the
 * generic resource loop) keep serving the current screens exactly as before. This router
 * is the new canonical surface, not a replacement of the old one — retiring the old one is
 * a separate, later decision.
 *
 * No route here can hard-delete a product, a variant, a category or a brand: `DELETE`
 * archives. Media references are the only rows that truly disappear, and they never touch
 * the file itself.
 */
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { can } from '../erp-core/permissions';
import { bootstrapCatalogue } from './bootstrap';
import { requireCatalogue } from './permissions';
import { archiveProduct, createProduct, getProduct, listProducts, updateProduct } from './products';
import { archiveVariant, createVariant, getVariant, listVariants, updateVariant } from './variants';
import { archiveCategory, categoryTree, createCategory, getCategory, listCategories, updateCategory } from './categories';
import { BRAND_CATEGORIES, createBrand, getBrand, listBrands, updateBrand } from './brands';
import { addMedia, listMedia, makeMediaPrimary, removeMedia } from './media';
import { createAttribute, listAttributes } from './attributes';
import { catalogueContext } from './audit';
import {
  CATALOGUE_ERRORS, CATALOGUE_RESOURCES, MEDIA_TYPES, PRODUCT_STATUSES, VARIANT_STATUSES, CATALOGUE_STATUSES,
} from './types';

type CatalogueRequest = Request & { admin?: AdminIdentity };

/** code → HTTP status. A controlled answer for every failure, never a 500. */
const STATUS_BY_CODE: Record<string, number> = {
  [CATALOGUE_ERRORS.SKU_TAKEN]: 409,
  [CATALOGUE_ERRORS.SLUG_TAKEN]: 409,
  [CATALOGUE_ERRORS.CODE_TAKEN]: 409,
  [CATALOGUE_ERRORS.CONFLICT]: 409,
  [CATALOGUE_ERRORS.PERMISSION_DENIED]: 403,
  [CATALOGUE_ERRORS.NOT_FOUND]: 404,
  [CATALOGUE_ERRORS.PRODUCT_NOT_FOUND]: 404,
  [CATALOGUE_ERRORS.CATEGORY_NOT_FOUND]: 404,
  [CATALOGUE_ERRORS.BRAND_NOT_FOUND]: 404,
};

function answer(res: Response, result: { ok: boolean; value?: unknown; code?: string; message?: string; details?: unknown }) {
  if (result.ok) return res.json({ success: true, data: result.value ?? null });
  const code = result.code || CATALOGUE_ERRORS.VALIDATION;
  const status = STATUS_BY_CODE[code] ?? 400;
  return res.status(status).json({
    success: false, code, error: result.message || 'Requête refusée par le catalogue.',
    ...(Array.isArray(result.details) && result.details.length ? { details: result.details } : {}),
  });
}

export function createCatalogueRouter(db: QatafoDatabase): Router {
  const router = Router();

  // Same boot-on-demand convention as the ERP Core router: whoever mounts the module
  // gets the schema, the numbering rows and the permission seed, exactly once, and a
  // failure here must never take the back office down (the constructor already tried).
  let booted = false;
  router.use((req, _res, next) => {
    if (booted || req.path === '/health') return next();
    booted = true;
    try { bootstrapCatalogue(db); } catch { /* schema already ensured at boot */ }
    return next();
  });
  router.get('/health', (_req, res) => {
    const report = (() => { try { return bootstrapCatalogue(db); } catch (error: any) { return { error: String(error?.message || error) }; } })();
    res.json({ success: true, data: { module: 'catalog', ...report } });
  });

  const actorOf = (req: CatalogueRequest) => ({
    id: req.admin?.id ?? null,
    name: req.admin?.name ?? null,
    ipAddress: req.ip || null,
  });

  /** `approve` is a second, explicit permission: publishing is not the same act as editing. */
  const mayPublish = (req: CatalogueRequest) => {
    const role = req.admin?.role ?? null;
    return can(db, role, { module: 'catalog', action: 'approve', resourceType: 'product', employee: req.erpEmployee ?? null }).allowed;
  };

  // ---------- Products ----------
  router.get('/products', ...requireCatalogue(db, 'read', 'product'), (req, res) => {
    const data = listProducts(db, {
      search: req.query.search, status: req.query.status, brandId: req.query.brand_id,
      categoryId: req.query.category_id, includeArchived: req.query.include_archived,
      page: req.query.page, pageSize: req.query.page_size,
    });
    res.json({ success: true, ...data });
  });

  router.get('/products/:id', ...requireCatalogue(db, 'read', 'product'), (req, res) => {
    const product = getProduct(db, req.params.id);
    if (!product) return answer(res, { ok: false, code: CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, message: 'Produit introuvable.' });
    res.json({
      success: true,
      data: {
        ...product,
        variants: listVariants(db, product.id),
        media: listMedia(db, product.id),
        category: product.category_id ? getCategory(db, product.category_id) : null,
        brand: product.brand_id ? getBrand(db, product.brand_id) : null,
      },
    });
  });

  router.post('/products', ...requireCatalogue(db, 'create', 'product'), (req: CatalogueRequest, res) => {
    const result = createProduct(db, req.body, {
      actor: actorOf(req), context: catalogueContext(db, req), mayPublish: mayPublish(req),
    });
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  router.put('/products/:id', ...requireCatalogue(db, 'update', 'product'), (req: CatalogueRequest, res) => {
    const result = updateProduct(db, req.params.id, req.body, {
      actor: actorOf(req), context: catalogueContext(db, req), mayPublish: mayPublish(req),
    });
    return answer(res, result);
  });

  /** Archive, never delete (see products.ts). */
  router.delete('/products/:id', ...requireCatalogue(db, 'delete', 'product'), (req: CatalogueRequest, res) => {
    const result = archiveProduct(db, req.params.id, {
      actor: actorOf(req), context: catalogueContext(db, req), reason: typeof req.query.reason === 'string' ? req.query.reason : undefined,
    });
    return answer(res, result);
  });

  // ---------- Variants (the SKU lives here) ----------
  router.get('/products/:id/variants', ...requireCatalogue(db, 'read', 'variant'), (req, res) => {
    const product = getProduct(db, req.params.id);
    if (!product) return answer(res, { ok: false, code: CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, message: 'Produit introuvable.' });
    res.json({ success: true, data: listVariants(db, product.id) });
  });

  router.post('/products/:id/variants', ...requireCatalogue(db, 'create', 'variant'), (req: CatalogueRequest, res) => {
    const result = createVariant(db, req.params.id, req.body, { actor: actorOf(req), context: catalogueContext(db, req) });
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  router.get('/variants/:id', ...requireCatalogue(db, 'read', 'variant'), (req, res) => {
    const variant = getVariant(db, req.params.id);
    if (!variant) return answer(res, { ok: false, code: CATALOGUE_ERRORS.NOT_FOUND, message: 'Variante introuvable.' });
    res.json({ success: true, data: variant });
  });

  router.put('/variants/:id', ...requireCatalogue(db, 'update', 'variant'), (req: CatalogueRequest, res) => {
    return answer(res, updateVariant(db, req.params.id, req.body, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  router.delete('/variants/:id', ...requireCatalogue(db, 'delete', 'variant'), (req: CatalogueRequest, res) => {
    return answer(res, archiveVariant(db, req.params.id, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  // ---------- Media ----------
  router.get('/products/:id/media', ...requireCatalogue(db, 'read', 'product_media'), (req, res) => {
    const product = getProduct(db, req.params.id);
    if (!product) return answer(res, { ok: false, code: CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, message: 'Produit introuvable.' });
    res.json({ success: true, data: listMedia(db, product.id) });
  });

  router.post('/products/:id/media', ...requireCatalogue(db, 'create', 'product_media'), (req: CatalogueRequest, res) => {
    const result = addMedia(db, req.params.id, req.body, { actor: actorOf(req), context: catalogueContext(db, req) });
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  router.put('/media/:id/primary', ...requireCatalogue(db, 'update', 'product_media'), (req: CatalogueRequest, res) => {
    return answer(res, makeMediaPrimary(db, req.params.id, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  router.delete('/media/:id', ...requireCatalogue(db, 'delete', 'product_media'), (req: CatalogueRequest, res) => {
    return answer(res, removeMedia(db, req.params.id, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  // ---------- Categories ----------
  router.get('/categories', ...requireCatalogue(db, 'read', 'category'), (req, res) => {
    const tree = categoryTree(db);
    if (String(req.query.shape ?? '').toLowerCase() === 'tree') {
      return res.json({ success: true, data: { flat: tree.flat, tree: tree.tree } });
    }
    res.json({ success: true, data: listCategories(db, { status: req.query.status, includeArchived: req.query.include_archived !== undefined }) });
  });

  router.get('/categories/:id', ...requireCatalogue(db, 'read', 'category'), (req, res) => {
    const category = getCategory(db, req.params.id);
    if (!category) return answer(res, { ok: false, code: CATALOGUE_ERRORS.CATEGORY_NOT_FOUND, message: 'Catégorie introuvable.' });
    res.json({ success: true, data: category });
  });

  router.post('/categories', ...requireCatalogue(db, 'create', 'category'), (req: CatalogueRequest, res) => {
    const result = createCategory(db, req.body, { actor: actorOf(req), context: catalogueContext(db, req) });
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  router.put('/categories/:id', ...requireCatalogue(db, 'update', 'category'), (req: CatalogueRequest, res) => {
    return answer(res, updateCategory(db, req.params.id, req.body, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  router.delete('/categories/:id', ...requireCatalogue(db, 'delete', 'category'), (req: CatalogueRequest, res) => {
    return answer(res, archiveCategory(db, req.params.id, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  // ---------- Brands ----------
  router.get('/brands', ...requireCatalogue(db, 'read', 'brand'), (req, res) => {
    const data = listBrands(db, { search: req.query.search, status: req.query.status, page: req.query.page, pageSize: req.query.page_size });
    res.json({ success: true, ...data });
  });

  router.get('/brands/:id', ...requireCatalogue(db, 'read', 'brand'), (req, res) => {
    const brand = getBrand(db, req.params.id);
    if (!brand) return answer(res, { ok: false, code: CATALOGUE_ERRORS.BRAND_NOT_FOUND, message: 'Marque introuvable.' });
    res.json({ success: true, data: brand });
  });

  router.post('/brands', ...requireCatalogue(db, 'create', 'brand'), (req: CatalogueRequest, res) => {
    const result = createBrand(db, req.body, { actor: actorOf(req), context: catalogueContext(db, req) });
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  router.put('/brands/:id', ...requireCatalogue(db, 'update', 'brand'), (req: CatalogueRequest, res) => {
    return answer(res, updateBrand(db, req.params.id, req.body, { actor: actorOf(req), context: catalogueContext(db, req) }));
  });

  // ---------- Attributes (declared, minimal, extensible) ----------
  router.get('/attributes', ...requireCatalogue(db, 'read', 'product_attribute'), (req, res) => {
    const appliesTo = String(req.query.applies_to ?? '');
    res.json({ success: true, data: listAttributes(db, appliesTo === 'product' || appliesTo === 'variant' ? appliesTo : undefined) });
  });

  router.post('/attributes', ...requireCatalogue(db, 'create', 'product_attribute'), (req: CatalogueRequest, res) => {
    const result = createAttribute(db, req.body, actorOf(req));
    if (!result.ok) return answer(res, result);
    res.status(201).json({ success: true, data: result.value });
  });

  // ---------- Vocabulary for the UI (no invented statuses) ----------
  router.get('/meta', ...requireCatalogue(db, 'read', 'product'), (_req, res) => {
    res.json({
      success: true,
      data: {
        productStatuses: [...PRODUCT_STATUSES],
        catalogueStatuses: [...CATALOGUE_STATUSES],
        variantStatuses: [...VARIANT_STATUSES],
        mediaTypes: [...MEDIA_TYPES],
        brandCategories: [...BRAND_CATEGORIES],
        resources: [...CATALOGUE_RESOURCES],
        policy: {
          media: 'référence publique uniquement (https ou /uploads non privé) — aucune écriture de fichier dans cette phase',
          deletion: 'archivage: aucun produit, variante, catégorie ou marque n’est supprimé physiquement',
          pricing: 'les prix restent calculés par le moteur de tarification existant',
        },
      },
    });
  });

  return router;
}
