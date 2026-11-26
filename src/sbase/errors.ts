/**
 * S Base — خطأ موحّد لكل المزوّدين (SandBase وApify).
 *
 * لماذا ملف مستقل (26/11/2026): بعد بناء مزوّد Apify جانب SandBase، يجب أن
 * تحمل كل الأخطاء **الصنف نفسه** (`SbaseError`) حتى تفهمها المسارات و`instanceof`
 * في الاختبارات بغضّ النظر عن المزوّد اللي رماها. المزوّدان يرميان بالأكواد
 * الموثّقة نفسها: NOT_CONFIGURED / UNAUTHORIZED / RATE_LIMIT / TIMEOUT / HTTP_x /
 * FAILED / EMPTY / NETWORK / MALFORMED — مع بادئة المزوّد (SANDBASE_ · APIFY_).
 *
 * قاعدة المالك: الفشل **ما يتفوترش وما يتلبسش** «ما فماش نتائج» — الكود يقول
 * الحقيقة، والحالة (status) هي اللي تختار سلوك الشاشة.
 */
export class SbaseError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'SbaseError';
    this.code = code;
    this.status = status;
  }
}
