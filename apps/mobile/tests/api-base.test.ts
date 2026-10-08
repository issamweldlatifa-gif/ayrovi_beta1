/**
 * «تبديل عنوان الخادم» — الأمر الواحد لازم يبدّل **كل** المواضع.
 *
 * الحاجة اللي نحميوها: العنوان مكتوب في خمسة بلايص، وكان واحد منهم بقى على
 * القديم تطلع حزمة تشير لخادم آخر (وهذا كان سبب «التطبيق ما يخدمش»). الاختبار
 * ينسخ الملفّات الحقيقية في مجلّد مؤقّت، يشغّل السكريبت، ويتحقّق واحد واحد.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { TARGETS, currentBase, retarget, validateBase } from '../scripts/set-api-base.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '..');
const REPO = path.resolve(MOBILE, '../..');
const NEW = 'https://ayrovi-beta2.onrender.com';
const temporary: string[] = [];

/** نسخة كاملة من الشجرة الحقيقية (نفس المسارات النسبية) في مجلّد مؤقّت. */
function sandbox(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ayrovi-api-'));
  temporary.push(root);
  const files = [
    'apps/mobile/src/api/config.ts',
    'apps/mobile/scripts/release-preflight.mjs',
    'apps/mobile/app.json',
    '.github/workflows/mobile-android.yml',
    '.github/workflows/mobile-release-aab.yml',
    '.github/workflows/beta-smoke.yml',
  ];
  for (const file of files) {
    const destination = path.join(root, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO, file), destination);
  }
  return root;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const read = (root: string, relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('أداة تبديل عنوان الخادم', () => {
  it('ترفض العناوين غير الصالحة (بلا https، فيها مسار، بلا نطاق)', () => {
    expect(() => validateBase('http://ayrovi-beta2.onrender.com')).toThrow(/https/);
    expect(() => validateBase('https://ayrovi-beta2.onrender.com/api')).toThrow(/مسار/);
    expect(() => validateBase('https://localhost')).toThrow(/نطاق/);
    expect(() => validateBase('موش عنوان')).toThrow(/غير صالح/);
    expect(validateBase('https://ayrovi-beta2.onrender.com').hostname).toBe('ayrovi-beta2.onrender.com');
  });

  it('يقرأ العنوان الحالي من الرمز (مرجع واحد)، ويبدّل المواضع الكل', () => {
    const root = sandbox();
    const before = currentBase(root);
    const changes = retarget(NEW, { root });

    // الملفّات الكل تبدّلت (بلا ملف زايد، بلا ملف ناقص).
    expect(changes.map((change) => change.file).sort()).toEqual(TARGETS.map((t) => t.file).sort());
    for (const target of TARGETS) {
      const text = read(root, target.file);
      expect(text).not.toContain(before);
      expect(text).toContain(target.kind === 'replace' ? NEW : 'ayrovi-beta2.onrender.com');
    }

    // الرمز: العنوان الجديد هو الافتراضي.
    expect(read(root, 'apps/mobile/src/api/config.ts')).toContain(`DEFAULT_API_BASE_URL = '${NEW}'`);
    // سكريبت الجهوزية: `apiBase` و`origin` بجوج.
    const preflight = read(root, 'apps/mobile/scripts/release-preflight.mjs');
    expect(preflight).toContain(`apiBase: '${NEW}'`);
    expect(preflight).toContain(`origin: '${NEW}'`);
    // الروابط العميقة: النطاق الجديد زاد، والقديم بقى (روابطه ما تموتش).
    const hosts = JSON.parse(read(root, 'apps/mobile/app.json')).expo.android.intentFilters[0].data.map(
      (entry: { host?: string }) => entry.host,
    );
    expect(hosts).toContain('ayrovi-beta2.onrender.com');
    expect(hosts).toContain(new URL(before).hostname);
    expect(hosts).toContain('ayrovi.tn');
  });

  it('ما يعاودش الكتابة كي العنوان راهو نفسو (بلا تغيير في الـgit)', () => {
    const root = sandbox();
    const same = currentBase(root);
    expect(retarget(same, { root })).toEqual([]);
  });

  it('التجربة بلا كتابة ما تبدّل حتى ملفّ', () => {
    const root = sandbox();
    const before = read(root, 'apps/mobile/src/api/config.ts');
    const changes = retarget(NEW, { root, dryRun: true });
    expect(changes.length).toBeGreaterThan(0);
    expect(read(root, 'apps/mobile/src/api/config.ts')).toBe(before);
  });

  it('العنوان مكتوب في المواضع الكل مرّة وحدة على الأقل', () => {
    // حماية من ملفّ يزيد فيه العنوان بصيغة أخرى ما يبدّلهاش السكريبت.
    const root = sandbox();
    const current = currentBase(root);
    for (const target of TARGETS) {
      const text = read(root, target.file);
      const expected = target.kind === 'replace' ? current : new URL(current).hostname;
      expect(text).toContain(expected);
    }
  });
});

// نكتب ملفّ في المجلّد المؤقّت باش نتأكّدو من صلاحية الكتابة (بلا أثر على الريبو).
it('المجلّد المؤقّت قابل للكتابة', () => {
  const root = sandbox();
  writeFileSync(path.join(root, 'tmp.txt'), 'x');
  expect(read(root, 'tmp.txt')).toBe('x');
});
