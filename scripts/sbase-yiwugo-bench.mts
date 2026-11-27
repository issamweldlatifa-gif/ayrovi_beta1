/**
 * بنش Yiwugo — معايير المالك الخمسة (docs/design/sbase-sourcing-identity.md §4)
 * موافقة الإنفاق: 27/11 — حد أقصى ~0.01$ (تشغيل واحد × 5 نتائج على الأرخص).
 *
 * يُشغَّل حيث يوجد APIFY_TOKEN (Render عندك — لا توكن في المستودع أبداً):
 *   APIFY_TOKEN=… npx tsx scripts/sbase-yiwugo-bench.mts
 * بلا توكن ⇒ خروج صادق 78 — لا نتائج وهمية عمرنا ما ننشئها.
 *
 * المرحلة الأولى = اكتشاف: يسجّل الحقول الخام فعلاً (نحصل على مخطط المخرجات
 * الحقيقي قبل أي mapper)، ثم يقيس آلياً ما يُقاس آلياً من المعايير الخمسة،
 * ويطبع تعليمات الفحص اليدوي لما تبقى (الارتباط وجودة الصور).
 * لا يُفعَّل أي actor في SBASE_IMAGE_SOURCES قبل اجتياز البنش + كلمتك.
 */
const ACTOR_ID = process.env.APIFY_YIWUGO_ACTOR ?? 'noahadler~yiwugo-scraper';
const QUERIES = ['phone case', 'hair clip accessory', 'kitchen storage box'];
const MAX_ITEMS = 5;

const token = String(process.env.APIFY_TOKEN ?? '').trim();
if (!token) {
  console.error('APIFY_TOKEN غائب — البنش لا يخترع نتائج. شغّله عند توفر التوكن.');
  process.exit(78);
}

const started = Date.now();
const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=120`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ searchTerms: QUERIES, maxItems: MAX_ITEMS }),
});

if (!runRes.ok) {
  console.error(`فشل التشغيل: HTTP ${runRes.status} — ${await runRes.text().then((t) => t.slice(0, 300))}`);
  process.exit(1);
}
const items = (await runRes.json()) as Array<Record<string, unknown>>;
const latencySec = (Date.now() - started) / 1000;

console.log(`\n=== Yiwugo bench — ${ACTOR_ID} · ${items.length} عنصراً · ${latencySec.toFixed(1)}s ===\n`);

// اكتشاف المخطط: أسماء الحقول الخام الفعلية (قبل أي مخطط على عقدنا).
const keys = new Set<string>();
for (const item of items) for (const key of Object.keys(item)) keys.add(key);
console.log('حقول المخرجات الخام:', [...keys].join(', '), '\n');
console.log('عيّنة خام أول 3 (للتخطيط اليدوي):');
for (const item of items.slice(0, 3)) console.log(JSON.stringify(item, null, 2).slice(0, 500), '\n');

// القياسات الآلية المتاحة من الرد الخام.
const find = (item: Record<string, unknown>, re: RegExp): unknown => {
  for (const [key, value] of Object.entries(item)) if (re.test(key)) return value;
  return undefined;
};
const pricePresent = items.filter((item) => find(item, /price|قیمت/i) !== undefined).length;
const moqPresent = items.filter((item) => find(item, /moq|minimum|miniorder|minimumorder/i) !== undefined).length;
const supplierPresent = items.filter((item) => find(item, /supplier|company|shop|store|seller/i) !== undefined).length;
const urls = items.map((item) => String(find(item, /url|link/i) ?? '')).filter(Boolean);
const images = items.map((item) => String(find(item, /image|photo|pic/i) ?? '')).filter(Boolean);
const uniqueUrls = new Set(urls).size;

console.log('=== المعايير الخمسة — القابل للقياس الآلي ===');
console.log(`2 · السعر الحقيقي: ${pricePresent}/${items.length} عنصراً فيه حقل سعر`);
console.log(`3 · MOQ: ${moqPresent}/${items.length} — (المتغيّرات تُفحص يدوياً من العيّنة أعلاه)`);
console.log(`4 · المورّد: ${supplierPresent}/${items.length} · روابط: ${urls.length}/${items.length} · صور: ${images.length}/${items.length}`);
console.log(`5 · السرعة: ${latencySec.toFixed(1)}s للكلمات الثلاث · تكرار الروابط: ${urls.length - uniqueUrls}/${urls.length}`);
console.log('\n=== الفحص اليدوي (المعيار 1 + جودة الصور) ===');
console.log('· انظر العيّنات أعلاه: هل النتائج مرتبطة فعلاً بالكلمات؟');
console.log('· هل أسعار الكميات (تدرّج الجملة) موجودة في الحقول؟');
console.log('· هل الروابط تفتح منتجات صالحة؟ والصور تعمل؟');
console.log('\nالقرار عندك: اجتياز ≥4/5 ⇒ تُضاف PLANNED ثم ACTIVE وفق قاعدة دورة الحياة.');
