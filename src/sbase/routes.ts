/**
 * S Base — مسارات البحث (مزوّد Apify + قناة الصورة).
 *
 *   GET  /api/sbase/sources → المتاجر + قدراتها الحقيقية + readiness
 *   POST /api/sbase/search  → بحث بكلمة على **المتاجر المختارة**، كل واحد بوحدو،
 *                              بالتوازي، وكل واحد بزمنو/خطئو/كاشو الخاص
 *   POST /api/sbase/item    → بطاقة منتج (product_detail عبر Apify)
 *   POST /api/sbase/image   → بحث بصورة على 1688: الصورة تُرسل **base64** في
 *                              POST واحد للـServer actor — بلا نشر رابط عمومي
 *   GET  /api/sbase/health  → حالة المفاتيح (بلا أي كشف)
 *
 * الفكرة: شريط بحث واحد، أما **ما فماش محرّك موحّد**: كل متجر يبقى نداء مستقلّ،
 * ونتائجه تتجمّع في مجموعة موسومة باسمه، والفلتر في الشاشة يخفي/يظهر المجموعات.
 * لهذا الزمن والخطأ والكاش معروضين **لكل متجر** موش للكل.
 *
 * 26/11/2026 — قرار المالك (نهائي): مزوّد واحد = Apify. الترتيب احترم العقد:
 * المزوّد الجديد بُني جانب القديم، فُعّل بمتغيّر بيئة، والتحقيق الحيّ بمفتاح
 * المالك يتمّ على الخادم المنشور — وما يبقى التطبيق بلا مصدر لحظة.
 */
import { Router } from 'express';
import multer from 'multer';

import {
  SBASE_IMAGE_SOURCE,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
  type SbaseProviderId,
  type SbaseSourceDescriptor,
  type SbaseSupports,
} from './descriptors';
import { SbaseError } from './errors';
import {
  apifyConfigured,
  apifyImageBase64,
  apifyImageEndpoint,
  runApifyDetail,
  runApifySearch,
  searchApifyByImage,
} from './apify';
import { extractProducts, missingFacets, type SbaseProduct } from './extract';
import { extractDetail, type SbaseDetail } from './detail';
import { normalizeUploadedImage } from '../services/imageValidation';
import type { PricingRules } from '../services/pricing';
import { estimateSbasePrice, type SbasePriceEstimate } from './pricing';
import { sbaseImageFailureFrom } from './image';

export const SBASE_CACHE_TTL_MS = 10 * 60_000;
const SBASE_CACHE_MAX = 200;
/** سقف عدد المتاجر في بحث واحد: كل متجر = نداء مدفوع. */
export const SBASE_MAX_SOURCES_PER_SEARCH = 7;

/** المزوّد الوحيد منذ 26/11/2026 — الاسم يظهر في الحمولات كما هو. */
export function activeSbaseProvider(): SbaseProviderId {
  return 'apify';
}

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
  /** زمن هذا المتجر وحده (ms) — بما فيه الـpolling. */
  durationMs: number;
  cached: boolean;
  async: boolean;
  /** كود الخطأ عندما `status==='error'` — ما نبدّلوش برسالة عامة. */
  error: { code: string; message: string } | null;
  costUsd: number | null;
  /** الكلفة تُحاسب ضمن السقف ولا بالصفّ — كما تنشرها صفحة الـactor. */
  billedPerResult: boolean;
}

