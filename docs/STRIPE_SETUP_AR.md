# تفعيل الخلاص بالكارطة عبر Stripe — ZAYROVI

> هذا الملف يشرح كيفاش تربط Stripe بالخادم خطوة بخطوة، وشنوّة بالضبط تبدّل في بيئة Render.
> الكود موجود ومربوط: ما تحتاجش تبدّل حتى حاجة في الـ code، فقط المتغيّرات.

---

## 1) علاش Stripe بدل Konnect

| | Konnect (قديم) | Stripe (جديد) |
|---|---|---|
| العملة | TND مباشرة | TND موش مدعومة ⇒ تُفاتر بـ `STRIPE_CURRENCY` (افتراضي EUR) |
| التدفّق | `init-payment` → `payUrl` → webhook GET | Checkout Session → `url` → webhook POST موقّع |
| التحقّق | server-to-server على `/payments/{ref}` | server-to-server على Checkout Session |
| المفاتيح | `KONNECT_*` | `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` |

الكود القديم (Konnect) بقى كـ**fallback** فقط للاختبارات؛ إذا `STRIPE_SECRET_KEY` موجود، Stripe هو اللي يخدم.

---

## 2) المتغيّرات المطلوبة (Render → Environment)

| المتغيّر | من وين تجيبو | مثال |
|---|---|---|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys → Secret key | `sk_test_51...` / `sk_live_51...` |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks → (endpoint) → Signing secret | `whsec_...` |
| `STRIPE_CURRENCY` | اختياري، افتراضي `eur` | `eur` / `usd` |
| `PUBLIC_BASE_URL` | أصل الموقع النهائي https | `https://ayrovi.tn` |

⚠️ **عمرك** تحطّ `STRIPE_SECRET_KEY` في متغيّر يبدا بـ`VITE_`: كل `VITE_*` يوصل للمتصفّح.

---

## 3) إنشاء Webhook

1. Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL:
   ```
   https://<DOMAIN>/api/customer/payments/stripe/webhook
   ```
3. Events (زوز برك):
   - `checkout.session.completed`
   - `checkout.session.expired`
4. انسخ **Signing secret** ⇒ `STRIPE_WEBHOOK_SECRET`.

> حتى كان الويب-هوك ما وصلش، العميل ينجّم يتحقّق بـ
> `GET /api/customer/account/orders/:id/payments/card/verify?transaction=TXN-...`
> والخادم يعاود يسأل Stripe بوحدو (server-to-server). الويب-هوك يسرّع برك.

---

## 4) العملة والمبلغ — اقرا هذا قبل ما تحقّق

Stripe **ما يدعمش TND**. الخادم يفاتر المبلغ الرقمي نفسه في `STRIPE_CURRENCY`:

| طلب | في التطبيق | Stripe (EUR) |
|---|---|---|
| acompte 118.000 TND | `amountTnd = 118.000` | `amount_total = 11800` (118.00 €) |

⇒ **1 TND = 1 EUR** حالياً (MVP). إذا تحبّ تحويل حقيقي، بدّل `toStripeAmount()` في
`src/services/paymentGateway.ts`:
```ts
// مثال: TND / سعر صرف EUR
return Math.round((amountTnd / Number(process.env.STRIPE_FX_TND_PER_EUR || 3.4)) * 100);
```
وبعدها لازم تعدّل `verifyStripeCardPayment` بنفس المعادلة (المقارنة `amount_total === expectedAmount`).

---

## 5) التحقّق من التركيب

```bash
# 1. هل البوّابة "جاهزة" عند الخادم؟
curl -s https://<DOMAIN>/api/v1/aywebs/payments/methods | jq '.data.card_gateway_available'
# ⇒ true

# 2. اختبار دفع (test mode)
#    حطّ sk_test_... و whsec_... في بيئة staging، بدّل الـ order للـ CARD،
#    ومن بعد: POST /api/customer/account/orders/:id/payments/card/initiate
#    ⇒ { payUrl: "https://checkout.stripe.com/c/pay/cs_test_...", transactionNumber: "TXN-..." }
#    بطاقة اختبار: 4242 4242 4242 4242 · أي تاريخ مستقبلي · أي CVC

# 3. حالة المعاملة في قاعدة البيانات
sqlite3 data/qatafo.sqlite "SELECT transaction_number,provider,status,provider_reference FROM payment_transactions ORDER BY created_at DESC LIMIT 5;"
# ⇒ provider = STRIPE
```

---

## 6) نقاط النهاية المتوفّرة

| الطريقة | المسار | الدور |
|---|---|---|
| `POST` | `/api/customer/account/orders/:id/payments/card/initiate` | ينشئ Checkout Session ويرجّع `payUrl` |
| `GET` | `/api/customer/account/orders/:id/payments/card/verify?transaction=TXN-...` | تحقّق server-to-server |
| `POST` | `/api/customer/payments/stripe/webhook` | ويب-هوك Stripe (موقّع إجبارياً إذا `STRIPE_WEBHOOK_SECRET` موجود) |
| `GET` | `/api/customer/payments/konnect/webhook?payment_ref=cs_...` | توافق قديم (نفس المنطق) |
| `GET` | `/api/v1/aywebs/payments/methods` | `card_gateway_available: true/false` |

---

## 7) الأخطاء المتوقّعة

| الرمز/الرسالة | المعنى | الحل |
|---|---|---|
| `CARD_GATEWAY_UNAVAILABLE` (503) | `STRIPE_SECRET_KEY` فارغ أو `PUBLIC_BASE_URL` موش https | اضبط الزوز |
| `Signature webhook manquante/invalide` (400) | `STRIPE_WEBHOOK_SECRET` موجود والـsignature غالطة | انسخ الـsecret الصحيح، وتأكّد الـraw body ما تبدّلش (proxy) |
| `CARD_AMOUNT_INVALID` | المبلغ أقل من 0.50 في عملة ذات سنتيم | راجع `deposit_amount_tnd` |
| `expires_at must be at least 30 minutes` | كان خطأ في النسخة الأولى (20 دقيقة) | تصحّح: 31 دقيقة |
| `verifyStripeCardPayment → FAILED` | مبلغ/عملة/مرجع ما يتطابقوش | راجع سجل `provider_payload` في `payment_transactions` |
