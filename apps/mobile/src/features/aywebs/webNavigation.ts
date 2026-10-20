/**
 * قرار التنقّل داخل صفحة المتجر (WebView) — دالة نقيّة تُختبر بدون جهاز.
 *
 * لماذا هي مهمة: `react-native-webview` يفتح خارج التطبيق كل عنوان لا يطابق
 * `originWhitelist`، ويفعل ذلك **قبل** أن يستشير `onShouldStartLoadWithRequest`
 * (انظر `WebViewShared`: `Linking.openURL(url)` ثم `shouldStart = false`).
 * مع `['https://*']` كانت كل صفحة متجر تحوّل إلى `http://` أو `intent://` أو
 * `market://` أو مخطط تطبيق (فيسبوك، واتساب…) تخرج إلى تطبيق خارجي دون أن يطلبه المستعمل.
 *
 * الحل: نسمح للمكتبة بكل العناوين (`'*'`)، ونحسم نحن هنا: صفحات الويب داخل التطبيق،
 * وكل ما عداها يُمنع بلا أي فتح خارجي.
 */

/** صفحة ويب: `http://` أو `https://` مع مضيف. يرفض المسافات ومخطط أي شيء آخر. */
export function isWebPageUrl(raw: string): boolean {
  return /^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i.test(String(raw ?? '').trim());
}

export type WebNavigationDecision = 'allow' | 'block';

export function decideWebNavigation(url: string): WebNavigationDecision {
  if (url === 'about:blank') return 'allow';
  return isWebPageUrl(url) ? 'allow' : 'block';
}
