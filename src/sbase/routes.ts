/**
 * S Base — مسارات البحث (SandBase + قناة الصورة).
 *
 *   GET  /api/sbase/sources → المتاجر + قدراتها الحقيقية + readiness
 *   POST /api/sbase/search  → بحث بكلمة على **المتاجر المختارة**، كل واحد بوحدو،
 *                              بالتوازي، وكل واحد بزمنو/خطئو/كاشو الخاص
 *   POST /api/sbase/image   → بحث بصورة (Google Lens) — نتائج بالمتجر لكل نتيجة
 *   GET  /api/sbase/health  → حالة المفاتيح (بلا أي كشف)
 *
 * الفكرة: شريط بحث واحد، أما **ما فماش محرّك موحّد**: كل متجر يبقى نداء مستقلّ،
 * ونتائجه تتجمّع في مجموعة موسومة باسمه، والفلتر في الشاشة يخفي/يظهر المجموعات.
 * لهذا الزمن والخطأ والكاش معروضين **لكل متجر** موش للكل.
 */
import { Router } from 'express';
import multer from 'multer';

import {
  SBASE_IMAGE_SOURCE,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
  type SbaseSourceDescriptor,
  type SbaseSupports,
} from './descriptors';
import { runSandbaseCall, runSandbaseSearch, sandbaseConfigured, SbaseError } from './client';
import { extractProducts, missingFacets, type SbaseProduct } from './extract';
import { extractDetail, type SbaseDetail } from './detail';
import { normalizeUploadedImage } from '../services/imageValidation';
import { SbaseImageError, sbaseImageReady, searchSbaseByImage } from './image';

export const SBASE_CACHE_TTL_MS = 10 * 60_000;
const SBASE_CACHE_MAX = 200;
/** سقف عدد المتاجر في بحث واحد: كل متجر = نداء مدفوع. */
export const SBASE_MAX_SOURCES_PER_SEARCH = 7;

interface DetailCacheEntry {
  detail: SbaseDetail;
  durationMs: number;
  at: number;
}
const detailCache = new Map<string, DetailCacheEntry>();

interface CacheEntry {
  items: SbaseProduct[];
  durationMs: number;
  async: boolean;
  polls: number;
  runId: string | null;
  missingFields: string[];
  at: number;
}
const cache = new Map<string, CacheEntry>();

export function clearSbaseCache(): void {
  cache.clear();
  detailCache.clear();
}

function remember(key: string, entry: CacheEntry): void {
  if (entry.items.length === 0) return;
  if (cache.size >= SBASE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, entry);
}

export interface SbaseGroupSource {
  id: string;
  label: string;
  vendor: string;
  supports: SbaseSupports;
}

export interface SbaseGroup {
  source: SbaseGroupSource;
  status: 'ok' | 'empty' | 'error';
  items: SbaseProduct[];
  count: number;
  /** زمن هذا المتجر وحده (ms) — بما فيه polling. */
  durationMs: number;
  cached: boolean;
  async: boolean;
  /** كود الخطأ عندما `status==='error'` — ما نبدّلوش برسالة عامة. */
  error: { code: string; message: string } | null;
  costUsd: number | null;
  /** Alibaba : facturation par résultat, pas par appel — on l'affiche. */
  billedPerResult: boolean;
}

export interface SbaseSearchPayload {
  query: string;
  /** الزمن الكلي (أبطأ متجر) — موش مجموع الأزمنة. */
  totalMs: number;
  groups: SbaseGroup[];
  count: number;
  missingFields: string[];
  fetchedAt: string;
}

