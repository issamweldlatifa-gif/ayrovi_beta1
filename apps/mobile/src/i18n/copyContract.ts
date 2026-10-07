/**
 * عقد النصوص — قواعد قابلة للاختبار على القاموس وعلى المصدر.
 *
 * علاش ملف بلا React وبلا fs: القواعد (ولا وحدة فيها) تتكتب مرة، وتُختبر
 * مباشرة، وتُستعمل من `tests/copy.test.ts` اللي يقرا الملفات. هاكذا ما يبقى
 * «تدقيق لغوي» يدوي كل مرّة — يبقى عقد يمشي مع كل مرة يتشغّل فيها `npm test`.
 *
 * الأحكام اللي يغطّيها:
 *  1. **مفتاح مستعمل بلا نص**: كود يعيّط `t('cart.itemz')` والحرف هذا ما
 *     موجودش ⇒ المستعمل يشوف `cart.itemz`. هنا يوقفنا.
 *  2. **نص بلا مستعمل**: نص عمره ما يظهر (كود مات)، ولا يوصف حالة ما تصيرش.
 *  3. **لغة غالطة**: حرف عربي في النص الفرنسي، ولا حرف فرنسي مشكول في العربي.
 *  4. **متغيّرات ما تتطابقش**: `{count}` في الفرنسي و`{nombre}` في العربي ⇒
 *     القيمة تختفي بصمت.
 *  5. **نص مجمّد**: نصوص قالها صاحب المشروع بالحرف (مثل «Add to Cart»).
 */

export type Dictionary = Record<string, string>;

export interface CopyFinding {
  key: string;
  detail: string;
}

/** حرف عربي (الفبائي والملحقات) — نستعملوه باش نكشفو العربي في الفرنسي. */
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * تشكيل فرنسي صريح. الحروف المشكولة فقط: نقطة (`.`) ولا رقم ما يدخلوش هنا،
 * لهذا ما فماش نتائج مزيفة في النصوص التقنية (`P3`, `AYWEBs`, `TND`).
 */
const FRENCH_DIACRITIC = /[éèêëàâçôûùîïœÉÈÀÂÇÙÎÔÛ]/;

/** `{name}` داخل نص — نستعملوه باش نقارنو المتغيّرات بين اللغتين. */
export function placeholders(value: string): string[] {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** المتغيّرات ما تتطابقش بين اللغتين. */
export function placeholderDrift(ar: Dictionary, fr: Dictionary): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const key of Object.keys(fr)) {
    if (!(key in ar)) continue;
    const expected = placeholders(fr[key]);
    const actual = placeholders(ar[key]);
    if (expected.join(',') !== actual.join(',')) {
      findings.push({ key, detail: `fr={${expected.join(',')}} ar={${actual.join(',')}}` });
    }
  }
  return findings;
}

/**
 * لغة غالطة داخل نص. `allow` = استثناءات صريحة بمفتاحها (مثلًا `language.fr`
 * مكتوب بالفرنسي عن قصد، والعكس).
 */
export function wrongLanguage(
  dictionary: Dictionary,
  locale: 'ar' | 'fr',
  allow: string[] = [],
): CopyFinding[] {
  const allowed = new Set(allow);
  const findings: CopyFinding[] = [];
  for (const [key, value] of Object.entries(dictionary)) {
    if (allowed.has(key)) continue;
    const text = String(value);
    if (locale === 'fr' && ARABIC_LETTER.test(text)) {
      findings.push({ key, detail: 'حرف عربي في نص فرنسي' });
    }
    if (locale === 'ar' && FRENCH_DIACRITIC.test(text)) {
      findings.push({ key, detail: 'تشكيل فرنسي في نص عربي' });
    }
  }
  return findings;
}

/** نص مجمّد: القيمة لازم تكون هي نفسها بالحرف، وإلاّ رجعنا السبب. */
export function exactCopyProblems(
  dictionary: Dictionary,
  expectations: Array<{ key: string; value: string; why: string }>,
): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const { key, value, why } of expectations) {
    if (!(key in dictionary)) {
      findings.push({ key, detail: `المفتاح ما موجودش (${why})` });
      continue;
    }
    if (dictionary[key] !== value) {
      findings.push({ key, detail: `لازم تكون «${value}» (${why})` });
    }
  }
  return findings;
}

/** أول قطعة من المفتاح (`cart` في `cart.empty`) — أساس معرفة «هذا مفتاح». */
export function keyPrefixes(dictionary: Dictionary): Set<string> {
  const prefixes = new Set<string>();
  for (const key of Object.keys(dictionary)) prefixes.add(key.split('.')[0]);
  return prefixes;
}

const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;

/**
 * كل الحرفيات في المصدر اللي **تشبه مفتاح ترجمة معروف**: الشكل `a.b` وأوّل
 * قطعة منها عائلة موجودة في القاموس (`cart`, `aywebs`, `status`…). الشرط
 * الثاني هو اللي يمنع الأفعال المزيفة: `app.ayrovi.mobile`، `2.0.0`،
 * `shared/publicSeo` ما يدخلوش.
 */
export function keyReferences(source: string, dictionary: Dictionary): string[] {
  const prefixes = keyPrefixes(dictionary);
  const found = new Set<string>();
  for (const match of source.matchAll(/'([^'\n\\]{2,80})'|"([^"\n\\]{2,80})"/g)) {
    const literal = match[1] ?? match[2] ?? '';
    if (!KEY_SHAPE.test(literal)) continue;
    if (!prefixes.has(literal.split('.')[0])) continue;
    found.add(literal);
  }
  return [...found];
}

/**
 * بادئات المفاتيح المتكوّنة في الوقت الحقيقي: `t(\`pay.${choice}\`)` ⇒ `pay.`،
 * و`t(\`screen.${tab}.body\`)` ⇒ `screen.`. البادئة = **النص الثابت قبل أوّل
 * `\${}`**: الجزء المتحرّك يقدر يكون في الوسط (`screen.<tab>.body`)، فما
 * ناخذوش النص كامل.
 */
export function dynamicPrefixes(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/t\(\s*`([^`]+)`/g)) {
    const prefix = match[1].split('${')[0];
    if (prefix) found.add(prefix);
  }
  return [...found];
}

/** مفاتيح مطلوبة من الكود وما عندهاش نص — أوّل حكم في هذا الملف. */
export function missingKeys(dictionary: Dictionary, references: string[]): CopyFinding[] {
  const findings: CopyFinding[] = [];
  for (const key of references) {
    if (!(key in dictionary)) findings.push({ key, detail: 'مستعمل في الكود وبلا نص' });
  }
  return findings;
}

/**
 * نصوص ما يوصللهاش المستعمل: لا استعمال حرفي، ولا تكوين ديناميكي يغطّيها.
 * النص الميّت موش «بلا ضرر»: يوهم أن الحالة مغطّاة، ويقدّم نصاً قديم للمترجم.
 */
export function unreachableKeys(
  dictionary: Dictionary,
  references: string[],
  prefixes: string[],
): CopyFinding[] {
  const used = new Set(references);
  const findings: CopyFinding[] = [];
  for (const key of Object.keys(dictionary)) {
    if (used.has(key)) continue;
    if (prefixes.some((prefix) => prefix.length > 1 && key.startsWith(prefix))) continue;
    findings.push({ key, detail: 'نص ما يوصلش للمستعمل' });
  }
  return findings;
}
