/**
 * Z Sourcing — مسارات REST (المرحلة 3 من الأمر التنفيذي للمالك 28/11).
 *
 * الحدود المعمارية المطبّقة:
 *  • هذه المسارات **جديدة ومستقلة** — لا تلمس /api/sbase ولا AYWEBS ولا Z Lens.
 *  • Nexscope مزوّد خارجي عبر adapter (`nexscope.ts`) — الواجهة تستهلك
 *    `ZSourcingProvider` لا بنية المزوّد.
 *  • بلا مفتاح على الخادم: رفض 503 صادق — لا واجهة شكلية ولا بيانات وهمية
 *    (قاعدة 7 من الأمر).
 *  • الاستجابة تحمل `raw` كما وصل — شفافية كاملة حتى نقطة التوقف (اختبار حقيقي
 *    على 1688) ثم تُقيَّد الحقول الموثّقة حيّاً.
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { normalizeUploadedImage } from '../services/imageValidation';
import { createNexscopeProvider, nexscopeConfigured, ZSourcingError } from './nexscope';

function failure(res: Response, error: unknown): Response {
  const err = error instanceof ZSourcingError
    ? error
    : new ZSourcingError('ZS_UNKNOWN', 'خطأ غير متوقّع في Z Sourcing.', 502);
  const payload: Record<string, unknown> = { success: false, code: err.code, error: err.message };
  if (err.providerCode) payload.providerCode = err.providerCode;
  if (err.retryAfterMs !== null) payload.retryAfterMs = err.retryAfterMs;
  return res.status(err.status).json(payload);
}

const NOT_CONFIGURED = {
  success: false,
  code: 'ZS_NEXSCOPE_NOT_CONFIGURED',
  error: 'مفتاح Nexscope غير مضبوط على الخادم — Z Sourcing موقوف حتى يضبط المالك المفتاح في env.',
};

export function createZSourcingRouter(): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  router.post('/search', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const zhQuery = typeof body.zhQuery === 'string' ? body.zhQuery.trim() : '';
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!zhQuery && !query) {
      return res.status(400).json({ success: false, code: 'ZS_QUERY_EMPTY', error: 'كلمة بحث مطلوبة.' });
    }
    if (!nexscopeConfigured()) return res.status(503).json(NOT_CONFIGURED);
    let provider;
    try { provider = createNexscopeProvider(); } catch (error) { return failure(res, error); }
    try {
      /*
       * الموثّق رسمياً: keyWord صيني مبسّط ≤50 حرفاً. من يمرّر zhQuery يستعمله
       * مباشرة؛ من يمرّر query عادي يذهب كما هو الآن — وطبقة الترجمة zh
       * (درس Soorce المؤكد) تُربط عند نقطة التوقف قبل إطلاق الواجهة.
       */
      const result = await provider.searchByKeyword({
        zhQuery: zhQuery || query,
        pageIndex: Number(body.pageIndex) > 0 ? Number(body.pageIndex) : 1,
        pageSize: Number(body.pageSize) > 0 ? Number(body.pageSize) : 20,
        ...(typeof body.sortField === 'string' && body.sortField.trim() ? { sortField: body.sortField.trim() } : {}),
        ...(body.sortType === 'asc' || body.sortType === 'desc' ? { sortType: body.sortType } : {}),
        ...(Number.isFinite(Number(body.priceStartCny)) && body.priceStartCny !== undefined ? { priceStartCny: Number(body.priceStartCny) } : {}),
        ...(Number.isFinite(Number(body.priceEndCny)) && body.priceEndCny !== undefined ? { priceEndCny: Number(body.priceEndCny) } : {}),
      });
      return res.json({ success: true, data: result });
    } catch (error) { return failure(res, error); }
  });

  router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'ZS_IMAGE_EMPTY', error: 'صورة مطلوبة.' });
    }
    if (!nexscopeConfigured()) return res.status(503).json(NOT_CONFIGURED);
    let provider;
    try { provider = createNexscopeProvider(); } catch (error) { return failure(res, error); }
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      /*
       * الموثّق رسمياً: PNG/JPG/JPEG فقط — WEBP/GIF غير مدعومين. الرفض محلي
       * ومجاني قبل أي نداء (نفس عقيدة S BASE: الرفض قبل الكلفة).
       */
      if (!/^image\/(png|jpe?g)$/i.test(normalized.mimeType)) {
        return res.status(400).json({
          success: false,
          code: 'ZS_IMAGE_FORMAT_UNSUPPORTED',
          error: 'Nexscope يقبل PNG/JPG/JPEG فقط — أعد التقاط الصورة أو حوّل صيغتها.',
        });
      }
      const result = await provider.searchByImage({
        imageBase64: normalized.buffer.toString('base64'),
        ...(Number(body.page) > 0 ? { page: Number(body.page) } : {}),
      });
      return res.json({ success: true, data: result });
    } catch (error) { return failure(res, error); }
  });

  router.post('/item', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : '';
    // الموثّق: offerId نصّي رقمي — حفظ المعرّفات الطويلة حرفياً بلا float.
    if (!/^\d{6,20}$/.test(offerId)) {
      return res.status(400).json({ success: false, code: 'ZS_OFFER_ID_INVALID', error: 'معرّف العرض مطلوب كنصّ رقمي (6–20 خانة).' });
    }
    if (!nexscopeConfigured()) return res.status(503).json(NOT_CONFIGURED);
    let provider;
    try { provider = createNexscopeProvider(); } catch (error) { return failure(res, error); }
    try {
      const detail = await provider.getDetail({
        offerId,
        ...(typeof body.currency === 'string' && body.currency.trim() ? { currency: body.currency.trim() } : {}),
      });
      return res.json({ success: true, data: { offerId, detail } });
    } catch (error) { return failure(res, error); }
  });

  return router;
}
