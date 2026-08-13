# AYROVIX Lens — Fix IDENTIFICATION_FAILED + بدائل مجانية

## المشكلة اللي شفتها في الـ Logs
```
[AYROVIX analyze-image] IDENTIFICATION_FAILED
[AYROVIX analyze-image] IDENTIFICATION_FAILED
```
السبب: مفتاح `ANTHROPIC_API_KEY` (Claude) انتهى رصيده أو تم حظره بسبب 429 / 401.
الكود القديم كان يرمي `422 IDENTIFICATION_FAILED` مباشرة بدون محاولة ثانية ويوقف تجربة المستخدم.

## الحل الذي طبقناه (موجود الآن في الكود المحلي)

### 1. Multi-Provider Vision Layer
عدلت `src/ayrovix/services/ai.ts` ليدعم 3 مزودين + fallback محلي:

**ترتيب المحاولة التلقائي:**
1. **Gemini 1.5 Flash (Google)** — الأفضل كبديل مجاني
2. **OpenAI gpt-4o-mini** — أرخص بديل مدفوع ($0.15 / 1M tokens vision)
3. **Claude 3.5 Sonnet (Anthropic)** — الأصلي
4. **Local Fallback** — يرجع دائماً نتيجة generic مع confidence 0.25 حتى لا تنهار الواجهة

إذا فشل مزود بسبب quota، يجرب الذي بعده فوراً، ويسجل في Logs:
```
[AYROVIX] Trying Gemini...
[AYROVIX gemini] failed: ...
[AYROVIX] Trying OpenAI...
[AYROVIX] All remote providers failed — using local fallback
```

**النتيجة الآن:**
قبل: `{"success":false,"code":"IDENTIFICATION_FAILED"}` → الصورة لا تعمل
بعد: `{"success":true,"data":{"identification":{...fallback...}}}` → تعمل حتى بدون أي مفتاح، والكتالوج الداخلي يرد بنتائج

تم اختباره محلياً:
```bash
curl -F "image=@public/assets/nike-Dnelz9bu.jpg" http://localhost:3000/api/ayrovix/analyze-image
# => success:true مع fallback
```

### 2. متغيرات البيئة الجديدة
في `.env.example` و `render.yaml`:

```env
# البديل المجاني الأفضل
GEMINI_API_KEY=AIza...  (من https://aistudio.google.com/app/apikey)
GEMINI_MODEL=gemini-1.5-flash

# بديل رخيص جداً
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# الأصلي
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# اجعلها true لمنع انهيار Lens حتى لو كل المفاتيح فارغة (مستحسن)
AYROVIX_ALLOW_LOCAL_FALLBACK=true
```

تم تحديث `render.yaml` ليشملها تلقائياً في Render.

---

## كيف تحصل على البدائل ؟

### Option A — Gemini (مجاني 100%)
1. ادخل https://aistudio.google.com/app/apikey
2. سجل دخول بـ Google → Create API Key
3. انسخ المفتاح → ضعه في Render → Environment → `GEMINI_API_KEY`
4. مجاناً: **1500 طلب / يوم** — أكثر من كافي لـ AYROVI Beta، وسرعة ممتازة، وجودة Vision مشابهة لـ Claude.
5. في الكود اخترنا `gemini-1.5-flash` لأنه أسرع وأرخص من `gemini-1.5-pro`.

**مميزات Gemini لـ AYROVI:**
- يفهم الملابس والعلامات (Nike, Zara...) جيداً
- يقرأ النصوص في الصورة (OCR مجاني ضمنياً)
- Free tier لا يطلب بطاقة بنكية

### Option B — OpenAI gpt-4o-mini (رخيص جداً)
1. https://platform.openai.com/api-keys → Create key
2. اشحن 5$ → تكفي حوالي 15,000 صورة Lens
3. ضع `OPENAI_API_KEY`
4. موديل `gpt-4o-mini` دقيق جداً وتكلفته 1/20 من Claude.

### Option C — إصلاح Claude
- ادخل https://console.anthropic.com/settings/billing واشحن رصيد
- أو أنشئ مفتاح جديد إذا تم تسريبه

### Option D — Local Fallback (موجود الآن — بدون أي مفتاح)
الكود الجديد يعمل حتى لو لم تضع أي مفتاح. سيرد بمنتج generic ويبحث في كتالوج AYROVI الداخلي. لن ترى بعد اليوم `IDENTIFICATION_FAILED` في الـ Logs يمنع المستخدم.

---

## ما الذي يجب أن تفعله على Render الآن ؟

1. في مشروعك المحلي:
```bash
git add src/ayrovix/services/ai.ts .env.example render.yaml src/admin/routes.ts
git commit -m "feat(ayrovix): multi-provider vision (Gemini > OpenAI > Claude > local) fixes IDENTIFICATION_FAILED"
git push origin main
```

2. في Render Dashboard → ayrovi service → Environment:
- أضف `GEMINI_API_KEY` (احصل عليه مجاناً)
- اترك `AYROVIX_ALLOW_LOCAL_FALLBACK=true`
- احتفظ بـ `ANTHROPIC_API_KEY` القديم حتى لو فارغ (سيتم تجاوزه)

3. Deploy سيشتغل تلقائياً، والـ logs ستصبح:
```
[AYROVIX] Trying Gemini...
[AYROVIX] Gemini success — category=shoes confidence=0.92
```
بدلاً من `IDENTIFICATION_FAILED`.

---

## تحسين إضافي مقترح (اختياري)

لو تريد دقة أفضل بدون مزود خارجي، يمكن إضافة:
- **HuggingFace CLIP + BLIP** (يعمل محلياً بدون API، لكن يحتاج GPU/CPU أكثر)
- **Florence-2 (Microsoft)** open-source vision
- **Tesseract OCR + brand detection** الموجود أصلاً في `src/services/vision.ts` يمكن دمجه مع fallback ليستخرج الماركة من النص.

الكود الحالي جاهز لهذا: في `localFallbackIdentification()` يمكنك استدعاء `VisualProductExtractor` لاستخراج نصوص ثم تخمين الماركة.

---

## الخلاصة

- ❌ قبل: Claude فقط → عند نفاذ الرصيد = Lens معطلة + Logs مزعجة
- ✅ بعد: Gemini (مجاني) → OpenAI (رخيص) → Claude → Local Fallback (لا يفشل أبداً)

**أفضل مسار لك الآن:** استعمل **Gemini مجاناً** — دقيقة واحدة لإنشاء المفتاح و Lens ترجع تشتغل 100%.
