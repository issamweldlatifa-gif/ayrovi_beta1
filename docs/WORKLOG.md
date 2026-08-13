# AYROVI — خطة تطوير شاملة (دورة 2026-08-13)

## طلبات المستخدم (حرفية → مهام)
1. [P1] إزالة بوابة تحقق الهاتف من إتمام الطلب نهائيًا (App.tsx يحجب !phoneVerified) — التحقق اختياري في إعدادات الحريف فقط
2. [P1] عربون: الطلب يبقى "في انتظار الدفع" → الحريف يرفع الوصل (بريد/بنك/D17/لقطة شاشة) → إشعار للإدارة → مراجعة → تأكيد + إشعار للحريف
3. [P1] مراحل الطلب للحريف: انتظار دفع → مراجعة → شراء → قيد شحن → تتبع بكود
4. [P1] دفع بالبطاقة = خصم 5% من العربون + توليد فاتورة مباشرة عند التأكيد
5. [P2] لوحة أدمن: إشعارات (وصل جديد للمراجعة) + تقارير مداخيل/مصاريف/أرباح + قنواتنا (FB/واتساب/انستغرام/تيك توك)
6. [P2] نظام فوترة كامل قابل للإرسال للعميل عند الحاجة (إعادة إرسال يدوي)
7. [P3] قسم "تطوير" في الإدارة: تحكم كامل بمحتوى المنصة (تبويبات/نصوص/ألوان/عناوين) + قوالب جاهزة (بديل Figma الحالي)
8. [P3] فوتر سفلي بنمط Yanaya (أكورديون + شارات ثقة + أيقونات دفع + قنوات + حقوق)
9. [P3] شريط تنقل زجاجي شفاف + توحيد الخطوط/الألوان/الأيقونات
10. [P4] Lens: تأثير مسح ضوئي على الصورة (ستايل Google Lens) + تأثير لرفع الرابط + OCR أقوى وأخف
11. [P5] تحديث أمن شامل (headers, rate limiting) + تنظيف أكواد
12. [P6] اختبارات + بناء + دفع GitHub + تحقق حي

## تقدّم التنفيذ
- [x] فحص شامل + خطة
- [x] P1 الإصلاحات الحرجة — بوابة الهاتف أزيلت من App.tsx؛ تحقق اختياري في الملف الشخصي؛ خصم 5% بطاقة (deposit_discount_tnd)؛ إشعار أدمن عند الوصل + بريد اختياري؛ خط مراحل 5 للحريف
- [x] P2 الأدمن — جرس إشعارات حي (30s polling)؛ صفحة Rapports (مداخيل/مصاريف/ربح + رسم 6 أشهر + CRUD مصاريف + صلاحيات reports:read/write)؛ زر إعادة توليد/إرسال الفاتورة؛ قنوات التواصل في الإعدادات
- [x] P3 التصميم — @theme inline tokens (brand/ink/muted/surface/line/accent)؛ استبدال ~250 لونًا ثابتًا؛ تطبيق الثيم وقت التشغيل من commerce-config؛ صفحة Développement بـ 6 قوالب جاهزة + ألوان مخصصة + خط + قنوات + نص الفوتر؛ فوتر Yanaya-ستايل (شارات ثقة + قنوات + أكورديون + أوسمة دفع + حقوق)؛ شريط زجاجي glass-header؛ خطوط Google؛ ترحيل settings CHECK (CHANNELS/DESIGN) مُختبر على قاعدة قديمة
- [x] P4 Lens/OCR — معاينة + مسح ضوئي lens-scan أثناء التحليل، shimmer للروابط؛ OCR: PSM sparse + أولوية TND/مطابقة كلمات مفتاحية/GBP
- [x] P5 الأمان — CSP موسّعة للخطوط + frame-ancestors 'self' + HSTS + X-Frame-Options (إنتاج فقط)؛ rate limiting (admin-login/otp/checkout/vision/scrape) مع اختبار 429
- [x] P6 — اختبارات 31/31 ✓؛ فحص أنواع ✓؛ ترحيل قاعدة قديمة حقيقية ✓ (FK=0)؛ معاينة محلية مدخنة ✓
- [x] نشر Render مؤكد حي (330deb9): theme/channels/cardDiscount في API العام + HSTS/X-Frame + إشعارات/تقارير محمية 401 — webhook الأول تأخر، الثاني نشر بنجاح

