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

const TRACKING_DOCUMENT_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'srsltid', 'igshid',
]);

function documentIdentity(raw: string): string | null {
  try {
    const url = new URL(String(raw || '').trim());
    if (!isWebPageUrl(url.toString())) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_DOCUMENT_PARAMS.has(key.toLowerCase()) || /^utm_/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Une capture appartient-elle au document actuellement affiché ? Le fragment et
 * l'ordre des paramètres ne changent pas le document ; le chemin et TOUTES les
 * valeurs de paramètres restent significatifs. Une capture sans URL, ou venant
 * d'un autre produit, est refusée au lieu d'ouvrir une feuille mélangée.
 */
export function captureMatchesPageUrl(captureUrl: unknown, pageUrl: unknown): boolean {
  if (typeof captureUrl !== 'string' || typeof pageUrl !== 'string') return false;
  const capture = documentIdentity(captureUrl);
  const page = documentIdentity(pageUrl);
  return Boolean(capture && page && capture === page);
}
