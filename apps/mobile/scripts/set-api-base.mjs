#!/usr/bin/env node
/**
 * تبديل عنوان الخادم في كل مكان، بأمر واحد.
 *
 * علاش موجود: العنوان مكتوب في خمسة بلايص (الرمز الافتراضي، ورشتي APK/AAB،
 * سكريبت الجهوزية، وفحص «من البداية للآخر»). نبدّل واحد وننسى الثاني ⇒ حزمة
 * تشير لخادم آخر — وهذا هو بالضبط الغلط اللي خلّى «التطبيق ما يخدمش» (كان
 * يشير لـ`ayrovi.tn` اللي ما فيهش خادم).
 *
 * الاستعمال:
 *   node scripts/set-api-base.mjs https://ayrovi-beta2.onrender.com
 *   node scripts/set-api-base.mjs https://ayrovi-beta2.onrender.com --dry-run
 *
 * الاختبار `tests/origin.test.ts` يتحقّق من بعد أنّ المواضع الكل متّفقين؛
 * و`app.json` يزيد النطاق الجديد في الروابط العميقة (وما ينحّيش القديم:
 * الروابط القديمة لازمها تبقى تفتح التطبيق).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** جذر الريبو (المسارات هنا نسبيّة ليه، كيف ما هي في git). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** الملفّات اللي فيها العنوان، وواش نعملو فيها. */
export const TARGETS = [
  { file: 'apps/mobile/src/api/config.ts', kind: 'replace' },
  { file: '.github/workflows/mobile-android.yml', kind: 'replace' },
  { file: '.github/workflows/mobile-release-aab.yml', kind: 'replace' },
  { file: 'apps/mobile/scripts/release-preflight.mjs', kind: 'replace' },
  { file: '.github/workflows/beta-smoke.yml', kind: 'replace' },
  { file: 'apps/mobile/app.json', kind: 'hosts' },
];

/** عنوان HTTPS نظيف: بلا مسار، بلا استعلام، بلا منفذ غريب. */
export function validateBase(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error(`عنوان غير صالح: ${raw}`);
  }
  if (url.protocol !== 'https:') throw new Error(`لازم https (موش ${url.protocol})`);
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('بلا مسار ولا استعلام: الأصل وحدو');
  if (!url.hostname.includes('.')) throw new Error(`اسم نطاق ناقص: ${url.hostname}`);
  if (url.port) throw new Error('بلا منفذ صريح');
  return url;
}

/** العنوان الحالي — يُقرأ من `src/api/config.ts`، وهو المرجع. */
export function currentBase(root = ROOT) {
  const source = readFileSync(path.join(root, 'apps/mobile/src/api/config.ts'), 'utf8');
  const found = source.match(/DEFAULT_API_BASE_URL\s*=\s*'([^']+)'/);
  if (!found) throw new Error('ما لقيناش DEFAULT_API_BASE_URL في apps/mobile/src/api/config.ts');
  return found[1];
}

/**
 * يبدّل كل المواضع. يرجع قائمة التبديلات (بلا كتابة كان `dryRun`).
 * @returns {{ file: string, before: string, after: string }[]}
 */
export function retarget(newBase, { root = ROOT, dryRun = false } = {}) {
  const url = validateBase(newBase);
  const from = currentBase(root);
  const to = url.origin;
  if (from === to) return [];
  const changes = [];

  for (const target of TARGETS) {
    const full = path.join(root, target.file);
    const text = readFileSync(full, 'utf8');
    let next = text;

    if (target.kind === 'replace') {
      next = text.split(from).join(to);
    } else {
      const manifest = JSON.parse(text);
      const filters = manifest?.expo?.android?.intentFilters?.[0]?.data;
      if (!Array.isArray(filters)) throw new Error('app.json: بنية intentFilters تبدّلت');
      if (!filters.some((entry) => entry.host === url.hostname)) {
        // نزيدو النطاق الجديد حدا القديم: الروابط القديمة تبقى تفتح التطبيق.
        filters.push({ scheme: 'https', host: url.hostname, pathPrefix: '/' });
      }
      next = `${JSON.stringify(manifest, null, 2)}\n`;
    }

    if (next !== text) {
      if (!dryRun) writeFileSync(full, next);
      changes.push({ file: target.file, before: from, after: to });
    }
  }
  return changes;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const base = args.find((arg) => !arg.startsWith('--'));
  if (!base) {
    console.error('الاستعمال: node scripts/set-api-base.mjs <https://الخادم> [--dry-run]');
    process.exit(2);
  }
  try {
    const changes = retarget(base, { dryRun });
    if (changes.length === 0) {
      console.log(`✅ العنوان راهو نفسو من قبل (${currentBase()}) — ما تبدّل شيء.`);
    } else {
      console.log(`${dryRun ? '🔎 (تجربة بلا كتابة)' : '✅'} العنوان الجديد: ${validateBase(base).origin}`);
      for (const change of changes) console.log(`   • ${change.file}`);
      console.log('   بعدها: npm test (اختبار الأصل يتحقّق من التناسق) ثم commit + push.');
    }
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
