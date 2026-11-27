/**
 * E2E — Commerce Core الحالي: سلّة واحدة تجمع ثلاثة مداخل ثم checkout واحد.
 *
 * طلب المالك (27/11، قبل توقيع Approval v1.0): «نتائج اختبار فعلي يجمع منتجاً
 * محلياً وعالمياً وصينياً في سلة واحدة، ثم يمر بالـCheckout».
 *
 * ما يثبته هذا الاختبار بالدليل (v2.4 §13):
 *   1. السلّة موحّدة فعلاً: ثلاثة مداخل مختلفة (كتالوج CRM / Lens موقّع /
 *      S BASE خام) تدخل من نقاط `/api/cart/*` إلى جدول cart_items الواحد.
 *   2. الطلب موحّد: checkout واحد يُنشئ طلباً واحداً بثلاثة أصناف، كل صنف
 *      يحمل مصدره وحالة الثقة واختيارات الزبون (لون/مقاس/ملاحظة/كمية).
 *   3. سطر S BASE يصل بـPENDING_MANUAL بلا توكن — واللحاء الموقّع VERIFIED.
 *
 * ويوثّق الفجوتين المعروفتين (نطاق P1/P2، لا نقص في ما نُفِّذ):
 *   • العربون يُحسب اليوم على totals.total الكامل (شاملاً الشحن) — التصميم
 *     المعتمد D4 v0.2 I7: على صافي المنتجات بعد الخصم وقبل الشحن.
 *   • الطلب يولد بحالة AWAITING_DEPOSIT (العربون يُطلب عند checkout) —
 *     التسلسل المعتمد v2.5 للأسطر الخاضعة للمراجعة: المراجعة أولاً ثم العربون.
 */
import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { createZayrovixPriceToken } from '../src/zayrovix/priceQuote';
import { recordVariantContract } from '../src/zayrovix/services/variantAvailability';

const created: string[] = [];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** إعداد سعر الصرف (فعل باك-أوفيس مشروع): إن خلت البيئة من CNY نضيفه
 * نضيفاً نضيفاً — المحرك نفسه لا يُحايَل أبداً — ونعيد الحالة بعد الانتهاء. */
let previousFx = '{}';
let addedCny = false;

function ensureCnyRate(): void {
  const row = db.get<{ fx_extra_rates: string }>("SELECT fx_extra_rates FROM pricing_config WHERE id='default'");
  previousFx = row?.fx_extra_rates ?? '{}';
  const rates = JSON.parse(previousFx) as Record<string, number>;
  if (!rates.CNY || !(rates.CNY > 0)) {
    db.run("UPDATE pricing_config SET fx_extra_rates=? WHERE id='default'",
      JSON.stringify({ ...rates, CNY: 0.46 }));
    addedCny = true;
  }
}

function makeCatalogProduct(finalPrice: number): string {
  const id = `e2e-catalog-${uid()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO products (id,name,description,image,additional_images,brand_id,brand_name,category,
      source_url,source_platform,original_price,currency,converted_price,customs_fee,shipping_fee,
      service_fee,final_price,express_available,stock_status,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, 'Produit local e2e', 'description e2e', '/uploads/p.jpg', '[]', null, 'SHEIN', 'MODE',
    'https://shein.example/p/e2e', 'SHEIN',
    20, 'EUR', 67, 10, 8, 5, finalPrice, 0, 'AVAILABLE', 'ACTIVE', now, now,
  );
  created.push(id);
  return id;
}

function makeCustomerAccount(): { accountId: string; token: string; csrfToken: string; email: string } {
  const now = new Date().toISOString();
  const accountId = `account-e2e-${uid()}`;
  const email = `e2e-${uid()}@zayrovi.test`;
  db.run(
    `INSERT INTO customer_accounts (id,display_name,email,status,email_verified_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    accountId, 'Client E2E', email, 'ACTIVE', now, now, now,
  );
  const session = createCustomerSession(db, accountId, { ip: '10.40.0.1', headers: {} } as never);
  return { accountId, token: session.token, csrfToken: session.csrfToken, email };
}

afterAll(() => {
  // تنظيف best-effort بترتيب الاعتماديات (اختبار على قاعدة البيانات الفعلية)
  const orderIds = db.all<{ id: string }>(
    `SELECT o.id FROM orders o WHERE o.account_id LIKE 'account-e2e-%'`,
  ).map((row) => row.id);
  for (const orderId of orderIds) {
    for (const table of ['order_items', 'order_status_history', 'payments']) {
      try { db.run(`DELETE FROM ${table} WHERE order_id=?`, orderId); } catch { /* best-effort */ }
    }
    try { db.run('DELETE FROM orders WHERE id=?', orderId); } catch { /* best-effort */ }
  }
  for (const productId of created) {
    try {
      db.run('DELETE FROM products WHERE id=?', productId);
      db.run('DELETE FROM cart_items WHERE external_id LIKE ?', `%${productId}%`);
    } catch { /* best-effort */ }
  }
  if (addedCny) {
    try { db.run("UPDATE pricing_config SET fx_extra_rates=? WHERE id='default'", previousFx); } catch { /* best-effort */ }
  }
  try {
    db.run("DELETE FROM cart_items WHERE session_id LIKE 'sess-e2e-%'");
    db.run("DELETE FROM customer_sessions WHERE account_id LIKE 'account-e2e-%'");
    db.run("DELETE FROM customer_accounts WHERE id LIKE 'account-e2e-%'");
    db.run("DELETE FROM customers WHERE id LIKE 'cust-e2e-%'");
  } catch { /* best-effort */ }
});

