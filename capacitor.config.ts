import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AYROVI — تطبيق أندرويد حقيقي (Capacitor 7)، وضع «الحزمة المضمّنة».
 *
 * قرار 2026-10-03 : حذف وضع «الغلاف الحي» (server.url) نهائيًا. لم تعد القشرة
 * تفتح الموقع عن بُعد — الواجهة كاملة مُجمَّعة داخل الـ APK (webDir = public/)
 * تمامًا כמו أي تطبيق أصلي: فتح فوري دون شبكة، والواجهة هي واجهة الموقع نفسها
 * (سطر واحد، مسار واحد، موقع واحد).
 *
 * كيف تعمل الـ API إذن؟ عبر جسر أصل واحد وحيد:
 *   client/src/services/nativeApiOrigin.ts
 * يلتقط كل طلب نسبي (/api/… ، /uploads/… ، /media/…) ويوجّهه إلى أصل الـ API
 * المطلق. لا يوجد مسار ثانٍ ولا نسخة ثانية من الواجهة (§2).
 *
 * ملاحظة أصالة: خادم الـ API يقبل أصول Capacitor القياسية في CORS مع
 * credentials، والمصادقة داخل التطبيق تعتمد رمز Bearer (x-ayrovi-native)
 * بدل الكوكيز عبر الأصول — انظر src/customer/nativeToken.ts.
 */
const config: CapacitorConfig = {
  appId: 'app.ayrovi.mobile',
  appName: 'AYROVI',
  webDir: 'public',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // back système = history.back() — les overlays Lens sont des couches history
    handleBackButton: true,
    backgroundColor: '#FAFAFA',
  },
  server: {
    // تطبيق حقيقي: لا server.url. الحزمة المحلية هي المصدر الوحيد للواجهة،
    // والمخطط https يجعل origine القشرة https://localhost (أصل Capacitor
    // القياسي المصرّح به في CORS الخادم).
    androidScheme: 'https',
    // aucun sous-domaine externe navigable dans la coque
    allowNavigation: [],
  },
};

export default config;
