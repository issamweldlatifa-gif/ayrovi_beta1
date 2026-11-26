/**
 * MLKit — إصدارات مثبّتة بدل الديناميكية (17.+) داخل @infinitered/react-native-mlkit-*.
 *
 * لماذا: الإصدار الديناميكي `17.+` يجبر Gradle على قراءة maven-metadata.xml من
 * repo.maven.apache.org عند **كل بناء**، وقد ردّ Maven Central بـ429
 * (Too Many Requests) في 26/11/2026 فإسقط بناء الـAPK بعد دقيقة —
 * لا علاقة للخطأ بالكود ولا بإصدارات Expo.
 *
 * لماذا THESE إصدارات بالذات (درس من محاولة أولى فاشلة):
 * فرض 17.0.0 على الكل أرجع object-detection-common إلى ما قبل إضافة فئة
 * `Detector` فسقط كوتلين بـ«Cannot access 'Detector' which is a supertype
 * of 'ObjectDetector'» (run 45865949108). القاعدة الصحيحة: تثبيت **ناتج
 * الحلّ نفسه** كما في البناء الأخضر — 17.+ يطابق 17.x فقط، وPOM الخاص بـ
 * object-detection:17.0.2 يسحب object-detection-common:18.0.0 (الأعلى يفوز):
 *   object-detection        17.0.2  (أحدث 17.x — mvnrepository 2024-08)
 *   object-detection-custom 17.0.2  (أحدث 17.x — 2024-08)
 *   object-detection-common 18.0.0  (ما يفرضه POM فعلياً — الأعلى يفوز)
 *   vision-common           17.3.0  (أحدث إصدار لها، بلا 18.x)
 * التثبيت على هذه المجموعة يقتل استعلام maven-metadata.xml نهائياً دون تغيير
 * أي فئة على classpath — نفس ما حلّه Gradle في كل البناء الأخضر السابق.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const PIN_MARKER = '[mlkit-pin]';

const PIN_BLOCK = `

// ${PIN_MARKER} إصدارات مثبّتة بدل 17.+ — استعلام maven-metadata.xml كان يُسقط
// البناء عند 429 من Maven Central (2026-11-26). قابس plugins/mlkit-pin.js —
// لا تعدّل الإصدارات إلا بعد قراءة القصّة في رأس الملف (17.0.0 كلها كسرت كوتلين).
subprojects {
    configurations.all {
        resolutionStrategy {
            force 'com.google.mlkit:object-detection:17.0.2'
            force 'com.google.mlkit:object-detection-custom:17.0.2'
            force 'com.google.mlkit:object-detection-common:18.0.0'
            force 'com.google.mlkit:vision-common:17.3.0'
        }
    }
}
`;

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function mlkitPin(config) {
  return withProjectBuildGradle(config, (mod) => {
    // الحرس يمنع التكرار عند prebuild غير النظيف (android/ مُتَجاهَل في Git
    // ويُولَّد من جديد في CI، لكن البناء المحلي المتكرر يمرّ هنا مرتين).
    if (!mod.modResults.contents.includes(PIN_MARKER)) {
      mod.modResults.contents += PIN_BLOCK;
    }
    return mod;
  });
};
