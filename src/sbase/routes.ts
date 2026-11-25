/**
 * S Base — مسارات البحث المستقلّة (SandBase).
 *
 * ثلاثة مسارات فقط، وكلها **للعميل** (لا تحتاج جلسة عمل):
 *   GET  /api/sbase/sources → كتالوغ المصادر + قدراتها الحقيقية + readiness
 *   POST /api/sbase/search  → بحث واحد على مصدر واحد، بنتائج حقيقية وزمن حقيقي
 *   GET  /api/sbase/health  → هل المفتاح مضبوط (بلا أي كشف للمفتاح)
 *
 * ما فماش أي صلة بـ`/api/v1/aywebs` ولا بـ`/api/zayrovix`: S Base تقرأ من
 * SandBase مباشرة، ونتائجها ما تدخلش لا للسلة ولا لقاعدة المنتجات.
 */
import { Router } from 'express';

import { describeSbaseSources, findSbaseSource, validateSbaseQuery, type SbaseSupports } from './descriptors';
import { runSandbaseSearch, sandbaseConfigured, SbaseError } from './client';
import { extractProducts, missingFacets, type SbaseProduct } from './extract';

/** كاش قصير: يعاود نفس البحث ⇒ نفس النتيجة بلا فلوس، والزمن الأصلي يبقى معروض. */
export const SBASE_CACHE_TTL_MS = 10 * 60_000;
const SBASE_CACHE_MAX = 200;

interface CacheEntry {
  payload: SbaseSearchPayload;
  at: number;
}
const cache = new Map<string, CacheEntry>();

export interface SbaseSearchPayload {
  source: { id: string; label: string; vendor: string; supports: SbaseSupports };
  query: string;
  market: string | null;
  status: 'ok' | 'empty';
  items: SbaseProduct[];
  count: number;
  /** حقول ما عطاهاش المصدر (image, price, currency, link, rating, store…). */
  missingFields: string[];
  /** الزمن الحقيقي للنداء الأصلي (ms)، بما فيه polling. */
  durationMs: number;
  cached: boolean;
  async: boolean;
  polls: number;
  runId: string | null;
  costUsd: number | null;
  fetchedAt: string;
}

export function clearSbaseCache(): void {
  cache.clear();
}

function remember(key: string, payload: SbaseSearchPayload): void {
  if (payload.status !== 'ok') return;
  if (cache.size >= SBASE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { payload, at: Date.now() });
}

export function createSbaseRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        provider: 'sandbase',
        configured: sandbaseConfigured(),
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
      },
    });
  });

  router.post('/search', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.source === 'string' ? body.source.trim() : '';
    const source = findSbaseSource(sourceId);
    if (!source) {
      return res.status(404).json({ success: false, code: 'UNKNOWN_SOURCE', error: 'مصدر غير معروف.' });
    }

    const validated = validateSbaseQuery(body.q);
    if ('error' in validated) {
      return res.status(400).json({ success: false, code: 'INVALID_QUERY', error: validated.error });
    }
    const query = validated.query;

    const requestedMarket = typeof body.market === 'string' ? body.market.trim().toLowerCase() : '';
    const market = requestedMarket && source.markets.some((entry) => entry.code.toLowerCase() === requestedMarket)
      ? requestedMarket
      : source.defaultMarket;

    const cacheKey = `${source.id}|${market ?? '-'}|${query.toLowerCase()}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < SBASE_CACHE_TTL_MS) {
      return res.json({ success: true, data: { ...hit.payload, cached: true } });
    }

    if (!sandbaseConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'SANDBASE_NOT_CONFIGURED',
        error: 'S Base غير مفعّل: مفتاح SandBase ما زال غير مضبوط على الخادم.',
      });
    }

    try {
      const run = await runSandbaseSearch(source, query, market);
      const items = extractProducts(run.data, { arrays: source.arrays, limit: 20 });
      const payload: SbaseSearchPayload = {
        source: { id: source.id, label: source.label, vendor: source.vendor, supports: source.supports },
        query,
        market,
        status: items.length > 0 ? 'ok' : 'empty',
        items,
        count: items.length,
        missingFields: items.length > 0 ? missingFacets(items) : [],
        durationMs: run.durationMs,
        cached: false,
        async: run.async,
        polls: run.polls,
        runId: run.runId,
        costUsd: source.costUsd,
        fetchedAt: new Date().toISOString(),
      };
      remember(cacheKey, payload);
      return res.json({ success: true, data: payload });
    } catch (error) {
      const failure = error instanceof SbaseError
        ? error
        : new SbaseError('SANDBASE_UNKNOWN', 'خطأ غير متوقّع أثناء الاتصال بمصدر البحث.', 502);
      return res.status(failure.status).json({ success: false, code: failure.code, error: failure.message });
    }
  });

  return router;
}
