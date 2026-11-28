/**
 * Z Sourcing — النموذج الموحد للمنتجات والموردين.
 *
 * قاعدة الأمر التنفيذي (المالك 28/11): لا اعتماد مباشر على بنية Nexscope،
 * ولا اختراع بيانات — **كل حقل هنا موثّق رسمياً** في وثائق nexscope.ai
 * (`/api-docs/1688-product-search`, `/1688-product-detail`, `/1688-search-by-image`)
 * وفي مستودعها الرسمي `nexscope-ai/nexscope-ecommerce-api`.
 *
 * الحقول التي لم يثبِت مستندها مسارها الدقيق في الاستجابة الحية تُجمع في
 * `raw` (المرور الخام) حتى نقطة التوقف (اختبار حقيقي على 1688) — لا تخمين
 * ولا حذف. المحوّل الحي في `nexscope.ts` يملأ المؤكدة ويمرّر الباقي.
 */

/** بطاقة منتج موحّدة — المؤكد فقط يُسَمّى، والباقي في raw. */
export interface ZSourcingProduct {
  /** معرّف العرض 1688 — سلسلة نصية دائماً (الوثائق: «preserve long identifiers as exact strings»). */
  offerId: string;
  title?: string;
  /** رابط المنتج الأصلي (`products.asinUrl` في البحث؛ رابط العرض في التفاصيل). */
  productUrl?: string;
  /** سعر القطعة باليوان (بحث الصورة يعيده موثّقاً؛ التفاصيل تُثبت عند نقطة التوقف). */
  priceCny?: number | null;
  /** سعر الوكالة/التسويق (`products.consignPrice` في بحث الكلمات). */
  consignPrice?: number | null;
  currency?: string | null;
  /** الحد الأدنى للطلب — موثّق في بحث الصورة؛ يُثبَّت شكله الحي في البحث/التفاصيل. */
  moq?: string | number | null;
  /** مبيعات شهرية موثّقة في بحث الصورة (monthly sales). */
  monthlySold?: string | null;
  /** معدل إعادة الشراء موثّق في بحث الصورة (repurchase rate). */
  repurchaseRate?: string | null;
  /** درجة الثقة التجارية موثّقة في بحث الصورة (trade score). */
  tradeScore?: string | null;
  /** المورّد — اسم الشركة (`products.company`) / هوية البائع (بحث الصورة). */
  supplier?: string | null;
  deliveryTime?: string | null;
  /** المرور الخام الكامل لهذا العنصر — للتحقق الحي عند نقطة التوقف ولـfieldProvenance مستقبلاً. */
  raw: Record<string, unknown>;
}

/** نتيجة بحث موحّدة (كلمات أو صورة) — بلا صفحات وهمية: ما وثّقه المزوّد فقط. */
export interface ZSourcingSearchResult {
  products: ZSourcingProduct[];
  /** الموثّق: بحث الكلمات pageIndex/pageSize(10–100)؛ بحث الصورة page/pageSize(≤50) — الترشيح الحي عند نقطة التوقف. */
  pageInfo: { pageIndex: number; pageSize: number; hasMore: boolean | null };
  /** ما استُدعي فعلاً — للشفافية والتشخيص. */
  endpointCalled: string;
  durationMs: number;
}

/** مزوّد بيانات Z Sourcing — واجهة تتغير بعدها الواجهات لا تتبدل (قاعدة المالك). */
export interface ZSourcingProvider {
  /** بحث بالكلمات — يمرّ عبر طبقة الترجمة zh (الوثائق: keyWord صيني مبسّط ≤50 حرفاً). */
  searchByKeyword(input: {
    zhQuery: string;
    pageIndex?: number;
    pageSize?: number;
    sortField?: string;
    sortType?: 'asc' | 'desc';
    priceStartCny?: number;
    priceEndCny?: number;
    moqStart?: number;
    moqEnd?: number;
  }): Promise<ZSourcingSearchResult>;
  /** بحث بالصورة — base64 نقي بلا بادئة (PNG/JPG/JPEG حصراً — WEBP/GIF غير مدعومين). */
  searchByImage(input: { imageBase64: string; page?: number; pageSize?: number }): Promise<ZSourcingSearchResult>;
  /** تفاصيل عرض واحد — offerId سلسلة نصية + عملة اختيارية. */
  getDetail(input: { offerId: string; currency?: string }): Promise<Record<string, unknown>>;
}
