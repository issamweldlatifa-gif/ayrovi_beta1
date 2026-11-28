/**
 * S Base — اختبارات حارس الميزانية اليومية (P1-A(a) — D22 v1.1، اعتماد المالك 28/11/2026).
 *
 * على ماذا يقف هذا الملف:
 *  • دفتر بنيوي في الذاكرة يحقق **نفس عقد الجدول** (`get/run/transaction`)
 *    الذي يخدمه سطر `settings` الحقيقي — فنختبر منطق الحجز/السقف/التصفير/
 *    البقاء عبر restart **حرفياً** بلا SQLite أصلي (بناء better-sqlite3 الأصلي
 *    محجوب في بيئة التطوير هذه — قيد موثّق في D22 §7؛ الـe2e الحقيقي على
 *    جدول settings يُختبر حيث تُبنى الاعتماديات الأصلية).
 *  • «البقاء عبر restart» = حارس ثانٍ (instance جديد) على **نفس الدفتر**:
 *    الجديد يقرأ ما كتبه القديم — هذا بالضبط ما يفعله restart على settings.
 *  • ثوابت الكلفة هي ثوابت apify.ts المعلنة — لا أرقام مختلَعة.
 */
import { describe, expect, test } from 'vitest';

import {
  SBASE_BUDGET_COST_USD,
  SBASE_BUDGET_SETTING_KEY,
  createSbaseBudgetGuard,
  readSbaseBudgetCapUsd,
  type SbaseBudgetLedgerDb,
} from '../src/sbase/budget';
import { SbaseError } from '../src/sbase/errors';

/** دفتر بنيوي: سطر واحد بمفتاح setting_key (نفس دلالات جدول settings). */
function fakeLedger() {
  const rows = new Map<string, string>();
  const ledger: SbaseBudgetLedgerDb = {
    get(sql: string, ...params: unknown[]) {
      void sql;
      const value = rows.get(params[0] as string);
      return value === undefined ? undefined : { setting_value: value };
    },
    run(sql: string, ...params: unknown[]) {
      void sql;
      // ترتيب معاملات UPSERT: (id, setting_key, setting_value, updated_at)
      rows.set(params[1] as string, params[2] as string);
    },
    transaction<T>(fn: () => T) {
      return fn();
    },
  };
  return { ledger, rows };
}

const DAY = '2026-11-28T00:00:00.000Z';
const at = (iso: string) => () => new Date(iso);
const tomorrow = '2026-11-29T00:00:00.000Z';

