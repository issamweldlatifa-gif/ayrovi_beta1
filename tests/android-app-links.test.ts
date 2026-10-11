/**
 * App Links — الملف اللي يخلّي `https://ayrovi.tn` تفتح التطبيق.
 *
 * القاعدة اللي كنتحاسبوا عليها هنا: **ملف غالط أسوأ من ملف غايب**. ملف غايب ⇒
 * أندرويد يفتح المتصفّح كما العادة. ملف موجود وبصمة غالطة ⇒ أندرويد يقعد
 * يعاود يجرّب وبلا حتى إشارة، والمستعمل يحسب «الروابط مكسورة».
 * لهذا البصمة ما تتنظّمش: إما 32 بايت صحيحة، إما `null`.
 *
 * الاختبارات هذي ما تلمسش قاعدة البيانات ولا الخادم — تتستدعي العقد المشترك
 * وحده (`shared/appLinks.ts`)، وهو نفس اللي يستدعيه `src/server.ts`.
 */
import { describe, expect, test } from 'vitest';
import {
  ANDROID_APP_LINK_DEMO_PACKAGE,
  ANDROID_APP_LINK_ENV,
  ANDROID_APP_LINK_PACKAGE,
  ANDROID_APP_LINK_PACKAGES_ENV,
  ANDROID_APP_LINK_RELATION,
  appLinksDiagnostics,
  appLinksFromEnv,
  assetLinksStatement,
  parseAppLinkPackages,
  parseCertificateFingerprints,
} from '../shared/appLinks';

/** بصمة حقيقية الشكل: 32 بايت. */
const SIGNING = 'C0:4A:9F:31:7B:2D:88:E4:5A:16:0C:D3:71:BE:42:9A:64:1F:07:B5:AE:38:D2:96:4C:81:F3:5E:20:79:AB:6D';
/** بصمة ثانية — مفتاح Google Play بعد إعادة التوقيع: حالتان لازم يتعايشوا. */
const PLAY = '1D:33:88:07:F1:52:B9:6C:2E:0A:44:7F:C5:19:E3:8B:27:60:DA:14:9C:35:82:4E:A1:6B:00:7D:F8:22:59:C7';

describe('قراءة البصمات', () => {
  test('بصمة صحيحة تبقى كما هي، والحروف الصغيرة تترفع', () => {
    expect(parseCertificateFingerprints(SIGNING.toLowerCase())).toEqual([SIGNING]);
  });

  test('زوز بصمات (مفتاح الإصدار + مفتاح Play) على سطرين أو بفاصلة', () => {
    expect(parseCertificateFingerprints(`${SIGNING}\n${PLAY}`)).toEqual([SIGNING, PLAY]);
    expect(parseCertificateFingerprints(`${SIGNING},${PLAY}`)).toEqual([SIGNING, PLAY]);
    // التكرار ما يزيدش أسطر بلا معنى في الملف.
    expect(parseCertificateFingerprints(`${SIGNING},${SIGNING}`)).toEqual([SIGNING]);
  });

  test('لصق مباشر من `keytool -list -v` يتقبل: اللصقة `SHA256:` تتشال', () => {
    expect(parseCertificateFingerprints(`SHA256: ${SIGNING}`)).toEqual([SIGNING]);
    expect(parseCertificateFingerprints(`sha-256:${SIGNING}`)).toEqual([SIGNING]);
  });

  test('64 حرف بلا فواصل = نفس البايتات ⇒ تدخل الفواصل', () => {
    const compact = SIGNING.replace(/:/g, '');
    expect(compact).toHaveLength(64);
    expect(parseCertificateFingerprints(compact)).toEqual([SIGNING]);
  });

  test('الفراغ = ما فماش بصمة (موش خطأ)', () => {
    expect(parseCertificateFingerprints('')).toBeNull();
    expect(parseCertificateFingerprints('   ')).toBeNull();
    expect(parseCertificateFingerprints(undefined)).toBeNull();
    expect(parseCertificateFingerprints(null)).toBeNull();
  });

  test('البصمة الناقصة/الزائدة ترفض — ما نكتبوش ملف ما يخدمش', () => {
    // 31 بايت: حرف واحد ناقص في الآخر.
    expect(parseCertificateFingerprints(SIGNING.slice(0, -2))).toBeNull();
    // 33 بايت.
    expect(parseCertificateFingerprints(`${SIGNING}:0A`)).toBeNull();
    // بصمة SHA-1 (20 بايت) — الخوارزمية غالطة، موش «قريبة».
    expect(parseCertificateFingerprints('C0:4A:9F:31:7B:2D:88:E4:5A:16:0C:D3:71:BE:42:9A:64:1F:07:B5')).toBeNull();
    // حرف غير سداسي عشر.
    expect(parseCertificateFingerprints(SIGNING.replace(/^C0/, 'G0'))).toBeNull();
    // بصمة صحيحة + واحدة مغلوطة ⇒ الكل يرفض، حتى الصحيحة ما تنشرش وحدها.
    expect(parseCertificateFingerprints(`${SIGNING},nope`)).toBeNull();
  });
});

