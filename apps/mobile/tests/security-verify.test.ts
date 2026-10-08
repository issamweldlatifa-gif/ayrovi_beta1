/**
 * «وثّق حسابك» — المفتاح اللي يبطّل الطلب، لازم يقابلو **فعل**، موش معلومة.
 *
 * الخادم يرفض تأكيد الطلب على حساب بلا إيميل ولا تلفون موثّق
 * (`CONTACT_VERIFICATION_REQUIRED`). زر «وثّق توّا» في شاشة الطلب يودّي
 * لشاشة الأمان — وكانت شاشة الأمان **تعرض الحالة وبرك**: اسم مستعمل يلقى
 * باباً مسدوداً مزيّن بمعلومة. هذي القاعدة تمنع رجوع الصورة هذي:
 *
 *   1. الشاشة تعرض البطاقة **كي الحساب بلا توثيق** فقط، وتقول السبب؛
 *   2. وفيه زر حقيقي يودّي للدخول (Google/Apple/Facebook ولا SMS)؛
 *   3. والمفاتيح موجودين في اللغتين (كاتب/مترجم واحد ما ينساش لغة).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const SCREEN = read('../app/account/security.tsx');
const AR = read('../src/i18n/ar.ts');
const FR = read('../src/i18n/fr.ts');

const KEYS = ['security.verifyCard', 'security.verifyHint', 'security.verifyHow', 'security.verifyGo'] as const;

describe('شاشة الأمان — مسار التوثيق', () => {
  it('البطاقة تظهر فقط كي ما فماش توثيق (إيميل ولا تلفون)', () => {
    expect(SCREEN).toContain('!security.data.emailVerified && !security.data.phoneVerified');
  });

  it('وفيها فعل حقيقي: تودّي للدخول، موش معلومة وبرك', () => {
    expect(SCREEN).toContain("router.push('/sign-in')");
    expect(SCREEN).toMatch(/t\('security\.verifyGo'\)/);
  });

  it('تشرح أنّ التوثيق يجي من الدخول (المزوّد ولا SMS)', () => {
    expect(SCREEN).toMatch(/t\('security\.verifyHow'\)/);
    expect(SCREEN).toMatch(/t\('security\.verifyHint'\)/);
  });

  it('المفاتيح الأربعة موجودين في اللغتين', () => {
    for (const key of KEYS) {
      expect(AR, `ar: ${key}`).toContain(`'${key}':`);
      expect(FR, `fr: ${key}`).toContain(`'${key}':`);
    }
  });

  it('القاموسان ما تخلطوش: النص الفرنسي بلا حروف عربية، والعربي بلا جملة فرنسية', () => {
    // يحصل فعلاً: نصّ يُلصق في القاموس الغالط. نقراو **القيمة** وحدها (بلا المفتاح).
    const value = (dictionary: string, key: string) => {
      const line = dictionary.split('\n').find((entry) => entry.includes(`'${key}':`)) || '';
      const start = line.indexOf(`'${key}':`) + key.length + 4;
      return line.slice(start).replace(/,?\s*$/, '');
    };
    for (const key of KEYS) {
      expect(/[\u0600-\u06FF]/.test(value(FR, key)), `fr: ${key}`).toBe(false);
      expect(/[A-Za-z]{4,}/.test(value(AR, key).replace(/SMS|Google|Apple|Facebook/g, '')), `ar: ${key}`).toBe(false);
    }
  });
});
