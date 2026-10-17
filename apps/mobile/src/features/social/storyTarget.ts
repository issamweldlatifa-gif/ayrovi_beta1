/**
 * هدف الستوري — الجزء النقي (بلا React)، قابل للاختبار (Q3، 08/10/2026).
 *
 * لماذا ملف مستقل: العارض في `features/social`، والبطاقة في `features/sections`،
 * والشاشة في `app/`. ثلاثة أماكن تحتاج **نفس القرار** — تكراره ثلاث مرّات
 * يعني ثلاث نسخ تتباعد. والأسوأ: استيراد `src/` من `app/` (دورة معكوسة).
 */
import { router } from 'expo-router';
import { Linking } from 'react-native';

import type { StoryItem } from '@/api/sections';

/** هل للستوري هدف يُفتح؟ الـCTA يبان بجوابها، وما عندوش ⇒ ما يبانش. */
export function storyHasTarget(story: StoryItem): boolean {
  return Boolean(story.productId || story.arrivalId || story.targetUrl);
}

/**
 * يفتح الهدف: منتوج ⇒ صفحتو؛ وصولة ⇒ المتجر مفلتر عليها؛ رابط ⇒ المتصفّح.
 *
 * الترتيب موش اعتباطي: المنتوج **أخصّ** من الوصولة (وصولة فيها منتوجات)،
 * والرابط الخارجي آخر حلّ لأنّو يخرج المستعمل من التطبيق.
 */
export function openStoryTarget(story: StoryItem): void {
  if (story.productId) {
    router.push({ pathname: '/product/[id]', params: { id: story.productId } });
    return;
  }
  if (story.arrivalId) {
    router.push({ pathname: '/catalog', params: { arrivalId: story.arrivalId } });
    return;
  }
  if (story.targetUrl) Linking.openURL(story.targetUrl).catch(() => null);
}
