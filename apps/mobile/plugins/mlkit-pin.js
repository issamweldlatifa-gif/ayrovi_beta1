/**
 * MLKit — إصدارات مثبّتة بدل الديناميكية (17.+) داخل @infinitered/react-native-mlkit-*.
 *
 * لماذا: الإصدار الديناميكي `17.+` يجبر Gradle على قراءة maven-metadata.xml من
 * repo.maven.apache.org عند **كل بناء**، وقد ردّ Maven Central بـ429
 * (Too Many Requests) في 26/11/2026 فإسقط بناء الـAPK بعد دقيقة —
 * لا علاقة للخطأ بالكود ولا بإصدارات Expo (التعليقة كانت تُظهر جدول
 * [📦] المترابطين فقط). التثبيت على إصدار حيّ معروف يقتل استعلام
 * maven-metadata.xml نهائياً، فلا يبقى البناء رهينة لمزاج Maven Central.
 *
 * الإصدارات الأربعة 17.0.0 هي الأساس الذي حُلّ عليه 17.+ عند كتابة
 * @infinitered/react-native-mlkit-5.0.0، ولا تستهلك شيئاً أبعد من 17.0.0.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const PIN_MARKER = '[mlkit-pin]';

const PIN_BLOCK = `

// ${PIN_MARKER} إصدارات مثبّتة بدل 17.+ — استعلام maven-metadata.xml كان يُسقط
// البناء عند 429 من Maven Central (2026-11-26). قابس expo/config-plugins
// plugins/mlkit-pin.js — لا تحذفه إلا مع فهم القصّة أعلاه.
subprojects {
    configurations.all {
        resolutionStrategy {
            force 'com.google.mlkit:object-detection-common:17.0.0'
            force 'com.google.mlkit:object-detection-custom:17.0.0'
            force 'com.google.mlkit:object-detection:17.0.0'
            force 'com.google.mlkit:vision-common:17.0.0'
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
