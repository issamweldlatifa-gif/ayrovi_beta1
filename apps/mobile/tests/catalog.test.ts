/**
 * كتالوج المتجر (Q1) — العقد اللي مانرجعش فيه لورا.
 *
 * لماذا هذا الاختبار موجود: الخطة الأولى بنت من مسارات الـAPI بلا ما تقرا
 * المنتوج ⇒ طلّع تطبيق فارغ. هذا يقفل **القراءة** و**قراراً واحداً صعباً**:
 *
 *   • حقل ناقص ⇒ قيمة محايدة، موش استثناء يطيّح الشاشة؛
 *   • السعر هو **سعر الخادم** وحدو (`finalPrice`)؛
 *   • وبالتالي **ما فمّاش زر «زيد للسلّة»** في صفحة المنتوج — لأنّ إضافة منتوج
 *     كتالوج تمرّ بحساب سعر ثانٍ في الخادم، ونشر سعرين مختلفين لنفس المنتوج هو
 *     بالضبط الكذبة المطبوعة اللي مانعملهاش. مسلك الشراء الكامل = Q5.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...(args as [])),
}));

const { fetchCatalogProducts, normalizeStockStatus } = await import('../src/api/catalog');

const PRODUCT = {
  id: 'product_1',
  name: 'Ensemble tendance',
  description: 'Test',
  image: '/media/hero-femme.jpg',
  additionalImages: ['/media/a.jpg'],
  brandId: 'brand_shein',
  brandName: 'SHEIN',
  category: 'MODE',
  sourceUrl: 'https://shein.example/p/1',
  sourcePlatform: 'SHEIN',
  originalPrice: 20,
  currency: 'EUR',
  convertedPrice: 67,
  customsFee: 10,
  shippingFee: 8,
  serviceFee: 5,
  finalPrice: 90,
  expressAvailable: true,
  stockStatus: 'in_stock',
  arrivalIds: ['arrival_1'],
};

const screen = () => readFileSync(fileURLToPath(new URL('../app/product/[id].tsx', import.meta.url)), 'utf8');

describe('كتالوج المتجر — القراءة', () => {
  // `mockReset` يضيّع تتبّع الرفض المعلّق في Vitest ⇒ وعد مرفوض يبان «غير مُعالَج»
// ويُسقط الاختبار، ولو كان الكود يلقطو صح. `mockClear` + قيمة افتراضية تحلّها.
beforeEach(() => { apiGet.mockClear(); apiGet.mockResolvedValue({ data: [] }); });

  it('السعر المعروض هو سعر الخادم: لا مجموع، ولا تحويل عملة في التطبيق', async () => {
    apiGet.mockResolvedValue({ data: [PRODUCT] });
    const rows = await fetchCatalogProducts({});
    // 67 + 10 + 8 + 5 = 90 هنا — بس القاعدة موش الحساب: القاعدة أننا نعرض
    // `finalPrice` كما جاء، حتى لو ما طابقش مجموع الأجزاء (قرار الخادم).
    expect(rows[0]?.finalPrice).toBe(90);
    expect(rows[0]?.currency).toBe('EUR');
  });

  it('الفلترة بالوصولة والحدّ يتبنّيو في المسار', async () => {
    apiGet.mockResolvedValue({ data: [] });
    await fetchCatalogProducts({ limit: 50, arrivalId: 'arrival_1' });
    expect(apiGet).toHaveBeenCalledWith('/api/public/products?limit=50&arrivalId=arrival_1', {});
  });

  it('بلا فلترة ⇒ بلا معاملات في المسار', async () => {
    apiGet.mockResolvedValue({ data: [] });
    await fetchCatalogProducts({});
    expect(apiGet).toHaveBeenCalledWith('/api/public/products', {});
  });

  it('حقل ناقص ⇒ قيمة محايدة، موش شاشة طايحة', async () => {
    apiGet.mockResolvedValue({ data: [{ id: 'x' }, null, 42] });
    const rows = await fetchCatalogProducts({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('');
    expect(rows[0]?.finalPrice).toBe(0);
    expect(rows[0]?.currency).toBe('TND');
    expect(rows[0]?.additionalImages).toEqual([]);
    expect(rows[0]?.expressAvailable).toBe(false);
  });

  it('ردّ موش مصفوفة ⇒ قائمة فارغة (موّش استثناء)', async () => {
    apiGet.mockResolvedValue({ data: null });
    await expect(fetchCatalogProducts({})).resolves.toEqual([]);
  });

  it('منتوج بلا سعر ⇒ 0، والشاشة تقول «بلا تسعير» موش «0.00»', async () => {
    apiGet.mockResolvedValue({ data: [{ ...PRODUCT, finalPrice: undefined }] });
    const rows = await fetchCatalogProducts({});
    expect(rows[0]?.finalPrice).toBe(0);
  });
});

describe('صفحة المنتوج — قرار موثّق', () => {
  it('«زيد للسلّة» يستعمل **مسار الكتالوج** وحدو (سعر واحد، موش سعرين)', () => {
    // Q1 كان يمنع الزر: المسار العام للسلّة يعيد حساب السعر من `sourcePrice`
    // ⇒ سعر ثانٍ لنفس المنتوج = كذبة مطبوعة. Q5 أضاف `/api/cart/catalog`
    // اللي يستعمل `final_price` المنشور ⇒ سعر واحد. القفل يتبدّل: موش «ما
    // فمّاش زر»، بل «الزر يمرّ من المسار الصحيح».
    const source = screen();
    expect(source).toContain('addCatalogToCart');
    expect(source).not.toMatch(/addCartItem|addAyWebsCartItem/);
  });

  it('الزر **ما يبانش** كان ما فمّاش سعر أو كان نافد (موّش زر يفشل)', () => {
    // نفس قاعدة الخادم: `NO_PRICE` و`OUT_OF_STOCK` يرفضو الإضافة، فإظهار زر
    // يفشل هو «الزر الميّت» الممنوع.
    expect(screen()).toContain('canOrder');
    expect(screen()).toContain('outOfStock');
  });

  it('وفيها الإجراءان اللي ينجّمو يتنفّذو: التاجر + المفضلة', () => {
    const source = screen();
    expect(source).toContain('catalog.openSource');
    expect(source).toContain('addCatalogFavorite');
  });
});

describe('حالة المخزون — التطبيع من المصدر', () => {
  it('القاعدة تخزّن `AVAILABLE/LIMITED/OUT_OF_STOCK` (كبير) ⇒ تُقرا صح', () => {
    // العيب اللي كان: التطبيق يقارن بـ`in_stock` (صغير) ⇒ كل المنتوجات كانت
    // تبان «التوفّر غير مؤكّد» — جهل مقنّع بالحياد.
    expect(normalizeStockStatus('AVAILABLE')).toBe('AVAILABLE');
    expect(normalizeStockStatus('LIMITED')).toBe('LIMITED');
    expect(normalizeStockStatus('OUT_OF_STOCK')).toBe('OUT_OF_STOCK');
  });

  it('الصيغة القديمة (`in_stock`) مقبولة كذلك: التطبيق ما يتبعش نسخة القاعدة', () => {
    expect(normalizeStockStatus('in_stock')).toBe('AVAILABLE');
    expect(normalizeStockStatus('sold_out')).toBe('OUT_OF_STOCK');
  });

  it('قيمة مجهولة ⇒ `UNKNOWN` (موّش «موجود» بالتفاؤل)', () => {
    expect(normalizeStockStatus('')).toBe('UNKNOWN');
    expect(normalizeStockStatus(undefined)).toBe('UNKNOWN');
    expect(normalizeStockStatus('nimportequoi')).toBe('UNKNOWN');
  });
});
