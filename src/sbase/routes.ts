/**
 * S Base — مسارات البحث (SandBase + قناة الصورة).
 *
 *   GET  /api/sbase/sources → المتاجر + قدراتها الحقيقية + readiness
 *   POST /api/sbase/search  → بحث بكلمة على **المتاجر المختارة**، كل واحد بوحدو،
 *                              بالتوازي، وكل واحد بزمنو/خطئو/كاشو الخاص
 *   POST /api/sbase/image   → بحث بصورة على 1688 (بلا SerpApi): الصورة تتنشر
 *                              في رابط عمومي مؤقّت، و1688 تجيب المتشابهات
 *   GET  /api/sbase/photo/:token → الصورة المؤقّتة (10 دقائق) اللي تقراها 1688
 *   GET  /api/sbase/health  → حالة المفاتيح (بلا أي كشف)
 *
 * الفكرة: شريط بحث واحد، أما **ما فماش محرّك موحّد**: كل متجر يبقى نداء مستقلّ،
 * ونتائجه تتجمّع في مجموعة موسومة باسمه، والفلتر في الشاشة يخفي/يظهر المجموعات.
 * لهذا الزمن والخطأ والكاش معروضين **لكل متجر** موش للكل.
 */
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';

import {
  SBASE_IMAGE_SOURCE,
  describeSbaseSources,
  findSbaseSource,
  sbaseDetailCostUsd,
  sbaseSourceCostUsd,
  validateSbaseQuery,
  type SbaseProviderId,
  type SbaseSourceDescriptor,
  type SbaseSupports,
} from './descriptors';
import { runSandbaseCall, runSandbaseSearch, sandbaseConfigured, SbaseError } from './client';
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
import {
  SbaseImageError,
  assertSbasePhotoReachable,
  sbaseImageFailureFrom,
  searchSbaseByImage,
} from './image';

export const SBASE_CACHE_TTL_MS = 10 * 60_000;
const SBASE_CACHE_MAX = 200;
/** سقف عدد المتاجر في بحث واحد: كل متجر = نداء مدفوع. */
export const SBASE_MAX_SOURCES_PER_SEARCH = 7;

/**
 * المزوّد النشيط: `SBASE_PROVIDER=apify` يفعّل مزوّد Apify (قرار المالك
 * 26/11/2026)، وأي قيمة أخرى تُبقي SandBase — **التفعيل بمتغيّر البيئة** حتى
 * لا يبقى التطبيق بلا مصدر لحظة، والحذف النهائي يأتي بعد التحقيق الحيّ فقط.
 */
export function activeSbaseProvider(): SbaseProviderId {
  return String(process.env.SBASE_PROVIDER ?? '').trim().toLowerCase() === 'apify' ? 'apify' : 'sandbase';
}

function providerConfigured(provider: SbaseProviderId): boolean {
  return provider === 'apify' ? apifyConfigured() : sandbaseConfigured();
}

function providerNotConfiguredCode(provider: SbaseProviderId): string {
  return provider === 'apify' ? 'APIFY_NOT_CONFIGURED' : 'SANDBASE_NOT_CONFIGURED';
}

function providerNotConfiguredMessage(provider: SbaseProviderId): string {
  return provider === 'apify'
    ? 'S Base غير مفعّل: مفتاح Apify ما زال غير مضبوط على الخادم.'
    : 'S Base غير مفعّل: مفتاح SandBase ما زال غير مضبوط على الخادم.';
}

interface DetailCacheEntry {
  detail: SbaseDetail;
  durationMs: number;
  at: number;
}
const detailCache = new Map<string, DetailCacheEntry>();

/**
 * صور مؤقّتة للبحث البصري.
 *
 * 1688 ما تقبلش ملفاً، تقبل `imgUrl`. لهذا الصورة اللي يختارها المستعمل تُنشر
 * 10 دقائق على رابط عشوائي عندنا، 1688 تجيبها، وبعدها تختفي. ما فماش تخزين
 * دائم، ما فماش قائمة، والرمز 24 بايت عشوائي (غير قابل للتخمين).
 */
export const SBASE_PHOTO_TTL_MS = 10 * 60_000;
const SBASE_PHOTO_MAX = 24;
interface PhotoEntry { buffer: Buffer; mimeType: string; at: number }
const photos = new Map<string, PhotoEntry>();

export function clearSbasePhotos(): void {
  photos.clear();
}

export function publishSbasePhoto(buffer: Buffer, mimeType: string): string {
  const token = randomBytes(24).toString('hex');
  while (photos.size >= SBASE_PHOTO_MAX) photos.delete(photos.keys().next().value as string);
  photos.set(token, { buffer, mimeType, at: Date.now() });
  return token;
}

function readSbasePhoto(token: string): PhotoEntry | null {
  const entry = photos.get(token);
  if (!entry) return null;
  if (Date.now() - entry.at > SBASE_PHOTO_TTL_MS) {
    photos.delete(token);
    return null;
  }
  return entry;
}