export interface SbaseSearchPayload {
  query: string;
  /** الزمن الكلي (أبطأ متجر) — موش مجموع الأزمنة. */
  totalMs: number;
  groups: SbaseGroup[];
  count: number;
  missingFields: string[];
  /** المزوّد اللي جاوب فعلاً — الشاشة تعرضه بصدق. */
  provider: SbaseProviderId;
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
  const cacheKey = `apify|${source.id}|${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
    return {
      source: base, status: hit.items.length > 0 ? 'ok' : 'empty', items: hit.items, count: hit.items.length,
      durationMs: hit.durationMs, cached: true, async: hit.async, error: null, costUsd: source.costUsd,
      billedPerResult: source.billedPerResult,
    };
  }

  try {
    const run = await runApifySearch(query);
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
      : new SbaseError('APIFY_UNKNOWN', 'خطأ غير متوقّع أثناء الاتصال بالمصدر.', 502);
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

export interface SbaseRouterOptions {
  /**
   * محرّك السعر الموجود (`db.getPricingRules`). بلا هذا، البطاقة تعرض ثمن
   * المصدر فقط وتقول «تقدير غير متوفّر» — ما نخترعوش معدّلاً.
   */
  getPricingRules?: () => PricingRules;
}

export function createSbaseRouter(options: SbaseRouterOptions = {}): Router {
  const router = Router();
  const estimate = (item: SbaseProduct): SbasePriceEstimate | null => estimateSbasePrice(
    options.getPricingRules?.() ?? null,
    { amount: item.amount, currency: item.currency, title: item.title, includeLocalDelivery: false },
  );
  /** Sur la fiche d'un produit, la ligne est seule : le transport local compte. */
  const estimateDetail = (detail: SbaseDetail): SbasePriceEstimate | null => estimateSbasePrice(
    options.getPricingRules?.() ?? null,
    {
      amount: detail.amount, currency: detail.currency, title: detail.title ?? '', includeLocalDelivery: true,
      // وزن الحزمة المعلن من المصدر يغذّي الشحن — غايب ⇒ وزن التصنيف، بلا اختراع.
      ...(detail.weightKg ? { weightKg: detail.weightKg } : {}),
    },
  );
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        provider: activeSbaseProvider(),
        configured: apifyConfigured(),
        image: apifyConfigured(),
        sources: describeSbaseSources({ configured: apifyConfigured() }).length,
      },
    });
  });

  router.get('/sources', (_req, res) => {
    const configured = apifyConfigured();
    res.json({
      success: true,
      data: {
        provider: activeSbaseProvider(),
        configured,
        sources: describeSbaseSources({ configured }),
        image: {
          ...SBASE_IMAGE_SOURCE,
          // نقطة النهاية الفعلية للـServer actor (تقرأ APIFY_IMAGE_ACTOR وقت النداء).
          endpoint: apifyImageEndpoint(),
          configured,
        },
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
    if (!apifyConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'APIFY_NOT_CONFIGURED',
        error: 'S Base غير مفعّل: مفتاح Apify ما زال غير مضبوط على الخادم.',
      });
    }

    const started = Date.now();
    const groups = (await Promise.all(wanted.map((source) => searchOneSource(source, query))))
      // Prix source + estimation TND (moteur de prix existant) sur CHAQUE ligne.
      .map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, priceEstimate: estimate(item) })) }));
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
      provider: activeSbaseProvider(),
      fetchedAt: new Date().toISOString(),
    };
    return res.json({ success: true, data: payload });
  });

  /**
   * تفاصيل منتج واحد + الخيارات (مقاسات/ألوان). التصميم واحد لكل المتاجر،
   * أما الداتا فمن `product_detail` عند Apify — والوزن المعلن يغذّي الشحن في
   * محرّك السعر. النداء يقبل المعرّف ولا الرابط (`offerIds`، موثّق).
   */
  router.post('/item', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.source === 'string' ? body.source.trim() : '';
    const source = findSbaseSource(sourceId);
    if (!source) {
      return res.status(404).json({ success: false, code: 'UNKNOWN_SOURCE', error: 'مصدر غير معروف.' });
    }
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 500) : null;
    if (!id && !url) {
      return res.status(400).json({ success: false, code: 'ITEM_ID_REQUIRED', error: 'هذا المتجر يحتاج معرّف المنتج (item ID) ولا رابطاً صالحاً.' });
    }
    if (!id && !title && !url) {
      return res.status(400).json({ success: false, code: 'ITEM_INPUT_REQUIRED', error: 'معرّف المنتج، عنوانو، ولا رابطو مطلوب.' });
    }
    if (!apifyConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'APIFY_NOT_CONFIGURED',
        error: 'S Base غير مفعّل: مفتاح Apify ما زال غير مضبوط على الخادم.',
      });
    }

    const cacheKey = `apify|${source.id}|${id ?? ''}|${url ?? ''}|${title}`;
    const hit = detailCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
      return res.json({
        success: true,
        data: {
          source: { id: source.id, label: source.label, vendor: source.vendor, supports: source.supports },
          detail: { ...hit.detail, priceEstimate: estimateDetail(hit.detail) }, durationMs: hit.durationMs, cached: true,
          costUsd: source.detail.costUsd, billedPerResult: source.billedPerResult,
          fetchedAt: new Date().toISOString(),
        },
      });
    }

    try {
      const run = await runApifyDetail({ id, url });
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
          detail: { ...detail, priceEstimate: estimateDetail(detail) },
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
        : new SbaseError('APIFY_UNKNOWN', 'خطأ غير متوقّع أثناء جلب التفاصيل.', 502);
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
      /*
       * Apify: الصورة تُرسل **base64** في request واحد للـServer actor — بلا
       * نشر رابط عمومي ولا سَبر شبكي. السَبر المجّاني هنا محلي: فكّ الشفرة
       * والتحقق والضغط التدرّجي تحت حدّ 1MB الموثّق، كل ذلك قبل أي نداء مدفوع
       * (الرفض المحلي 413 ما يكلف حتى سنتاً).
       */
      const imageBase64 = await apifyImageBase64(normalized.buffer, normalized.mimeType);
      const result = await searchApifyByImage(imageBase64);
      const items = extractProducts(result.data, {
        arrays: [['items']],
        limit: 20,
        // كل نتيجة من هذا النداء = 1688، والنصّ يقولها بدل ما يخمّن متجراً.
        storeFallback: '1688',
      }).map((item) => ({ ...item, store: '1688' }));

      const stores = [...new Set(items.map((item) => item.store).filter((store): store is string => Boolean(store)))];
      const missing = new Set<string>();
      for (const item of items) for (const field of item.missing) missing.add(field);
      return res.json({
        success: true,
        data: {
          mode: 'image',
          channel: { ...SBASE_IMAGE_SOURCE, endpoint: apifyImageEndpoint(), costUsd: SBASE_IMAGE_SOURCE.costUsd, configured: apifyConfigured() },
          status: items.length > 0 ? 'ok' : 'empty',
          items: items.map((item) => ({ ...item, priceEstimate: estimate(item) })),
          count: items.length,
          stores,
          missingFields: [...missing].sort(),
          /** الزمن اللي خذا نداء 1688 نفسه. */
          durationMs: result.durationMs,
          endpoint: apifyImageEndpoint(),
          costUsd: SBASE_IMAGE_SOURCE.costUsd,
          provider: activeSbaseProvider(),
          totalMs: Date.now() - started,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      /*
       * خطأ المزوّد ما يولّيش «صورة غالطة» (26/11/2026): كل عطب (quota، 429،
       * timeout) كان يخرج `SBASE_IMAGE_INVALID` + 400 — أي نلومو صورة المستخدم
       * على عطب خارجي. توّا كل حالة بكودها وحالتها.
       */
      const failure = sbaseImageFailureFrom(error);
      return res.status(failure.status).json({
        success: false,
        code: failure.code,
        error: failure.message,
        ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
      });
    }
  });

  return router;
}
