const { chromium } = require('playwright');
const fs = require('fs');
const ids = JSON.parse(fs.readFileSync('/tmp/ratio_ids.json', 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const heights = {};
  for (const [name, id] of ids) {
    // انشر الصورة
    await page.evaluate(async (id) => { await fetch(`/api/admin/hero-visuals/${id}/publish`, { method: 'POST', headers: { 'x-csrf-token': sessionStorage.getItem('ayrovi_admin_csrf') || '' } }); }, id).catch(() => {});
    // عبر curl بدل ذلك — نستخدم إعادة التحميل فقط بعد النشر الخارجي (تم بالفعل في الخطوة السابقة لكل واحدة)
  }
  await browser.close();
})();