describe('أسماء الحزم', () => {
  test('بلا ضبط: حزمة الإصدار وحدها', () => {
    expect(parseAppLinkPackages(undefined)).toEqual([ANDROID_APP_LINK_PACKAGE]);
    expect(parseAppLinkPackages('')).toEqual([ANDROID_APP_LINK_PACKAGE]);
    expect(ANDROID_APP_LINK_PACKAGE).toBe('app.ayrovi.mobile');
  });

  test('الإصدار + العرض التجريبي يتعايشوا في نفس الملف', () => {
    expect(parseAppLinkPackages(`${ANDROID_APP_LINK_PACKAGE}, ${ANDROID_APP_LINK_DEMO_PACKAGE}`))
      .toEqual([ANDROID_APP_LINK_PACKAGE, ANDROID_APP_LINK_DEMO_PACKAGE]);
  });

  test('اسم حزمة باطل يرفض', () => {
    // بلا نقطة: موش اسم حزمة أندرويد.
    expect(parseAppLinkPackages('ayrovi')).toBeNull();
    // مسطرة ممنوعة في اسم الحزمة.
    expect(parseAppLinkPackages('app.ayrovi.mobile-x')).toBeNull();
  });

  test('الحروف الكبيرة تتنظّم لصغيرة — الحزم في `app.json` صغيرة', () => {
    expect(parseAppLinkPackages('App.Ayrovi.Mobile')).toEqual(['app.ayrovi.mobile']);
  });
});