async function searchOneSource(
  source: SbaseSourceDescriptor,
  query: string,
): Promise<SbaseGroup> {
  const base: SbaseGroupSource = {
    id: source.id,
    label: source.label,
    vendor: source.vendor,
    supports: source.supports,
  };
  const cacheKey = `${source.id}|${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
    return {
      source: base, status: hit.items.length > 0 ? 'ok' : 'empty', items: hit.items, count: hit.items.length,
      durationMs: hit.durationMs, cached: true, async: hit.async, error: null, costUsd: source.costUsd,
      billedPerResult: source.billedPerResult,
    };
  }

  try {
    const run = await runSandbaseSearch(source, query, source.defaultMarket);
    const items = extractProducts(run.data, { arrays: source.arrays, limit: 20 });
    const missingFields = items.length > 0 ? missingFacets(items) : [];
    remember(cacheKey, {
      items, durationMs: run.durationMs, async: run.async, polls: run.polls,
      runId: run.runId, missingFields, at: Date.now(),
    });
    return {
      source: base,
      status: items.length > 0 ? 'ok' : 'empty',
      items,
      count: items.length,
      durationMs: run.durationMs,
      cached: false,
      async: run.async,
      error: null,
      costUsd: source.costUsd,
      billedPerResult: source.billedPerResult,
    };
  } catch (error) {
    const failure = error instanceof SbaseError
      ? error
      : new SbaseError('SANDBASE_UNKNOWN', 'خطأ غير متوقّع أثناء الاتصال بالمصدر.', 502);
    return {
      source: base,
      status: 'error',
      items: [],
      count: 0,
      durationMs: 0,
      cached: false,
      async: source.async,
      error: { code: failure.code, message: failure.message },
      costUsd: source.costUsd,
      billedPerResult: source.billedPerResult,
    };
  }
}

export function createSbaseRouter(): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        provider: 'sandbase',
        configured: sandbaseConfigured(),
        image: sbaseImageReady(),
        sources: describeSbaseSources({ configured: sandbaseConfigured() }).length,
      },
    });
  });

  router.get('/sources', (_req, res) => {
    const configured = sandbaseConfigured();
    res.json({
      success: true,
      data: {
        provider: 'sandbase',
        configured,
        sources: describeSbaseSources({ configured }),
        image: { ...SBASE_IMAGE_SOURCE, configured: sbaseImageReady() },
      },
    });
  });

  router.post('/search', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const validated = validateSbaseQuery(body.q);
    if ('error' in validated) {
      return res.status(400).json({ success: false, code: 'INVALID_QUERY', error: validated.error });
    }
    const query = validated.query;

    // المتاجر: اللي طلبها المستعمل، وإلا الافتراضية. لا نزيدو مصدراً من عندنا.
    const requested = Array.isArray(body.sources)
      ? body.sources.filter((value): value is string => typeof value === 'string')
      : [];
    const defaults = describeSbaseSources({ configured: true }).filter((source) => source.defaultEnabled).map((source) => source.id);
    const wanted = (requested.length > 0 ? requested : defaults)
      .map((id) => id.trim())
      .filter((id, index, list) => list.indexOf(id) === index)
      .slice(0, SBASE_MAX_SOURCES_PER_SEARCH)
      .map((id) => findSbaseSource(id))
      .filter((source): source is SbaseSourceDescriptor => Boolean(source));

    if (wanted.length === 0) {
      return res.status(400).json({ success: false, code: 'NO_SOURCE', error: 'اختار متجراً واحداً على الأقل.' });
    }
    if (!sandbaseConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'SANDBASE_NOT_CONFIGURED',
        error: 'S Base غير مفعّل: مفتاح SandBase ما زال غير مضبوط على الخادم.',
      });
    }

    const started = Date.now();
    const groups = await Promise.all(wanted.map((source) => searchOneSource(source, query)));
    const totalMs = Date.now() - started;
    const count = groups.reduce((sum, group) => sum + group.count, 0);
    const facets = new Set<string>();
    for (const group of groups) for (const field of group.items.flatMap((item) => item.missing)) facets.add(field);

    const payload: SbaseSearchPayload = {
      query,
      totalMs,
      groups,
      count,
      missingFields: [...facets].sort(),
      fetchedAt: new Date().toISOString(),
    };
    return res.json({ success: true, data: payload });
  });

  /**
   * تفاصيل منتج واحد + الخيارات (مقاسات/ألوان). التصميم واحد لكل المتاجر،
   * أما الداتا فمن endpoint المتجر نفسو — واللي ما عندوش endpoint يرجع 400
   * صريح (`DETAILS_UNSUPPORTED`) موش صفحة فارغة.
   */
  router.post('/item', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.source === 'string' ? body.source.trim() : '';
    const source = findSbaseSource(sourceId);
    if (!source) {
      return res.status(404).json({ success: false, code: 'UNKNOWN_SOURCE', error: 'مصدر غير معروف.' });
    }
    if (!source.detail) {
      return res.status(400).json({
        success: false,
        code: 'DETAILS_UNSUPPORTED',
        error: `${source.label} ما تنشرش تفاصيل منتج في SandBase — نفتحلك الرابط الأصلي.`,
      });
    }
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 500) : null;
    const market = typeof body.market === 'string' ? body.market.trim().toLowerCase() : source.defaultMarket;
    if (source.detail.requiresId && !id) {
      return res.status(400).json({ success: false, code: 'ITEM_ID_REQUIRED', error: 'هذا المتجر يحتاج معرّف المنتج (ASIN/item ID).' });
    }
    if (!id && !title) {
      return res.status(400).json({ success: false, code: 'ITEM_INPUT_REQUIRED', error: 'معرّف المنتج ولا عنوانو مطلوب.' });
    }
    if (!sandbaseConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'SANDBASE_NOT_CONFIGURED',
        error: 'S Base غير مفعّل: مفتاح SandBase ما زال غير مضبوط على الخادم.',
      });
    }

    const cacheKey = `${source.id}|${id ?? ''}|${title}`;
    const hit = detailCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
      return res.json({
        success: true,
        data: {
          source: { id: source.id, label: source.label, vendor: source.vendor, supports: source.supports },
          detail: hit.detail, durationMs: hit.durationMs, cached: true,
          costUsd: source.detail.costUsd, billedPerResult: source.billedPerResult,
          fetchedAt: new Date().toISOString(),
        },
      });
    }

    try {
      const run = await runSandbaseCall(
        source.detail.endpoint,
        source.detail.buildBody({ id, title, url, market }),
        { asyncHint: source.detail.async },
      );
      const detail = extractDetail(run.data);
      if (detailCache.size >= SBASE_CACHE_MAX) {
        const oldest = detailCache.keys().next().value;
        if (oldest) detailCache.delete(oldest);
      }
      detailCache.set(cacheKey, { detail, durationMs: run.durationMs, at: Date.now() });
      return res.json({
        success: true,
        data: {
          source: { id: source.id, label: source.label, vendor: source.vendor, supports: source.supports },
          detail,
          durationMs: run.durationMs,
          cached: false,
          costUsd: source.detail.costUsd,
          billedPerResult: source.billedPerResult,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const failure = error instanceof SbaseError
        ? error
        : new SbaseError('SANDBASE_UNKNOWN', 'خطأ غير متوقّع أثناء جلب التفاصيل.', 502);
      return res.status(failure.status).json({ success: false, code: failure.code, error: failure.message });
    }
  });

  router.post('/image', upload.single('image'), async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'SBASE_IMAGE_EMPTY', error: 'صورة مطلوبة.' });
    }
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      const started = Date.now();
      const { items, durationMs } = await searchSbaseByImage(normalized.buffer);
      const stores = [...new Set(items.map((item) => item.store).filter((store): store is string => Boolean(store)))];
      const missing = new Set<string>();
      for (const item of items) for (const field of item.missing) missing.add(field);
      return res.json({
        success: true,
        data: {
          mode: 'image',
          channel: { ...SBASE_IMAGE_SOURCE, configured: sbaseImageReady() },
          status: items.length > 0 ? 'ok' : 'empty',
          items,
          count: items.length,
          stores,
          missingFields: [...missing].sort(),
          /** الزمن داخل القناة (Lens) مقابل الزمن الكامل للطلب. */
          durationMs,
          totalMs: Date.now() - started,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof SbaseImageError) {
        return res.status(error.status).json({ success: false, code: error.code, error: error.message });
      }
      const message = error instanceof Error && /image|format|pixel/i.test(error.message)
        ? 'الصورة ما تتقراش. جرّب صورة JPEG أو PNG أخرى.'
        : 'تعذّر تحليل الصورة.';
      return res.status(400).json({ success: false, code: 'SBASE_IMAGE_INVALID', error: message });
    }
  });

  return router;
}