/** الأصل العمومي (Render/الخادم) اللي تشوفو 1688 — من الطلب أو من الإعداد. */
function publicOrigin(req: { protocol?: string; get?: (name: string) => string | undefined }, fallbackPortHint = ''): string {
  const configured = String(process.env.SBASE_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const host = String(req.get?.('x-forwarded-host') || req.get?.('host') || '').trim() || fallbackPortHint;
  const proto = forwardedProto || req.protocol || 'https';
  return host ? `${proto}://${host}` : '';
}

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
  /** المزوّد اللي جاوب فعلاً (sandbase | apify) — الشاشة تعرضه بصدق. */
  provider: SbaseProviderId;
  fetchedAt: string;
}

async function searchOneSource(
  source: SbaseSourceDescriptor,
  query: string,
  provider: SbaseProviderId,
): Promise<SbaseGroup> {
  const base: SbaseGroupSource = {
    id: source.id,
    label: source.label,
    vendor: source.vendor,
    supports: source.supports,
  };
  // المزوّد في مفتاح الكاش: نتيجة SandBase لا تُقدَّم أبداً لبحث Apify (والعكس).
  const cacheKey = `${provider}|${source.id}|${query.toLowerCase()}`;
  const costUsd = sbaseSourceCostUsd(source, provider);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
    return {
      source: base, status: hit.items.length > 0 ? 'ok' : 'empty', items: hit.items, count: hit.items.length,
      durationMs: hit.durationMs, cached: true, async: hit.async, error: null, costUsd,
      billedPerResult: source.billedPerResult,
    };
  }

  try {
    const run = provider === 'apify'
      ? await runApifySearch(query)
      : await runSandbaseSearch(source, query, source.defaultMarket);
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
      costUsd,
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
      costUsd,
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
  /**
   * فحص منشور الصورة قبل النداء المدفوع (اختبارات فقط؛ في الإنتاج `fetch` العادي).
   * الفحص والإنتاج يشاركان نفس الدالة: ما فماش منطق مخفي في الاختبار.
   */
  photoProbe?: typeof fetch;
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
    const provider = activeSbaseProvider();
    res.json({
      success: true,
      data: {
        provider,
        configured: providerConfigured(provider),
        image: providerConfigured(provider),
        sources: describeSbaseSources({ configured: providerConfigured(provider), provider }).length,
      },
    });
  });

  router.get('/sources', (_req, res) => {
    const provider = activeSbaseProvider();
    const configured = providerConfigured(provider);
    res.json({
      success: true,
      data: {
        provider,
        configured,
        sources: describeSbaseSources({ configured, provider }),
        image: {
          ...SBASE_IMAGE_SOURCE,
          // عند Apify: نقطة النهاية هي الـServer actor، والثمن المنشور عند Apify.
          ...(provider === 'apify' ? { endpoint: apifyImageEndpoint(), costUsd: SBASE_IMAGE_SOURCE.apifyCostUsd } : {}),
          configured: providerConfigured(provider),
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
    const provider = activeSbaseProvider();
    if (!providerConfigured(provider)) {
      return res.status(503).json({
        success: false,
        code: providerNotConfiguredCode(provider),
        error: providerNotConfiguredMessage(provider),
      });
    }

    const started = Date.now();
    const groups = (await Promise.all(wanted.map((source) => searchOneSource(source, query, provider))))
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
      provider,
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
    const provider = activeSbaseProvider();
    // عند Apify: `offerIds` يقبل المعرّف **ولا الرابط** (موثّق) — بلا بدنيل منفصل.
    const byUrl = provider === 'sandbase' && source.detail.requiresId && !id && source.detail.byUrl && url
      ? { endpoint: source.detail.byUrl.endpoint, body: source.detail.byUrl.buildBody({ id, title, url, market }), costUsd: source.detail.byUrl.costUsd }
      : null;
    if (provider === 'apify' ? !id && !url : source.detail.requiresId && !id && !byUrl) {
      return res.status(400).json({ success: false, code: 'ITEM_ID_REQUIRED', error: 'هذا المتجر يحتاج معرّف المنتج (item ID) ولا رابطاً صالحاً.' });
    }
    if (!id && !title && !url) {
      return res.status(400).json({ success: false, code: 'ITEM_INPUT_REQUIRED', error: 'معرّف المنتج، عنوانو، ولا رابطو مطلوب.' });
    }
    if (!providerConfigured(provider)) {
      return res.status(503).json({
        success: false,
        code: providerNotConfiguredCode(provider),
        error: providerNotConfiguredMessage(provider),
      });
    }

    const detailCostUsd = sbaseDetailCostUsd(source, provider);
    // المزوّد في مفتاح الكاش: بطاقة SandBase لا تُقدَّم أبداً على Apify (والعكس).
    const cacheKey = `${provider}|${source.id}|${id ?? ''}|${url ?? ''}|${title}`;
    const hit = detailCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
      return res.json({
        success: true,
        data: {
          source: { id: source.id, label: source.label, vendor: source.vendor, supports: source.supports },
          detail: { ...hit.detail, priceEstimate: estimateDetail(hit.detail) }, durationMs: hit.durationMs, cached: true,
          costUsd: detailCostUsd, billedPerResult: source.billedPerResult,
          fetchedAt: new Date().toISOString(),
        },
      });
    }

    try {
      const run = provider === 'apify'
        ? await runApifyDetail({ id, url })
        : await runSandbaseCall(
          byUrl ? byUrl.endpoint : source.detail.endpoint,
          byUrl ? byUrl.body : source.detail.buildBody({ id, title, url, market }),
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
          detail: { ...detail, priceEstimate: estimateDetail(detail) },
          durationMs: run.durationMs,
          cached: false,
          costUsd: provider === 'apify' ? detailCostUsd : (byUrl ? byUrl.costUsd : detailCostUsd),
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

  /*
   * الصورة المؤقّتة اللي تقراها 1688.
   *
   * مسار عام (بلا جلسة) لأن SandBase تجيبو بلا ترويسة: الرمز نفسه هو التصريح —
   * 48 حرفاً عشوائياً، 10 دقائق، صورة JPEG واحدة، وما فماش قائمة.
   */
  router.get('/photo/:token', (req, res) => {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).end();
    const entry = readSbasePhoto(token);
    if (!entry) return res.status(404).end();
    res.setHeader('Content-Type', entry.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.end(entry.buffer);
  });

  router.post('/image', upload.single('image'), async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'SBASE_IMAGE_EMPTY', error: 'صورة مطلوبة.' });
    }
    const provider = activeSbaseProvider();
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      const started = Date.now();
      let items: SbaseProduct[];
      let durationMs = 0;
      let endpoint: string;
      let costUsd: number | undefined;
      let photoExpiresAt: string | undefined;

      if (provider === 'apify') {
        /*
         * Apify: الصورة تُرسل **base64** في request واحد للـServer actor — بلا
         * نشر رابط عمومي ولا سَبر شبكي. السَبر المجّاني هنا محلي: فكّ الشفرة
         * والتحقق والضغط التدرّجي تحت حدّ 1MB الموثّق، كل ذلك قبل أي نداء مدفوع
         * (الرفض المحلي 413 ما يكلف حتى سنتاً).
         */
        const imageBase64 = await apifyImageBase64(normalized.buffer, normalized.mimeType);
        const result = await searchApifyByImage(imageBase64);
        items = extractProducts(result.data, {
          arrays: [['items']],
          limit: 20,
          // كل نتيجة من هذا النداء = 1688، والنصّ يقولها بدل ما يخمّن متجراً.
          storeFallback: '1688',
        }).map((item) => ({ ...item, store: '1688' }));
        durationMs = result.durationMs;
        endpoint = apifyImageEndpoint();
        costUsd = SBASE_IMAGE_SOURCE.apifyCostUsd;
      } else {
        const origin = publicOrigin(req);
        if (!origin) {
          throw new SbaseImageError(
            'SBASE_IMAGE_UNKNOWN',
            'ما نعرفوش أصل الخادم العمومي: اضبط SBASE_PUBLIC_URL باش 1688 تقرا الصورة.',
            503,
          );
        }
        const token = publishSbasePhoto(normalized.buffer, normalized.mimeType);
        const photoUrl = `${origin}/api/sbase/photo/${token}`;
        /*
         * فحص مجّاني قبل النداء المدفوع: كنا ندفع `$0.014286` ونتلقى رفضاً
         * للرابط، والمستعمل يقرا «جرّب صورة أخرى» — والحقيقة أن النشر عندنا
         * هو اللي ما يتقراش. توّا الخطب يتسمّى قبل ما يتحاسب.
         */
        await assertSbasePhotoReachable(photoUrl, { fetchImpl: options.photoProbe });
        const sandbase = await searchSbaseByImage(photoUrl);
        items = sandbase.items;
        durationMs = sandbase.durationMs;
        endpoint = sandbase.endpoint;
        costUsd = sandbase.costUsd;
        photoExpiresAt = new Date(Date.now() + SBASE_PHOTO_TTL_MS).toISOString();
      }

      const stores = [...new Set(items.map((item) => item.store).filter((store): store is string => Boolean(store)))];
      const missing = new Set<string>();
      for (const item of items) for (const field of item.missing) missing.add(field);
      return res.json({
        success: true,
        data: {
          mode: 'image',
          channel: { ...SBASE_IMAGE_SOURCE, ...(provider === 'apify' ? { endpoint, costUsd } : {}), configured: providerConfigured(provider) },
          status: items.length > 0 ? 'ok' : 'empty',
          items: items.map((item) => ({ ...item, priceEstimate: estimate(item) })),
          count: items.length,
          stores,
          missingFields: [...missing].sort(),
          /** الزمن اللي خذا نداء 1688 نفسه. */
          durationMs,
          endpoint,
          costUsd,
          /** رابط الصورة المؤقّت (10 دقائق) — للتشخيص، يتنحّى وحدو (SandBase فقط). */
          ...(photoExpiresAt ? { photoExpiresAt } : {}),
          provider,
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