## بقية أفكار مؤجلة (ليست مطلوبة الآن)
- دمج Figma حقيقي يتطلب مفاتيح API (مؤجل — القوالب الجاهزة تغني حاليًا)
- ربط بوابة دفع فعلية للبطاقة (يحتاج مفاتيح Paymee/Konnect — مؤجل)

## ملاحظات تقنية
- Tailwind v4 + @tailwindcss/vite — `client/src/index.css` فيه متغيرات `--ayrovi-*`
- الألوان ثابتة `[#673de6]` في المكونات — ستُستبدل بـ tokens قابلة للثيم عبر `@theme inline`
- الثيم يُحمَّل من `/api/public/commerce-config` (setting `site_theme` JSON)
- إشعارات العميل عند المراجعة موجودة؛ الناقص: إشعار الأدمن عند رفع الوصل

## Correctif — téléphone de livraison bloqué au checkout (2026-08-13)
- **Bug** : le champ téléphone du CheckoutModal était `readOnly`, prérempli uniquement depuis `account.phone` → tout compte sans numéro (inscription Google/email) ne pouvait jamais valider de commande.
- Champ désormais éditable (prefill : téléphone de l'adresse enregistrée > téléphone du compte), validation client alignée serveur (8 chiffres, prefixe 2/4/5/7/9), codes `INVALID_PHONE` explicites côté API + matching client historique sur chiffres normalisés.
- Emails admin via Nodemailer (MAIL_PROVIDER/MAIL_API_KEY/MAIL_FROM) avec repli console ; alerte à chaque capture d'acompte.
- Env de test épinglé dans vitest.config.mts (admin email/password, OTP console) → tests déterministes sans .env. 32/32 verts. Déployé (commit 8333aaa).

## AYROVIX Lens V1 (2026-08-13)
- **Nouvelle feature au-dessus du système existant** (zéro casse : auth, panier, calculator, commandes, acompte 20%, preuves, admin, factures intacts).
- Server `src/ayrovix/` : `services/ai.ts` (Claude Vision, clé ANTHROPIC_API_KEY server-side only, jamais de VITE_*), `services/search.ts` (fournisseurs interchangeables : catalogue AYROVI toujours actif + Google Shopping optionnel via SERPAPI_KEY ; scoring déterministe code>marque>modèle>couleurs), `services/product.ts` (URL → scraper existant, SSRF bloqué, jamais de données devinées), `services/currency.ts` (réutilise pricing_config versionné), `events.ts` (analytics anonymes).
- API : POST /api/ayrovix/analyze-image (multer 6 Mo, JPEG/PNG/WebP/GIF), /analyze-url (canal url|qr), /choose ; rate-limit 12/10 min ; 503 AYROVIX_UNAVAILABLE sans clé.
- Admin : GET /api/admin/ayrovix/stats (reports:read) + carte AYROVIX dans Rapports (analyses 7j, taux de correspondance, top marques/requêtes).
- Client `client/src/ayrovix/` : LensLauncher (sheet plein écran, state machine home→preview→analyzing→candidates→product), LensCamera (capture=environment + fallback), LensUpload, QRScanner (BarcodeDetector natif + repli jsqr), ProductCandidates (plusieurs candidats, % match, jamais de réponse unique), ProductResult + ProductVariants. Commander → handleAddToCart existant → panier → checkout dépôt existant.
- Env : ANTHROPIC_API_KEY / ANTHROPIC_MODEL / SERPAPI_KEY documentés dans .env.example. Tests 38/38 (image sans clé→503, mime→415, query builder, scoring, flux simulé end-to-end, SSRF QR).
