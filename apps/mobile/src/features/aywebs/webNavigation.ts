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
  /* Paramètres éphémères SPA / télémétrie AliExpress & SHEIN injectés via replaceState */
  'spm', 'scm', 'scm_id', 'scm-url', 'pvid', 'pdp_npi', 'pdp_ext_f', 'utparam-url',
  'algo_pvid', 'algo_exp_id', 'curpageloguid', 'gatewayadapt', 'gps-id', 'btsid',
  'ws_ab_test', '_t', 'aff_fcid', 'aff_fsk', 'aff_platform', 'sk', 'aff_trace_key',
  'terminal_id', 'afsmartredirect', 'sourcetype', 'channel', '_randl_shipto', '_evo_buckets',
  'mallcode', 'imgratio', 'src_module', 'src_identifier', 'src_tab_page_id', 'pagelisttype',
  '_bg_fs', 'page_kw', 'ici', 'refer_page_el_sn', 'refer_page_id', 'refer_page_name',
  '_x_sessn_id', '_x_ads_channel', '_x_ads_sub_channel',
]);

const SILENT_APP_SCHEMES = /^(?:aliexpress|ae|alipays|tbopen|taobao|tmall|shein|sheinlink|temu|intent|market):/i;

/**
 * Les pages mobiles marchandes (AliExpress, SHEIN, Temu) tentent souvent en
 * arrière-plan d'ouvrir leur application native (`aliexpress://`, `intent://`).
 * On bloque toujours ce saut, mais sans afficher de bannière d'erreur parasite
 * au client qui navigue normalement sur la fiche HTTPS.
 */
export function isSilentAppDeepLink(raw: string): boolean {
  return SILENT_APP_SCHEMES.test(String(raw ?? '').trim());
}

function aliexpressDocumentIdentity(url: URL): string | null {
  const hostMatch = /(?:^|\.)(aliexpress\.(?:com|us|ru))$/i.exec(url.hostname);
  if (!hostMatch) return null;
  const rootHost = hostMatch[1].toLowerCase();
  const pathMatch = /\/(?:item|i)\/(\d{6,20})\.html(?:[/?]|$)/i.exec(url.pathname)
    || /\/store\/product\/[^/]+\/(?:\d+_)?(\d{6,20})\.html(?:[/?]|$)/i.exec(url.pathname);
  const queryId = url.searchParams.get('productId')
    || url.searchParams.get('itemId')
    || url.searchParams.get('item_id')
    || '';
  const itemId = pathMatch?.[1] || (/^\d{6,20}$/.test(queryId.trim()) ? queryId.trim() : '');
  if (!itemId) return null;
  return `https://${rootHost}/item/${itemId}.html`;
}

function sheinDocumentIdentity(url: URL): string | null {
  const hostMatch = /(?:^|\.)(shein\.(?:com|co\.uk|fr|de|es|it|ca|com\.mx|com\.br))$/i.exec(url.hostname);
  if (!hostMatch) return null;
  const rootHost = hostMatch[1].toLowerCase();
  const qMatch = url.searchParams.get('goods_id') || url.searchParams.get('goodsId') || url.searchParams.get('productId') || '';
  const pMatch = /(?:^|[-/])p-(\d{5,16})(?=[-./]|$)/i.exec(url.pathname)
    || /\/p\/(\d{5,16})(?:[/?]|$)/i.exec(url.pathname)
    || /\/product-item-v\d+-(\d{5,16})(?=[-./]|$)/i.exec(url.pathname);
  const goodsId = (/^\d{5,16}$/.test(qMatch.trim()) ? qMatch.trim() : '') || pMatch?.[1] || '';
  if (!goodsId) return null;
  return `https://${rootHost}/-p-${goodsId}.html`;
}

function documentIdentity(raw: string): string | null {
  try {
    const url = new URL(String(raw || '').trim());
    if (!isWebPageUrl(url.toString())) return null;
    const aeId = aliexpressDocumentIdentity(url);
    if (aeId) return aeId;
    const sheinId = sheinDocumentIdentity(url);
    if (sheinId) return sheinId;
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

export interface WebViewErrorLike {
  url?: string;
  code?: number;
  description?: string;
  isForMainFrame?: boolean;
}

/**
 * Filtre les faux positifs `WebView.onError` d'Android/iOS :
 *   • redirections d'application bloquées (`aliexpress://`, `intent://`, `ERR_UNKNOWN_URL_SCHEME`, code `-10`) ;
 *   • navigations intermédiaires annulées lors d'une redirection (`ERR_ABORTED`, `-3` / `-999`) ;
 *   • erreurs de sous-cadres (`isForMainFrame === false`) ou d'hôtes tiers (pixels/traceurs).
 */
export function isFatalMainPageLoadError(
  event: WebViewErrorLike | null | undefined,
  currentPageUrl: string,
): boolean {
  if (!event) return true;
  if (event.isForMainFrame === false) return false;
  const code = typeof event.code === 'number' ? event.code : 0;
  if (code === -999 || code === -3 || code === -10) return false;
  const desc = String(event.description ?? '');
  if (/ERR_UNKNOWN_URL_SCHEME|ERR_ABORTED|NSURLErrorCancelled|Frame load interrupted/i.test(desc)) {
    return false;
  }
  const failingUrl = String(event.url ?? '').trim();
  if (!failingUrl) return true;
  if (!isWebPageUrl(failingUrl)) return false;
  if (!currentPageUrl || !isWebPageUrl(currentPageUrl)) return true;
  if (captureMatchesPageUrl(failingUrl, currentPageUrl)) return true;
  try {
    const failHost = new URL(failingUrl).hostname.toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
    const pageHost = new URL(currentPageUrl).hostname.toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
    return failHost === pageHost;
  } catch {
    return false;
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
