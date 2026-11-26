/**
 * S Base — صنف الخطأ الموحّد.
 *
 * لماذا ملف مستقل (26/11/2026): المسارات و`instanceof` يحتاجون صنفاً واحداً
 * بغضّ النظر عن مصدر الخطأ — الملف هو بيت `SbaseError`، والأكواد الموثّقة نفسها:
 * NOT_CONFIGURED / UNAUTHORIZED / RATE_LIMIT / TIMEOUT / HTTP_x / FAILED /
 * EMPTY / NETWORK / MALFORMED، ببادئة المزوّد (APIFY_).
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
