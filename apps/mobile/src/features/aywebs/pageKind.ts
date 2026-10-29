/**
 * « هل هذه الصفحة بطاقة منتوج؟ » — القاعدة الوحيدة التي تسمح بفتح ورقة الاختيار
 * على صفحة ما نشرتش منتوج.
 *
 * علاش في التطبيق زادة، وقتاش الخادم يحكم: على متجر بلا motif في URL (أو domaine
 * موش في السجل) ما فماش كيفاش نعرفو قبل الحقن. المستعمل يضغط «زيد للسلّة»،
 * والقراءة تجي — وإذا الصفحة صفحة متجر (accueil، rayon، تحويل بلد) ما فماش
 * منتوج باش نعرضوه: الورقة ما تتفتحش، والسبب يتقال.
 *
 * نفس القاعدة موجودة على الخادم (`classifyAyWebsCapturedPage` في
 * `shared/aywebsCapture.ts` + `src/aywebs/webviewCapture.ts`) — وهي **المرجع**.
 * النسخة هذه مصغّرة باش تشتغل في التطبيق (ما نجرّوش shared/ عبر Metro)،
 * و`tests/aywebs-page-kind-drift.test.ts` يقارن الزوز على كل التركيبات: أي
 * انحراف بينهم يفشّل الاختبار.
 */

export type PageKind = 'PRODUCT_CARD' | 'STOREFRONT' | 'AD';

export interface PageSignals {
  hasTitle: boolean;
  hasPrice: boolean;
  hasPurchaseControl: boolean;
  hasVariants: boolean;
  hasImages: boolean;
  hasProductShell: boolean;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** إشارات الصفحة من القراءة — نفس تعريف الخادم، حرفياً. */
export function pageSignalsOf(capture: unknown): PageSignals {
  const page = isRecord(capture) ? capture : {};
  const amazon = isRecord(page.amazon) ? page.amazon : null;
  const shein = isRecord(page.shein) ? page.shein : null;
  const aliexpress = isRecord(page.aliexpress) ? page.aliexpress : null;
  const temu = isRecord(page.temu) ? page.temu : null;
  const candidates = Array.isArray(page.priceCandidates) ? page.priceCandidates : [];
  const groups = Array.isArray(page.variantGroups) ? page.variantGroups : [];
  const variants = amazon && Array.isArray(amazon.variants) ? amazon.variants : [];
  const options = amazon && Array.isArray(amazon.options) ? amazon.options : [];
  const aeSkus = aliexpress && Array.isArray(aliexpress.skus) ? aliexpress.skus : [];
  const images = Array.isArray(page.images) ? page.images : [];
  const pageAsin = amazon ? text(amazon.pageAsin).toUpperCase() : '';
  const sheinGoodsId = shein ? text(shein.pageGoodsId) : '';
  const aeItemId = aliexpress ? text(aliexpress.pageItemId) : '';
  const temuGoodsId = temu ? text(temu.pageGoodsId) : '';
  return {
    hasTitle: Boolean(text(page.title).slice(0, 300)),
    hasPrice: candidates.some((candidate) => Boolean(text(isRecord(candidate) ? candidate.text : candidate))),
    hasPurchaseControl: Boolean(text(page.addToCartText)),
    hasVariants: groups.length > 0 || variants.length > 0 || options.length > 0 || aeSkus.length > 0,
    hasImages: images.length > 0,
    hasProductShell: /^[A-Z0-9]{10}$/.test(pageAsin)
      || /^\d{5,16}$/.test(sheinGoodsId)
      || /^\d{6,20}$/.test(aeItemId)
      || /^\d{8,24}$/.test(temuGoodsId),
  };
}

/** نفس ترتيب القرار على الخادم — لا يُعاد ترتيبه هنا. */
export function classifyPageSignals(signals: PageSignals): { kind: PageKind; reason: string } {
  const selling = signals.hasPurchaseControl || signals.hasVariants || signals.hasProductShell;
  if (signals.hasPrice && signals.hasTitle) return { kind: 'PRODUCT_CARD', reason: 'prix_et_titre' };
  if (selling && signals.hasTitle) return { kind: 'PRODUCT_CARD', reason: signals.hasProductShell ? 'coquille_produit' : 'commande_ou_variantes' };
  if (signals.hasPrice) return { kind: 'AD', reason: 'prix_sans_identite' };
  if (signals.hasProductShell && signals.hasImages) return { kind: 'PRODUCT_CARD', reason: 'coquille_produit_sans_titre' };
  return { kind: 'STOREFRONT', reason: 'aucun_repere_de_fiche' };
}

/** القراءة تخصّ بطاقة منتوج؟ */
export function captureIsProductCard(capture: unknown): boolean {
  return classifyPageSignals(pageSignalsOf(capture)).kind === 'PRODUCT_CARD';
}