describe('البيان الذي يُنشر', () => {
  test('الشكل اللي يطلبوه أندرويد بالضبط', () => {
    const statement = assetLinksStatement([ANDROID_APP_LINK_PACKAGE], [SIGNING]);
    expect(statement).toEqual([
      {
        relation: [ANDROID_APP_LINK_RELATION],
        target: {
          namespace: 'android_app',
          package_name: 'app.ayrovi.mobile',
          sha256_cert_fingerprints: [SIGNING],
        },
      },
    ]);
  });

  test('حزمتان ⇒ سطران، ونفس البصمات', () => {
    const statement = assetLinksStatement(
      [ANDROID_APP_LINK_PACKAGE, ANDROID_APP_LINK_DEMO_PACKAGE],
      [SIGNING, PLAY],
    );
    expect(statement).toHaveLength(2);
    const targets = (statement || []).map((entry) => (entry.target as any).package_name);
    expect(targets).toEqual([ANDROID_APP_LINK_PACKAGE, ANDROID_APP_LINK_DEMO_PACKAGE]);
    for (const entry of statement || []) {
      expect((entry.target as any).sha256_cert_fingerprints).toEqual([SIGNING, PLAY]);
    }
  });

  test('بلا بصمات: `null` — الخادم يرجع 404 بدل ملف فارغ', () => {
    expect(assetLinksStatement([ANDROID_APP_LINK_PACKAGE], [])).toBeNull();
    expect(assetLinksStatement([], [SIGNING])).toBeNull();
  });

  test('من متغيّرات البيئة: نفس النتيجة، والاسم الصحيح للمتغيّر', () => {
    expect(ANDROID_APP_LINK_ENV).toBe('ANDROID_APP_LINK_SHA256');
    expect(ANDROID_APP_LINK_PACKAGES_ENV).toBe('ANDROID_APP_LINK_PACKAGES');
    expect(appLinksFromEnv({})).toBeNull();
    expect(appLinksFromEnv({ [ANDROID_APP_LINK_ENV]: '  ' })).toBeNull();

    const statement = appLinksFromEnv({
      [ANDROID_APP_LINK_ENV]: `${SIGNING}\n${PLAY}`,
      [ANDROID_APP_LINK_PACKAGES_ENV]: ANDROID_APP_LINK_DEMO_PACKAGE,
    });
    expect(statement).toEqual([{
      relation: [ANDROID_APP_LINK_RELATION],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_APP_LINK_DEMO_PACKAGE,
        sha256_cert_fingerprints: [SIGNING, PLAY],
      },
    }]);
  });
});

describe('App Links — التشخيص يسمّي المتغيّر الناقص', () => {
  const FINGERPRINT = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

  test('بلا بصمات ⇒ الناقص هو البصمات (الحزم عندها معيار: حزمة الإصدار)', () => {
    expect(appLinksDiagnostics({}).missingEnv).toEqual([ANDROID_APP_LINK_ENV]);
    expect(appLinksDiagnostics({ [ANDROID_APP_LINK_PACKAGES_ENV]: ANDROID_APP_LINK_PACKAGE }).missingEnv).toEqual([
      ANDROID_APP_LINK_ENV,
    ]);
  });

  test('بصمة وبرك ⇒ البيان يخرج، بس **للإصدار وحدو**', () => {
    // نقطة تضيّع وقت: العرض التجريبي (`…demo`) ما يتغطّاش بالافتراضي ⇒
    // الروابط العميقة تخدم في تطبيق الإصدار وبرك. الحل صريح تحت.
    const env = { [ANDROID_APP_LINK_ENV]: FINGERPRINT };
    expect(appLinksDiagnostics(env).missingEnv).toEqual([]);
    const statement = appLinksFromEnv(env) as Array<Record<string, any>>;
    expect(statement).toHaveLength(1);
    expect(statement[0].target.package_name).toBe(ANDROID_APP_LINK_PACKAGE);
  });

  test('العرض التجريبي يتغطّى كان بإعلان صريح', () => {
    const env = {
      [ANDROID_APP_LINK_ENV]: FINGERPRINT,
      [ANDROID_APP_LINK_PACKAGES_ENV]: `${ANDROID_APP_LINK_PACKAGE},${ANDROID_APP_LINK_DEMO_PACKAGE}`,
    };
    expect(appLinksDiagnostics(env).missingEnv).toEqual([]);
    const statement = appLinksFromEnv(env) as Array<Record<string, any>>;
    expect(statement.map((entry) => entry.target.package_name)).toEqual([
      ANDROID_APP_LINK_PACKAGE,
      ANDROID_APP_LINK_DEMO_PACKAGE,
    ]);
  });

  test('بصمة مغلوطة ⇒ الناقص يتقال، والبيان ما يخرجش', () => {
    const env = { [ANDROID_APP_LINK_ENV]: 'AA:BB:ZZ' };
    expect(appLinksDiagnostics(env).missingEnv).toEqual([ANDROID_APP_LINK_ENV]);
    expect(appLinksFromEnv(env)).toBeNull();
  });
});

