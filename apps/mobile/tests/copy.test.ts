/**
 * تدقيق النصوص — يحرس الحاجات اللي ما يتشافوش في مراجعة سريعة:
 *  1. مفتاح يعيّط عليه الكود وما عندوش نص (المستعمل يشوف `cart.itemz`)؛
 *  2. نص ما يوصلش للمستعمل أصلاً (كود مات ولا حالة ما تصيرش)؛
 *  3. عربي في الفرنسي، ولا فرنسي مشكول في العربي؛
 *  4. `{count}` في لغة و`{nombre}` في الأخرى ⇒ الرقم يختفي بصمت؛
 *  5. نصوص مجمّدة قالها صاحب المشروع بالحرف (مثل «Add to Cart»)؛
 *  6. كل حالة يبعثها الخادم عندها تسمية بلغة المستعمل (الحالات، وسائل الخلاص،
 *     أكواد منع الشراء) — وإلاّ الكود الخام يوصل للشاشة.
 *
 * القواعد نفسها في `src/i18n/copyContract.ts` (بلا React وبلا fs) — هذا الملف
 * يقرا الملفات ويطبّقها.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ar } from '../src/i18n/ar';
import { fr } from '../src/i18n/fr';
import {
  dynamicPrefixes,
  exactCopyProblems,
  keyReferences,
  missingKeys,
  placeholderDrift,
  unreachableKeys,
  wrongLanguage,
  type Dictionary,
} from '../src/i18n/copyContract';
import { PAYMENT_DEFINITIONS } from '../src/api/checkout';
import { OCEREX_BLOCK_CODES } from '../src/api/ocerex';
import { statusCodes, statusKey } from '../src/api/labels';

const AR = ar as unknown as Dictionary;
const FR = fr as unknown as Dictionary;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * القاموسان ما يتقراوش كمراجع (هما المصدر)، وكذلك ملف العقد: فيه أمثلة
 * `t('cart.itemz')` في التعليق، وهو موش كود واجهة.
 */
const NOT_SOURCE = ['src/i18n/ar.ts', 'src/i18n/fr.ts', 'src/i18n/copyContract.ts'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(relative));
    else if (/\.tsx?$/.test(entry.name) && !NOT_SOURCE.includes(relative)) out.push(relative);
  }
  return out;
}

const SOURCES = [...sourceFiles('app'), ...sourceFiles('src')].map((relative) => ({
  relative,
  text: readFileSync(path.join(ROOT, relative), 'utf8'),
}));
const ALL_SOURCE = SOURCES.map((file) => file.text).join('\n');

const REFERENCES = new Set<string>();
for (const file of SOURCES) for (const key of keyReferences(file.text, FR)) REFERENCES.add(key);
const DYNAMIC_PREFIXES = dynamicPrefixes(ALL_SOURCE);

describe('عقد النصوص — القاموس', () => {
  it('ما فماش مفتاح يستدعيه الكود وبلا نص', () => {
    expect(missingKeys(FR, [...REFERENCES]).map((finding) => `${finding.key} (${finding.detail})`)).toEqual([]);
    expect(missingKeys(AR, [...REFERENCES]).map((finding) => `${finding.key} (${finding.detail})`)).toEqual([]);
  });

  it('ما فماش نص ميّت ما يوصلش للمستعمل', () => {
    expect(unreachableKeys(AR, [...REFERENCES], DYNAMIC_PREFIXES).map((f) => f.key)).toEqual([]);
    expect(unreachableKeys(FR, [...REFERENCES], DYNAMIC_PREFIXES).map((f) => f.key)).toEqual([]);
  });

  it('ما فماش لغة غالطة داخل النص', () => {
    // الاستثناءان الوحيدان: اسم اللغة نفسها، مكتوب بلغتها.
    expect(wrongLanguage(FR, 'fr', ['language.ar']).map((f) => `${f.key}: ${f.detail}`)).toEqual([]);
    expect(wrongLanguage(AR, 'ar', ['language.fr']).map((f) => `${f.key}: ${f.detail}`)).toEqual([]);
  });

  it('المتغيّرات متاع `{}` متطابقة بين اللغتين', () => {
    expect(placeholderDrift(AR, FR).map((f) => `${f.key}: ${f.detail}`)).toEqual([]);
  });

  it('النصوص المجمّدة كيما قالها صاحب المشروع', () => {
    expect(exactCopyProblems(AR, [
      {
        key: 'aywebs.addToCart',
        value: 'Add to Cart',
        why: 'قرار AYWEBs: التسمية بالحرف — لا «Buy» لا «احترِ توّا»',
      },
    ]).map((f) => `${f.key}: ${f.detail}`)).toEqual([]);
    expect(exactCopyProblems(FR, [
      {
        key: 'aywebs.addToCart',
        value: 'Add to Cart',
        why: 'نفس القرار في الفرنسية: زرّ الإضافة ما يتبدّلش',
      },
    ]).map((f) => `${f.key}: ${f.detail}`)).toEqual([]);
  });

  it('زرّ الإضافة يقرا النص المجمّد، ما يكتبش «Add to Cart» في اليد', () => {
    const sheet = readFileSync(path.join(ROOT, 'src/features/aywebs/AddToCartSheet.tsx'), 'utf8');
    expect(sheet).toContain("t('aywebs.addToCart')");
  });
});