describe('E2E — سلّة موحّدة بثلاثة مداخل ثم checkout واحد (طلب المالك 27/11)', () => {
  test('محلي (كتالوج) + عالمي (Lens موقّع) + صيني (S BASE خام) ⇒ طلب واحد بثلاثة أصناف', async () => {
    // ── تجهيز: سعر CNY (إن غاب) + منتج محلي + حساب عميل + جلسة سلّة ──
    ensureCnyRate();
    const productId = makeCatalogProduct(137.55);
    const { accountId, token, csrfToken, email } = makeCustomerAccount();
    const session = `sess-e2e-${uid()}`;
    const sessionHeaders = { 'x-session-id': session };
    // CSRF خادمي إلزامي على كل POST بمصادقة عميل — نفس ما يفعله التطبيق.
    const authHeaders = { ...sessionHeaders, Authorization: `Bearer ${token}`, 'x-csrf-token': csrfToken };

    // ── 1) المدخل المحلي: كتالوج CRM ──
    const catalogAdd = await request(app)
      .post('/api/cart/catalog').set(sessionHeaders).send({ productId });
    expect(catalogAdd.status).toBe(201);
    expect(catalogAdd.body.success).toBe(true);
    expect(Number(catalogAdd.body.cartItem.priceTND)).toBe(137.55);

    // ── 2) المدخل العالمي: سطر Lens موقّع (priceToken) ──
    const lensUrl = 'https://boutique-inconnue-exemple.com/item/lens-e2e';
    const lensPrice = 12.5;
    const lensToken = createZayrovixPriceToken({
      price: lensPrice,
      currency: 'USD',
      title: 'Montre globale lens e2e',
      referenceUrl: lensUrl,
      status: 'VERIFIED',
    });
    expect(lensToken).toBeTruthy();
    /* متجر عام بلا contract توفر (كما يولده Lens لدومينات مجهولة) —
       وبلا اختيارات متغيّرات: حارس التوفر عند الـcheckout يمنع
       NO_CONTRACT + متغيّرات مطلوبة (دليل الصدق نفسه). */
    const lensAdd = await request(app).post('/api/cart/items').set(sessionHeaders).send({
      store: 'generic',
      externalId: null,
      url: lensUrl,
      referenceUrl: lensUrl,
      title: 'Montre globale lens e2e',
      imageUrl: '',
      sourcePrice: lensPrice,
      sourceCurrency: 'USD',
      priceVerificationStatus: 'VERIFIED',
      priceToken: lensToken,
      quantity: 2,
    });
    if (lensAdd.status !== 201) console.log('LENS-ADD-BODY:', JSON.stringify(lensAdd.body));
    expect(lensAdd.status).toBe(201);
    expect(lensAdd.body.cartItem.priceVerificationStatus).toBe('VERIFIED');

    const sbaseUrl = 'https://detail.1688.com/offer/e2e-mixed.html';
    /* ── 3) المدخل الصيني: S BASE خام بلا توكن ⇒ PENDING_MANUAL ──
       «فتح الفيش» أولاً: في الإنتاج، جلب التفاصيل يسجّل عقد المتغيّرات
       (recordDetailVariantContract في src/sbase/routes.ts) — هنا نحاكي
       ذلك بالكاتب نفسه: ما ثبته الخادم من المصدر هو مبرر قبول الاختيار. */
    recordVariantContract(sbaseUrl, {
      attribute: 'Taille',
      productAvailability: 'available',
      source: 'sbase',
      variants: [
        { value: '42', color: 'أسود', availability: 'available', reason: 'Taille · Couleur' },
        { value: '42', color: 'أحمر', availability: 'available', reason: 'Taille · Couleur' },
        { value: '43', color: 'أسود', availability: 'available', reason: 'Taille · Couleur' },
      ],
    }, new Date().toISOString());
    const sbaseAdd = await request(app).post('/api/cart/items').set(sessionHeaders).send({
      store: '1688',
      externalId: 'e2e-1688-1',
      url: sbaseUrl,
      referenceUrl: sbaseUrl,
      title: 'Sac chinois sourcing e2e',
      imageUrl: '',
      sourcePrice: 22.8,
      sourceCurrency: 'CNY',
      requestedSize: '42',
      requestedColor: 'أسود',
      customerNote: 'هدية — غلاف أحمر',
      quantity: 3,
    });
    if (sbaseAdd.status !== 201) console.log('SBASE-ADD-BODY:', JSON.stringify(sbaseAdd.body));
    expect(sbaseAdd.status).toBe(201);
    expect(sbaseAdd.body.cartItem.priceVerificationStatus).toBe('PENDING_MANUAL');
    expect(String(sbaseAdd.body.cartItem.requestedColor)).toBe('أسود');
    expect(Number(sbaseAdd.body.cartItem.quantity)).toBe(3);

    // ── السلّة الموحّدة: ثلاثة أسطر في نفس الجلسة/الجدول ──
    const cart = await request(app).get('/api/cart/items').set(sessionHeaders);
    expect(cart.status).toBe(200);
    expect(cart.body.items).toHaveLength(3);

    // ── الـCheckout الموحّد الوحيد ──
    /* طريقة الدفع: checkout الحالي يستقبل PENDING_SELECTION حصراً (COD يُرفض
       هنا صراحةً) — الاختيار يتم من تفصيل الطلب بعد الإنشاء، كما يشرح الكود
       نفسه: «the current checkout uses PENDING_SELECTION». */
    const paymentMethod = 'PENDING_SELECTION';
    const checkout = await request(app).post('/api/checkout').set(authHeaders).send({
      name: 'Client E2E',
      email, // البريد الموثّق للحساب نفسه — حارس VERIFIED_EMAIL_REQUIRED
      phone: '+21620123456',
      city: 'Tunis',
      address: '10 rue de la République',
      paymentMethod, // PENDING_SELECTION — الاختيار لاحق في تفصيل الطلب
      deliveryMode: 'home',
      termsAccepted: true,
      locale: 'fr-TN',
    });
    if (checkout.status !== 201) console.log('CHECKOUT-BODY:', JSON.stringify(checkout.body));
    expect([200, 201]).toContain(checkout.status); // الخادم يرد 200 على نجاح checkout
    expect(checkout.body.success).toBe(true);
    const orderId = String(checkout.body.orderId ?? checkout.body.order?.id ?? checkout.body.data?.order?.id ?? '');
    expect(orderId).toBeTruthy();

    // ── الطلب الواحد بثلاثة أصناف، كل صنف بمصدره وحالته واختياراته ──
    const orders = db.all<{ id: string; status: string; deposit_percent: number; deposit_amount_tnd: number; total_tnd: number }>(
      'SELECT id,status,deposit_percent,deposit_amount_tnd,total_tnd FROM orders WHERE account_id=?', accountId,
    );
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.id).toBe(orderId);

    const items = db.all<Record<string, unknown>>(
      'SELECT * FROM order_items WHERE order_id=?', order.id,
    );
    expect(items).toHaveLength(3);

    const byStatus = (status: string) => items.filter((item) => item.price_verification_status === status);
    // الصيني: خام ⇒ PENDING_MANUAL مع اختيارات الزبون كاملة (سلسلة CRM)
    const sbaseItem = items.find((item) => String(item.reference_url || item.source_url) === sbaseUrl);
    expect(sbaseItem).toBeTruthy();
    expect(String(sbaseItem!.price_verification_status)).toBe('PENDING_MANUAL');
    expect(String(sbaseItem!.requested_color)).toBe('أسود');
    expect(String(sbaseItem!.requested_size)).toBe('42');
    expect(String(sbaseItem!.customer_note)).toContain('هدية');
    expect(Number(sbaseItem!.quantity)).toBe(3);
    // العالمي: موقّع VERIFIED
    const lensItem = items.find((item) => String(item.reference_url || item.source_url) === lensUrl);
    expect(lensItem).toBeTruthy();
    expect(String(lensItem!.price_verification_status)).toBe('VERIFIED');
    expect(Number(lensItem!.quantity)).toBe(2);
    if (checkout.status !== 201) console.log('CHECKOUT-BODY:', JSON.stringify(checkout.body));
    // المحلي: كتالوج بثمنه المنشور
    expect(byStatus('VERIFIED').length).toBeGreaterThanOrEqual(2);

    // ── توثيق السلوك الحالي (الفجوتان المعروفتان — نطاق P1/P2) ──
    // الطلب يولد AWAITING_DEPOSIT: العربون محسوب ومطلوب عند checkout —
    // قبل مراجعة المورّد. التسلسل المعتمد v2.5 يقلبه لأسطر المراجعة.
    expect(order.status).toBe('AWAITING_DEPOSIT');
    expect(order.deposit_percent).toBeGreaterThan(0);
    expect(order.deposit_amount_tnd).toBeGreaterThan(0);
    // والعربون على totals.total الكامل — بينما D4 v0.2 I7 يقول صافي المنتجات
    // قبل الشحن: فجوة مرحلة التنفيذ موثقة، لا اعتماد للنقص كشكل نهائي.
    expect(order.total_tnd).toBeGreaterThan(order.deposit_amount_tnd);
  });
});
