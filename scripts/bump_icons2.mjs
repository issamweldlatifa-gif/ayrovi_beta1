// سكربت تكميلي: يكبّر الأيقونات العشوائية (h-[Npx]) وأحجام size={N} في مساعد AI وملف المستخدم.
import { readFileSync, writeFileSync } from 'node:fs';

const replacers = [
  // أيقونات مساعد AI العشوائية (~18px) → أكبر
  [/h-\[18px\] w-\[18px\]/g, 'h-7 w-7'],
  [/h-\[17px\] w-\[17px\]/g, 'h-7 w-7'],
  [/h-\[16px\] w-\[16px\]/g, 'h-7 w-7'],
  [/h-\[22px\] w-\[22px\]/g, 'h-8 w-8'],
  [/h-\[20px\] w-\[20px\]/g, 'h-8 w-8'],
  // أحجام size={N} في المساعد
  [/size=\{18\}/g, 'size={26}'],
  [/size=\{15\}/g, 'size={22}'],
  [/size=\{16\}/g, 'size={24}'],
  [/size=\{23\}/g, 'size={30}'],
  [/size=\{20\}/g, 'size={28}'],
  // ملف المستخدم: توحيد الأيقونات إلى 28px
  [/h-5 w-5/g, 'h-7 w-7'],
  [/h-6 w-6/g, 'h-7 w-7'],
  [/h-4 w-4/g, 'h-6 w-6'],
];

const files = process.argv.slice(2);
let total = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { console.error('تخطّي:', file); continue; }
  let next = text;
  let count = 0;
  for (const [re, rep] of replacers) { const before = next; next = next.replace(re, rep); count += (before.match(re)?.length || 0); }
  if (next !== text) { writeFileSync(file, next); total += count; console.log(`✓ ${file} (${count})`); }
  else console.log(`· بدون تغيير: ${file}`);
}
console.log(`\nتم تكبير ${total} موضع.`);
