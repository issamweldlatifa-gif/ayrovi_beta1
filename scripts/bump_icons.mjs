// سكربت مؤقت: يكبّر أيقونات الواجهة العامة بشكل موحّد ومنخفض المخاطر.
// يطابق فقط أزواج h-N w-N المربّعة (وأمثالها المتجاوبة sm:h-N sm:w-N) وأحجام size={N} المفردة،
// ويزيد القيمة بخطوة واحدة (للأصناف) أو 3 (للأحجام) مع سقف.
import { readFileSync, writeFileSync } from 'node:fs';

const STEP_CLASS = 1;
const STEP_SIZE = 3;
const CAP_CLASS = 11;
const CAP_SIZE = 44;
const MIN = 4;

const bumpNum = (n, step, cap) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < MIN) return n;
  return String(Math.min(cap, v + step));
};

// h-N w-N حيث N==M (مربّع = أيقونة عادةً)
const reClass = /(?<![\w-])(h-)(\d+)( w-)(\d+)(?=[\s"'`}])/g;
const reClassSm = /(?<![\w-])(sm:h-)(\d+)( sm:w-)(\d+)(?=[\s"'`}])/g;
// size={N}
const reSize = /(?<![\w])size=\{(\d+)\}/g;

function transform(text) {
  let out = text.replace(reClass, (_m, a, b, c, d) => (b === d ? `${a}${bumpNum(b, STEP_CLASS, CAP_CLASS)}${c}${bumpNum(d, STEP_CLASS, CAP_CLASS)}` : _m));
  out = out.replace(reClassSm, (_m, a, b, c, d) => (b === d ? `${a}${bumpNum(b, STEP_CLASS, CAP_CLASS)}${c}${bumpNum(d, STEP_CLASS, CAP_CLASS)}` : _m));
  out = out.replace(reSize, (_m, b) => `size={${bumpNum(b, STEP_SIZE, CAP_SIZE)}}`);
  return out;
}

const files = process.argv.slice(2);
let total = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { console.error('تخطّي (غير موجود):', file); continue; }
  const next = transform(text);
  if (next !== text) {
    writeFileSync(file, next);
    const changed = (text.match(reClass)?.length || 0) + (text.match(reClassSm)?.length || 0) + (text.match(reSize)?.length || 0);
    total += changed;
    console.log(`✓ ${file}`);
  } else {
    console.log(`· بدون تغيير: ${file}`);
  }
}
console.log(`\nتم تكبير ${total} موضع تقريباً.`);
