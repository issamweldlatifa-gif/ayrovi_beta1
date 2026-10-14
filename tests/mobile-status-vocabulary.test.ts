/**
 * مفردات الحالات — التطبيق والمرآة.
 *
 * التطبيق يعرض الحالات اللي يبعثها الخادم (`orders.status`، `payment_status`،
 * `payment_method`، `deposit_status`). والقائمة الحقيقية مكتوبة في مخطط قاعدة
 * البيانات (`CHECK(… IN (…))`) — موش في التطبيق ولا في ملف نصّي.
 *
 * علاش هذا الاختبار عند الجذر: باش تبقى **المرآة** في
 * `apps/mobile/src/api/labels.ts` مطابقة للمخطط. كان الخادم زاد حالة جديدة
 * وبقى التطبيق متخلّف، المستعمل يقرا `OUT_FOR_DELIVERY` خام في الشاشة — وهذا
 * بالضبط الفرق اللي لازم يولي واضحاً بين تحديث التطبيق وتحديث الخادم.
 * الاختبار مستقلّ عن قاعدة البيانات: يقرا الملفات فقط، فيمشي في CI بلا بناء
 * أصلي (كان الرمز `better-sqlite3` ما تعمّرش).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * جذر المشروع = مجلد التشغيل (vitest يتشغّل من الجذر). ما نستعملوش
 * `import.meta.url`: `tsconfig` الجذر `module: commonjs` وما يقبلهاش.
 * نفس اللي يعملوه باقي اختبارات الجذر (`process.cwd()`).
 */
const ROOT = process.cwd();
const SCHEMA = readFileSync(path.join(ROOT, 'src/db/database.ts'), 'utf8');
const MIRROR = readFileSync(path.join(ROOT, 'apps/mobile/src/api/labels.ts'), 'utf8');

/** جدول الطلبات وحده: الشرط `CHECK` هذا هو اللي يحدّد ما ينجّم يبعثو الخادم. */
function ordersTableSql(): string {
  const start = SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS orders (');
  expect(start, 'جدول الطلبات ما لقيناهش في المخطط').toBeGreaterThan(-1);
  const end = SCHEMA.indexOf('\n);', start);
  expect(end, 'نهاية جدول الطلبات ما لقيناهاش').toBeGreaterThan(start);
  return SCHEMA.slice(start, end);
}

/** قائمة مغلقة من المخطط: `CHECK(<column> IN ('A','B',…))`. */
function schemaValues(column: string): string[] {
  const pattern = new RegExp(`CHECK\\(${column} IN \\(([^)]*)\\)\\)`);
  const match = ordersTableSql().match(pattern);
  expect(match, `ما فماش CHECK لـ${column} في جدول الطلبات`).not.toBeNull();
  return [...String(match?.[1] || '').matchAll(/'([A-Z0-9_]+)'/g)].map((row) => row[1]);
}

/** مرآة التطبيق: `export const X_CODES = ['A', …] as const;`. */
function mirrorValues(constant: string): string[] {
  const match = MIRROR.match(new RegExp(`export const ${constant} = \\[([\\s\\S]*?)\\] as const;`));
  expect(match, `${constant} ما موجودش في apps/mobile/src/api/labels.ts`).not.toBeNull();
  return [...String(match?.[1] || '').matchAll(/'([A-Z0-9_]+)'/g)].map((row) => row[1]);
}

const FAMILIES: Array<{ column: string; constant: string; family: string; size: number }> = [
  { column: 'status', constant: 'ORDER_STATUS_CODES', family: 'order', size: 10 },
  { column: 'payment_status', constant: 'PAYMENT_STATUS_CODES', family: 'payment', size: 7 },
  { column: 'payment_method', constant: 'PAYMENT_METHOD_CODES', family: 'method', size: 7 },
  { column: 'deposit_status', constant: 'DEPOSIT_STATUS_CODES', family: 'deposit', size: 5 },
];

/** المفاتيح المنشورة لكل عائلة: `'status.order.CREATED'` ⇒ `CREATED`. */
function mappedCodes(family: string): string[] {
  return [...MIRROR.matchAll(new RegExp(`'status\\.${family}\\.([A-Z0-9_]+)'`, 'g'))].map((row) => row[1]);
}

describe('مفردات الطلب: التطبيق = مخطط قاعدة البيانات', () => {
  test('كل عائلة: نفس الأكواد ونفس الترتيب', () => {
    for (const entry of FAMILIES) {
      const schema = schemaValues(entry.column);
      const mirror = mirrorValues(entry.constant);
      expect(schema.length, `${entry.column}: عدد الأكواد`).toBe(entry.size);
      expect(mirror, `${entry.constant} مرآة ${entry.column}`).toEqual(schema);
    }
  });

  test('كل كود منشور كمفتاح، وكل مفتاح أصلو كود', () => {
    for (const entry of FAMILIES) {
      const values = mirrorValues(entry.constant);
      for (const code of values) {
        expect(MIRROR, `${entry.constant}: ${code} بلا مفتاح`).toContain(`${code}: 'status.`);
      }
      // ولا مفتاح زايد بلا كود في المخطط (نص لحالة ما تبعثهاش القاعدة).
      expect(mappedCodes(entry.family).sort(), `status.${entry.family}.*`).toEqual([...values].sort());
    }
  });
});