describe('عقد النصوص — المفاتيح المتكوّنة في الوقت الحقيقي', () => {
  it('التبويبات: `tabs.<tab>` و`screen.<tab>.*` لكل تبويب مستعمل', () => {
    const tabs = new Set<string>();
    for (const file of SOURCES) {
      for (const match of file.text.matchAll(/<Screen[^>]*\btab="([^"]+)"/g)) tabs.add(match[1]);
      for (const match of file.text.matchAll(/<Tabs\.Screen[^>]*\bname="([^"]+)"/g)) tabs.add(match[1]);
    }
    /**
     * Modèle de navigation en vigueur :
     *   • la barre du bas porte cinq OUTILS — lens · aywebs · sonim · vision ·
     *     ocerex (consigne produit) ;
     *   • `index` (l’accueil), `account` et `cart` restent des ROUTES — l’en-tête
     *     et le tiroir pointent dessus — mais sont retirés de la barre
     *     (`href: null`). Un onglet masqué n’est pas un onglet supprimé : on ne
     *     casse pas les liens existants pour un changement de navigation.
     * Ce test ne fige donc pas une liste décorative : il garantit que tout
     * onglet déclaré — visible ou non — possède ses textes dans les deux langues.
     */
    expect([...tabs].sort()).toEqual([
      'account', 'aywebs', 'cart', 'index', 'lens', 'ocerex', 'sonim', 'vision',
    ]);
    for (const tab of tabs) {
      const labelKey = tab === 'index' ? 'tabs.home' : `tabs.${tab}`;
      const keys = tab === 'index' ? [labelKey] : [labelKey, `screen.${tab}.subtitle`, `screen.${tab}.body`];
      for (const key of keys) {
        expect(Object.keys(FR), `${key} (تبويب ${tab})`).toContain(key);
        expect(Object.keys(AR), `${key} (تبويب ${tab})`).toContain(key);
      }
    }
  });

  it('وسائل الخلاص: كل تعريف عندو تسمية وشرح وسبب منع', () => {
    for (const definition of PAYMENT_DEFINITIONS) {
      for (const key of [definition.labelKey, definition.hintKey, definition.blockedKey]) {
        expect(Object.keys(FR), key).toContain(key);
        expect(Object.keys(AR), key).toContain(key);
      }
    }
  });

  it('حالات الخادم: كل كود من مفردات المخطط عندو تسمية في اللغتين', () => {
    for (const family of ['order', 'payment', 'method', 'deposit'] as const) {
      for (const code of statusCodes(family)) {
        const key = statusKey(family, code);
        expect(key, `${family}/${code}`).not.toBeNull();
        expect(Object.keys(FR), `${family}/${code}`).toContain(String(key));
        expect(Object.keys(AR), `${family}/${code}`).toContain(String(key));
      }
    }
  });

  it('كود مجهول ما يتسمّاش بالغالط: يرجع `null` ⇒ الواجهة تعرض الكود', () => {
    expect(statusKey('order', 'STATUS_FROM_THE_FUTURE')).toBeNull();
    expect(statusKey('payment', '')).toBeNull();
  });

  it('أكواد منع الشراء (OCEREX): لكل واحد نص باللغتين', () => {
    for (const code of OCEREX_BLOCK_CODES) {
      if (!code) continue;
      const key = `ocerex.block.${code}`;
      expect(Object.keys(FR), key).toContain(key);
      expect(Object.keys(AR), key).toContain(key);
    }
  });
});
