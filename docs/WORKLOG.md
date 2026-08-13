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

## AYROVIX Lens V1.1 — expérience caméra live façon Amazon Lens (2026-08-13)
- Refonte UX : Lens ouvre DÉSORMAIS la caméra en direct (plus de menu) — barre haute (fermer · AYROVIX Lens · torche si supportée), viseur à coins + lens-scan, obturateur 74px.
- 3 modes en bas : **Recherche** (capture frame → préparation 1400px → analyse Claude immédiate), **Importer** (galerie → même pipeline), **Code** (scan live QR + codes-barres EAN/UPC/Code128 via BarcodeDetector natif, repli jsQR pour QR ; zone « coller un lien » intégrée).
- QR avec URL → /analyze-url (canal qr) · code-barres → NOUVEAU POST /api/ayrovix/analyze-barcode (validation 6-14 chiffres, recherche SerpAPI si clé ; sinon réponse propre + carte code avec Copier/Photographier — jamais d'invention).
- Sans caméra/permission refusée → menu de repli (photo, import, lien). Un seul flux getUserMedia pour toute la session ; tracks stoppés à la fermeture.
- Tests 39/39 (validation barcode + réponse sans fournisseur). QRScanner.tsx supprimé : le scan vit dans LiveCamera (une seule caméra).

## AYROVIX Lens V1.3 — retour Claude Vision (2026-08-13)
- **Retour OpenAI → Anthropic** : `services/ai.ts` appelle `api.anthropic.com/v1/messages` (ANTHROPIC_API_KEY / ANTHROPIC_MODEL=claude-3-5-haiku-latest). Tests stub `content[0].text`. Admin badges + render.yaml mis à jour.
- **Bug trouvé & corrigé** : Permissions-Policy était `camera=()` → caméra (donc flash) bloquée pour le site lui-même. Désormais `camera=(self)`.
- **Torche** : toggleTorch durci (tente applyConstraints même si capabilities muet, hint utilisateur si l'appareil refuse).
- **Bouton ⋮** à côté du flash → sheet sombre : Comment l'utiliser (4 étapes) + Conditions d'utilisation (IA indicative, prix confirmé au panier, photos non conservées, anti-abus…).
- **SerpAPI vérifiée** : checkSerpApiHealth() (account.json, cache 60 s) exposé dans /api/admin/ayrovix/stats → badges d'état dans la carte AYROVIX des Rapports (Vision IA + SerpAPI, recherches restantes).

## AYROVIX Lens V2 — Anthropic uniquement (2026-08-13, état courant)
- Cette section remplace les choix de fournisseurs documentés dans les versions historiques ci-dessus.
- Claude Haiku 4.5 est l'unique fournisseur Vision de Lens. Une seule réponse structurée identifie le produit et lit le prix réellement visible, sans cascade IA ni résultat générique inventé.
- Claude Web Search est l'unique recherche externe : `web_search_20250305`, `max_uses: 1`, cache 5 min et coalescing. Sans clé, seul le catalogue local reste disponible.
- L'API expose `detectedPrice` et `/analyze-code`; les QR texte, QR URL et codes-barres décodés localement suivent désormais les routes Claude/catalogue adaptées.
- Les captures contenant du texte restent en PNG sans filtres; le serveur valide et réencode les images en mémoire.
- La vérification d'un lien direct doit extraire un prix magasin exploitable avant de commander à partir d'un prix lu sur image.
- `.env.example`, `render.yaml` et les badges Admin Lens n'exposent plus que la configuration Anthropic.
- Validation locale finale : TypeScript ✅, 47/47 tests ✅, build production ✅, audit 0 vulnérabilité ✅, `git diff --check` et contrôle des secrets ✅.

## AYROVIX Lens V2.1 — recherche visuelle Google Lens (2026-08-13, état courant)
- Cette section remplace l'architecture de recherche image Anthropic-only documentée en V2.
- Une photo lance désormais Claude Vision et SerpApi Google Lens en parallèle : Claude lit le prix et les indices visibles; Google Lens renvoie produits, images, liens et prix éventuels.
- L'image destinée à SerpApi est réencodée en mémoire en JPEG de 500 Ko maximum, sans fichier public ni upload AYROVI; `image_id` est temporaire.
- Si Google Lens renvoie au moins un produit exploitable, Claude Web Search n'est pas facturé pour cette image. Il reste le fallback texte et le moteur des QR/codes-barres/liens.
- Cache SHA-256 dix minutes et coalescing empêchent de refacturer les rescans identiques.
- Les badges Admin distinguent Claude Vision, Google Lens et Claude Web Search.
- Validation locale : TypeScript ✅, 48/48 tests ✅, build production ✅, audit 0 vulnérabilité ✅.
- Validation production : photo Nike Air Max 95 → HTTP 200 en 5,63 s, 8 correspondances Google Lens avec image et lien; modèle Air Max 95 reconnu par Claude. Une fiche Coproom a ensuite confirmé un prix direct de 255 EUR, distinct de l'estimation Lens.
- Le client bloque désormais toute commande fondée seulement sur un prix Claude/Lens : le bouton n'est activé qu'après prix confirmé par la fiche marchand (ou prix du catalogue local). Les tailles/couleurs ne sont jamais annoncées si la source ne les fournit pas.
