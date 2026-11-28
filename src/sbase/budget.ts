/**
 * S Base — حارس الميزانية اليومية لمزوّد Apify (P1-A(a) — D22 v1.1، اعتماد المالك 28/11/2026).
 *
 * لماذا محفوظ لا ذاكري (ملاحظة المالك): عدّاد الذاكرة يموت مع restart فيتجاوز
 * السقف بلا وعي. السجل اليومي في جدول `settings` القائم (صفر migrations) بنمط
 * **check-and-reserve**: transaction واحدة تحجز تقدير النداء قبل الصرف —
 * تصفيرها الوحيد مفتاح التاريخ (يوم UTC جديد)، ولا مسار آخر يصفّرها.
 *
 * الحدود المعلنة (D22 §4):
 *  • الأرقام تقديرات معلنة (`APIFY_*_COST_USD` — ثوابت apify.ts نفسها) لا
 *    فوترة رسمية: الحارس حماية عملية ضد الاستهلاك غير المتحكّم فيه، لا محاسبة
 *    مالية دقيقة.
 *  • تعدد instances غير مدعوم في topology القائمة (التطبيق كله أحادي الكاتب على
 *    SQLite واحد)؛ عند دخول التوسع الأفقي ينتقل الحارس لنقطة تنسيق مشتركة —
 *    شرط مسجّل في بوّة P2 (D20 §9).
 *  • سطر settings تالف ⇒ يوم جديد نظيف (الاستمرارية أولاً — لا جمود كامل بسبب
 *    سطر فاسد)، والفشل نفسه لا يتخفّى: التحفّظ يصعد كأنه يوم جديد.
 *
 * بلا `SBASE_DAILY_BUDGET_USD` (أو قيمة ≤ 0): لا حارس يُحقن — السلوك مطابق
 * لما قبل التنفيذ حرفياً (نمط البوّة الصامتة القائم في `brightDataConfig`).
 */
import { randomUUID } from 'node:crypto';
import { APIFY_DETAIL_COST_USD, APIFY_IMAGE_COST_USD, APIFY_SEARCH_COST_USD } from './apify';
import { SbaseError } from './errors';

export type SbaseBudgetKind = 'search' | 'detail' | 'image';

export const SBASE_BUDGET_SETTING_KEY = 'sbase_budget_v1';

/** الواجهة البنيوية الدنيا للـDB — تُحقن من نقطة التركيب (نفس نمط الجسر القائم). */
export interface SbaseBudgetLedgerDb {
  get(sql: string, ...params: unknown[]): unknown;
  run(sql: string, ...params: unknown[]): void;
  transaction<T>(fn: () => T): T;
}

/** تقديرات الكلفة المعلنة — مصدر واحد للحقيقة: ثوابت apify.ts. */
export const SBASE_BUDGET_COST_USD: Record<SbaseBudgetKind, number> = {
  search: APIFY_SEARCH_COST_USD,
  detail: APIFY_DETAIL_COST_USD,
  image: APIFY_IMAGE_COST_USD,
};

export interface SbaseBudgetState { date: string; search: number; detail: number; image: number }

export interface SbaseBudgetGuard {
  /** يحجز تقدير نداء مدفوع واحد قبل تشغيله، ويرمي `SOURCE_BUDGET_EXCEEDED` (503) عند تجاوز السقف. */
  (kind: SbaseBudgetKind): void;
  /** قراءة الحالة الحالية بلا حجز (تشخيص/اختبارات). */
  snapshot(): SbaseBudgetState;
}

const SELECT_SQL = 'SELECT setting_value FROM settings WHERE setting_key = ?';
const UPSERT_SQL = `INSERT INTO settings
  (id, category, setting_key, setting_value, value_type, label, updated_at, updated_by)
  VALUES (?, 'GENERAL', ?, ?, 'JSON', 'سقف الإنفاق اليومي التقديري لمزوّد Apify — S BASE (ZPIC P1-A)', ?, 'system:zpic-budget')
  ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`;

function freshState(date: string): SbaseBudgetState {
  return { date, search: 0, detail: 0, image: 0 };
}

/** أي حقل مفقود/غير رقم ⇒ صفر، وأي تاريخ غير اليوم ⇒ يوم جديد نظيف. */
function normalizeState(raw: unknown, date: string): SbaseBudgetState {
  const candidate = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SbaseBudgetState>;
  const read = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
  if (candidate.date !== date) return freshState(date);
  return { date, search: read(candidate.search), detail: read(candidate.detail), image: read(candidate.image) };
}

export function createSbaseBudgetGuard(
  db: SbaseBudgetLedgerDb,
  opts: { capUsd: number; now?: () => Date },
): SbaseBudgetGuard {
  const capUsd = opts.capUsd;
  const now = opts.now ?? (() => new Date());

  const reserve = (kind: SbaseBudgetKind): void => {
    const today = now().toISOString().slice(0, 10);
    const decision = db.transaction(() => {
      const row = db.get(SELECT_SQL, SBASE_BUDGET_SETTING_KEY) as { setting_value: string } | undefined;
      let state = freshState(today);
      if (typeof row?.setting_value === 'string') {
        try { state = normalizeState(JSON.parse(row.setting_value), today); } catch { state = freshState(today); }
      }
      const next = Number((state[kind] + SBASE_BUDGET_COST_USD[kind]).toFixed(5));
      if (next > capUsd + 1e-9) return { allowed: false as const };
      state[kind] = next;
      db.run(UPSERT_SQL, randomUUID(), SBASE_BUDGET_SETTING_KEY, JSON.stringify(state), now().toISOString());
      return { allowed: true as const };
    });
    if (!decision.allowed) {
      throw new SbaseError(
        'SOURCE_BUDGET_EXCEEDED',
        `سقف الإنفاق اليومي التقديري لمزوّد Apify بلغ حدّه (${capUsd}$) — النوع: ${kind}. جرّب غداً أو ارفع السقف من إعدادات الخادم.`,
        503,
      );
    }
  };

  const guard = reserve as SbaseBudgetGuard;
  guard.snapshot = (): SbaseBudgetState => {
    const today = now().toISOString().slice(0, 10);
    const row = db.get(SELECT_SQL, SBASE_BUDGET_SETTING_KEY) as { setting_value: string } | undefined;
    if (typeof row?.setting_value !== 'string') return freshState(today);
    try { return normalizeState(JSON.parse(row.setting_value), today); } catch { return freshState(today); }
  };
  return guard;
}

/**
 * قراءة السقف من env — غائب / غير رقم / ≤ 0 ⇒ null: الحارس معطّل تماماً
 * (سقف 0 عبر env = تعطيل مقصود، لا حظر شامل؛ الحظر الفوري بcap=0 متاح
 * في الاختبارات عبر حقن مباشر).
 */
export function readSbaseBudgetCapUsd(raw: string | undefined): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}
