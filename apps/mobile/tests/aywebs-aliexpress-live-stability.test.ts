/**
 * AYWEBs — Stabilité AliExpress en conditions réelles WebView mobile (28/10/2026).
 *
 * Couvre les causes exactes des deux erreurs rencontrées sur téléphone :
 *   1. « Lecture de la page impossible » (`aywebs.captureFailed`)
 *      - URL AliExpress > 600 caractères (`spm`, `pdp_npi`, `pdp_ext_f`, `utparam-url`)
 *        tronquée par `captureScript` alors que `pageUrl` gardait l'URL entière ;
 *      - mutations `history.replaceState` et bascules `www.` / `fr.` / `m.aliexpress.com` ;
 *      - messages parasites envoyés sur `window.ReactNativeWebView.postMessage` par
 *        les scripts AliExpress (`WindVane`, `AEHybrid`, `aplus`) ;
 *      - `WebView.onError` déclenché par les redirections `aliexpress://` / `intent://`
 *        (`ERR_UNKNOWN_URL_SCHEME`, `-10`) ou redirections intermédiaires (`ERR_ABORTED`, `-3`) ;
 *      - structure mobile H5 `_dida_config_` enveloppée dans `.fields` + `propertyList`.
 *   2. « Requête interrompue. » (`ApiError('aborted')`)
 *      - réécriture interne de query-params AliExpress pendant l'appui sur le bouton ;
 *      - pré-lecture silencieuse remplacée ou avortée pendant que l'appui s'y rattachait.
 */
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../../../src/aywebs/captureScript';
import {
  buildAyWebsCaptureInjection,
  isAyWebsBridgeMessage,
  parseAyWebsCaptureMessage,
  type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { ApiError } from '@/api/errors';
import {
  canReusePrefetch,
  readDecision,
  resolveAddToCart,
} from '@/features/aywebs/captureFlow';
import {
  captureMatchesPageUrl,
  decideWebNavigation,
  isFatalMainPageLoadError,
  isSilentAppDeepLink,
} from '@/features/aywebs/webNavigation';

const LONG_ALIEXPRESS_URL =
  'https://fr.aliexpress.com/item/1005008512345678.html'
  + '?spm=a2g0o.productlist.main.1.48213819xyz987654321'
  + '&algo_pvid=12345678-1234-1234-1234-1234567890ab'
  + '&algo_exp_id=12345678-1234-1234-1234-1234567890ab-0'
  + '&pdp_ext_f=%7B%22order%22%3A%221420%22%2C%22eval%22%3A%221%22%2C%22sku_id%22%3A%2212000045678901234%22%7D'
  + '&pdp_npi=4%40dis%21EUR%2149.98%2122.49%21%21%21380.00%21171.00%21%402103890117300000000001234e5678%2112000045678901234%21sea%21FR%210%21ABX'
  + '&curPageLogUid=AbCdEfGhIjKlMnOpQrStUvWxYz'
  + '&utparam-url=scene%3Asearch%7Cquery_from%3Aproductlist_main_1_' + 'x'.repeat(280)
  + '&sku_id=12000045678901234';

describe('AliExpress — identité de document face aux URL longues et aux mutations SPA', () => {
  it('reconnaît la même fiche malgré 900+ caractères de paramètres pdp_npi/spm et les sous-domaines mobiles', () => {
    expect(LONG_ALIEXPRESS_URL.length).toBeGreaterThan(750);
    expect(captureMatchesPageUrl(
      'https://fr.aliexpress.com/item/1005008512345678.html?sku_id=12000045678901234',
      LONG_ALIEXPRESS_URL,
    )).toBe(true);
    expect(captureMatchesPageUrl(
      'https://m.aliexpress.com/item/1005008512345678.html?gatewayAdapt=glo2fra&_t=1730123456',
      'https://www.aliexpress.com/item/1005008512345678.html?spm=a2g0o.home.1000001.12',
    )).toBe(true);
    expect(captureMatchesPageUrl(
      'https://ar.aliexpress.com/i/1005008512345678.html',
      'https://fr.aliexpress.com/item/1005008512345678.html',
    )).toBe(true);
  });

  it('refuse toujours une capture provenant d’un autre article AliExpress ou d’une page de recherche', () => {
    expect(captureMatchesPageUrl(
      'https://fr.aliexpress.com/item/1005009999999999.html',
      LONG_ALIEXPRESS_URL,
    )).toBe(false);
    expect(captureMatchesPageUrl(
      'https://fr.aliexpress.com/wholesale?SearchText=ecouteurs',
      LONG_ALIEXPRESS_URL,
    )).toBe(false);
  });

  it('préserve la pré-lecture et la lecture utilisateur lors des réécritures replaceState de la même fiche', () => {
    const now = 500_000;
    const rewrittenUrl = 'https://m.aliexpress.com/item/1005008512345678.html?pdp_npi=mutated&_t=999';
    expect(canReusePrefetch({ url: LONG_ALIEXPRESS_URL, at: now - 1_000, status: 'ok' }, rewrittenUrl, now)).toBe(true);
    expect(readDecision({ intent: 'user', pageUrl: LONG_ALIEXPRESS_URL }, 'silent', rewrittenUrl)).toBe('join');
  });
});

describe('AliExpress — script de capture réel sur URL longue et état mobile H5 (_dida_config_.fields)', () => {
  it('nettoie l’URL > 750 caractères sans tronquer sku_id et extrait les modules .fields + propertyList sous 64 Ko', () => {
    const posted: string[] = [];
    const didaState = {
      _init_data_: {
        data: {
          data: {
            headerInfo_2251: {
              id: 'headerInfo_2251',
              fields: {
                productId: '1005008512345678',
                title: 'Écouteurs Bluetooth 5.4 ANC Hi-Res',
              },
            },
            price_2252: {
              id: 'price_2252',
              fields: {
                currencyCode: 'EUR',
                discountPrice: {
                  minActivityAmount: { value: '22.49', currency: 'EUR' },
                  maxActivityAmount: { value: '25.99', currency: 'EUR' },
                },
              },
            },
            quantity_2254: {
              id: 'quantity_2254',
              fields: { totalAvailQuantity: 120 },
            },
            imageView_2255: {
              id: 'imageView_2255',
              fields: { imagePathList: ['https://ae01.alicdn.com/kf/S1111111111/main.jpg'] },
            },
            sku_2253: {
              id: 'sku_2253',
              fields: {
                propertyList: [
                  {
                    skuPropertyId: 14,
                    skuPropertyName: 'Couleur',
                    skuPropertyValues: [
                      { propertyValueId: 193, propertyValueDisplayName: 'Noir', skuPropertyImagePath: 'https://ae01.alicdn.com/kf/S222/noir.jpg' },
                      { propertyValueId: 194, propertyValueDisplayName: 'Blanc', skuPropertyImagePath: 'https://ae01.alicdn.com/kf/S333/blanc.jpg' },
                    ],
                  },
                  {
                    skuPropertyId: 5,
                    skuPropertyName: 'Version',
                    skuPropertyValues: [
                      { propertyValueId: 1001, propertyValueDisplayName: 'Standard' },
                      { propertyValueId: 1002, propertyValueDisplayName: 'ANC Pro' },
                    ],
                  },
                ],
                skuPaths: [
                  { skuIdStr: '12000045678901234', path: '14:193;5:1001', skuVal: { availQuantity: 45, skuActivityAmount: { value: '22.49', currency: 'EUR' } } },
                  { skuIdStr: '12000045678901235', path: '14:193;5:1002', skuVal: { availQuantity: 30, skuActivityAmount: { value: '25.99', currency: 'EUR' } } },
                  { skuIdStr: '12000045678901236', path: '14:194;5:1001', skuVal: { availQuantity: 45, skuActivityAmount: { value: '22.49', currency: 'EUR' } } },
                  { skuIdStr: '12000045678901237', path: '14:194;5:1002', skuVal: { availQuantity: 0, skuActivityAmount: { value: '25.99', currency: 'EUR' } } },
                ],
              },
            },
          },
        },
      },
    };
    const parsedUrl = new URL(LONG_ALIEXPRESS_URL);
    const context = vm.createContext({
      document: {
        title: 'AliExpress',
        documentElement: { getAttribute: () => 'fr' },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
      },
      location: {
        href: LONG_ALIEXPRESS_URL,
        hostname: parsedUrl.hostname,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
      },
      window: {
        _dida_config_: didaState,
        ReactNativeWebView: { postMessage: (text: string) => posted.push(String(text)) },
      },
      console,
    });

    vm.runInContext(buildAyWebsCaptureInjection(AYWEBS_CAPTURE_SCRIPT), context);
    expect(posted).toHaveLength(1);
    const parsed = parseAyWebsCaptureMessage(posted[0]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const capturedUrl = String(parsed.capture.url);
    expect(capturedUrl.length).toBeLessThan(150);
    expect(capturedUrl).toContain('sku_id=12000045678901234');
    expect(captureMatchesPageUrl(capturedUrl, LONG_ALIEXPRESS_URL)).toBe(true);
    expect(parsed.capture.title).toBe('Écouteurs Bluetooth 5.4 ANC Hi-Res');
    expect(parsed.capture.currencyText).toBe('EUR');
    expect(parsed.capture.priceCandidates).toEqual([
      { text: '22.49 EUR', source: 'embedded_json' },
    ]);
    const ae = parsed.capture.aliexpress as { pageItemId?: string; selectedSkuId?: string; skus?: unknown[] };
    expect(ae.pageItemId).toBe('1005008512345678');
    expect(ae.selectedSkuId).toBe('12000045678901234');
    expect(ae.skus).toHaveLength(4);
  });
});

describe('AliExpress — filtrage du pont WebView, des erreurs deep-link et des avortements internes', () => {
  it('ignore les messages tiers (WindVane / Aplus / AEHybrid) mais reconnaît nos captures et erreurs', () => {
    expect(isAyWebsBridgeMessage('windvane://call/HybridBridge:ready')).toBe(false);
    expect(isAyWebsBridgeMessage('bridge_ready')).toBe(false);
    expect(isAyWebsBridgeMessage('{"type":"aplus_pv","spm":"a2g0o.detail"}')).toBe(false);
    expect(isAyWebsBridgeMessage('{"event":"page_ready"}')).toBe(false);
    expect(isAyWebsBridgeMessage('[1,2,3]')).toBe(false);
    expect(isAyWebsBridgeMessage('')).toBe(false);

    expect(isAyWebsBridgeMessage('{"v":1,"url":"https://fr.aliexpress.com/item/1005008512345678.html"}')).toBe(true);
    expect(isAyWebsBridgeMessage('{"__aywebs_error":"SCRIPT_NO_RESULT"}')).toBe(true);
  });

  it('bloque silencieusement aliexpress:// et intent:// et n’affiche pas Lecture impossible sur ERR_UNKNOWN_URL_SCHEME / ERR_ABORTED', () => {
    const deepLink = 'aliexpress://product/detail?itemId=1005008512345678';
    const intentLink = 'intent://product/detail?itemId=1005008512345678#Intent;scheme=aliexpress;package=com.alibaba.aliexpresshd;end';
    expect(decideWebNavigation(deepLink)).toBe('block');
    expect(decideWebNavigation(intentLink)).toBe('block');
    expect(isSilentAppDeepLink(deepLink)).toBe(true);
    expect(isSilentAppDeepLink(intentLink)).toBe(true);
    expect(isSilentAppDeepLink('javascript:alert(1)')).toBe(false);

    const pageUrl = 'https://fr.aliexpress.com/item/1005008512345678.html';
    expect(isFatalMainPageLoadError({ url: deepLink, code: -10, description: 'net::ERR_UNKNOWN_URL_SCHEME', isForMainFrame: true }, pageUrl)).toBe(false);
    expect(isFatalMainPageLoadError({ url: pageUrl, code: -3, description: 'net::ERR_ABORTED', isForMainFrame: true }, pageUrl)).toBe(false);
    expect(isFatalMainPageLoadError({ url: pageUrl, code: -999, description: 'NSURLErrorCancelled', isForMainFrame: true }, pageUrl)).toBe(false);
    expect(isFatalMainPageLoadError({ url: 'https://retcode.alicdn.com/r.png', code: -2, description: 'ERR_NAME_NOT_RESOLVED', isForMainFrame: false }, pageUrl)).toBe(false);
    expect(isFatalMainPageLoadError({ url: 'https://retcode.alicdn.com/r.png', code: -2, description: 'ERR_FAILED', isForMainFrame: true }, pageUrl)).toBe(false);

    expect(isFatalMainPageLoadError({ url: pageUrl, code: -2, description: 'net::ERR_INTERNET_DISCONNECTED', isForMainFrame: true }, pageUrl)).toBe(true);
  });

  it('ne propage pas « Requête interrompue. » quand un avortement interne survient sans annulation du contrôleur client', async () => {
    const userController = new AbortController();
    const resolve = vi.fn(async () => ({}) as AyWebsResolveOutcome);
    const result = await resolveAddToCart({
      readCapture: async () => {
        throw new ApiError('aborted', 'Lecture remplacée par une nouvelle lecture.');
      },
      resolve,
      signal: userController.signal,
      waitForCapture: true,
    });
    expect(userController.signal.aborted).toBe(false);
    expect(result.decision.kind).toBe('refused');
    if (result.decision.kind === 'refused') {
      expect(result.decision.error.kind).not.toBe('aborted');
      expect(result.decision.error.code).toBe('CAPTURE_INCOMPLETE');
    }
  });
});