describe('S Base — حارس الميزانية اليومية (P1-A(a) — D22 v1.1)', () => {
  test('الحجز يتراكم لكل نوع بتقديراته المعلنة — بلا أي اختراع أرقام', () => {
    const { ledger } = fakeLedger();
    const guard = createSbaseBudgetGuard(ledger, { capUsd: 100, now: at(DAY) });
    guard('search');
    guard('search');
    guard('detail');
    guard('image');
    const state = guard.snapshot();
    expect(state.date).toBe('2026-11-28');
    expect(state.search).toBeCloseTo(SBASE_BUDGET_COST_USD.search * 2, 5);
    expect(state.detail).toBeCloseTo(SBASE_BUDGET_COST_USD.detail, 5);
    expect(state.image).toBeCloseTo(SBASE_BUDGET_COST_USD.image, 5);
  });

  test('تجاوز السقف: رفض صادق SOURCE_BUDGET_EXCEEDED/503 — والحالة لا تتغيّر (لا حجز جزئي)', () => {
    const { ledger } = fakeLedger();
    const cap = SBASE_BUDGET_COST_USD.search * 2;
    const guard = createSbaseBudgetGuard(ledger, { capUsd: cap, now: at(DAY) });
    guard('search');
    guard('search');
    const before = guard.snapshot();
    let thrown: SbaseError | null = null;
    try { guard('search'); } catch (error) { thrown = error as SbaseError; }
    expect(thrown).not.toBeNull();
    expect(thrown!.code).toBe('SOURCE_BUDGET_EXCEEDED');
    expect(thrown!.status).toBe(503);
    expect(guard.snapshot()).toEqual(before);
  });

  test('replay ملاحظة المالك ② — السجل يبقى عبر restart: حارس جديد على نفس الدفتر يواصل التراكم', () => {
    const { ledger } = fakeLedger();
    const cap = SBASE_BUDGET_COST_USD.search * 3;
    const first = createSbaseBudgetGuard(ledger, { capUsd: cap, now: at(DAY) });
    first('search');
    first('search');
    // «إعادة تشغيل الخادم»: instance جديد، نفس قاعدة البيانات.
    const restarted = createSbaseBudgetGuard(ledger, { capUsd: cap, now: at(DAY) });
    expect(restarted.snapshot().search).toBeCloseTo(SBASE_BUDGET_COST_USD.search * 2, 5);
    restarted('search'); // الثالث يمرّ (تراكم من ما قبل restart)
    let thrown: unknown = null;
    try { restarted('search'); } catch (error) { thrown = error; }
    expect((thrown as SbaseError)?.code).toBe('SOURCE_BUDGET_EXCEEDED');
  });

  test('رولوفر اليوم: تصفير الوحيد مفتاح التاريخ — يوم جديد = سقف كامل', () => {
    const { ledger } = fakeLedger();
    const cap = SBASE_BUDGET_COST_USD.search * 2;
    const guard = createSbaseBudgetGuard(ledger, { capUsd: cap, now: at(DAY) });
    guard('search');
    guard('search');
    expect(() => guard('search')).toThrow(SbaseError);
    const later = createSbaseBudgetGuard(ledger, { capUsd: cap, now: at(tomorrow) });
    expect(later.snapshot()).toEqual({ date: '2026-11-29', search: 0, detail: 0, image: 0 });
    expect(() => later('search')).not.toThrow();
  });

  test('سطر settings تالف ⇒ يوم جديد نظيف — الاستمرارية أولاً (حد موثّق في D22 §4)', () => {
    const { ledger, rows } = fakeLedger();
    rows.set(SBASE_BUDGET_SETTING_KEY, '{not-json');
    const guard = createSbaseBudgetGuard(ledger, { capUsd: 10, now: at(DAY) });
    expect(() => guard('detail')).not.toThrow();
    expect(guard.snapshot().detail).toBeCloseTo(SBASE_BUDGET_COST_USD.detail, 5);
  });

  test('قراءة السقف من env: غائب/تالف/≤0 ⇒ معطّل (null) — نمط البوّة الصامتة', () => {
    expect(readSbaseBudgetCapUsd(undefined)).toBeNull();
    expect(readSbaseBudgetCapUsd('')).toBeNull();
    expect(readSbaseBudgetCapUsd('   ')).toBeNull();
    expect(readSbaseBudgetCapUsd('abc')).toBeNull();
    expect(readSbaseBudgetCapUsd('-3')).toBeNull();
    expect(readSbaseBudgetCapUsd('0')).toBeNull();
    expect(readSbaseBudgetCapUsd('2.55')).toBe(2.55);
    expect(readSbaseBudgetCapUsd(' 2.55 ')).toBe(2.55);
  });

  test('cap=0 بحقن مباشر: أول نداء يُرفض (سلوك الاختبار المتعمد — لا عبر env)', () => {
    const { ledger } = fakeLedger();
    const guard = createSbaseBudgetGuard(ledger, { capUsd: 0, now: at(DAY) });
    let thrown: SbaseError | null = null;
    try { guard('image'); } catch (error) { thrown = error as SbaseError; }
    expect(thrown?.code).toBe('SOURCE_BUDGET_EXCEEDED');
    expect(thrown?.status).toBe(503);
  });
});
