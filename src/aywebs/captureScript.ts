/**
 * AYWEBs — LECTEUR DE PAGE POUR LE WebView DU CLIENT (Phase 2.1, 06/10/2026).
 *
 * Ce module contient LE script exécuté dans la page marchande ouverte chez le
 * client (`webView.evaluateJavascript`). Il ne fait AUCUNE décision métier : il
 * COLLECTE des faits lisibles — des textes — et les rend en JSON. C'est le
 * serveur (`webviewCapture.ts`) qui juge : intégrité du prix, devise prouvée,
 * disponibilité, corroboration.
 *
 * ── POURQUOI UN SCRIPT SERVI PAR LE SERVEUR ─────────────────────────────────
 * Servi à `GET /api/v1/aywebs/capture/script.js` : corriger un sélecteur cassé
 * par un marchand devient un déploiement serveur, pas une nouvelle version de
 * l'application. Le script ne contient aucun secret (il lit une page publique
 * que l'utilisateur regarde déjà) — une clé embarquée, elle, aurait été un faux
 * secret : une application est décompilable.
 *
 * ── RÈGLES D'ÉCRITURE (ne pas les casser) ───────────────────────────────────
 *   • ES5 uniquement (vieux WebViews), aucune balise de gabarit, aucun backtick ;
 *   • jamais d'exception qui remonte : chaque section est isolée par try/catch ;
 *   • aucune donnée privée : pas de cookies, pas de localStorage, pas de champs
 *     de formulaire, pas de HTML. Uniquement des textes visibles et des métas ;
 *   • bornes strictes (longueurs, nombre d'éléments) côté client ET côté serveur ;
 *   • un texte de prix SANS chiffre ET sans devise n'est pas candidat : cela
 *     évite le piège des prix « coupés » (Amazon publie la partie entière et la
 *     partie décimale dans deux spans séparés : « 6 » + « 99 »).
 */

import { findAyWebsStore } from '../../shared/aywebsStores';
import { ayWebsCaptureReader } from './captureReaders/registry';

/** Chemin de service du script (le client le récupère une fois puis le rejoue). */
export const AYWEBS_CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';

export const AYWEBS_CAPTURE_SCRIPT = String.raw`(function () {
  var LIMITS = { priceCandidates: 4, variantTexts: 30, selectedTexts: 5, images: 4, label: 60, text: 300, variantGroups: 4, variantValues: 20, matrixEntries: 120 };
  var GLOBAL_WIN = null;
  try { GLOBAL_WIN = (typeof document !== 'undefined' && document && document.defaultView) ? document.defaultView : (typeof window !== 'undefined' ? window : null); } catch (e) { GLOBAL_WIN = null; }
  var READER_PROFILE = null;
  try { READER_PROFILE = (GLOBAL_WIN && GLOBAL_WIN.__AYWEBS_CAPTURE_READER__) || (typeof window !== 'undefined' && window.__AYWEBS_CAPTURE_READER__) || null; } catch (e) { READER_PROFILE = null; }
  var out = {
    v: 1, url: '', canonicalUrl: null, title: null, brand: null,
    priceCandidates: [], currencyText: null, availabilityText: null,
    addToCartText: null, conditionText: null, selectedVariantTexts: [], variantTexts: [], variantGroups: [],
    variantMatrix: [],
    images: [], capturedAt: null, pageLang: null, amazon: null, shein: null, aliexpress: null,
    reader: READER_PROFILE ? { id: READER_PROFILE.storeId || null, version: READER_PROFILE.version || 0 } : null,
    diagnostics: []
  };

  /* Diagnostic BORNÉ : code court (ex. « price:buybox_asin_mismatch »), jamais de texte de page. */
  function diag(code) { if (out.diagnostics.length < 16) out.diagnostics.push(code); }

  function text(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cut(value, max) { return text(value).slice(0, max); }
  function pushUnique(list, value, max, size) {
    var v = cut(value, size);
    if (!v) return;
    for (var i = 0; i < list.length; i++) { if (list[i].toLowerCase() === v.toLowerCase()) return; }
    if (list.length < max) list.push(v);
  }
  var CURRENCY_HINT = /[$\u20ac\u00a3\u00a5\u20ba]|(?:^|[^A-Za-z])(EUR|USD|GBP|JPY|TND|DT|MAD|AED|SAR|CAD|AUD|SGD|BRL|MXN|PLN|TRY|CHF|SEK)(?=$|[^A-Za-z])|\bd\.?t\b/i;
  var HAS_DIGIT = /[0-9]/;

  /* ── LECTEUR AMAZON (07/10/2026) — pourquoi un lecteur à part ──────────────
     Amazon ne publie AUCUN JSON-LD de prix (mesuré 04/10 et 06/10/2026) : son
     prix est éclaté en spans («a-price-symbol» + «a-price-whole» +
     «a-price-fraction») et le «.a-offscreen» DANS le bloc de prix est vide. La
     page est par ailleurs constellée de prix de PUBLICITÉ (carrousels
     sponsorisés, « Similar items ») : le lecteur générique y a déjà pris 6,99
     au lieu du prix vendu (audit Phase 0).

     Sur une page qui a la coquille produit d'Amazon, on lit donc UNIQUEMENT la
     zone d'achat (buybox / core price), on exclut les contextes publicitaires,
     et s'il reste plus d'un montant DISTINCT on ne publie RIEN : le serveur
     relira. Ne rien publier est un résultat honnête ; choisir au hasard ne
     l'est pas. */
  var host = '';
  try { host = String(location.hostname || '').toLowerCase().replace(/^(?:www|smile)\./, ''); } catch (e) { host = ''; }
  var IS_AMAZON = /^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
  function hasSelector(selector) {
    try { return !!document.querySelector(selector); } catch (e) { return false; }
  }
  /* La coquille produit : une vraie fiche /dp en a toujours au moins un marqueur.
     Une page amazon.com qui n'en a aucun n'est pas une fiche produit (page de
     recherche, page de test) : elle garde le lecteur générique. */
  var AMAZON_STRICT = IS_AMAZON && (
    hasSelector('#dp-container') || hasSelector('#dp') || hasSelector('#ppd') || hasSelector('#centerCol')
    || hasSelector('#buybox') || hasSelector('#desktop_buybox') || hasSelector('#apex_desktop')
    || hasSelector('#corePriceDisplay_desktop_feature_div') || hasSelector('#corePrice_desktop')
    || hasSelector('#corePrice_feature_div') || hasSelector('#corePrice_mobile_feature_div'));
  var AMAZON_ASIN = '';
  if (AMAZON_STRICT) {
    try {
      var asinMatch = String(location.pathname || '').match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
      if (asinMatch) AMAZON_ASIN = asinMatch[1].toUpperCase();
      if (!AMAZON_ASIN) {
        var canonicalLink = document.querySelector('link[rel="canonical"]');
        var canonicalHref = canonicalLink ? String(canonicalLink.getAttribute('href') || '') : '';
        var canonicalMatch = canonicalHref.match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
        if (canonicalMatch) AMAZON_ASIN = canonicalMatch[1].toUpperCase();
      }
    } catch (e) {}
  }
  /* ── LECTEUR SHEIN / TEMU (26/10/2026) ────────────────────────────────────
     Ces deux marchands rendent une application mono-page : le prix demandé au
     panier arrive dans un conteneur dont le nom est STABLE («product-intro__
     head-price», «price-now», «sale-price»…), à côté du prix BARRÉ (retail).
     Le lecteur générique les ignorait : il ne connaît que «.product-price» ou
     «[data-price]». Résultat mesuré côté client : capture reçue, AUCUN prix
     candidat ⇒ feuille sans prix, et le bouton restait en lecture.

     Ici on lit UNIQUEMENT des conteneurs nommés, on retire le prix barré, et on
     n'écrit un candidat que si TOUTES les lectures donnent le MÊME montant. Un
     désaccord ne devient jamais un prix : il devient un diagnostic. La lecture
     générique est SAUTÉE pour ces deux marchands (elle ramène les prix des
     articles recommandés). */
  var IS_SHEIN = /(^|\.)shein\.(com|co\.uk|fr|de|es|it|ca|com\.mx|com\.br)$/.test(host);
  var IS_TEMU = /(^|\.)temu\.com$/.test(host);
  var IS_ALIEXPRESS = /(^|\.)aliexpress\.(com|us|ru)$/.test(host);
  var SHEIN_GOODS_ID = '';
  var ALIEXPRESS_ITEM_ID = '';
  var ALIEXPRESS_URL_SKU_ID = '';
  if (IS_SHEIN) {
    try {
      var sheinQueryMatch = String(location.search || '').match(/[?&](?:goods_id|goodsId|productId)=(\d{5,16})(?:&|$)/i);
      if (sheinQueryMatch) SHEIN_GOODS_ID = sheinQueryMatch[1];
      if (!SHEIN_GOODS_ID) {
        var sheinPath = String(location.pathname || '');
        var sheinPathMatch = sheinPath.match(/(?:^|[-/])p-(\d{5,16})(?=[-./]|$)/i)
          || sheinPath.match(/\/p\/(\d{5,16})(?=[-./]|$)/i)
          || sheinPath.match(/\/product-item-v\d+-(\d{5,16})(?=[-./]|$)/i);
        if (sheinPathMatch) SHEIN_GOODS_ID = sheinPathMatch[1];
      }
      if (!SHEIN_GOODS_ID) {
        var sheinCanonEl = document.querySelector('link[rel="canonical"]');
        var sheinCanonHref = sheinCanonEl ? String(sheinCanonEl.getAttribute('href') || '') : '';
        var sheinCanonMatch = sheinCanonHref.match(/(?:^|[-/])p-(\d{5,16})(?=[-./?]|$)/i);
        if (sheinCanonMatch) SHEIN_GOODS_ID = sheinCanonMatch[1];
      }
    } catch (e) {}
  }
  if (IS_ALIEXPRESS) {
    try {
      var aePath = String(location.pathname || '');
      var aePathMatch = aePath.match(/\/(?:item|i)\/(\d{6,20})\.html(?:[/?]|$)/i)
        || aePath.match(/\/store\/product\/[^/]+\/(?:\d+_)?(\d{6,20})\.html(?:[/?]|$)/i);
      if (aePathMatch) ALIEXPRESS_ITEM_ID = aePathMatch[1];
      if (!ALIEXPRESS_ITEM_ID) {
        var aeQueryMatch = String(location.search || '').match(/[?&](?:productId|itemId|item_id)=(\d{6,20})(?:&|$)/i);
        if (aeQueryMatch) ALIEXPRESS_ITEM_ID = aeQueryMatch[1];
      }
      if (!ALIEXPRESS_ITEM_ID) {
        var aeCanonEl = document.querySelector('link[rel="canonical"]');
        var aeCanonHref = aeCanonEl ? String(aeCanonEl.getAttribute('href') || '') : '';
        var aeCanonMatch = aeCanonHref.match(/\/(?:item|i)\/(\d{6,20})\.html/i);
        if (aeCanonMatch) ALIEXPRESS_ITEM_ID = aeCanonMatch[1];
      }
      var aeSkuQueryMatch = String(location.search || '').match(/[?&](?:sku_id|skuId)=(\d{5,24})(?:&|$)/i);
      if (aeSkuQueryMatch) ALIEXPRESS_URL_SKU_ID = aeSkuQueryMatch[1];
    } catch (e) {}
  }
  var STRUCK = 'del, s, strike, [class*="original" i], [class*="retail" i], [class*="crossed" i], [class*="line-through" i], [class*="strike" i], [class*="market" i], [class*="old-price" i], [class*="list-price" i], [class*="delprice" i], [class*="del-price" i], [class*="price-del" i], [class*="club-price" i], [class*="member-price" i], [class*="vip-price" i], [class*="installment" i], [class*="klarna" i], [class*="afterpay" i], [class*="clearpay" i], [class*="estimat" i], [class*="coupon" i], [class*="discount-label" i], [class*="price-discount" i], [class*="off-tag" i]';
  var SHEIN_MAIN_PRICE_SCOPES = [
    '.product-intro__head-mainprice',
    '.goods-price__main',
    '[class*="product-intro__head-mainprice" i]',
    '[class*="goods-price__main" i]',
    '[data-testid="product-price-sale"]'
  ];
  var AE_MAIN_PRICE_SCOPES = [
    '[data-pl="product-price"] [class*="price--currentPriceText" i]',
    '[data-pl="product-price"] [class*="price--current" i]',
    '[data-pl="product-price"] [class*="currentPrice" i]',
    '.product-price-current',
    '[class*="pdp-comp-price-current" i]',
    '[class*="price-banner--current" i]',
    '.uniform-banner-box-price',
    '[class*="pdp-info" i] [class*="price--current" i]',
    '[class*="price-default--current" i]',
    '[class*="snow-price_SnowPrice__main" i]',
    '[data-testid="product-price-current"]'
  ];
  /* Conteneurs liés au BLOC PRODUIT, jamais « tout ce qui contient price » : une
     classe « sale-price » existe aussi sur les cartes de recommandation, et un
     prix de recommandation publié comme prix vendu serait pire que pas de prix. */
  var PRICE_SCOPES = [
    '.product-intro__head-price',
    '[class*="product-intro" i] [class*="price" i]',
    '[class*="goods-detail" i] [class*="price" i]',
    '[data-testid*="product-price" i]',
    '[data-testid*="price" i]'
  ];
  var SHEIN_BLOCKED_CONTEXT = /recommend|similar|also[-_ ]?like|related|carousel|review|comment|outfit|shop[-_ ]?the[-_ ]?look|match[-_ ]?with|often[-_ ]?bought|recently[-_ ]?viewed|header|footer/i;
  var AE_BLOCKED_CONTEXT = /recommend|more[-_ ]?to[-_ ]?love|similar|related|also[-_ ]?like|bundle[-_ ]?deal|combo|shipping|delivery|freight|installment|klarna|afterpay|choice[-_ ]?banner|review|comment|seller[-_ ]?rec|store[-_ ]?rec|header|footer/i;
  function sheinBlocked(node) {
    var cur = node;
    for (var hop = 0; cur && cur.nodeType === 1 && hop < 8; hop++) {
      var tag = String(cur.tagName || '').toLowerCase();
      if (tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'aside') return true;
      var cls = String(cur.className || '') + ' ' + String(cur.id || '') + ' ' + String((cur.getAttribute && cur.getAttribute('data-testid')) || '');
      if (SHEIN_BLOCKED_CONTEXT.test(cls)) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  function aeBlocked(node) {
    var cur = node;
    for (var hop = 0; cur && cur.nodeType === 1 && hop < 8; hop++) {
      var tag = String(cur.tagName || '').toLowerCase();
      if (tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'aside') return true;
      var cls = String(cur.className || '') + ' ' + String(cur.id || '') + ' ' + String((cur.getAttribute && (cur.getAttribute('data-pl') || cur.getAttribute('data-testid'))) || '');
      if (AE_BLOCKED_CONTEXT.test(cls)) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  function aeNormalizeSplitPrice(raw) {
    var s = text(raw);
    if (!s) return '';
    /* AliExpress Comet éclate le prix courant en spans (« US $ », « 14 », « . », « 99 ») :
       l'indentation HTML ne doit pas laisser d'espace autour du séparateur décimal,
       ni coller un suffixe d'unité (« / piece », « / lot »). */
    s = s.replace(/\s*\/\s*(?:pc|pcs|piece|pi[eè]ce|lot|set|pair|paire|pack|unit|item|pieza|pe[cç]a|stück)s?\b.*$/i, '');
    s = s.replace(/(\d)\s*([.,])\s*(\d{1,2})(?!\d)/g, '$1$2$3');
    return text(s);
  }
  /* Texte d'un conteneur SANS ses prix barrés ni pastilles de remise (-40%). */
  function scopeText(element) {
    if (!element) return '';
    var clone = null;
    try { clone = element.cloneNode(true); } catch (e) { return text(element.textContent); }
    try {
      var struck = clone.querySelectorAll(STRUCK);
      for (var i = 0; i < struck.length; i++) {
        if (struck[i] && struck[i].parentNode) struck[i].parentNode.removeChild(struck[i]);
      }
      var children = clone.querySelectorAll('span, div, em, b, strong, small, p');
      for (var c = 0; c < children.length; c++) {
        var childText = text(children[c].textContent);
        if (childText && /^[-+]?\s*\d{1,2}\s*%(?:\s*off)?$/i.test(childText) && children[c].parentNode) {
          children[c].parentNode.removeChild(children[c]);
        }
      }
    } catch (e) {}
    return text(clone.textContent);
  }
  /* Un nœud BARRÉ ou annexe (club, coupon, mensualité) n'est pas un prix vendu. */
  var STRUCK_HINT = /original|retail|crossed|line-through|strike|market|old-price|list-price|delprice|del-price|price-del|club-price|member-price|vip-price|installment|klarna|afterpay|clearpay|estimat|coupon|discount-label|price-discount|off-tag/i;
  function struckNode(node) {
    var current = node;
    for (var hop = 0; current && current.nodeType === 1 && hop < 4; hop++) {
      var tag = String(current.tagName || '').toLowerCase();
      if (tag === 'del' || tag === 's' || tag === 'strike') return true;
      if (STRUCK_HINT.test(String(current.className || ''))) return true;
      current = current.parentNode;
    }
    return false;
  }
  function amountCount(value) {
    var hits = String(value || '').match(/[0-9]+(?:[.,][0-9]{1,2})?/g);
    return hits ? hits.length : 0;
  }
  function collectScopedReadings(scopes) {
    var readings = [];
    var seenCompact = {};
    for (var s = 0; s < scopes.length; s++) {
      var nodes = [];
      try { nodes = document.querySelectorAll(scopes[s]); } catch (e) { continue; }
      for (var n = 0; n < nodes.length && n < 4; n++) {
        if (IS_SHEIN && sheinBlocked(nodes[n])) continue;
        if (IS_ALIEXPRESS && aeBlocked(nodes[n])) continue;
        if (struckNode(nodes[n])) continue;
        var value = scopeText(nodes[n]);
        if (IS_ALIEXPRESS) value = aeNormalizeSplitPrice(value);
        if (!value || value.length > 80) continue;
        if (!HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value)) continue;
        if (amountCount(value) !== 1) continue; /* vente + barré collés : on ne tranche pas */
        var compact = value.replace(/\s+/g, '').toLowerCase();
        if (!seenCompact[compact]) {
          seenCompact[compact] = true;
          readings.push(value);
        }
      }
      if (readings.length > 4) break;
    }
    return readings;
  }
  /* Montants distincts lus dans les conteneurs nommés (jamais plus de 6 nœuds). */
  function storeScopedPrices() {
    if (IS_SHEIN) {
      var mainReadings = collectScopedReadings(SHEIN_MAIN_PRICE_SCOPES);
      if (mainReadings.length > 0) return mainReadings;
    }
    if (IS_ALIEXPRESS) {
      /* Sur AliExpress mobile/desktop, le bloc principal « data-pl="product-price" »
         coexiste parfois avec une bannière secondaire (« Offre de bienvenue » /
         barre collante) : dès que le premier sélecteur prioritaire livre un montant
         unique, on ne descend pas dans les sélecteurs de repli moins précis. */
      for (var aeS = 0; aeS < AE_MAIN_PRICE_SCOPES.length; aeS++) {
        var tierReadings = collectScopedReadings([AE_MAIN_PRICE_SCOPES[aeS]]);
        if (tierReadings.length === 1) return tierReadings;
        if (tierReadings.length > 1) return tierReadings;
      }
    }
    return collectScopedReadings(PRICE_SCOPES);
  }
  /* ── LECTEUR D'ÉTAT ET VARIANTES SHEIN v2 (28/10/2026) ─────────────────────
     SHEIN rend chaque couleur sous son propre goods_id (-p-<id>.html) et publie
     les tailles, stocks et prix SKU dans son état embarqué (gbRawData /
     productIntroData / __SSR_DATA__ / __INITIAL_STATE__) ainsi que dans le DOM
     (.product-intro__color, .product-intro__size, .goods-color, .goods-size).
     Tout reste vérifié contre SHEIN_GOODS_ID : un état SPA résiduel d'un autre
     article est immédiatement écarté. */
  var SHEIN_STATE = null;
  var SHEIN_STATE_CHECKED = false;
  var SHEIN_BEM_ACTIVE = /(?:^|[\s_-])(active|selected|checked|current|choose|is-active|on)(?:$|[\s_-])/i;
  var SHEIN_BEM_DISABLED = /(?:^|[\s_-])(disabled|soldout|sold-out|unavailable|out-of-stock|oos|is-disabled|no-stock)(?:$|[\s_-])/i;
  var SHEIN_SIZE_GUIDE_NOISE = /^(?:cm|inch|inches|in|eu|us|uk|fr|it|br|mx|de|es|fit\s*finder|size\s*guide|sizing\s*guide|guide\s*des\s*tailles|tableau\s*des\s*tailles|gr(?:ö|oe)(?:ß|ss)entabelle|gu(?:í|i)a\s*de\s*tallas|guida\s*alle\s*taglie|جدول\s*المقاسات|دليل\s*المقاسات)$/i;
  var SHEIN_LOW_STOCK_HINT = /(?:only\s*(\d{1,2})\s*left(?:\s*in\s*stock)?|plus\s*que\s*(\d{1,2})(?:\s*en\s*stock)?|nur\s*noch\s*(\d{1,2})|solo\s*quedan\s*(\d{1,2})|ultimi\s*(\d{1,2})|بقي\s*(\d{1,2})\s*فقط|متبقي\s*(\d{1,2}))/i;

  function sheinHttpsUrl(rawUrl) {
    var u = text(rawUrl);
    if (!u) return '';
    if (u.indexOf('//') === 0) u = 'https:' + u;
    return /^https?:\/\//i.test(u) ? cut(u, 600) : '';
  }
  function sheinExtractGoodsIdFromUrl(rawUrl) {
    var s = String(rawUrl || '');
    if (!s) return '';
    var qm = s.match(/[?&](?:goods_id|goodsId|productId)=(\d{5,16})(?:&|$)/i);
    if (qm) return qm[1];
    var pm = s.match(/(?:^|[-/])p-(\d{5,16})(?=[-./?#]|$)/i)
      || s.match(/\/p\/(\d{5,16})(?=[-./?#]|$)/i)
      || s.match(/\/product-item-v\d+-(\d{5,16})(?=[-./?#]|$)/i);
    return pm ? pm[1] : '';
  }
  function sheinNumericAmount(rawText) {
    var s = text(rawText);
    if (!s) return null;
    var m = s.match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!m) return null;
    var n = parseFloat(m[1].replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }
  function sheinFormatPriceObj(priceObj, fallbackCurrency) {
    if (priceObj === null || priceObj === undefined) return '';
    var iso = /^[A-Z]{3}$/.test(String(fallbackCurrency || '').toUpperCase()) ? String(fallbackCurrency).toUpperCase() : '';
    if (typeof priceObj === 'string' || typeof priceObj === 'number') {
      var direct = text(priceObj);
      if (!direct || !HAS_DIGIT.test(direct)) return '';
      if (CURRENCY_HINT.test(direct) && amountCount(direct) === 1) return cut(direct, LIMITS.label);
      if (iso && /^\d+(?:[.,]\d{1,2})?$/.test(direct)) return cut(direct.replace(',', '.') + ' ' + iso, LIMITS.label);
      return '';
    }
    if (typeof priceObj !== 'object') return '';
    var objIso = text(priceObj.currency || priceObj.currencyCode || priceObj.priceCurrency).toUpperCase();
    if (/^[A-Z]{3}$/.test(objIso)) iso = objIso;
    var amt = text(priceObj.amount !== undefined ? priceObj.amount : (priceObj.usdAmount !== undefined && iso === 'USD' ? priceObj.usdAmount : (priceObj.value !== undefined ? priceObj.value : '')));
    if (amt && /^\d+(?:[.,]\d{1,2})?$/.test(amt) && iso) {
      return cut(amt.replace(',', '.') + ' ' + iso, LIMITS.label);
    }
    var withSym = text(priceObj.amountWithSymbol || priceObj.displayPrice || priceObj.formatted || '');
    if (withSym && HAS_DIGIT.test(withSym) && CURRENCY_HINT.test(withSym) && amountCount(withSym) === 1) {
      return cut(withSym, LIMITS.label);
    }
    return '';
  }
  function sheinNodeSelected(el) {
    var cur = el;
    for (var hop = 0; cur && cur.nodeType === 1 && hop < 3; hop++) {
      if (cur.getAttribute) {
        if (cur.getAttribute('aria-checked') === 'true' || cur.getAttribute('aria-selected') === 'true' || cur.getAttribute('aria-pressed') === 'true') return true;
        var ds = String(cur.getAttribute('data-selected') || cur.getAttribute('data-active') || '').toLowerCase();
        if (ds === 'true' || ds === '1') return true;
      }
      if (SHEIN_BEM_ACTIVE.test(String(cur.className || ''))) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  function sheinNodeDisabled(el) {
    var cur = el;
    for (var hop = 0; cur && cur.nodeType === 1 && hop < 3; hop++) {
      if (cur.disabled === true) return true;
      if (cur.getAttribute) {
        if (cur.getAttribute('aria-disabled') === 'true' || cur.getAttribute('disabled') !== null) return true;
        var dd = String(cur.getAttribute('data-disabled') || cur.getAttribute('data-soldout') || '').toLowerCase();
        if (dd === 'true' || dd === '1') return true;
      }
      if (SHEIN_BEM_DISABLED.test(String(cur.className || ''))) return true;
      if (hop === 0 && cur.querySelector) {
        try {
          if (cur.querySelector('[class*="soldout" i], [class*="sold-out" i], [class*="disabled" i], [aria-disabled="true"]')) return true;
        } catch (e) {}
      }
      cur = cur.parentNode;
    }
    return false;
  }
  function sheinCleanSizeLabel(el) {
    if (!el) return { label: '', stock: null };
    var rawText = text(el.textContent);
    var stockVal = null;
    if (rawText) {
      var sm = rawText.match(SHEIN_LOW_STOCK_HINT);
      if (sm) {
        var digits = sm[1] || sm[2] || sm[3] || sm[4] || sm[5] || sm[6] || sm[7];
        var parsedStock = parseInt(digits, 10);
        if (parsedStock > 0 && parsedStock <= 99) stockVal = parsedStock;
      }
    }
    var attrSize = text(el.getAttribute && (el.getAttribute('data-size') || el.getAttribute('data-attr-value') || el.getAttribute('data-value')));
    if (attrSize && !/^\d{5,}$/.test(attrSize) && !SHEIN_SIZE_GUIDE_NOISE.test(attrSize)) {
      return { label: cut(attrSize, LIMITS.label), stock: stockVal };
    }
    if (el.querySelector) {
      try {
        var inner = el.querySelector('.product-intro__size-radio-inner, .goods-size__item-text, [class*="size-radio-inner" i], [class*="size-name" i], [class*="size-label" i]');
        var innerTxt = text(inner && inner.textContent);
        if (innerTxt && !SHEIN_SIZE_GUIDE_NOISE.test(innerTxt)) {
          return { label: cut(innerTxt, LIMITS.label), stock: stockVal };
        }
      } catch (e) {}
    }
    var aria = text(el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')));
    var candidate = aria || rawText;
    if (candidate) {
      candidate = text(candidate.replace(SHEIN_LOW_STOCK_HINT, '').replace(/\b(?:sold\s*out|out\s*of\s*stock|épuisé|epuise|rupture|ausverkauft|agotado|esaurito)\b/gi, ''));
    }
    if (!candidate || candidate.length > 36 || SHEIN_SIZE_GUIDE_NOISE.test(candidate)) return { label: '', stock: stockVal };
    return { label: cut(candidate, LIMITS.label), stock: stockVal };
  }
  function sheinReadDomSelectedSize() {
    try {
      var containers = document.querySelectorAll('.product-intro__size, .goods-size, [class*="product-intro__size" i], [class*="goods-size" i], [data-testid*="size" i]');
      for (var c = 0; c < containers.length && c < 8; c++) {
        if (sheinBlocked(containers[c]) || isInNavigation(containers[c])) continue;
        var pills = containers[c].querySelectorAll('.product-intro__size-radio, .goods-size__radio, .goods-size__item, [class*="size-radio" i], [class*="size-item" i], [data-size], [role="radio"], button, li');
        for (var p = 0; p < pills.length && p < 30; p++) {
          if (!sheinNodeSelected(pills[p])) continue;
          var parsed = sheinCleanSizeLabel(pills[p]);
          if (parsed.label) return parsed.label;
        }
      }
    } catch (e) {}
    return '';
  }
  function sheinUnwrapRootCandidate(cand) {
    if (!cand || typeof cand !== 'object') return null;
    if (cand.detail && typeof cand.detail === 'object' && (cand.detail.goods_id || cand.detail.goods_name || cand.detail.salePrice)) return cand;
    if (cand.productIntroData && typeof cand.productIntroData === 'object') return cand.productIntroData;
    if (cand.gbRawData && typeof cand.gbRawData === 'object') return cand.gbRawData;
    if (cand.goodsDetail && typeof cand.goodsDetail === 'object') return sheinUnwrapRootCandidate(cand.goodsDetail) || cand.goodsDetail;
    if (cand.productIntro && typeof cand.productIntro === 'object') return sheinUnwrapRootCandidate(cand.productIntro) || cand.productIntro;
    if (cand.goodsInfo && typeof cand.goodsInfo === 'object') return cand;
    if (cand.goods_id || cand.goods_name || cand.salePrice || cand.attrSizeList || cand.relation_color) return cand;
    return null;
  }
  function sheinParseRawObject(rawRoot) {
    var root = sheinUnwrapRootCandidate(rawRoot);
    if (!root || typeof root !== 'object') return null;
    var detail = (root.detail && typeof root.detail === 'object') ? root.detail
      : (root.goodsInfo && typeof root.goodsInfo === 'object' ? root.goodsInfo : root);
    var rawGoodsId = text(detail.goods_id || root.goods_id || detail.goodsId || root.goodsId || '');
    if (rawGoodsId && !/^\d{5,16}$/.test(rawGoodsId)) rawGoodsId = '';
    /* Anti-résidu SPA : si l'URL courante porte un goods_id et que l'objet lu
       désigne un AUTRE goods_id, on rejette cet objet. */
    if (SHEIN_GOODS_ID && rawGoodsId && rawGoodsId !== SHEIN_GOODS_ID) return null;
    var currency = text(
      root.currency
      || (root.currencyInfo && (root.currencyInfo.code || root.currencyInfo.currency))
      || (detail.salePrice && detail.salePrice.currency)
      || (detail.retailPrice && detail.retailPrice.currency)
      || ''
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) currency = '';
    var salePrice = sheinFormatPriceObj(detail.salePrice || detail.discountPrice || detail.unit_discount_price || root.salePrice || root.price, currency);
    var inStock = null;
    if (detail.is_on_sale === 0 || detail.is_on_sale === '0' || detail.goods_status === 0 || detail.stock === 0 || detail.stock === '0' || root.is_sold_out === true || detail.is_sold_out === true) {
      inStock = false;
    } else if (detail.is_on_sale === 1 || detail.is_on_sale === '1' || Number(detail.stock) > 0 || detail.is_stock_enough === 1 || root.is_sold_out === false) {
      inStock = true;
    }
    var images = [];
    var pushImg = function (u) {
      var clean = sheinHttpsUrl(u);
      if (clean) pushUnique(images, clean, LIMITS.images, 600);
    };
    pushImg(detail.original_img || detail.goods_img || detail.goods_thumb);
    if (root.goods_imgs && typeof root.goods_imgs === 'object') {
      if (root.goods_imgs.main_image) pushImg(root.goods_imgs.main_image.origin_image || root.goods_imgs.main_image.medium_image);
      var detImgs = root.goods_imgs.detail_image;
      if (Object.prototype.toString.call(detImgs) === '[object Array]') {
        for (var di = 0; di < detImgs.length && images.length < LIMITS.images; di++) {
          pushImg(detImgs[di] && (detImgs[di].origin_image || detImgs[di].medium_image || detImgs[di]));
        }
      }
    }
    if (detail.goods_imgs && typeof detail.goods_imgs === 'object') {
      if (detail.goods_imgs.main_image) pushImg(detail.goods_imgs.main_image.origin_image || detail.goods_imgs.main_image.medium_image);
      var detImgs2 = detail.goods_imgs.detail_image;
      if (Object.prototype.toString.call(detImgs2) === '[object Array]') {
        for (var di2 = 0; di2 < detImgs2.length && images.length < LIMITS.images; di2++) {
          pushImg(detImgs2[di2] && (detImgs2[di2].origin_image || detImgs2[di2].medium_image || detImgs2[di2]));
        }
      }
    }
    var currentColor = '';
    var mainAttr = detail.mainSaleAttribute || root.mainSaleAttribute;
    if (Object.prototype.toString.call(mainAttr) === '[object Array]' && mainAttr.length > 0) {
      currentColor = text(mainAttr[0] && (mainAttr[0].attr_value_name || mainAttr[0].attr_value || mainAttr[0].attr_value_en));
    } else if (mainAttr && typeof mainAttr === 'object') {
      currentColor = text(mainAttr.attr_value_name || mainAttr.attr_value || mainAttr.attr_value_en);
    }
    if (!currentColor) currentColor = text(detail.color_name || detail.color || '');
    var mainColorThumb = sheinHttpsUrl(detail.color_image || detail.goods_color_image || detail.goods_thumb || detail.original_img || (images.length ? images[0] : ''));
    var colors = [];
    if (currentColor) {
      colors.push({
        value: cut(currentColor, LIMITS.label),
        goodsId: rawGoodsId || SHEIN_GOODS_ID || null,
        image: mainColorThumb || null,
        available: inStock,
        selected: true,
        price: null,
        priceFrom: false
      });
    }
    var relColors = root.relation_color || detail.relation_color || root.otherColorList || detail.otherColorList;
    if (Object.prototype.toString.call(relColors) === '[object Array]') {
      for (var rc = 0; rc < relColors.length && colors.length < LIMITS.variantValues; rc++) {
        var rItem = relColors[rc];
        if (!rItem || typeof rItem !== 'object') continue;
        var rColor = '';
        if (Object.prototype.toString.call(rItem.mainSaleAttribute) === '[object Array]' && rItem.mainSaleAttribute[0]) {
          rColor = text(rItem.mainSaleAttribute[0].attr_value_name || rItem.mainSaleAttribute[0].attr_value || rItem.mainSaleAttribute[0].attr_value_en);
        } else if (rItem.mainSaleAttribute && typeof rItem.mainSaleAttribute === 'object') {
          rColor = text(rItem.mainSaleAttribute.attr_value_name || rItem.mainSaleAttribute.attr_value);
        }
        if (!rColor) rColor = text(rItem.color_name || rItem.attr_value_name || rItem.attr_value || rItem.goods_color_name || rItem.name || '');
        if (!rColor) continue;
        var rGid = text(rItem.goods_id || rItem.goodsId || '');
        if (rGid && !/^\d{5,16}$/.test(rGid)) rGid = '';
        var rDup = false;
        for (var cExist = 0; cExist < colors.length; cExist++) {
          if (colors[cExist].value.toLowerCase() === rColor.toLowerCase() || (rGid && colors[cExist].goodsId === rGid)) {
            if (!colors[cExist].goodsId && rGid) colors[cExist].goodsId = rGid;
            rDup = true;
            break;
          }
        }
        if (rDup) continue;
        var rSoldOut = rItem.is_on_sale === 0 || rItem.is_on_sale === '0' || rItem.stock === 0 || rItem.stock === '0' || rItem.is_sold_out === true;
        var rPrice = sheinFormatPriceObj(rItem.salePrice || rItem.discountPrice || rItem.price, currency);
        var rImg = sheinHttpsUrl(rItem.goods_color_image || rItem.color_image || rItem.goods_thumb || rItem.original_img || '');
        colors.push({
          value: cut(rColor, LIMITS.label),
          goodsId: rGid || null,
          image: rImg || null,
          available: rSoldOut ? false : null,
          selected: Boolean(rGid && (rGid === (rawGoodsId || SHEIN_GOODS_ID))),
          price: rPrice || null,
          priceFrom: Boolean(rPrice)
        });
      }
    }
    var sizes = [];
    var extraGroupsMap = {};
    var extraGroupOrder = [];
    var addSheinExtraAttr = function (gName, gVal, gSel, gAvail) {
      var cleanG = cut(gName, LIMITS.label);
      var cleanV = cut(gVal, LIMITS.label);
      var noiseRe = NOT_A_CHOICE || /^(select|choose|choisir|sélectionner|please|اختر|--)|search|department|store name|catégorie|category/i;
      if (!cleanG || !cleanV || SHEIN_SIZE_GUIDE_NOISE.test(cleanV) || noiseRe.test(cleanV)) return;
      var gk = cleanG.toLowerCase();
      if (!extraGroupsMap[gk]) {
        if (extraGroupOrder.length >= 3) return;
        extraGroupOrder.push(cleanG);
        extraGroupsMap[gk] = { name: cleanG, values: [], selected: [], availMap: {} };
      }
      var bucket = extraGroupsMap[gk];
      if (!ciExactContains(bucket.values, cleanV) && bucket.values.length < LIMITS.variantValues) {
        bucket.values.push(cleanV);
      }
      if (gSel && !ciExactContains(bucket.selected, cleanV)) bucket.selected.push(cleanV);
      var vk = cleanV.toLowerCase();
      if (gAvail === true) bucket.availMap[vk] = true;
      else if (gAvail === false && bucket.availMap[vk] !== true) bucket.availMap[vk] = false;
    };
    var sheinReadTiers = function (entryObj, cur) {
      var tiersOut = [];
      if (!entryObj || typeof entryObj !== 'object') return tiersOut;
      var rawTiers = entryObj.ladder_price || entryObj.wholesale_price || entryObj.tierPriceList || entryObj.quantity_discount || (entryObj.price && entryObj.price.ladder_price) || null;
      if (Object.prototype.toString.call(rawTiers) !== '[object Array]') return tiersOut;
      for (var ti = 0; ti < rawTiers.length && tiersOut.length < 6; ti++) {
        var tr = rawTiers[ti];
        if (!tr || typeof tr !== 'object') continue;
        var minQ = parseInt(String(tr.min_quantity || tr.minQuantity || tr.num || tr.count || tr.min || ''), 10);
        var tPrice = sheinFormatPriceObj(tr.price || tr.salePrice || tr.unit_price || tr.unitPrice || tr, cur);
        if (!isNaN(minQ) && minQ >= 2 && minQ <= 100 && tPrice) {
          tiersOut.push({ minQuantity: minQ, unitPrice: cut(tPrice, 40) });
        }
      }
      return tiersOut;
    };
    var minRangeStr = sheinFormatPriceObj(detail.min_price || detail.minSalePrice || root.min_price || null, currency);
    var maxRangeStr = sheinFormatPriceObj(detail.max_price || detail.maxSalePrice || root.max_price || null, currency);
    var hasRangePrice = Boolean(minRangeStr && maxRangeStr && minRangeStr !== maxRangeStr);
    var skus = [];
    var rawSizes = root.attrSizeList || detail.attrSizeList
      || (root.saleAttr && root.saleAttr.sizeList)
      || (detail.saleAttr && detail.saleAttr.sizeList)
      || root.sizeList || detail.sizeList
      || root.skuList || detail.skuList;
    var hasAnyExplicitSkuPrice = false;
    if (Object.prototype.toString.call(rawSizes) === '[object Array]') {
      for (var spCheck = 0; spCheck < rawSizes.length; spCheck++) {
        var spEntry = rawSizes[spCheck];
        if (!spEntry || typeof spEntry !== 'object') continue;
        var spObj = (spEntry.price && (spEntry.price.salePrice || spEntry.price.discountPrice || spEntry.price)) || spEntry.salePrice || spEntry.discountPrice || null;
        if (sheinFormatPriceObj(spObj, currency)) { hasAnyExplicitSkuPrice = true; break; }
      }
      for (var sz = 0; sz < rawSizes.length && skus.length < LIMITS.matrixEntries; sz++) {
        var sEntry = rawSizes[sz];
        if (!sEntry || typeof sEntry !== 'object') continue;
        var sStockRaw = sEntry.stock !== undefined ? sEntry.stock : (sEntry.quantity !== undefined ? sEntry.quantity : sEntry.inventory);
        var sStockNum = sStockRaw !== undefined && sStockRaw !== null && sStockRaw !== '' ? parseInt(String(sStockRaw), 10) : NaN;
        var sSold = sEntry.is_sold_out === true || sEntry.sold_out === 1 || sEntry.is_on_sale === 0 || (!isNaN(sStockNum) && sStockNum <= 0);
        var sAvail = sSold ? false : (!isNaN(sStockNum) && sStockNum > 0 ? true : (sEntry.is_sold_out === false || sEntry.is_on_sale === 1 ? true : null));
        var sPriceObj = (sEntry.price && (sEntry.price.salePrice || sEntry.price.discountPrice || sEntry.price)) || sEntry.salePrice || sEntry.discountPrice || null;
        var explicitSkuPrice = sheinFormatPriceObj(sPriceObj, currency);
        var sPrice = explicitSkuPrice || (!hasAnyExplicitSkuPrice && !hasRangePrice && sAvail === true && salePrice ? salePrice : '');
        var skuAttrs = {};
        if (currentColor) skuAttrs['Couleur'] = cut(currentColor, LIMITS.label);
        var sVal = text(sEntry.attr_value_name || sEntry.attr_value || sEntry.size_name || sEntry.sizeName || sEntry.name || '');
        if (Object.prototype.toString.call(sEntry.sku_sale_attr) === '[object Array]') {
          for (var sa = 0; sa < sEntry.sku_sale_attr.length; sa++) {
            var saItem = sEntry.sku_sale_attr[sa];
            if (!saItem || typeof saItem !== 'object') continue;
            var saVal = text(saItem.attr_value_name || saItem.attr_value || saItem.value || '');
            if (!saVal) continue;
            var saName = text(saItem.attr_name || saItem.attr_name_en || saItem.name || '');
            if (!saName || /size|taille|age|âge|talla|größe|مقاس|عمر/i.test(saName)) {
              if (!sVal) sVal = saVal;
              skuAttrs['Taille'] = cut(saVal, LIMITS.label);
            } else if (/color|colour|couleur|farbe|لون/i.test(saName)) {
              skuAttrs['Couleur'] = cut(saVal, LIMITS.label);
            } else {
              skuAttrs[cut(saName, LIMITS.label)] = cut(saVal, LIMITS.label);
              addSheinExtraAttr(saName, saVal, Boolean(sEntry.selected || saItem.selected), sAvail);
            }
          }
        }
        if (sVal && !SHEIN_SIZE_GUIDE_NOISE.test(sVal)) {
          if (!skuAttrs['Taille']) skuAttrs['Taille'] = cut(sVal, LIMITS.label);
          if (sizes.length < LIMITS.variantValues) {
            var sDup = false;
            for (var sEx = 0; sEx < sizes.length; sEx++) {
              if (sizes[sEx].value.toLowerCase() === sVal.toLowerCase()) {
                sDup = true;
                /* Si deux SKUs partagent la même taille (ex. Type A vs Type B) avec des prix différents, le prix 1D de la taille n'est pas uniforme : on le neutralise sur l'axe 1D tout en gardant le prix exact dans skus[]. */
                if (sizes[sEx].price && sPrice && sizes[sEx].price !== sPrice) sizes[sEx].price = null;
                if (sAvail === true && sizes[sEx].available === false) sizes[sEx].available = null;
                break;
              }
            }
            if (!sDup) {
              sizes.push({
                value: cut(sVal, LIMITS.label),
                available: sAvail,
                stock: !sSold && !isNaN(sStockNum) && sStockNum > 0 && sStockNum <= 999 ? sStockNum : null,
                price: sPrice || null
              });
            }
          }
        }
        var attrCount = 0;
        for (var ak in skuAttrs) { if (Object.prototype.hasOwnProperty.call(skuAttrs, ak)) attrCount++; }
        if (attrCount > 0) {
          var sCode = text(sEntry.sku_code || sEntry.skuCode || sEntry.sku_id || sEntry.attr_value_id || '');
          skus.push({
            skuId: sCode || null,
            goodsId: rawGoodsId || SHEIN_GOODS_ID || null,
            attributes: skuAttrs,
            price: sPrice || null,
            available: sAvail,
            stock: !sSold && !isNaN(sStockNum) && sStockNum > 0 && sStockNum <= 999 ? sStockNum : null,
            image: images[0] || null,
            evidenceSource: 'embedded_json',
            quantityTiers: sheinReadTiers(sEntry, currency)
          });
        }
      }
    }
    /* Si les couleurs sœurs dans relation_color embarquent déjà leur propre attrSizeList / skuList, on les ajoute directement à la matrice initiale ! */
    if (Object.prototype.toString.call(relColors) === '[object Array]') {
      for (var rci = 0; rci < relColors.length; rci++) {
        var rcItem = relColors[rci];
        if (!rcItem || typeof rcItem !== 'object') continue;
        var rcGid = text(rcItem.goods_id || rcItem.goodsId || '');
        if (!rcGid || (rawGoodsId && rcGid === rawGoodsId)) continue;
        var rcColor = '';
        if (Object.prototype.toString.call(rcItem.mainSaleAttribute) === '[object Array]' && rcItem.mainSaleAttribute[0]) {
          rcColor = text(rcItem.mainSaleAttribute[0].attr_value_name || rcItem.mainSaleAttribute[0].attr_value);
        }
        if (!rcColor) rcColor = text(rcItem.goods_color_name || rcItem.color_name || rcItem.attr_value_name || '');
        if (!rcColor) continue;
        var rcSizes = rcItem.attrSizeList || rcItem.skuList || rcItem.sizeList || null;
        if (Object.prototype.toString.call(rcSizes) !== '[object Array]') continue;
        var rcImg = sheinHttpsUrl(rcItem.goods_color_image || rcItem.color_image || rcItem.goods_thumb || rcItem.original_img);
        for (var rsz = 0; rsz < rcSizes.length && skus.length < LIMITS.matrixEntries; rsz++) {
          var rsEntry = rcSizes[rsz];
          if (!rsEntry || typeof rsEntry !== 'object') continue;
          var rsStock = rsEntry.stock !== undefined ? parseInt(String(rsEntry.stock), 10) : NaN;
          var rsSold = rsEntry.is_sold_out === true || rsEntry.sold_out === 1 || (!isNaN(rsStock) && rsStock <= 0);
          var rsAvail = rsSold ? false : (!isNaN(rsStock) && rsStock > 0 ? true : (rsEntry.is_sold_out === false ? true : null));
          var rsPriceObj = (rsEntry.price && (rsEntry.price.salePrice || rsEntry.price.discountPrice || rsEntry.price)) || rsEntry.salePrice || null;
          var rsPrice = sheinFormatPriceObj(rsPriceObj, currency);
          var rsVal = text(rsEntry.attr_value_name || rsEntry.attr_value || rsEntry.size_name || '');
          var rsAttrs = { 'Couleur': cut(rcColor, LIMITS.label) };
          if (Object.prototype.toString.call(rsEntry.sku_sale_attr) === '[object Array]') {
            for (var rsa = 0; rsa < rsEntry.sku_sale_attr.length; rsa++) {
              var rsaItem = rsEntry.sku_sale_attr[rsa];
              if (!rsaItem) continue;
              var rsaName = text(rsaItem.attr_name || rsaItem.name || '');
              var rsaVal = text(rsaItem.attr_value_name || rsaItem.attr_value || '');
              if (!rsaVal) continue;
              if (!rsaName || /size|taille|age|âge|talla|größe|مقاس|عمر/i.test(rsaName)) {
                if (!rsVal) rsVal = rsaVal;
                rsAttrs['Taille'] = cut(rsaVal, LIMITS.label);
              } else if (!/color|colour|couleur|farbe|لون/i.test(rsaName)) {
                rsAttrs[cut(rsaName, LIMITS.label)] = cut(rsaVal, LIMITS.label);
                addSheinExtraAttr(rsaName, rsaVal, false, rsAvail);
              }
            }
          }
          if (!rsVal) continue;
          if (!rsAttrs['Taille']) rsAttrs['Taille'] = cut(rsVal, LIMITS.label);
          if (sizes.length < LIMITS.variantValues && !SHEIN_SIZE_GUIDE_NOISE.test(rsVal)) {
            var rsSizeExists = false;
            for (var rse = 0; rse < sizes.length; rse++) {
              if (sizes[rse].value.toLowerCase() === rsVal.toLowerCase()) { rsSizeExists = true; break; }
            }
            if (!rsSizeExists) {
              sizes.push({ value: cut(rsVal, LIMITS.label), available: null, stock: null, price: null });
            }
          }
          skus.push({
            skuId: text(rsEntry.sku_code || rsEntry.sku_id || '') || ('shein:' + rcGid + ':' + rsVal),
            goodsId: rcGid,
            attributes: rsAttrs,
            price: rsPrice || null,
            available: rsAvail,
            stock: !rsSold && !isNaN(rsStock) && rsStock > 0 && rsStock <= 999 ? rsStock : null,
            image: rcImg || null,
            evidenceSource: 'embedded_json',
            quantityTiers: sheinReadTiers(rsEntry, currency)
          });
        }
      }
    }
    var extraGroups = [];
    for (var ego = 0; ego < extraGroupOrder.length; ego++) {
      var eg = extraGroupsMap[extraGroupOrder[ego].toLowerCase()];
      if (eg && eg.values.length >= 1) extraGroups.push(eg);
    }
    var brandName = '';
    if (detail.brand && typeof detail.brand === 'object') brandName = text(detail.brand.brand_name || detail.brand.name);
    else if (typeof detail.brand === 'string') brandName = text(detail.brand);
    if (!brandName && root.brandInfo && typeof root.brandInfo === 'object') brandName = text(root.brandInfo.brand_name || root.brandInfo.name);
    if (!brandName) brandName = text(detail.brandName || root.brandName || '');
    var titleText = text(detail.goods_name || root.goods_name || '');
    var skuId = text(detail.goods_sn || detail.productRelationID || root.goods_sn || '');
    if (!rawGoodsId && !titleText && !salePrice && !colors.length && !sizes.length && !skus.length) return null;
    return {
      goodsId: rawGoodsId || SHEIN_GOODS_ID || '',
      skuId: skuId,
      title: titleText,
      brand: brandName,
      currency: currency,
      salePrice: salePrice,
      hasRangePrice: hasRangePrice,
      inStock: inStock,
      images: images,
      currentColor: currentColor,
      colors: colors,
      sizes: sizes,
      extraGroups: extraGroups,
      skus: skus,
      quantityTiers: sheinReadTiers(detail, currency)
    };
  }
  function sheinMergeNetworkPayloads(baseState) {
    if (!GLOBAL_WIN) return baseState;
    var netList = null;
    try { netList = GLOBAL_WIN.__aywebsNetPayloads; } catch (e) { netList = null; }
    if (Object.prototype.toString.call(netList) !== '[object Array]' || !netList.length) return baseState;
    for (var ni = 0; ni < netList.length && ni < 25; ni++) {
      var item = netList[ni];
      if (!item || !item.body || typeof item.body !== 'object') continue;
      /* Source #3 (network_cache) : peut contenir le produit courant OU une couleur sœur préchargée en AJAX. */
      var candidateBody = item.body.info || item.body.data || item.body.result || item.body;
      if (!baseState) {
        var parsedNet = sheinParseRawObject(candidateBody);
        if (parsedNet) {
          for (var pns = 0; pns < parsedNet.skus.length; pns++) parsedNet.skus[pns].evidenceSource = 'network_cache';
          baseState = parsedNet;
        }
        continue;
      }
      /* Pour une couleur sœur déjà connue dans baseState.colors, on accepte ses SKUs réseau sans écraser l'état de la fiche principale. */
      try {
        var netDetail = (candidateBody && (candidateBody.detail || (candidateBody.productIntroData && candidateBody.productIntroData.detail))) || candidateBody;
        var netGid = text(netDetail && (netDetail.goods_id || netDetail.goodsId) || '');
        if (!netGid || netGid === baseState.goodsId) continue;
        var matchedSiblingColor = '';
        for (var sck = 0; sck < baseState.colors.length; sck++) {
          if (baseState.colors[sck].goodsId === netGid) { matchedSiblingColor = baseState.colors[sck].value; break; }
        }
        if (!matchedSiblingColor) continue;
        var netSizes = candidateBody.attrSizeList || ( netDetail && netDetail.attrSizeList ) || candidateBody.skuList || ( netDetail && netDetail.skuList );
        if (Object.prototype.toString.call(netSizes) !== '[object Array]') continue;
        var netCur = baseState.currency || '';
        for (var nsz = 0; nsz < netSizes.length && baseState.skus.length < LIMITS.matrixEntries; nsz++) {
          var nsEntry = netSizes[nsz];
          if (!nsEntry || typeof nsEntry !== 'object') continue;
          var nsVal = text(nsEntry.attr_value_name || nsEntry.attr_value || nsEntry.size_name || '');
          if (!nsVal) continue;
          var nsStock = nsEntry.stock !== undefined ? parseInt(String(nsEntry.stock), 10) : NaN;
          var nsSold = nsEntry.is_sold_out === true || nsEntry.sold_out === 1 || (!isNaN(nsStock) && nsStock <= 0);
          var nsAvail = nsSold ? false : (!isNaN(nsStock) && nsStock > 0 ? true : (nsEntry.is_sold_out === false ? true : null));
          var nsPriceObj = (nsEntry.price && (nsEntry.price.salePrice || nsEntry.price.discountPrice || nsEntry.price)) || nsEntry.salePrice || null;
          var nsPrice = sheinFormatPriceObj(nsPriceObj, netCur);
          baseState.skus.push({
            skuId: text(nsEntry.sku_code || nsEntry.sku_id || '') || ('shein:' + netGid + ':' + nsVal),
            goodsId: netGid,
            attributes: { 'Couleur': cut(matchedSiblingColor, LIMITS.label), 'Taille': cut(nsVal, LIMITS.label) },
            price: nsPrice || null,
            available: nsAvail,
            stock: !nsSold && !isNaN(nsStock) && nsStock > 0 && nsStock <= 999 ? nsStock : null,
            image: null,
            evidenceSource: 'network_cache',
            quantityTiers: []
          });
        }
      } catch (e) {}
    }
    return baseState;
  }
  function sheinEnsureState() {
    if (SHEIN_STATE_CHECKED) return SHEIN_STATE;
    SHEIN_STATE_CHECKED = true;
    if (!IS_SHEIN) return null;
    try {
      var winKeys = ['gbRawData', 'productIntroData', 'gbProductIntroData', '__SSR_DATA__', 'saPagesInfo', '__INITIAL_STATE__'];
      for (var wk = 0; wk < winKeys.length; wk++) {
        var wVal = null;
        try { wVal = (GLOBAL_WIN && GLOBAL_WIN[winKeys[wk]]) || (typeof window !== 'undefined' ? window[winKeys[wk]] : null); } catch (e) { wVal = null; }
        if (wVal && typeof wVal === 'object') {
          var parsedWin = sheinParseRawObject(wVal);
          if (parsedWin) {
            for (var pws = 0; pws < parsedWin.skus.length; pws++) parsedWin.skus[pws].evidenceSource = 'preloaded_state';
            SHEIN_STATE = sheinMergeNetworkPayloads(parsedWin);
            return SHEIN_STATE;
          }
        }
      }
      var sTags = document.querySelectorAll('script:not([src])');
      var scriptKeys = ['gbRawData', 'productIntroData', 'gbProductIntroData', '__SSR_DATA__'];
      for (var st = 0; st < sTags.length && st < 60; st++) {
        var code = sTags[st].textContent || '';
        if (!code || code.length > 600000) continue;
        for (var sk = 0; sk < scriptKeys.length; sk++) {
          if (code.indexOf(scriptKeys[sk]) < 0) continue;
          var obj = amazonReadScriptJson(code, scriptKeys[sk]);
          if (obj) {
            var parsedScript = sheinParseRawObject(obj);
            if (parsedScript) {
              SHEIN_STATE = sheinMergeNetworkPayloads(parsedScript);
              return SHEIN_STATE;
            }
          }
        }
      }
      SHEIN_STATE = sheinMergeNetworkPayloads(null);
    } catch (e) {}
    return SHEIN_STATE;
  }

  /* ── LECTEUR D'ÉTAT ET MATRICE SKU ALIEXPRESS v2 (28/10/2026) ─────────────
     AliExpress publie toutes les combinaisons d'un même article (/item/<id>.html)
     dans une matrice SKU cartésienne (Couleur × Taille × Prise × Expédié depuis…)
     au sein de runParams / _dida_config_ / __AER_DATA__ / __INIT_DATA__, ainsi
     que dans le DOM Comet ([data-pl="product-sku"], [data-sku-col]).
     Tout état embarqué dont l'identifiant contredit ALIEXPRESS_ITEM_ID est rejeté. */
  var ALIEXPRESS_STATE = null;
  var ALIEXPRESS_STATE_CHECKED = false;
  var AE_BEM_ACTIVE = /(?:^|[\s_-])(selected|active|checked|current|is-selected|sku-item--selected)(?:$|[\s_-])|sku-item--selected/i;
  var AE_BEM_DISABLED = /(?:^|[\s_-])(disabled|soldout|sold-out|unavailable|out-of-stock|oos|is-disabled|sku-item--soldout|sku-item--disabled)(?:$|[\s_-])|sku-item--soldout|sku-item--disabled/i;
  var AE_GUIDE_NOISE = /^(?:size\s*chart|size\s*info|size\s*guide|guide\s*des\s*tailles|tabla\s*de\s*tallas|guia\s*de\s*tamanhos|gr(?:ö|oe)(?:ß|ss)entabelle|جدول\s*المقاسات|دليل\s*المقاسات)$/i;
  var AE_NOT_VARIANT_GROUP = /^(sort|sort by|sortby|trier|tri|order by|orderby|quantit\w*|quantity|qty|nombre|view|view by|affichage|filter|filtre|page|pages|lang|langue|language|devise|currency|pays|country|region|région|per page|items per page|afficher)\b/i;

  function aeCleanImageUrl(rawUrl) {
    var u = sheinHttpsUrl(rawUrl);
    if (!u) return '';
    /* Vignettes AliExpress (_50x50.jpg, _80x80q90.jpg_.webp, _220x220xz.jpg) ->
       photo nette du CDN alicdn.com tout en gardant une URL HTTP(S) authentique. */
    if (/alicdn\.com\//i.test(u)) {
      u = u.replace(/_\d{2,3}x\d{2,3}[a-z0-9_.]*\.(?:jpg|jpeg|png|webp)(?:_\.webp)?$/i, '');
    }
    return cut(u, 600);
  }
  function aeFormatPrice(rawVal, fallbackCurrency) {
    if (rawVal === null || rawVal === undefined) return '';
    var iso = /^[A-Z]{3}$/.test(String(fallbackCurrency || '').toUpperCase()) ? String(fallbackCurrency).toUpperCase() : '';
    if (typeof rawVal === 'object') {
      var objIso = text(rawVal.currency || rawVal.currencyCode || '');
      if (/^[A-Z]{3}$/.test(objIso.toUpperCase())) iso = objIso.toUpperCase();
      if (rawVal.value !== undefined && rawVal.value !== null && /^\d+(?:[.,]\d{1,2})?$/.test(text(rawVal.value)) && iso) {
        return cut(text(rawVal.value).replace(',', '.') + ' ' + iso, LIMITS.label);
      }
      var formated = aeNormalizeSplitPrice(rawVal.formatedAmount || rawVal.formattedPrice || rawVal.displayPrice || '');
      if (formated && HAS_DIGIT.test(formated) && amountCount(formated) === 1 && (CURRENCY_HINT.test(formated) || iso)) {
        return CURRENCY_HINT.test(formated) ? cut(formated, LIMITS.label) : cut(formated + ' ' + iso, LIMITS.label);
      }
      return '';
    }
    var s = aeNormalizeSplitPrice(rawVal);
    if (!s || !HAS_DIGIT.test(s) || amountCount(s) !== 1) return '';
    if (/^\d+(?:[.,]\d{1,2})?$/.test(s)) {
      return iso ? cut(s.replace(',', '.') + ' ' + iso, LIMITS.label) : '';
    }
    if (CURRENCY_HINT.test(s)) return cut(s, LIMITS.label);
    return iso ? cut(s + ' ' + iso, LIMITS.label) : '';
  }
  function aeFindComponent(root, patterns, maxDepth) {
    if (!root || typeof root !== 'object' || maxDepth < 0) return null;
    for (var k in root) {
      if (!Object.prototype.hasOwnProperty.call(root, k)) continue;
      var val = root[k];
      if (!val || typeof val !== 'object') continue;
      for (var p = 0; p < patterns.length; p++) {
        if (patterns[p].test(k)) return val;
      }
    }
    if (maxDepth > 0) {
      for (var k2 in root) {
        if (!Object.prototype.hasOwnProperty.call(root, k2)) continue;
        var child = root[k2];
        if (child && typeof child === 'object' && Object.prototype.toString.call(child) !== '[object Array]') {
          var found = aeFindComponent(child, patterns, maxDepth - 1);
          if (found) return found;
        }
      }
    }
    return null;
  }
  function aeUnwrapFields(comp) {
    if (comp && typeof comp === 'object' && comp.fields && typeof comp.fields === 'object') return comp.fields;
    return comp;
  }
  function aeParseRawObject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var root = raw;
    if (root._init_data_ && root._init_data_.data) root = root._init_data_.data;
    if (root.data && typeof root.data === 'object') {
      if (root.data.data && typeof root.data.data === 'object') root = root.data.data;
      else root = root.data;
    }
    if (root.result && typeof root.result === 'object' && (root.result.productInfoComponent || root.result.skuComponent || root.result.priceComponent)) {
      root = root.result;
    }
    if (root.fields && typeof root.fields === 'object') root = root.fields;

    var infoComp = aeUnwrapFields(root.productInfoComponent || root.pageModule || root.titleModule || aeFindComponent(root, [/^(?:productInfo|headerInfo|title_|header_)/i], 2)) || {};
    var priceComp = aeUnwrapFields(root.priceComponent || root.priceModule || aeFindComponent(root, [/^(?:priceComponent|priceModule|price_)/i], 2)) || {};
    var skuComp = aeUnwrapFields(root.skuComponent || root.skuModule || root.skuInfo || aeFindComponent(root, [/^(?:skuComponent|skuModule|sku_|skuInfo)/i], 2)) || {};
    var invComp = aeUnwrapFields(root.inventoryComponent || root.quantityModule || aeFindComponent(root, [/^(?:inventory|quantity_)/i], 2)) || {};
    var imgComp = aeUnwrapFields(root.imageComponent || root.imageModule || root.imageView || aeFindComponent(root, [/^(?:imageComponent|imageModule|imageView)/i], 2)) || {};

    var rawItemId = text(
      infoComp.id || infoComp.productId || infoComp.itemId
      || root.productId || root.itemId
      || (root.item && (root.item.itemId || root.item.productId))
      || ''
    );
    if (ALIEXPRESS_ITEM_ID && rawItemId && /^\d{6,20}$/.test(rawItemId) && rawItemId !== ALIEXPRESS_ITEM_ID) {
      diag('ae:state_itemid_mismatch');
      return null;
    }

    var currency = text(
      priceComp.currencyCode || priceComp.currency
      || (root.currencyComponent && (root.currencyComponent.currencyCode || root.currencyComponent.currency))
      || (priceComp.discountPrice && priceComp.discountPrice.minActivityAmount && priceComp.discountPrice.minActivityAmount.currency)
      || (priceComp.origPrice && priceComp.origPrice.minAmount && priceComp.origPrice.minAmount.currency)
      || root.currencyCode || root.currency || ''
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) currency = '';

    var titleText = text(infoComp.subject || infoComp.title || root.subject || root.productTitle || (root.item && root.item.title) || '');
    var brandName = text(root.brandName || infoComp.brandName || '');
    if (!brandName) {
      var propArr = (root.productPropComponent && root.productPropComponent.props) || (root.specsModule && root.specsModule.props) || [];
      if (Object.prototype.toString.call(propArr) === '[object Array]') {
        for (var bp = 0; bp < propArr.length && bp < 30; bp++) {
          var pItem = propArr[bp];
          if (!pItem) continue;
          var pAttrName = text(pItem.attrName || pItem.name || '');
          var pAttrVal = text(pItem.attrValue || pItem.value || '');
          if (/^(?:brand(?:\s*name)?|marque|marca|marke|العلامة\s*التجارية|الماركة)$/i.test(pAttrName)
            && pAttrVal && !/^(?:none|noenname_null|oem|other|n\/a|generic|sans\s*marque)$/i.test(pAttrVal)) {
            brandName = pAttrVal;
            break;
          }
        }
      }
    }

    var images = [];
    var pushAeImg = function (u) {
      var clean = aeCleanImageUrl(u);
      if (clean) pushUnique(images, clean, LIMITS.images, 600);
    };
    var imgList = imgComp.imagePathList || imgComp.images || root.imagePathList || (root.item && root.item.images) || [];
    if (Object.prototype.toString.call(imgList) === '[object Array]') {
      for (var im = 0; im < imgList.length && images.length < LIMITS.images; im++) {
        var imEntry = imgList[im];
        pushAeImg(typeof imEntry === 'string' ? imEntry : (imEntry && (imEntry.url || imEntry.src || imEntry.imageUrl)));
      }
    }

    var totalStock = null;
    var rawTotalAvail = invComp.totalAvailQuantity !== undefined ? invComp.totalAvailQuantity : (invComp.totalQuantity !== undefined ? invComp.totalQuantity : null);
    if (rawTotalAvail !== null && rawTotalAvail !== undefined && rawTotalAvail !== '') {
      var parsedTotal = parseInt(String(rawTotalAvail), 10);
      if (isFinite(parsedTotal) && parsedTotal >= 0) totalStock = parsedTotal;
    }
    var inStock = totalStock !== null ? totalStock > 0 : null;

    /* Prix ferme de fiche uniquement quand il n'est pas une fourchette min≠max */
    var discObj = priceComp.discountPrice || {};
    var origObj = priceComp.origPrice || {};
    var minAct = discObj.minActivityAmount || priceComp.formatedActivityPrice || priceComp.actMinPrice || priceComp.activityPrice || null;
    var maxAct = discObj.maxActivityAmount || priceComp.actMaxPrice || null;
    var minOrig = origObj.minAmount || priceComp.formatedPrice || priceComp.minPrice || priceComp.price || null;
    var maxOrig = origObj.maxAmount || priceComp.maxPrice || null;
    var salePrice = '';
    var minActStr = aeFormatPrice(minAct, currency);
    var maxActStr = maxAct ? aeFormatPrice(maxAct, currency) : '';
    if (minActStr && (!maxActStr || Math.abs((sheinNumericAmount(minActStr) || 0) - (sheinNumericAmount(maxActStr) || 0)) < 0.005)) {
      salePrice = minActStr;
    } else if (!minActStr) {
      var minOrigStr = aeFormatPrice(minOrig, currency);
      var maxOrigStr = maxOrig ? aeFormatPrice(maxOrig, currency) : '';
      if (minOrigStr && (!maxOrigStr || Math.abs((sheinNumericAmount(minOrigStr) || 0) - (sheinNumericAmount(maxOrigStr) || 0)) < 0.005)) {
        salePrice = minOrigStr;
      }
    }

    /* Propriétés de variantes (productSKUPropertyList / skuProperties / propertyList / props) */
    var rawProps = skuComp.productSKUPropertyList || skuComp.skuProperties || skuComp.propertyList || skuComp.props || (root.sku && (root.sku.props || root.sku.skuProperties || root.sku.propertyList)) || [];
    var properties = [];
    var propNameById = {};
    var valInfoByPair = {};
    if (Object.prototype.toString.call(rawProps) === '[object Array]') {
      for (var rp = 0; rp < rawProps.length && properties.length < LIMITS.variantGroups; rp++) {
        var pRow = rawProps[rp];
        if (!pRow || typeof pRow !== 'object') continue;
        var pid = text(pRow.skuPropertyId !== undefined ? pRow.skuPropertyId : (pRow.pid !== undefined ? pRow.pid : pRow.id));
        var pName = cut(pRow.skuPropertyName || pRow.name || pRow.title || '', LIMITS.label);
        if (!pName || AE_NOT_VARIANT_GROUP.test(pName)) continue;
        var rawVals = pRow.skuPropertyValues || pRow.values || [];
        if (Object.prototype.toString.call(rawVals) !== '[object Array]' || !rawVals.length) continue;
        var cleanVals = [];
        for (var rv = 0; rv < rawVals.length && cleanVals.length < LIMITS.variantValues; rv++) {
          var vRow = rawVals[rv];
          if (!vRow || typeof vRow !== 'object') continue;
          var vid = text(vRow.propertyValueIdLong !== undefined ? vRow.propertyValueIdLong : (vRow.propertyValueId !== undefined ? vRow.propertyValueId : (vRow.vid !== undefined ? vRow.vid : vRow.id)));
          var vLabel = cut(vRow.propertyValueDisplayName || vRow.displayName || vRow.propertyValueName || vRow.name || '', LIMITS.label);
          if (!vLabel || AE_GUIDE_NOISE.test(vLabel)) continue;
          var vImg = aeCleanImageUrl(vRow.skuPropertyImagePath || vRow.skuPropertyImageSummPath || vRow.image || vRow.img || '');
          cleanVals.push({ vid: vid, name: vLabel, image: vImg || null });
          if (pid && vid) {
            valInfoByPair[pid + ':' + vid] = { propName: pName, value: vLabel, image: vImg || null };
          }
          if (vRow.propertyValueId !== undefined && text(vRow.propertyValueId) !== vid && pid) {
            valInfoByPair[pid + ':' + text(vRow.propertyValueId)] = { propName: pName, value: vLabel, image: vImg || null };
          }
        }
        if (!cleanVals.length) continue;
        if (pid) propNameById[pid] = pName;
        properties.push({ pid: pid, name: pName, values: cleanVals });
      }
    }

    /* Matrice SKU (skuPriceList / skuPaths / priceList) */
    var rawSkus = skuComp.skuPriceList || skuComp.skuPaths || skuComp.skuList || (root.sku && (root.sku.skuPaths || root.sku.skuPriceList || root.sku.skuList)) || [];
    var priceBySkuId = {};
    var extraPriceList = priceComp.skuPriceList || skuComp.priceList || (root.price && root.price.skuPriceList) || [];
    if (Object.prototype.toString.call(extraPriceList) === '[object Array]') {
      for (var ep = 0; ep < extraPriceList.length && ep < 120; ep++) {
        var epRow = extraPriceList[ep];
        if (!epRow || typeof epRow !== 'object') continue;
        var epId = text(epRow.skuIdStr || epRow.skuId || '');
        if (epId) priceBySkuId[epId] = epRow;
      }
    }
    var skus = [];
    if (Object.prototype.toString.call(rawSkus) === '[object Array]') {
      for (var rs = 0; rs < rawSkus.length && skus.length < 60; rs++) {
        var sRow = rawSkus[rs];
        if (!sRow || typeof sRow !== 'object') continue;
        var sId = text(sRow.skuIdStr || sRow.skuId || '');
        var extraRow = (sId && priceBySkuId[sId]) ? priceBySkuId[sId] : null;
        var sVal = sRow.skuVal || (extraRow && extraRow.skuVal) || extraRow || sRow;
        var propStr = text(sRow.skuAttr || sRow.path || sRow.skuPropIds || '');
        var attrs = {};
        var attrCount = 0;
        var skuImg = null;
        if (propStr) {
          var segments = propStr.split(/[;,]/);
          for (var tk = 0; tk < segments.length; tk++) {
            var seg = text(segments[tk]);
            if (!seg) continue;
            var hashIdx = seg.indexOf('#');
            var pairPart = hashIdx >= 0 ? seg.slice(0, hashIdx) : seg;
            var fallbackLabel = hashIdx >= 0 ? cut(seg.slice(hashIdx + 1), LIMITS.label) : '';
            var colonIdx = pairPart.indexOf(':');
            if (colonIdx <= 0) continue;
            var segPid = text(pairPart.slice(0, colonIdx));
            var segVid = text(pairPart.slice(colonIdx + 1));
            var mapped = valInfoByPair[segPid + ':' + segVid];
            var mappedProp = (mapped && mapped.propName) || propNameById[segPid] || '';
            var mappedVal = (mapped && mapped.value) || fallbackLabel || '';
            if (mappedProp && mappedVal) {
              attrs[mappedProp] = mappedVal;
              attrCount++;
              if (!skuImg && mapped && mapped.image) skuImg = mapped.image;
            }
          }
        }
        var rawAvailQty = sVal.availQuantity !== undefined ? sVal.availQuantity
          : (sVal.stock !== undefined ? sVal.stock
            : (sVal.inventory !== undefined ? sVal.inventory
              : (sRow.salable === false ? 0 : null)));
        var sAvail = null;
        var sStock = null;
        if (rawAvailQty !== null && rawAvailQty !== undefined && rawAvailQty !== '') {
          var sq = parseInt(String(rawAvailQty), 10);
          if (isFinite(sq)) {
            sAvail = sq > 0;
            sStock = sq > 0 && sq <= 999 ? sq : null;
          }
        } else if (sRow.salable === true || sVal.salable === true) {
          sAvail = true;
        } else if (sRow.salable === false || sVal.salable === false) {
          sAvail = false;
        }
        if (!currency) {
          var skuCur = text(sVal.currency || (sVal.skuAmount && sVal.skuAmount.currency) || (sVal.skuActivityAmount && sVal.skuActivityAmount.currency) || '').toUpperCase();
          if (/^[A-Z]{3}$/.test(skuCur)) currency = skuCur;
        }
        var skuPriceRaw = sVal.skuActivityAmount || sVal.actSkuMultiCurrencyCalPrice || sVal.actSkuMultiCurrencyDisplayPrice || sVal.actSkuCalPrice || sVal.activityPrice || sVal.salePrice
          || sVal.skuAmount || sVal.skuMultiCurrencyCalPrice || sVal.skuMultiCurrencyDisplayPrice || sVal.skuCalPrice || sVal.price || '';
        var skuPriceStr = aeFormatPrice(skuPriceRaw, currency);
        if (!attrCount && rawSkus.length === 1 && (skuPriceStr || sAvail !== null)) {
          if (!salePrice && skuPriceStr) salePrice = skuPriceStr;
          if (inStock === null && sAvail !== null) inStock = sAvail;
        }
        if (attrCount > 0) {
          skus.push({
            skuId: sId || null,
            attributes: attrs,
            price: skuPriceStr || null,
            available: sAvail,
            stock: sStock,
            image: skuImg
          });
        }
      }
    }

    if (!rawItemId && !titleText && !salePrice && !properties.length && !skus.length) return null;
    return {
      itemId: rawItemId || ALIEXPRESS_ITEM_ID || '',
      title: titleText,
      brand: brandName,
      currency: currency,
      salePrice: salePrice,
      inStock: inStock,
      totalStock: totalStock,
      images: images,
      properties: properties,
      skus: skus
    };
  }
  function aeEnsureState() {
    if (ALIEXPRESS_STATE_CHECKED) return ALIEXPRESS_STATE;
    ALIEXPRESS_STATE_CHECKED = true;
    if (!IS_ALIEXPRESS) return null;
    try {
      var aeWinKeys = ['runParams', '_dida_config_', '__INIT_DATA__', '__AER_DATA__', '__INITIAL_STATE__'];
      for (var awk = 0; awk < aeWinKeys.length; awk++) {
        var awVal = null;
        try { awVal = window[aeWinKeys[awk]]; } catch (e) { awVal = null; }
        if (awVal && typeof awVal === 'object') {
          var parsedAw = aeParseRawObject(awVal);
          if (parsedAw) { ALIEXPRESS_STATE = parsedAw; return ALIEXPRESS_STATE; }
        }
      }
      var jsonScriptIds = ['__AER_DATA__', '__NEXT_DATA__'];
      for (var jsi = 0; jsi < jsonScriptIds.length; jsi++) {
        var jsEl = document.getElementById(jsonScriptIds[jsi]);
        if (jsEl && jsEl.textContent) {
          try {
            var parsedTag = aeParseRawObject(JSON.parse(jsEl.textContent));
            if (parsedTag) { ALIEXPRESS_STATE = parsedTag; return ALIEXPRESS_STATE; }
          } catch (e) {}
        }
      }
      var aeScripts = document.querySelectorAll('script:not([src])');
      var aeMarkers = ['window.runParams', 'runParams', '_dida_config_', '__INIT_DATA__'];
      for (var ast = 0; ast < aeScripts.length && ast < 60; ast++) {
        var acode = aeScripts[ast].textContent || '';
        if (!acode || acode.length > 800000) continue;
        for (var amk = 0; amk < aeMarkers.length; amk++) {
          if (acode.indexOf(aeMarkers[amk]) < 0) continue;
          var aobj = amazonReadScriptJson(acode, aeMarkers[amk]);
          if (!aobj && aeMarkers[amk].indexOf('runParams') >= 0 && acode.indexOf('data:') >= 0) {
            aobj = amazonReadScriptJson(acode, 'data');
          }
          if (aobj) {
            var parsedAs = aeParseRawObject(aobj);
            if (parsedAs) { ALIEXPRESS_STATE = parsedAs; return ALIEXPRESS_STATE; }
          }
        }
      }
    } catch (e) {}
    return ALIEXPRESS_STATE;
  }
  function aeDimKey(name) {
    var k = text(name).toLowerCase();
    if (/^(?:colou?r|couleur|farbe|colore|cor|kleur|لون|اللون|цвет)\b/i.test(k)) return 'dim:color';
    if (/^(?:size|taille|talla|taglia|gr(?:ö|oe)(?:ß|ss)e|tamanho|مقاس|المقاس|قياس|размер)\b/i.test(k)) return 'dim:size';
    return k;
  }
  function aeReadDomSelectionMap() {
    var map = {};
    try {
      var propContainers = document.querySelectorAll('[data-pl="product-sku"] [class*="sku-item--property" i], [data-pl="product-sku"] [class*="sku--property" i], .sku-property, .product-sku [class*="property" i], [data-testid*="sku-property" i]');
      for (var pc = 0; pc < propContainers.length && pc < 8; pc++) {
        var cont = propContainers[pc];
        if (aeBlocked(cont) || isInNavigation(cont)) continue;
        var titleEl = cont.querySelector('[class*="sku-item--title" i], [class*="sku--title" i], .sku-title, [class*="property-title" i]');
        var rawTitle = titleEl ? text(titleEl.textContent) : '';
        var gName = rawTitle;
        var headerVal = '';
        if (rawTitle && (rawTitle.indexOf(':') >= 0 || rawTitle.indexOf('：') >= 0)) {
          var colonParts = rawTitle.split(/[:：]/);
          gName = text(colonParts[0]);
          headerVal = cut(colonParts.slice(1).join(':'), LIMITS.label);
        }
        var pills = cont.querySelectorAll('[data-sku-col], [class*="sku-item--box" i], [class*="sku-item--image" i], [class*="sku-item--text" i], .sku-property-item, [role="radio"]');
        var chosenVal = '';
        for (var pl = 0; pl < pills.length && pl < 30; pl++) {
          var pill = pills[pl];
          var cls = String(pill.className || '');
          var isSel = AE_BEM_ACTIVE.test(cls)
            || (pill.getAttribute && (pill.getAttribute('aria-checked') === 'true' || pill.getAttribute('aria-selected') === 'true' || pill.getAttribute('data-selected') === 'true'));
          if (!isSel) continue;
          var pImg = pill.querySelector && pill.querySelector('img');
          var vTxt = cut(
            (pill.getAttribute && (pill.getAttribute('title') || pill.getAttribute('data-spm-anchor-id-title') || pill.getAttribute('aria-label')))
            || (pImg && (pImg.getAttribute('alt') || pImg.getAttribute('title')))
            || pill.textContent,
            LIMITS.label
          );
          if (vTxt && !AE_GUIDE_NOISE.test(vTxt)) { chosenVal = vTxt; break; }
        }
        if (!chosenVal && headerVal && !AE_GUIDE_NOISE.test(headerVal)) chosenVal = headerVal;
        if (gName && chosenVal) map[aeDimKey(gName)] = { name: gName, value: chosenVal };
      }
    } catch (e) {}
    return map;
  }
  function aeFindMatchingSku(state, domSelMap) {
    if (!state || !state.skus || !state.skus.length) return null;
    var domKeys = [];
    for (var dk in domSelMap) {
      if (Object.prototype.hasOwnProperty.call(domSelMap, dk)) domKeys.push(dk);
    }
    if (domKeys.length > 0) {
      var matched = [];
      for (var i = 0; i < state.skus.length; i++) {
        var sku = state.skus[i];
        var attrs = sku.attributes || {};
        var allDomMatch = true;
        for (var j = 0; j < domKeys.length; j++) {
          var wantedKey = domKeys[j];
          var wantedVal = String(domSelMap[wantedKey].value || '').toLowerCase();
          var foundAttr = false;
          for (var ak in attrs) {
            if (!Object.prototype.hasOwnProperty.call(attrs, ak)) continue;
            if (aeDimKey(ak) === wantedKey && String(attrs[ak] || '').toLowerCase() === wantedVal) {
              foundAttr = true;
              break;
            }
          }
          if (!foundAttr) { allDomMatch = false; break; }
        }
        if (!allDomMatch) continue;
        /* Les autres dimensions éventuelles qui n'ont qu'UNE valeur sur la fiche sont automatiquement satisfaites. */
        var totalProps = state.properties ? state.properties.length : 0;
        var multiChoiceCount = 0;
        for (var mp = 0; mp < totalProps; mp++) {
          if (state.properties[mp].values && state.properties[mp].values.length >= 2) multiChoiceCount++;
        }
        if (domKeys.length >= multiChoiceCount) matched.push(sku);
      }
      if (matched.length === 1) return matched[0];
    }
    if (ALIEXPRESS_URL_SKU_ID && !domKeys.length) {
      for (var u = 0; u < state.skus.length; u++) {
        if (String(state.skus[u].skuId || '') === ALIEXPRESS_URL_SKU_ID) return state.skus[u];
      }
    }
    if (state.skus.length === 1) return state.skus[0];
    return null;
  }
  /* RACINE DE LA FICHE.
     Pourquoi : Amazon publie des blocs de variantes AILLEURS sur la page
     (carrousels sponsorisés, « produits similaires ») qui portent les mêmes
     identifiants (« inline-twister-row-… », « #twister… »). Lire le document entier
     revenait à présenter les tailles d'un AUTRE article dans la feuille de
     celui-ci — donc à laisser commander une combinaison qui n'existe pas.
     On borne donc la lecture des blocs de variantes à la fiche elle-même. */
  var AMAZON_PRODUCT_ROOT = null;
  if (AMAZON_STRICT) {
    try {
      AMAZON_PRODUCT_ROOT = document.querySelector('#dp-container') || document.querySelector('#ppd') || document.querySelector('#dp');
    } catch (e) { AMAZON_PRODUCT_ROOT = null; }
  }
  /** Requête bornée à la fiche quand elle existe ; document sinon. */
  function amazonRootQuery(selector) {
    var scope = AMAZON_PRODUCT_ROOT || document;
    try { return scope.querySelectorAll(selector); } catch (e) { return []; }
  }
  /** Un nœud appartient-il à la fiche ? (faux si une racine existe et l'exclut) */
  function amazonInsideProductRoot(node) {
    if (!AMAZON_PRODUCT_ROOT) return true;
    if (!node) return false;
    try { return AMAZON_PRODUCT_ROOT === node || AMAZON_PRODUCT_ROOT.contains(node); } catch (e) { return false; }
  }
  var AMAZON_EVIDENCE_LIMITS = { options: 60, variants: 40, dimensions: 6, label: 60, scripts: 80, scriptChars: 500000 };
  var AMAZON_ASIN_PATTERN = /^[A-Z0-9]{10}$/;
  function amazonValidAsin(value) {
    var candidate = text(value).toUpperCase();
    return AMAZON_ASIN_PATTERN.test(candidate) ? candidate : '';
  }
  function amazonDimensionName(value, fallback) {
    var name = text(value).toLowerCase();
    name = name.replace(/^variation_/, '').replace(/_name$/, '').replace(/[_-]+/g, ' ');
    if (/color|colour/.test(name)) return 'color';
    if (/size|taille/.test(name)) return 'size';
    if (/style|model/.test(name)) return 'style';
    return name || fallback || 'option';
  }
  function amazonReadBalancedJson(source, start) {
    var first = source.charAt(start);
    if (first !== '{' && first !== '[') return null;
    var stack = [];
    var quote = '';
    var escaped = false;
    for (var i = start; i < source.length; i++) {
      var ch = source.charAt(i);
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        if (!stack.length) return null;
        stack.pop();
        if (!stack.length) {
          try { return JSON.parse(source.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    return null;
  }
  function amazonReadJsonValue(source, key) {
    if (!source || source.indexOf(key) < 0) return null;
    var markers = ['"' + key + '"', "'" + key + "'", key];
    var searchFrom = 0;
    for (var attempt = 0; attempt < 24; attempt++) {
      var at = -1;
      var marker = '';
      for (var m = 0; m < markers.length; m++) {
        var found = source.indexOf(markers[m], searchFrom);
        if (found >= 0 && (at < 0 || found < at)) { at = found; marker = markers[m]; }
      }
      if (at < 0) return null;
      var after = at + marker.length;
      if (marker === key) {
        var beforeChar = at > 0 ? source.charAt(at - 1) : '';
        var afterChar = source.charAt(after);
        if (/[A-Za-z0-9_$]/.test(beforeChar) || /[A-Za-z0-9_$]/.test(afterChar)) {
          searchFrom = after;
          continue;
        }
      }
      /* Collage : certaines pages sérialisent leurs données DANS une chaîne
         (« "sortedDimValuesForAllDims\" : … »). Entre la clé et les deux-points
         il n'y a alors que des antislashs et des guillemets — jamais un
         séparateur. On les saute, bornés, avant de conclure au refus. */
      for (var glue = 0; glue < 6 && after < source.length; glue++) {
        var joint = source.charAt(after);
        if (joint === '\\' || joint === '"' || (/\s/.test(joint))) { after++; continue; }
        break;
      }
      var separator = source.charAt(after);
      if (separator === ':' || separator === '=') {
        after++;
        while (after < source.length && /\s/.test(source.charAt(after))) after++;
        var parsed = amazonReadBalancedJson(source, after);
        if (parsed && typeof parsed === 'object') return parsed;
      }
      searchFrom = at + marker.length;
    }
    return null;
  }
  /* Données échappées : une seconde lecture sur le texte déséchappé, avant
     d'abandonner. Une seule passe, bornée — on ne réécrit pas la page, on la
     relit autrement. */
  function amazonReadScriptJson(source, key) {
    var value = amazonReadJsonValue(source, key);
    if (value) return value;
    if (!source || source.indexOf('\\"') < 0) return null;
    return amazonReadJsonValue(source.split('\\"').join('"'), key);
  }
  /* Un index (nombre, ou texte de chiffres dans une table d'index) n'est JAMAIS un nom d'option :
     il ne devient une valeur que s'il pointe vers une entrée texte de « variationValues » pour la
     MÊME dimension. Hors de cette table, il est écarté. */
  function amazonIndexedValue(variationValues, key, index) {
    if (!variationValues || typeof index !== 'number' || index % 1 !== 0 || index < 0) return '';
    var list = variationValues[key];
    if (Object.prototype.toString.call(list) !== '[object Array]' || index >= list.length) return '';
    return typeof list[index] === 'string' ? text(list[index]) : '';
  }
  function amazonValueFrom(value, key, variationValues, indexSource) {
    var isIndex = typeof value === 'number' || (indexSource && typeof value === 'string' && /^\d+$/.test(value));
    if (isIndex) return amazonIndexedValue(variationValues, key, Number(value));
    return typeof value === 'string' ? text(value) : '';
  }
  function amazonNormalizeDimensions(raw, dimensionKeys, variationValues, indexSource) {
    var dimensions = [];
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      for (var i = 0; i < raw.length && dimensions.length < AMAZON_EVIDENCE_LIMITS.dimensions; i++) {
        var rawKey = dimensionKeys[i] || ('dimension_' + (i + 1));
        var label = amazonValueFrom(raw[i], rawKey, variationValues, indexSource);
        if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label) continue;
        dimensions.push({ name: amazonDimensionName(rawKey, 'dimension_' + (i + 1)), value: label });
      }
    } else if (raw && typeof raw === 'object') {
      for (var key in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, key) || dimensions.length >= AMAZON_EVIDENCE_LIMITS.dimensions) continue;
        var objectLabel = amazonValueFrom(raw[key], key, variationValues, indexSource);
        if (!objectLabel || objectLabel.length > AMAZON_EVIDENCE_LIMITS.label) continue;
        dimensions.push({ name: amazonDimensionName(key, 'dimension_' + (dimensions.length + 1)), value: objectLabel });
      }
    }
    return dimensions;
  }
  /* ── DONNÉES DU TWISTER (source STRUCTURÉE du choix couleur / taille) ──────
     La fiche publie, en plus du DOM, une table
     « sortedDimValuesForAllDims » : pour chaque dimension, la liste de ses
     valeurs avec «dimensionValueDisplayText», «dimensionValueState»
     (SELECTED / AVAILABLE / UNAVAILABLE) et «defaultAsin». C'est la seule
     source qui donne, valeur par valeur, l'ASIN ET l'état de stock — une
     pastille non rendue (liste paresseuse, écran étroit) ne prive donc plus la
     feuille de ses couleurs. Bornes et refus : uniquement des tableaux non
     vides d'objets qui portent un libellé ; toute autre clé de la page
     (« twister-js-init-dpx-data »…) est ignorée. */
  function amazonTwisterData() {
    var dims = [];
    var scripts = [];
    try { scripts = document.querySelectorAll('script:not([src])'); } catch (e) { return dims; }
    for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts && !dims.length; s++) {
      /* Un script DANS la fiche seulement : les blocs « sponsorisés » en
         contiennent aussi, avec les valeurs d'un autre produit. */
      if (!amazonInsideProductRoot(scripts[s])) continue;
      var source = scripts[s].textContent || '';
      if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars) continue;
      if (source.indexOf('sortedDimValuesForAllDims') < 0) continue;
      var raw = amazonReadScriptJson(source, 'sortedDimValuesForAllDims');
      if (!raw || typeof raw !== 'object') continue;
      for (var key in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        if (dims.length >= AMAZON_EVIDENCE_LIMITS.dimensions) break;
        var list = raw[key];
        if (Object.prototype.toString.call(list) !== '[object Array]' || !list.length) continue;
        var values = [];
        for (var i = 0; i < list.length && values.length < 60; i++) {
          var entry = list[i];
          if (!entry || typeof entry !== 'object') continue;
          var label = text(entry.dimensionValueDisplayText || entry.dimensionValueDisplayName);
          if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label) continue;
          if (NOT_A_CHOICE.test(label)) continue;
          var state = text(entry.dimensionValueState).toLowerCase();
          values.push({
            label: label,
            asin: amazonValidAsin(entry.defaultAsin),
            state: state === 'selected' ? 'selected' : state === 'available' ? 'available' : state === 'unavailable' ? 'unavailable' : 'unknown'
          });
        }
        if (!values.length) continue;
        dims.push({ key: key, name: amazonDimensionName(key, 'option_' + (dims.length + 1)), values: values });
      }
    }
    return dims;
  }
  /* Noms AFFICHÉS des dimensions (« size_name » ⇒ « Size »), publiés à part :
     ils servent de repli quand la table des valeurs n'est pas lisible. */
  function amazonVariationLabels() {
    var labels = null;
    var scripts = [];
    try { scripts = document.querySelectorAll('script:not([src])'); } catch (e) { return null; }
    for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts && !labels; s++) {
      var source = scripts[s].textContent || '';
      if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars) continue;
      if (source.indexOf('variationDisplayLabels') < 0) continue;
      var raw = amazonReadScriptJson(source, 'variationDisplayLabels');
      if (raw && typeof raw === 'object') labels = raw;
    }
    return labels;
  }
  /* Prix affiché SUR LA CARTE du choix (pastille couleur) : un seul montant
     distinct, jamais un prix barré. NULL quand la carte n'en publie pas —
     on ne prend pas le prix de la fiche à sa place. */
  function amazonCardPrice(element) {
    var nodes = [];
    try { nodes = element.querySelectorAll('.a-price:not(.a-text-price)'); } catch (e) { return ''; }
    var seen = {};
    var distinct = 0;
    var value = '';
    for (var i = 0; i < nodes.length && i < 4; i++) {
      var reading = amazonPriceText(nodes[i]);
      if (!reading || !amazonPlausible(reading)) continue;
      var digits = reading.replace(/[^0-9]/g, '');
      if (!digits || seen[digits]) continue;
      seen[digits] = true;
      distinct++;
      value = reading;
    }
    return distinct === 1 ? value : '';
  }
  /* La carte dit-elle ELLE-MÊME que ce choix est épuisé ? Vocabulaire fermé,
     borné à la carte : une couleur CSS ou un texte de pied de page ne compte
     pas. */
  function amazonCardOutOfStock(element) {
    var raw = text(element.textContent);
    if (!raw || raw.length > 300) return false;
    return /sold\s*out|out\s*of\s*stock|unavailable|not available|\u00e9puis|epuise|rupture|ausverkauft|agotado|esaurito|non disponible/i.test(raw);
  }
  /* Stock annoncé SUR LA CARTE (« Only 6 left in stock », « nur noch 3 auf
     Lager ») : nombre borné, ou rien. */
  function amazonCardStock(element) {
    var raw = text(element.textContent);
    if (!raw || raw.length > 400) return null;
    var match = /(?:only\s+)?(\d{1,3})\s+(?:left in stock|remaining|available)/i.exec(raw)
      || /(?:il ne reste plus que|plus que)\s*(\d{1,3})/i.exec(raw)
      || /(?:nur noch|noch)\s*(\d{1,3})\s*(?:auf lager|verf\u00fcgbar|verfuegbar)/i.exec(raw)
      || /(?:\u0628\u0642\u064a|\u0645\u062a\u0628\u0642\u064a)\s*(\d{1,3})/.exec(raw);
    if (!match) return null;
    var count = Number(match[1]);
    return count > 0 && count <= 999 ? count : null;
  }
  function collectAmazonEvidence() {
    var result = { readerVersion: 2, pageAsin: AMAZON_ASIN || null, selectedAsin: null, selectedValues: [], options: [], variants: [] };
    if (!AMAZON_STRICT) return result;
    var variationValues = null;
    var dimensionKeys = [];
    var dimensionNames = [];
    var variationKeysFromTable = false;
    /* Ordre des DIMENSIONS : la table du twister (ou, à défaut, les libellés
       affichés) nomme les colonnes de «dimensionValuesDisplayData». Sans lui,
       une fiche qui ne publie pas «variationValues» donnait « dimension 1 » et
       « dimension 2 » — des noms que la feuille ne pouvait pas présenter. */
    var twisterDims = amazonTwisterData();
    for (var td = 0; td < twisterDims.length && dimensionKeys.length < AMAZON_EVIDENCE_LIMITS.dimensions; td++) {
      dimensionKeys.push(twisterDims[td].key);
      dimensionNames.push(twisterDims[td].name);
    }
    if (!dimensionKeys.length) {
      var displayLabels = amazonVariationLabels();
      for (var dl in displayLabels) {
        if (!Object.prototype.hasOwnProperty.call(displayLabels, dl)) continue;
        if (dimensionKeys.length >= AMAZON_EVIDENCE_LIMITS.dimensions) break;
        if (!/^(?:variation_)?[a-z][a-z0-9_-]*(?:_name)?$/i.test(dl)) continue;
        dimensionKeys.push(dl);
        dimensionNames.push(amazonDimensionName(dl, 'dimension_' + (dimensionKeys.length)));
      }
    }
    var scripts = [];
    try { scripts = document.querySelectorAll('script:not([src])'); } catch (e) { scripts = []; }
    for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts; s++) {
      var source = scripts[s].textContent || '';
      if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars) continue;
      /* « variationValues : {} » n'est PAS une table : une table VIDE ne doit ni
         arrêter la recherche, ni empêcher de nommer les dimensions autrement. */
      if (!variationValues) {
        var foundVariation = amazonReadScriptJson(source, 'variationValues');
        if (foundVariation && typeof foundVariation === 'object') {
          for (var fk in foundVariation) {
            if (!Object.prototype.hasOwnProperty.call(foundVariation, fk)) continue;
            variationValues = foundVariation;
            break;
          }
        }
      }
      if (variationValues && !variationKeysFromTable) {
        var tableKeys = [];
        for (var dimensionKey in variationValues) {
          if (!Object.prototype.hasOwnProperty.call(variationValues, dimensionKey)) continue;
          if (tableKeys.length >= AMAZON_EVIDENCE_LIMITS.dimensions) break;
          tableKeys.push(dimensionKey);
        }
        /* La table de valeurs fait foi pour l'ORDRE des colonnes ; les noms
           viennent d'elle, à défaut du twister déjà lu. */
        if (tableKeys.length) {
          dimensionKeys = tableKeys;
          variationKeysFromTable = true;
          dimensionNames = [];
          for (var tn = 0; tn < tableKeys.length; tn++) dimensionNames.push(amazonDimensionName(tableKeys[tn], 'dimension_' + (tn + 1)));
        }
      }
      var displayMap = amazonReadScriptJson(source, 'dimensionValuesDisplayData');
      if (displayMap && typeof displayMap === 'object') {
        for (var displayAsin in displayMap) {
          if (!Object.prototype.hasOwnProperty.call(displayMap, displayAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants) continue;
          var validDisplayAsin = amazonValidAsin(displayAsin);
          var displayDimensions = amazonNormalizeDimensions(displayMap[displayAsin], dimensionKeys, variationValues, false);
          if (validDisplayAsin && displayDimensions.length) amazonMergeVariant(result, validDisplayAsin, displayDimensions, 'dimensionValuesDisplayData');
        }
      }
      var asinMap = amazonReadScriptJson(source, 'asinVariationValues');
      if (asinMap && typeof asinMap === 'object') {
        for (var mappedAsin in asinMap) {
          if (!Object.prototype.hasOwnProperty.call(asinMap, mappedAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants) continue;
          var validMappedAsin = amazonValidAsin(mappedAsin);
          var mappedDimensions = amazonNormalizeDimensions(asinMap[mappedAsin], dimensionKeys, variationValues, true);
          if (validMappedAsin && mappedDimensions.length) amazonMergeVariant(result, validMappedAsin, mappedDimensions, 'asinVariationValues');
        }
      }
    }
    /* Options et CHOIX depuis les données du twister : la seule source qui donne,
       valeur par valeur, l'ASIN et l'état publié. Une pastille non rendue (liste
       paresseuse) ne prive plus la feuille de ses couleurs et de ses tailles. */
    var twisterSelectedAsins = [];
    for (var t = 0; t < twisterDims.length; t++) {
      var twisterDim = twisterDims[t];
      for (var tp = 0; tp < twisterDim.values.length && result.options.length < AMAZON_EVIDENCE_LIMITS.options; tp++) {
        var twisterValue = twisterDim.values[tp];
        var twisterChosen = twisterValue.state === 'selected';
        var twisterEvidence = twisterChosen || twisterValue.state === 'available'
          ? 'available'
          : twisterValue.state === 'unavailable' ? 'unavailable' : 'unknown';
        amazonAddOption(result, twisterDim.name, twisterValue.label, twisterValue.asin, twisterChosen, twisterEvidence, 'twister_data');
        if (!twisterChosen) continue;
        pushUnique(result.selectedValues, twisterValue.label, 6, AMAZON_EVIDENCE_LIMITS.label);
        if (twisterValue.asin) pushUnique(twisterSelectedAsins, twisterValue.asin, 10, 10);
      }
    }
    /* Borné à la fiche : un bloc de variantes d'un carrousel sponsorisé porte le
       même identifiant et proposerait les tailles d'un autre article. */
    var blocks = amazonRootQuery('[id^="inline-twister-row-"], #twister [id^="variation_"], [id^="variation_"][id$="_name"], #twister [id^="inline-twister-row-"]');
    /* Un bloc qui en CONTIENT un autre ne décrit pas une dimension à lui seul :
       on ne garde que les blocs les plus internes (bornés, ≤ 40 nœuds). */
    var keptBlocks = [];
    for (var kb = 0; kb < blocks.length && kb < 40; kb++) {
      var nested = false;
      for (var kn = 0; kn < blocks.length && kn < 40; kn++) {
        if (kn === kb || blocks[kn] === blocks[kb]) continue;
        if (blocks[kn].contains && blocks[kn].contains(blocks[kb])) { nested = true; break; }
      }
      if (!nested) keptBlocks.push(blocks[kb]);
    }
    blocks = keptBlocks;
    var selectedAsins = [];
    for (var b = 0; b < blocks.length && b < 20; b++) {
      var block = blocks[b];
      var blockId = String(block.id || '');
      var dimension = amazonDimensionName(blockId, 'option_' + (b + 1));
      if (blockId.indexOf('inline-twister-row-') === 0) dimension = amazonDimensionName(blockId.replace('inline-twister-row-', ''), 'option_' + (b + 1));
      var items = [];
      try { items = block.querySelectorAll('li, select option, [role="radio"], [role="option"], [data-asin]'); } catch (e) { items = []; }
      for (var o = 0; o < items.length && result.options.length < AMAZON_EVIDENCE_LIMITS.options; o++) {
        var item = items[o];
        /* data-value purement numérique = index de swatch : jamais un nom d'option. */
        var dataValue = text(item.getAttribute && item.getAttribute('data-value'));
        if (/^\d+$/.test(dataValue)) dataValue = '';
        var label = text(dataValue || (item.getAttribute && (item.getAttribute('title') || item.getAttribute('aria-label'))));
        if (!label) {
          try { var imageLabel = item.querySelector('img[alt]'); label = text(imageLabel && imageLabel.getAttribute('alt')); } catch (e) {}
        }
        /* Le libellé d'une carte est écrit DANS un enfant (« a-button-text ») :
           prendre tout le texte du <li> ramenait « X-Small $99.00 Sold out »
           comme NOM de taille. */
        if (!label) {
          try {
            var labelNode = item.querySelector('.a-button-text, .swatch-title-text, .a-size-base, .a-color-base');
            if (labelNode) label = text(labelNode.textContent);
          } catch (e) {}
        }
        if (!label) label = text(item.textContent);
        label = text(label.replace(/^click to select\s*/i, ''));
        if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label || NOT_A_CHOICE.test(label)) continue;
        var optionAsin = amazonAsinFromNode(item);
        var selected = amazonNodeIsSelected(item);
        /* Ancien tracé : le swatch CHOISI porte data-dp-url vide = la fiche ouverte elle-même. */
        if (selected && !optionAsin && AMAZON_ASIN && item.hasAttribute && item.hasAttribute('data-dp-url')) optionAsin = AMAZON_ASIN;
        var state = amazonNodeAvailability(item);
        var optionImage = '';
        try {
          var optionImageNode = item.querySelector('img');
          if (optionImageNode) optionImage = String(optionImageNode.getAttribute('data-old-hires') || optionImageNode.getAttribute('data-a-hires') || optionImageNode.currentSrc || optionImageNode.getAttribute('src') || optionImageNode.getAttribute('data-src') || '');
        } catch (e) {}
        var addedOption = amazonAddOption(result, dimension, label, optionAsin, selected, state, 'twister_dom', optionImage);
        /* Prix et stock AFFICHÉS SUR LA CARTE de ce choix. Ce sont des faits de
           la page, pas un devis : le serveur recalcule (et le prix d'une carte
           n'est jamais présenté comme le total en dinars). */
        if (addedOption) {
          var cardPrice = amazonCardPrice(item);
          if (cardPrice && !addedOption.price) addedOption.price = cut(cardPrice, LIMITS.text);
          /* « 5 options from $56.32 » : c'est un prix d'ENTRÉE de gamme, pas le
             prix de cette couleur. La feuille l'affiche comme « à partir de » et
             ne le présente jamais comme le prix de l'article. */
          if (cardPrice) addedOption.priceFrom = isFromPrice(item);
          var cardStock = amazonCardStock(item);
          if (cardStock) {
            if (!addedOption.stock) addedOption.stock = cardStock;
            /* Un NOMBRE de pièces annoncé sur la carte est une preuve POSITIVE :
               la page dit combien elle en a. Ce n'est pas une déduction. */
            if (addedOption.availabilityEvidence === 'unknown') addedOption.availabilityEvidence = 'available';
          }
          /* « Sold out » écrit sur la carte, sans marqueur de classe : c'est un
             fait de la page, pas une absence de donnée. */
          if (addedOption.availabilityEvidence === 'unknown' && amazonCardOutOfStock(item)) {
            addedOption.availabilityEvidence = 'unavailable';
          }
        }
        if (selected && optionAsin) pushUnique(selectedAsins, optionAsin, 10, 10);
      }
    }
    var selectedField = null;
    try { selectedField = document.querySelector('#ASIN, input[name="ASIN"]'); } catch (e) {}
    var fieldAsin = amazonValidAsin(selectedField && (selectedField.value || selectedField.getAttribute('value')));
    if (fieldAsin) result.selectedAsin = fieldAsin;
    else if (twisterSelectedAsins.length === 1) result.selectedAsin = twisterSelectedAsins[0];
    else if (selectedAsins.length === 1) result.selectedAsin = selectedAsins[0];
    for (var v = 0; v < result.variants.length; v++) {
      result.variants[v].selected = !!result.selectedAsin && result.variants[v].asin === result.selectedAsin;
    }
    return result;
  }
  function amazonMergeVariant(result, asin, dimensions, source) {
    if (!asin || !dimensions || !dimensions.length) return;
    var variant = null;
    for (var i = 0; i < result.variants.length; i++) { if (result.variants[i].asin === asin) { variant = result.variants[i]; break; } }
    if (!variant) {
      if (result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants) return;
      variant = { asin: asin, dimensions: [], source: source, selected: false };
      result.variants.push(variant);
    }
    for (var d = 0; d < dimensions.length && variant.dimensions.length < AMAZON_EVIDENCE_LIMITS.dimensions; d++) {
      var candidate = dimensions[d];
      if (!candidate || !candidate.name || !candidate.value) continue;
      var duplicate = false;
      for (var x = 0; x < variant.dimensions.length; x++) {
        if (variant.dimensions[x].name === candidate.name && variant.dimensions[x].value.toLowerCase() === candidate.value.toLowerCase()) duplicate = true;
      }
      if (!duplicate) variant.dimensions.push({ name: cut(candidate.name, 40), value: cut(candidate.value, AMAZON_EVIDENCE_LIMITS.label) });
    }
  }
  function amazonAsinFromNode(element) {
    var node = element;
    for (var hop = 0; node && hop < 5; hop++) {
      /* Liste déroulante Amazon : value = « <index>,<ASIN> ». L'index n'est jamais un nom ; seul l'ASIN est lu. */
      if (String(node.tagName || '').toLowerCase() === 'option' && node.getAttribute) {
        var pair = /^\d+,([A-Z0-9]{10})$/i.exec(node.getAttribute('value') || '');
        if (pair) { var fromPair = amazonValidAsin(pair[1]); if (fromPair) return fromPair; }
      }
      if (node.getAttribute) {
        var asin = amazonValidAsin(node.getAttribute('data-asin') || node.getAttribute('data-defaultasin') || node.getAttribute('asin'));
        if (asin) return asin;
        /* Ancien tracé : data-dp-url="/dp/<ASIN>/…" désigne la variante de ce swatch. */
        var dpUrl = node.getAttribute('data-dp-url') || '';
        var dpMatch = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[\/?#]|$)/i.exec(dpUrl);
        if (dpMatch) { var fromDp = amazonValidAsin(dpMatch[1]); if (fromDp) return fromDp; }
        /* Tracé des cartes de choix actuelles : data-csa-c-item-id="asin.<ASIN>". */
        var csaId = String(node.getAttribute('data-csa-c-item-id') || node.getAttribute('data-csa-c-asin') || '');
        if (csaId) {
          var csaAsin = amazonValidAsin(csaId.replace(/^asin\./i, ''));
          if (csaAsin) return csaAsin;
        }
      }
      node = node.parentNode;
    }
    return '';
  }
  function amazonNodeIsSelected(element) {
    var node = element;
    for (var hop = 0; node && hop < 3; hop++) {
      var className = String(node.className || '').toLowerCase();
      if (/swatchselect|a-button-selected|\bselected\b/.test(className)) return true;
      if (node.getAttribute && (node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-selected') === 'true')) return true;
      if (String(node.tagName || '').toLowerCase() === 'option' && node.selected === true) return true;
      node = node.parentNode;
    }
    return false;
  }
  function amazonNodeAvailability(element) {
    var node = element;
    for (var hop = 0; node && hop < 3; hop++) {
      /* L'état peut être porté par un ENFANT de la carte (« <li …><span
         class="swatchUnavailable"> ») : on regarde la carte elle-même avant de
         remonter. Borné aux marqueurs explicites, jamais à une couleur CSS. */
      if (hop === 0 && node.querySelector) {
        try {
          if (node.querySelector('.swatchUnavailable, .dropdownUnavailable, .a-button-disabled, [aria-disabled="true"]')) return 'unavailable';
          if (node.querySelector('.swatchAvailable, .dropdownAvailable, [aria-disabled="false"]')) return 'available';
        } catch (e) {}
      }
      var className = String(node.className || '').toLowerCase();
      if (/swatchunavailable|dropdownunavailable|a-button-disabled|unavailable|outofstock/.test(className)
          || node.disabled === true || (node.getAttribute && node.getAttribute('aria-disabled') === 'true')) return 'unavailable';
      if (/swatchavailable|dropdownavailable/.test(className) || (node.getAttribute && node.getAttribute('aria-disabled') === 'false')) return 'available';
      node = node.parentNode;
    }
    return 'unknown';
  }
  /* Formulaire d'achat (zone d'achat) désignant un AUTRE ASIN que celui de l'URL : la zone affiche
     le prix d'un autre article ⇒ aucun prix Amazon n'est publié. */
  function amazonBuyboxAsinMismatch() {
    if (!AMAZON_ASIN) return false;
    var fields = [];
    try { fields = document.querySelectorAll('input#ASIN, input[name="ASIN"]'); } catch (e) { return false; }
    for (var i = 0; i < fields.length && i < 4; i++) {
      var inBuybox = false;
      for (var n = fields[i]; n && n.nodeType === 1; n = n.parentNode) {
        var nodeId = String(n.id || '');
        if (String(n.tagName || '').toUpperCase() === 'FORM' || /^(buybox|desktop_buybox|apex_desktop|corePrice_feature_div|corePriceDisplay_desktop_feature_div|addToCart)/.test(nodeId)) { inBuybox = true; break; }
      }
      if (!inBuybox) continue;
      var fieldValue = String(fields[i].value || fields[i].getAttribute('value') || '').toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(fieldValue) && fieldValue !== AMAZON_ASIN) return true;
    }
    return false;
  }
  /* Retourne l'option (nouvelle, ou déjà connue) : l'appelant peut y attacher le
     prix et le stock lus sur la carte, même si la valeur venait des données du
     twister. NULL quand la borne d'options est atteinte. */
  function amazonAddOption(result, dimension, value, asin, selected, state, source, image) {
    var imageUrl = typeof image === 'string' && /^https?:\/\//i.test(image) ? cut(image, 600) : null;
    var key = dimension + '|' + value.toLowerCase() + '|' + (asin || '');
    for (var i = 0; i < result.options.length; i++) {
      var existing = result.options[i];
      if ((existing.dimension + '|' + existing.value.toLowerCase() + '|' + (existing.asin || '')) === key) {
        if (selected && !existing.selected) existing.selected = true;
        if (state !== 'unknown' && existing.availabilityEvidence === 'unknown') existing.availabilityEvidence = state;
        if (!existing.image && imageUrl) existing.image = imageUrl;
        return existing;
      }
    }
    var added = null;
    if (result.options.length < AMAZON_EVIDENCE_LIMITS.options) {
      added = { dimension: cut(dimension, 40), value: cut(value, AMAZON_EVIDENCE_LIMITS.label), asin: asin || null, selected: !!selected, availabilityEvidence: state, source: source };
      if (imageUrl) added.image = imageUrl;
      result.options.push(added);
    }
    if (asin) amazonMergeVariant(result, asin, [{ name: dimension, value: value }], source);
    return added;
  }
  /** Élément de navigation / recherche — jamais un choix produit ni un achat. */
  function isInNavigation(el) {
    var node = el;
    for (var hops = 0; node && hops < 6; hops++) {
      var tag = String(node.tagName || '').toLowerCase();
      if (tag === 'header' || tag === 'nav') return true;
      var role = node.getAttribute && node.getAttribute('role');
      if (role === 'search') return true;
      var id = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
      if (/navbar|nav-|search|department/.test(id)) return true;
      node = node.parentNode;
    }
    return false;
  }
  /** Prix barré (ancien prix) : attribut data-a-strike, balise <s>/<del>/<strike>, ou line-through en style inline. */
  function isStruckNode(node) {
    var tag = String(node.tagName || '').toLowerCase();
    if (tag === 's' || tag === 'del' || tag === 'strike') return true;
    if (node.getAttribute && node.getAttribute('data-a-strike') !== null) return true;
    var style = node.style;
    if (style && /line-through/i.test(String(style.textDecoration || '') + ' ' + String(style.textDecorationLine || ''))) return true;
    return false;
  }
  /** Contexte publicitaire / navigation / prix barré / caché — jamais un prix vendu. */
  function amazonBlocked(element) {
    if (!element) return true;
    if (isInNavigation(element)) return true;
    var node = element;
    for (var hops = 0; node && hops < 10; hops++) {
      if (isStruckNode(node)) return true;
      var descriptor = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
      if (/sponsored|sp-sponsored|carousel|nav-assist|similar|recommendation|adplace|a-text-price|deal-badge|apex_desktop_right/.test(descriptor)) return true;
      /* Offres annexes de la zone d'achat. Constaté sur une fiche US récupérée le
         18/10/2026 (texte rendu, pas le DOM) : « Add a protection plan » avec
         2-Year Protection Plan $39.99 et Complete Protect $16.99/month, affiché
         dans la colonne d'achat. Ces prix ne sont pas le prix vendu : sans ce
         filtre, deux montants distincts font abstenir le lecteur sur une fiche saine. */
      if (/attach|protection|warranty|insurance|popover|a-modal|upsell|add-?on|cross-?sell/.test(descriptor)) return true;
      /* Amazon garde une COPIE responsive du prix dans le DOM (desktop/mobile).
         Lire le seul style inline ne suffit pas : la copie peut être masquée par
         une règle CSS ou un media query. On interroge donc le style CALCULÉ —
         mesuré le 06/10/2026 : deux prix dans la même page, l'un invisible. */
      if (node.nodeType === 1 && node.getAttribute) {
        if (node.getAttribute('aria-hidden') === 'true') return true;
        if (node.hasAttribute && node.hasAttribute('hidden')) return true;
        var inlineStyle = String(node.getAttribute('style') || '');
        if (/display:\s*none|visibility:\s*(?:hidden|collapse)/i.test(inlineStyle)) return true;
        try {
          var view = document.defaultView;
          var computed = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(node) : null;
          if (computed && (computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse')) return true;
        } catch (e) {}
      }
      node = node.parentNode;
    }
    return false;
  }
  /** Nombre de MONTANTS distincts dans un texte (« $29.99 - $38.99 » ⇒ 2). */
  function amazonAmountCount(value) {
    var normalized = String(value || '').replace(/[\s\u00a0\u202f]+/g, '');
    var found = normalized.match(/\d+(?:[.,]\d{2})?/g);
    if (!found) return 0;
    var seen = {};
    var count = 0;
    for (var i = 0; i < found.length; i++) {
      var key = found[i].replace(/[.,]/g, '');
      if (!key || seen[key]) continue;
      seen[key] = true;
      count++;
    }
    return count;
  }
  /** « À partir de », « from », « ab » : un prix de départ n'est pas un prix vendu. */
  function amazonFromPrice(element, value) {
    if (/\b(?:from|ab|a partir de|à partir de|desde|da)\b\s*$/i.test(String(value || '').trim().replace(/\s+/g, ' '))) return true;
    var node = element;
    for (var hop = 0; node && hop < 2; hop++) {
      var descriptor = String((node.className || '') + ' ' + (node.id || '')).toLowerCase();
      if (/price-range|pricerange|from-price|basisprice/.test(descriptor)) return true;
      node = node.parentNode;
    }
    return false;
  }
  /** Famille de preuve d'une lecture de prix dans la zone d'achat. L'étiquette
      d'accessibilité est une chaîne complète publiée par la page ; tout le reste
      est le bloc de prix, que NOUS reconstruisons quand son «.a-offscreen» est
      vide (cas mesuré). Deux familles différentes d'accord = corroboration. */
  function amazonReadingSource(element) {
    var node = element;
    for (var hop = 0; node && hop < 2; hop++) {
      if (String(node.id || '') === 'apex-pricetopay-accessibility-label') return 'a11y_label';
      node = node.parentNode;
    }
    return 'dom';
  }
  /** Prix d'un élément Amazon : «.a-offscreen» s'il est rempli, sinon reconstruction
      à partir des spans (le cas MESURÉ : «.a-offscreen» vide dans le bloc). */
  function amazonPriceText(element) {
    if (!element) return '';
    var offscreen = '';
    try { var off = element.querySelector('.a-offscreen'); offscreen = text(off && off.textContent); } catch (e) {}
    if (offscreen && HAS_DIGIT.test(offscreen)) {
      /* Le libellé caché peut contenir une remise (« $179.98 with 10 percent
         savings ») ou deux montants : on n'en garde un que s'il est UNIQUE. */
      var offscreenAmount = amazonSingleAmount(offscreen) || amazonAccessibilityAmount(offscreen);
      if (offscreenAmount) return offscreenAmount;
    }
    var whole = '';
    var fraction = '';
    var symbol = '';
    try {
      var wholeEl = element.querySelector('.a-price-whole');
      whole = text(wholeEl && wholeEl.textContent) || (element.className && /a-price-whole/.test(String(element.className)) ? text(element.textContent) : '');
      whole = whole.replace(/[.,\s]+$/, '');
      var fractionEl = element.querySelector('.a-price-fraction');
      fraction = text(fractionEl && fractionEl.textContent).replace(/\D/g, '').slice(0, 2);
      var symbolEl = element.querySelector('.a-price-symbol');
      symbol = text(symbolEl && symbolEl.textContent);
    } catch (e) {}
    if (!whole || !HAS_DIGIT.test(whole)) {
      /* Pas de spans : l'étiquette d'accessibilité d'Amazon porte le prix en
         clair (« $109.00 ») — c'est une LECTURE, pas une reconstruction. */
      var ownText = text(element.textContent);
      if (ownText && HAS_DIGIT.test(ownText) && ownText.length <= LIMITS.text) {
        return amazonSingleAmount(ownText) || amazonAccessibilityAmount(ownText);
      }
      return '';
    }
    return symbol + whole + (fraction ? '.' + fraction : '');
  }
  /** Le PREMIER montant d'un texte, avec sa devise si elle est écrite. */
  function amazonFindAmount(raw) {
    return String(raw || '').match(/(?:[$\u20ac\u00a3\u00a5\uffe5]\s*)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?(?:\s*[$\u20ac\u00a3\u00a5\uffe5]|\s*(?:EUR|USD|GBP|JPY|TND))?/i);
  }
  /** UN SEUL montant dans le texte, sinon rien : « $29.99 - $38.99 » n'est pas un prix. */
  function amazonSingleAmount(value) {
    var raw = text(value);
    if (!raw || !CURRENCY_HINT.test(raw)) return '';
    var match = amazonFindAmount(raw);
    if (!match || !CURRENCY_HINT.test(match[0])) return '';
    var rest = raw.slice(0, match.index) + raw.slice(match.index + match[0].length);
    if (HAS_DIGIT.test(rest)) return '';
    return text(match[0]);
  }
  /**
   * Étiquette d'accessibilité Amazon : elle porte le prix en clair, et le mobile
   * y ajoute parfois un pourcentage (« $179.98 with 10 percent savings »).
   *
   * Règle : SEUL un suffixe de remise explicite est retiré. Tout autre nombre
   * dans l'étiquette la fait REJETER — une étiquette ambiguë n'est jamais un
   * prix. Et une étiquette ne publie jamais un prix toute seule : elle ne sert
   * qu'à corroborer le prix visible de la zone d'achat.
   */
  function amazonAccessibilityAmount(value) {
    var raw = text(value);
    if (!raw || !CURRENCY_HINT.test(raw)) return '';
    var plain = amazonSingleAmount(raw);
    if (plain) return plain;
    var match = amazonFindAmount(raw);
    if (!match || !CURRENCY_HINT.test(match[0])) return '';
    var prefix = raw.slice(0, match.index);
    var suffix = raw.slice(match.index + match[0].length);
    if (HAS_DIGIT.test(prefix)) return '';
    if (!/^\s*(?:with\s+)?\d{1,3}(?:[.,]\d+)?\s*(?:%|percent)\s+(?:savings|off|discount)\s*$/i.test(suffix)) return '';
    return text(match[0]);
  }
  /** Texte manifestement inutilisable : le MÊME motif écrit deux fois
      (« $6.99$6.99 », mesuré sur mobile le 06/10/2026). Le verdict complet
      (devise, bornes, séparateurs) reste celui du SERVEUR — ici on évite
      seulement d'envoyer une évidence déjà cassée. */
  function amazonPlausible(value) {
    var normalized = String(value || '').replace(/[\s\u00a0\u202f]+/g, '');
    if (!normalized) return false;
    if (/^(.{3,})\1$/.test(normalized)) return false;
    return true;
  }
  /** Tous les produits publiés (JSON-LD) — mode Amazon : on choisit par ASIN. */
  function collectProducts(node, depth, list) {
    depth = depth || 0;
    if (!node || depth > 6 || list.length > 8) return;
    if (Object.prototype.toString.call(node) === '[object Array]') {
      for (var i = 0; i < node.length; i++) collectProducts(node[i], depth + 1, list);
      return;
    }
    if (typeof node !== 'object') return;
    var type = node['@type'];
    var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
    for (var t = 0; t < types.length; t++) {
      if (String(types[t] || '').toLowerCase() === 'product') { list.push(node); break; }
    }
    var keys = ['@graph', 'mainEntity', 'itemListElement', 'item'];
    for (var k = 0; k < keys.length; k++) {
      if (node[keys[k]]) collectProducts(node[keys[k]], depth + 1, list);
    }
  }
  function amazonProductMatchesAsin(product) {
    if (!AMAZON_ASIN || !product) return false;
    var hay = [];
    var keys = ['sku', 'mpn', 'productID', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'asin', 'url', '@id'];
    for (var i = 0; i < keys.length; i++) { if (product[keys[i]]) hay.push(String(product[keys[i]])); }
    var offers = product.offers;
    var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
    for (var o = 0; o < list.length; o++) {
      var offer = list[o];
      if (!offer || typeof offer !== 'object') continue;
      if (offer.sku) hay.push(String(offer.sku));
      if (offer.url) hay.push(String(offer.url));
      if (offer['@id']) hay.push(String(offer['@id']));
    }
    return hay.join(' ').toUpperCase().indexOf(AMAZON_ASIN) >= 0;
  }
  /** Produit JSON-LD : celui de l'ASIN de la page ; sinon l'unique produit publié.
      Plusieurs produits et aucun ne porte l'ASIN ⇒ on ne choisit PAS. */
  function amazonPickProduct(products) {
    if (!products || !products.length) return null;
    if (AMAZON_ASIN) {
      for (var i = 0; i < products.length; i++) {
        if (amazonProductMatchesAsin(products[i])) return products[i];
      }
    }
    return products.length === 1 ? products[0] : null;
  }
  /** Offre exploitable : un «Offer» UNIQUE. «AggregateOffer» (plusieurs vendeurs,
      fourchette lowPrice/highPrice) et les tableaux de plusieurs offres sont
      REFUSÉS : ce n'est pas le prix de la zone d'achat. */
  function amazonOffer(product) {
    if (!product) return null;
    var offers = product.offers;
    var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
    var plain = [];
    for (var i = 0; i < list.length; i++) {
      var offer = list[i];
      if (!offer || typeof offer !== 'object') continue;
      var type = offer['@type'];
      var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
      var aggregate = false;
      for (var t = 0; t < types.length; t++) {
        if (/aggregateoffer/i.test(String(types[t] || ''))) aggregate = true;
      }
      if (aggregate) continue;
      plain.push(offer);
    }
    return plain.length === 1 ? plain[0] : null;
  }
  /** Disponibilité publiée par Amazon («#availability») — texte brut, borné. */
  function amazonAvailabilityText() {
    var selectors = [
      '#availability .primary-availability-message',
      '#availability_feature_div .primary-availability-message',
      '#availability',
      '#availability_feature_div .a-color-success',
      '#availability_feature_div .a-color-price',
      '#outOfStock'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = null;
      try { el = document.querySelector(selectors[i]); } catch (e) { continue; }
      var value = text(el && el.textContent);
      if (value && value.length <= LIMITS.text) return value;
    }
    return '';
  }

  function cleanCaptureUrl(rawHref) {
    var href = text(rawHref);
    if (!href) return '';
    if (href.length <= 500 && !IS_ALIEXPRESS) return cut(href, 600);
    /* Les URL AliExpress/SPA dépassent souvent 800–1400 caractères à cause de
       « pdp_npi », « pdp_ext_f », « utparam-url », « spm »… Une troncature brute à 600
       coupait au milieu d'un encodage « % » et perdait « sku_id » ou rendait l'URL
       différente de celle du WebView. On retire uniquement le bruit de suivi. */
    try {
      var hashPos = href.indexOf('#');
      var noHash = hashPos >= 0 ? href.slice(0, hashPos) : href;
      var qPos = noHash.indexOf('?');
      if (qPos < 0) return cut(noHash, 600);
      var basePart = noHash.slice(0, qPos);
      var queryPart = noHash.slice(qPos + 1);
      var dropKey = /^(?:utm_[^=]*|spm|scm|scm_id|scm-url|pvid|pdp_npi|pdp_ext_f|utparam-url|algo_pvid|algo_exp_id|curpageloguid|gatewayadapt|gps-id|btsid|ws_ab_test|_t|aff_fcid|aff_fsk|aff_platform|sk|aff_trace_key|terminal_id|afsmartredirect|sourcetype|channel|_randl_shipto|_evo_buckets|fbclid|gclid|srsltid)$/i;
      var parts = queryPart.split('&');
      var kept = [];
      for (var qp = 0; qp < parts.length; qp++) {
        var seg = parts[qp];
        if (!seg) continue;
        var eqIdx = seg.indexOf('=');
        var kName = eqIdx >= 0 ? seg.slice(0, eqIdx) : seg;
        if (dropKey.test(kName)) continue;
        kept.push(seg);
      }
      var rebuilt = kept.length ? (basePart + '?' + kept.join('&')) : basePart;
      return cut(rebuilt, 600);
    } catch (e) {
      return cut(href, 600);
    }
  }

  try { out.url = cleanCaptureUrl(location && location.href); } catch (e) { out.url = ''; }
  try { out.capturedAt = new Date().toISOString(); } catch (e) { out.capturedAt = null; }
  try { out.pageLang = cut(document.documentElement && document.documentElement.getAttribute('lang'), 20) || null; } catch (e) {}

  /* ── 1. JSON-LD : la seule donnée MACHINE publiée par le marchand ───────── */
  var jsonLd = null;
  var jsonProducts = [];
  try {
    var blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (var b = 0; b < blocks.length; b++) {
      var raw = blocks[b].textContent || '';
      if (!raw || raw.length > 400000) continue;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      if (AMAZON_STRICT) {
        collectProducts(parsed, 0, jsonProducts);
        if (jsonProducts.length > 8) break;
      } else if (!jsonLd) {
        jsonLd = findProduct(parsed);
      }
    }
  } catch (e) {}
  /* Amazon : le produit retenu est celui de l'ASIN affiché — pas « le premier
     produit de la page » (une fiche Amazon publie souvent le JSON-LD de plusieurs
     articles : accessoires, versions, publicités). */
  if (AMAZON_STRICT) jsonLd = amazonPickProduct(jsonProducts);

  function findProduct(node, depth) {
    depth = depth || 0;
    if (!node || depth > 6) return null;
    if (Object.prototype.toString.call(node) === '[object Array]') {
      for (var i = 0; i < node.length; i++) { var found = findProduct(node[i], depth + 1); if (found) return found; }
      return null;
    }
    if (typeof node !== 'object') return null;
    var type = node['@type'];
    var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
    for (var t = 0; t < types.length; t++) {
      /* « ProductGroup » est un produit PUBLIÉ (Zalando, SHEIN, TEMU) : le refuser
         revenait à ne rien lire du tout sur ces fiches. */
      var nodeType = String(types[t] || '').toLowerCase();
      if (nodeType === 'product' || nodeType === 'productgroup') return node;
    }
    var keys = ['@graph', 'mainEntity', 'itemListElement', 'item'];
    for (var k = 0; k < keys.length; k++) {
      if (node[keys[k]]) { var child = findProduct(node[keys[k]], depth + 1); if (child) return child; }
    }
    return null;
  }
  function firstOffer(product) {
    if (!product) return null;
    var offers = product.offers;
    if (Object.prototype.toString.call(offers) === '[object Array]') return offers[0] || null;
    if (offers && typeof offers === 'object') return offers;
    /* Groupe de variantes : le prix vit sur les VARIANTES («hasVariant[].offers«).
       On ne le prend que s'il désigne UN SEUL montant ; plusieurs prix différents
       ⇒ aucune offre (le serveur refusera la capture, ce qui est le but). */
    var variants = Object.prototype.toString.call(product.hasVariant) === '[object Array]'
      ? product.hasVariant : (product.hasVariant ? [product.hasVariant] : []);
    var collected = [];
    var amounts = [];
    for (var v = 0; v < variants.length && v < 120 && collected.length < 30; v++) {
      var variant = variants[v];
      if (!variant || typeof variant !== 'object') continue;
      var nested = Object.prototype.toString.call(variant.offers) === '[object Array]'
        ? variant.offers : (variant.offers ? [variant.offers] : []);
      for (var n = 0; n < nested.length && collected.length < 30; n++) {
        var nestedOffer = nested[n];
        if (!nestedOffer || typeof nestedOffer !== 'object') continue;
        if (/aggregateoffer/i.test(String(nestedOffer['@type'] || ''))) continue;
        collected.push(nestedOffer);
        var amount = String(nestedOffer.price === undefined || nestedOffer.price === null ? '' : nestedOffer.price);
        if (amount && amounts.indexOf(amount) < 0) amounts.push(amount);
      }
    }
    if (collected.length && amounts.length === 1) return collected[0];
    return null;
  }
  function offerField(offer, names) {
    if (!offer) return '';
    for (var i = 0; i < names.length; i++) {
      var value = offer[names[i]];
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        if (value.value !== undefined) return String(value.value);
        if (value.name !== undefined) return String(value.name);
        continue;
      }
      return String(value);
    }
    return '';
  }

  /* Amazon : seule une offre UNIQUE est exploitable (« amazonOffer » écarte
     « AggregateOffer » et les tableaux de plusieurs offres : ce n'est pas le prix
     de la zone d'achat). Hors Amazon, la première offre publiée reste la règle. */
  var offer = AMAZON_STRICT ? amazonOffer(jsonLd) : firstOffer(jsonLd);
  try {
    if (jsonLd) {
      out.title = cut(jsonLd.name, LIMITS.text) || out.title;
      var brand = jsonLd.brand;
      if (Object.prototype.toString.call(brand) === '[object Array]') brand = brand[0];
      if (brand && typeof brand === 'object') brand = brand.name;
      out.brand = cut(brand, 120) || null;
      var images = jsonLd.image;
      if (Object.prototype.toString.call(images) !== '[object Array]') images = images ? [images] : [];
      for (var im = 0; im < images.length && out.images.length < LIMITS.images; im++) {
        var src = images[im];
        if (src && typeof src === 'object') src = src.url || src.contentUrl;
        if (src && /^https?:\/\//i.test(String(src))) pushUnique(out.images, src, LIMITS.images, 600);
      }
    }
    if (offer) {
      var priceText = offerField(offer, ['price', 'lowPrice', 'highPrice']);
      var currencyText = offerField(offer, ['priceCurrency', 'currency']);
      if (priceText && HAS_DIGIT.test(priceText)) {
        out.priceCandidates.push({ text: cut(priceText + ' ' + currencyText, LIMITS.text), source: 'json_ld' });
      }
      if (currencyText) out.currencyText = cut(currencyText, LIMITS.label);
      var availability = offerField(offer, ['availability', 'inventoryLevel']);
      if (availability) out.availabilityText = cut(availability, LIMITS.text);
      var condition = offerField(offer, ['itemCondition', 'condition']);
      if (condition) out.conditionText = cut(condition, 120);
    }
  } catch (e) {}

  /* ── 2. Métat-données (Open Graph / product) — deuxième source ──────────── */
  try {
    var meta = function (selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) { var value = text(el.getAttribute('content')); if (value) return value; }
      }
      return '';
    };
    var metaPrice = meta(['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]']);
    var metaCurrency = meta(['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]', 'meta[itemprop="priceCurrency"]']);
    if (metaPrice && HAS_DIGIT.test(metaPrice)) {
      out.priceCandidates.push({ text: cut(metaPrice + ' ' + metaCurrency, LIMITS.text), source: 'meta' });
    }
    if (metaCurrency && !out.currencyText) out.currencyText = cut(metaCurrency, LIMITS.label);
    if (!out.title) out.title = cut(meta(['meta[property="og:title"]']), LIMITS.text) || null;
    var ogImage = meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    if (ogImage && /^\/\//.test(ogImage)) ogImage = 'https:' + ogImage;
    if (ogImage && /^https?:\/\//i.test(ogImage)) pushUnique(out.images, ogImage, LIMITS.images, 600);
    out.canonicalUrl = cut(meta(['meta[property="og:url"]']), 600) || null;
  } catch (e) {}

  try {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute('href')) out.canonicalUrl = cut(canonical.getAttribute('href'), 600);
  } catch (e) {}
  /* Amazon et SHEIN mobile («m.shein.com» -> «fr.shein.com» / «www.shein.com»)
     pointent parfois leur canonical vers un sous-domaine frère. Le crible serveur
     refuse toute capture dont le canonical change d'hôte (anti-usurpation). La
     fiche garde son identité propre (ASIN ou goods_id dans l'URL de la page).
     On ne transmet donc un canonical que s'il désigne le MÊME hôte. */
  if ((AMAZON_STRICT || IS_SHEIN || IS_ALIEXPRESS) && out.canonicalUrl) {
    try {
      var canonicalHost = String(new URL(out.canonicalUrl, location.href).hostname || '').toLowerCase().replace(/^(?:www|smile)\./, '');
      if (canonicalHost !== host) out.canonicalUrl = null;
    } catch (e) { out.canonicalUrl = null; }
  }

  /* ── 3. Microdonnées (schema.org itemprop) ─────────────────────────────── */
  try {
    var item = document.querySelector('[itemprop="price"]');
    if (item) {
      var itemPrice = text(item.getAttribute('content')) || text(item.textContent);
      var itemCurrency = '';
      var currencyEl = document.querySelector('[itemprop="priceCurrency"]');
      if (currencyEl) itemCurrency = text(currencyEl.getAttribute('content')) || text(currencyEl.textContent);
      if (itemPrice && HAS_DIGIT.test(itemPrice)) {
        out.priceCandidates.push({ text: cut(itemPrice + ' ' + itemCurrency, LIMITS.text), source: 'microdata' });
      }
      if (itemCurrency && !out.currencyText) out.currencyText = cut(itemCurrency, LIMITS.label);
    }
    var availabilityEl = document.querySelector('[itemprop="availability"]');
    if (availabilityEl && !out.availabilityText) {
      var availabilityText = text(availabilityEl.getAttribute('href')) || text(availabilityEl.getAttribute('content')) || text(availabilityEl.textContent);
      if (availabilityText) out.availabilityText = cut(availabilityText, LIMITS.text);
    }
  } catch (e) {}

  /* Amazon publie sa disponibilité en clair dans «#availability» (« In Stock »,
     « Currently unavailable »…) : c'est un TEXTE BRUT, que le vocabulaire fermé
     du serveur traduit. Elle compte surtout quand le bouton d'achat est
     désactivé — cas où aucun libellé d'achat n'est envoyé (voir §6). */
  if (AMAZON_STRICT && !out.availabilityText) {
    try {
      var amazonAvailability = amazonAvailabilityText();
      if (amazonAvailability) out.availabilityText = cut(amazonAvailability, LIMITS.text);
    } catch (e) {}
  }

  /* ── 4. DOM visible — dernier recours, borné ──────────────────────────────
     Deux pièges évités : (a) un texte SANS devise n'est pas retenu (les pages
     qui coupent le prix en deux spans donnent « 6 » tout seul — ce n'est pas un
     prix) ; (b) on lit au plus deux éléments, pour ne pas ramasser un prix de
     publicité ou de produit recommandé. */
  try {
    if (AMAZON_STRICT) {
      /* ── Zone d'achat SEULEMENT ─────────────────────────────────────────────
         Sélecteurs mesurés sur les fiches réelles des 04 et 06/10/2026. Aucun
         sélecteur large («.a-price») : deux prix de publicité sur la même page, et
         c'est le mauvais qui gagne. */
      /* Deux RANGS, et cette distinction a un sens mesuré (23/10/2026).
         Rang 1 = le prix VENDU de l'article (zone d'achat). Rang 2 = un montant
         ANNEXE de la même zone : « total avec livraison » (#tp_price_block…), qui
         diffère légitimement du prix de l'article. Compter les deux comme deux
         lectures « distinctes » faisait ABSTENIR le lecteur sur une fiche saine :
         aucune lecture publiée ⇒ capture refusée par le serveur ⇒ « nous n'avons
         pas pu lire le titre, le prix… ». Le rang 2 ne décide plus du prix ; il
         ne sert qu'au diagnostic. */
      var AMAZON_PRICE_SELECTORS = [
        ['#apex-pricetopay-accessibility-label', 1],
        ['#corePriceDisplay_desktop_feature_div .priceToPay', 1],
        ['#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)', 1],
        ['#corePrice_feature_div .a-price:not(.a-text-price)', 1],
        ['#corePrice_desktop .a-price:not(.a-text-price)', 1],
        ['#corePrice_mobile_feature_div .a-price:not(.a-text-price)', 1],
        ['#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price)', 1],
        ['#apex_desktop .a-price[data-a-color="base"]', 1],
        ['.priceToPay', 1],
        ['#price_inside_buybox', 1],
        ['#priceblock_ourprice', 1],
        ['#priceblock_dealprice', 1],
        ['#newBuyBoxPrice', 1],
        ['#buybox .a-price:not(.a-text-price)', 1],
        ['#desktop_buybox .a-price:not(.a-text-price)', 1],
        ['#mobile_buybox .a-price:not(.a-text-price)', 1],
        ['#tp_price_block_total_price_ww .a-offscreen', 2]
      ];
      var amazonReadings = [];
      var amazonNodes = [];
      var amazonSources = [];
      for (var s = 0; s < AMAZON_PRICE_SELECTORS.length && amazonReadings.length < 6; s++) {
        var selector = AMAZON_PRICE_SELECTORS[s][0];
        var tier = AMAZON_PRICE_SELECTORS[s][1];
        var nodes = [];
        try { nodes = document.querySelectorAll(selector); } catch (e) { continue; }
        for (var n = 0; n < nodes.length && amazonReadings.length < 6; n++) {
          var el = nodes[n];
          if (amazonNodes.indexOf(el) >= 0) continue;
          if (amazonBlocked(el)) continue;
          var elSource = amazonReadingSource(el);
          /* L'étiquette d'accessibilité est une CHAÎNE écrite par la page : elle
             peut contenir une remise. Elle n'est jamais publiée seule — sans un
             prix VISIBLE dans la zone d'achat, il n'y a pas de prix (une étiquette
             peut décrire un prix absent de l'écran). */
          var value = elSource === 'a11y_label' ? amazonAccessibilityAmount(text(el.textContent)) : amazonPriceText(el);
          if (!value || !HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value)) continue;
          if (value.length > LIMITS.text) continue;
          /* Le montant lu par le span peut encore être un texte collé
             (« $6.99$6.99 ») : le verdict de la Phase 0 est SERVEUR, mais on
             n'envoie pas un texte manifestement dupliqué. */
          if (!amazonPlausible(value)) continue;
          /* Une FOURCHETTE (« $29.99 - $38.99 ») ou un prix « à partir de » n'est
             pas un prix : c'est l'aveu que la page ne vend pas encore CETTE
             combinaison. On ne le publie jamais (le serveur le refuserait, à
             raison) ; on le DIT au client pour qu'il aille lire la fiche du
             choix. Mesuré sur les fiches à variantes (23/10/2026). */
          if (amazonAmountCount(value) > 1) { diag('price:range'); continue; }
          if (amazonFromPrice(el, value)) { diag('price:from'); continue; }
          if (tier === 2) { diag('price:annex_amount'); continue; }
          amazonNodes.push(el);
          amazonReadings.push(value);
          amazonSources.push(amazonReadingSource(el));
        }
      }
      var amazonDistinct = {};
      for (var d = 0; d < amazonReadings.length; d++) {
        amazonDistinct[amazonReadings[d].replace(/[\s\u00a0\u202f]+/g, '')] = true;
      }
      var amazonDistinctCount = 0;
      for (var key in amazonDistinct) { if (Object.prototype.hasOwnProperty.call(amazonDistinct, key)) amazonDistinctCount++; }
      /* Un seul montant distinct dans la zone d'achat ⇒ on publie UNE lecture PAR
         FAMILLE DE PREUVE (au plus deux) :
           • «a11y_label» — l'étiquette d'accessibilité d'Amazon, une CHAÎNE
             COMPLÈTE écrite par la page (« $109.00 ») ;
           • «dom» — le bloc de prix, reconstruit par NOUS depuis ses fragments
             (symbole + entier + décimale), et lu par le serveur.
         Deux familles d'accord = corroboration (le serveur l'exige pour les
         boutiques à motif d'URL, dont Amazon). Deux lectures de la MÊME famille
         ne seraient pas une preuve : une régression de reconstruction passerait
         pour confirmée. La corroboration ne remplace pas les gardes de zone
         d'achat (publicités exclues, panier d'achat d'un autre ASIN refusé) :
         elle vérifie seulement que le montant publié est lu deux fois pareil.
         Plus d'un montant distinct ⇒ ABSTENTION : la page a des prix
         concurrents, on ne choisit pas. */
      var buyboxMismatch = amazonBuyboxAsinMismatch();
      if (buyboxMismatch) diag('price:buybox_asin_mismatch');
      /* Plusieurs montants distincts dans la zone d'achat : abstention, motif explicite pour le serveur. */
      if (amazonDistinctCount > 1) diag('price:ambiguous_buybox:' + amazonDistinctCount);
      var visibleReading = false;
      for (var vr = 0; vr < amazonSources.length; vr++) {
        if (amazonSources[vr] !== 'a11y_label') { visibleReading = true; break; }
      }
      if (!visibleReading) {
        if (amazonReadings.length) diag('price:a11y_label_alone');
      }
      if (amazonDistinctCount === 1 && !buyboxMismatch && visibleReading) {
        var publishedFamilies = {};
        for (var fr = 0; fr < amazonReadings.length && out.priceCandidates.length < LIMITS.priceCandidates; fr++) {
          var family = amazonSources[fr] || 'dom';
          if (publishedFamilies[family]) continue;
          publishedFamilies[family] = true;
          out.priceCandidates.push({ text: cut(amazonReadings[fr], LIMITS.text), source: family });
        }
      }
      /* Source MACHINE d'Amazon : « "displayPrice":"$109.00" » dans les scripts de la
         page (mesuré le 04/10/2026, et lu par le lecteur serveur). Ce n'est PAS la
         même famille de preuve que le DOM : si elle désigne le même montant que la
         zone d'achat, elle la CORROBORE. Si elle désigne un autre montant, elle est
         aussi envoyée — le serveur voit alors deux sources en désaccord et refuse
         (ABSTENTION, jamais un choix). Elle n'est lue que si elle désigne UN seul
         montant : une page qui liste plusieurs prix (carrousels) n'en désigne aucun. */
      if (amazonDistinctCount === 1 && !buyboxMismatch) {
        try {
          var amzDisplay = [];
          var amzScripts = document.querySelectorAll('script:not([src])');
          for (var amzSc = 0; amzSc < amzScripts.length && amzSc < 80 && amzDisplay.length < 12; amzSc++) {
            var amzCode = amzScripts[amzSc].textContent || '';
            if (!amzCode || amzCode.length > 600000 || amzCode.indexOf('displayPrice') < 0) continue;
            var amzRe = /"displayPrice"\s*:\s*"([^"]{1,40})"/g;
            var amzHit = amzRe.exec(amzCode);
            while (amzHit && amzDisplay.length < 12) {
              amzDisplay.push(amzHit[1]);
              amzHit = amzRe.exec(amzCode);
            }
          }
          var amzAmounts = {};
          var amzAmountCount = 0;
          for (var amzA = 0; amzA < amzDisplay.length; amzA++) {
            var amzKey = amzDisplay[amzA].replace(/\D/g, '');
            if (!amzKey) continue;
            if (!amzAmounts[amzKey]) { amzAmounts[amzKey] = true; amzAmountCount++; }
          }
          if (amzAmountCount === 1) {
            var amzValue = '';
            for (var amzV = 0; amzV < amzDisplay.length && !amzValue; amzV++) {
              var amzCandidate = text(amzDisplay[amzV]);
              if (HAS_DIGIT.test(amzCandidate) && CURRENCY_HINT.test(amzCandidate) && amazonPlausible(amzCandidate)) amzValue = amzCandidate;
            }
            if (amzValue) out.priceCandidates.push({ text: cut(amzValue, LIMITS.text), source: 'embedded_json' });
          }
        } catch (e) {}
      }
    } else if (IS_SHEIN || IS_TEMU || IS_ALIEXPRESS || (READER_PROFILE && READER_PROFILE.priceMode === 'named_containers')) {
    /* SHEIN / TEMU / ALIEXPRESS : conteneurs NOMMÉS seulement, et UNANIMITÉ exigée. La
       lecture générique est volontairement sautée ici : sur ces pages, les
       carrousels de recommandation publient des dizaines de prix. */
    var scoped = storeScopedPrices();
    if (scoped.length === 1) {
      out.priceCandidates.push({ text: cut(scoped[0], LIMITS.text), source: 'dom' });
    } else if (scoped.length > 1) {
      diag('price:ambiguous_scope');
    } else {
      diag('price:no_named_container');
    }
    if (IS_SHEIN && scoped.length <= 1) {
      try {
        sheinEnsureState();
        if (SHEIN_STATE) {
          if (SHEIN_STATE.currency && !out.currencyText) out.currencyText = cut(SHEIN_STATE.currency, LIMITS.label);
          var sheinDomSelSize = sheinReadDomSelectedSize();
          var sheinActiveEmbPrice = '';
          if (sheinDomSelSize && SHEIN_STATE.sizes && SHEIN_STATE.sizes.length) {
            for (var ssIdx = 0; ssIdx < SHEIN_STATE.sizes.length; ssIdx++) {
              if (String(SHEIN_STATE.sizes[ssIdx].value || '').toLowerCase() === sheinDomSelSize.toLowerCase()) {
                if (SHEIN_STATE.sizes[ssIdx].price) sheinActiveEmbPrice = SHEIN_STATE.sizes[ssIdx].price;
                break;
              }
            }
          }
          if (!sheinActiveEmbPrice && SHEIN_STATE.salePrice) sheinActiveEmbPrice = SHEIN_STATE.salePrice;
          if (sheinActiveEmbPrice) {
            /* Si la taille active choisie par le client dans la SPA porte un prix
               SKU distinct du JSON-LD / meta statique initial (et que le DOM actif
               confirme ce prix SKU), on purge l'ancien candidat statique périmé. */
            var embAmount = sheinNumericAmount(sheinActiveEmbPrice);
            var domAmount = scoped.length === 1 ? sheinNumericAmount(scoped[0]) : null;
            if (embAmount !== null && domAmount !== null && Math.abs(embAmount - domAmount) <= 0.02) {
              var freshCandidates = [];
              for (var pcIdx = 0; pcIdx < out.priceCandidates.length; pcIdx++) {
                var pc = out.priceCandidates[pcIdx];
                if (pc && (pc.source === 'json_ld' || pc.source === 'meta' || pc.source === 'microdata')) {
                  var pcAmount = sheinNumericAmount(pc.text);
                  if (pcAmount !== null && Math.abs(pcAmount - embAmount) > 0.02) continue;
                }
                freshCandidates.push(pc);
              }
              out.priceCandidates = freshCandidates;
            }
            out.priceCandidates.push({ text: cut(sheinActiveEmbPrice, LIMITS.text), source: 'embedded_json' });
          }
        }
      } catch (e) {}
    }
    if (IS_ALIEXPRESS) {
      try {
        aeEnsureState();
        if (ALIEXPRESS_STATE) {
          if (ALIEXPRESS_STATE.currency && !out.currencyText) out.currencyText = cut(ALIEXPRESS_STATE.currency, LIMITS.label);
          var aeDomMap = aeReadDomSelectionMap();
          var aeActiveSku = aeFindMatchingSku(ALIEXPRESS_STATE, aeDomMap);
          var aeActiveEmbPrice = (aeActiveSku && aeActiveSku.price) ? aeActiveSku.price : (ALIEXPRESS_STATE.salePrice || '');
          if (aeActiveEmbPrice) {
            var aeEmbAmt = sheinNumericAmount(aeActiveEmbPrice);
            var aeDomAmt = scoped.length === 1 ? sheinNumericAmount(scoped[0]) : null;
            if (aeEmbAmt !== null && aeDomAmt !== null && Math.abs(aeEmbAmt - aeDomAmt) <= 0.02) {
              var aeFreshCandidates = [];
              for (var aePc = 0; aePc < out.priceCandidates.length; aePc++) {
                var aeCand = out.priceCandidates[aePc];
                if (aeCand && (aeCand.source === 'json_ld' || aeCand.source === 'meta' || aeCand.source === 'microdata')) {
                  var aeCandAmt = sheinNumericAmount(aeCand.text);
                  if (aeCandAmt !== null && Math.abs(aeCandAmt - aeEmbAmt) > 0.02) continue;
                }
                aeFreshCandidates.push(aeCand);
              }
              out.priceCandidates = aeFreshCandidates;
            }
            out.priceCandidates.push({ text: cut(aeActiveEmbPrice, LIMITS.text), source: 'embedded_json' });
          }
        }
      } catch (e) {}
    }
    } else if (READER_PROFILE && READER_PROFILE.priceMode === 'structured_only') {
    /* Le lecteur de ce marchand n'a pas encore de sélecteurs DOM vérifiés.
       JSON-LD / meta / microdata ont déjà été lus plus haut ; ici on s'abstient
       plutôt que de ramasser un prix de carte recommandée. */
    if (!out.priceCandidates.length) diag('price:structured_only_no_candidate');
    } else if (!IS_AMAZON) {
    /* Hors Amazon seulement : sur amazon.* la lecture générique ramasserait des prix de publicité. Le PANIER D'ACHAT d'abord : les sélecteurs de bloc d'achat des grandes
       plateformes (Amazon, Shopify, WooCommerce) désignent le prix VENDU, pas
       un prix de publicité ou d'un article recommandé — c'est précisément le
       piège mesuré le 06/10 (deux candidats « dom » à 6,99 et 263,86 sur la
       même page Amazon). Les sélecteurs génériques viennent après. */
    var selectors = [
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#corePrice_feature_div .a-offscreen',
      '#price_inside_buybox',
      '#priceblock_ourprice, #priceblock_dealprice',
      '.a-price .a-offscreen',
      '[data-testid*="price" i]',
      '[data-price]',
      '.product-price, .price-value, .price__value, .product__price, .price-current',
      '[class*="price" i] [class*="offscreen" i]'
    ];
    var taken = 0;
    for (var s = 0; s < selectors.length && taken < 2; s++) {
      var nodes = [];
      try { nodes = document.querySelectorAll(selectors[s]); } catch (e) { continue; }
      for (var n = 0; n < nodes.length && taken < 2; n++) {
        var el = nodes[n];
        var value = text(el.getAttribute && el.getAttribute('data-price')) || text(el.textContent);
        if (!value || !HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value)) continue;
        if (value.length > LIMITS.text) continue;
        out.priceCandidates.push({ text: cut(value, LIMITS.text), source: 'dom' });
        taken++;
      }
    }
    }
  } catch (e) {}

  /* ── 5. Devise : sources STRUCTURELLES uniquement ─────────────────────────
     Une version antérieure lisait « la première classe qui contient currency » :
     mesuré le 06/10/2026 sur une fiche amazon.de en euros, elle a rapporté
     « USD » (widget de préférence de devise) — une devise FAUSSE présentée avec
     l'autorité d'une lecture. Seules les sources publiées par le marchand
     (JSON-LD, meta, microdonnées) comptent ; sinon la devise reste inconnue et
     le serveur refusera de publier un devis (il relira la page lui-même). */

  /* ── 6. Bouton d'achat : libellé ET état (désactivé = pas de stock prouvé) ─ */
  try {
    /* Libellés d'achat, plusieurs langues. Le panier doit être nommé : « Add »
       tout court peut être « Add to wishlist », et un bouton de liste d'envies
       ne prouve aucun stock. */
    var ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|in\s*(?:den\s*warenkorb|die\s*einkaufstasche)|ajouter(?:\s+(?:au\s+)?(?:panier|sac)|\s+le\s+produit)?|acheter|aggiungi(?:\s+(?:al\s+carrello|alla\s+borsa))?|a(?:ñ|n)adir(?:\s+(?:a\s+la\s+|al\s+)?(?:cesta|carrito|bolsa))?|أضف\s*إلى\s*(?:السلة|العربة|الحقيبة|حقيبة\s*التسوق)|إضافة\s*إلى\s*(?:السلة|العربة|الحقيبة)|أضف\s*للسلة|اشترِ?\s*(?:الآن)?/i;
    var NOT_ADD_TEXT = /wish\s*list|wishlist|favoris|favorites|liste\s+d'envies|merkliste|envies/i;
    var SHEIN_SOLD_OUT_TEXT = /\b(sold\s*out|out\s*of\s*stock|épuisé|epuise|rupture(?:\s*de\s*stock)?|indisponible|ausverkauft|nicht\s*auf\s*lager|agotado|sin\s*existencias|esaurito|non\s*disponibile)\b|نفدت\s*الكمية|غير\s*متوفر/i;
    if (AMAZON_STRICT) {
      /* Correction du 07/10/2026 : un contrôle d'achat DÉSACTIVÉ ne publie RIEN.
         Son libellé dit « Add to Cart » — un texte qui, lu seul, prouverait un
         stock qui n'existe pas. L'état vient de «#availability» ou du JSON-LD,
         jamais d'un bouton qu'on ne peut pas utiliser. */
      var amazonControls = document.querySelectorAll('#add-to-cart-button, input[name="submit.add-to-cart"], #buy-now-button, #buybox button, #buybox input[type="submit"], #desktop_buybox button, #desktop_buybox input[type="submit"], button, input[type="submit"], input[type="button"]');
      for (var i3 = 0; i3 < amazonControls.length && !out.addToCartText; i3++) {
        var amazonControl = amazonControls[i3];
        if (isInNavigation(amazonControl)) continue;
        var amazonLabel = text(amazonControl.value) || text(amazonControl.textContent) || text(amazonControl.getAttribute && amazonControl.getAttribute('aria-label'));
        if (!amazonLabel || !ADD_TEXT.test(amazonLabel) || NOT_ADD_TEXT.test(amazonLabel)) continue;
        amazonLabel = text(amazonLabel.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
        if (!amazonLabel) continue;
        var amazonDisabled = amazonControl.disabled === true
          || (amazonControl.getAttribute && (amazonControl.getAttribute('aria-disabled') === 'true' || amazonControl.getAttribute('disabled') !== null));
        if (amazonDisabled) continue;
        out.addToCartText = cut(amazonLabel, LIMITS.text);
      }
    } else if (IS_SHEIN) {
      var sheinControls = document.querySelectorAll('.product-intro__add-btn button, .product-intro__add-btn [role="button"], .product-intro__add-btn, .goods-btn__add button, .goods-btn__add, [data-testid*="add-to-bag" i], [data-testid*="add-to-cart" i], button, [role="button"], input[type="submit"], input[type="button"]');
      for (var sCtrl = 0; sCtrl < sheinControls.length && !out.addToCartText; sCtrl++) {
        var sBtn = sheinControls[sCtrl];
        if (isInNavigation(sBtn) || sheinBlocked(sBtn)) continue;
        var sLabel = text(sBtn.value) || text(sBtn.textContent) || text(sBtn.getAttribute && sBtn.getAttribute('aria-label'));
        if (!sLabel || sLabel.length > 90 || NOT_ADD_TEXT.test(sLabel)) continue;
        var sClass = String(sBtn.className || '');
        var sDisabled = sBtn.disabled === true
          || (sBtn.getAttribute && (sBtn.getAttribute('aria-disabled') === 'true' || sBtn.getAttribute('disabled') !== null))
          || /(?:^|[\s_-])(disabled|soldout|sold-out|is-disabled)(?:$|[\s_-])/i.test(sClass);
        if (SHEIN_SOLD_OUT_TEXT.test(sLabel)) {
          if (!out.availabilityText) out.availabilityText = cut(sLabel, LIMITS.text);
          continue;
        }
        if (!ADD_TEXT.test(sLabel) || sDisabled) continue;
        out.addToCartText = cut(sLabel, LIMITS.text);
      }
      if (!out.availabilityText) {
        var sheinSoldNodes = document.querySelectorAll('.product-intro__soldout, .goods-soldout, [class*="product-intro__soldout" i], [class*="goods-soldout" i], [data-testid*="sold-out" i]');
        for (var sSold = 0; sSold < sheinSoldNodes.length && !out.availabilityText; sSold++) {
          if (sheinBlocked(sheinSoldNodes[sSold])) continue;
          var sSoldTxt = text(sheinSoldNodes[sSold].textContent);
          if (sSoldTxt && SHEIN_SOLD_OUT_TEXT.test(sSoldTxt)) out.availabilityText = cut(sSoldTxt, LIMITS.text);
        }
      }
    } else if (IS_ALIEXPRESS) {
      var AE_CANNOT_SHIP = /can'?t\s+ship\s+to|cannot\s+be\s+shipped|does\s+not\s+ship|livraison\s+indisponible|ne\s+peut\s+pas\s+être\s+livr|no\s+se\s+puede\s+enviar|لا\s*يمكن\s*الشحن/i;
      var aeControls = document.querySelectorAll('[data-pl="product-action"] button, [class*="action--sticky" i] button, .product-action button, [class*="add-to-cart" i], [data-testid*="add-to-cart" i], button, [role="button"], input[type="submit"], input[type="button"]');
      for (var aeCtrl = 0; aeCtrl < aeControls.length && !out.addToCartText; aeCtrl++) {
        var aeBtn = aeControls[aeCtrl];
        if (isInNavigation(aeBtn) || aeBlocked(aeBtn)) continue;
        var aeLabel = text(aeBtn.value) || text(aeBtn.textContent) || text(aeBtn.getAttribute && aeBtn.getAttribute('aria-label'));
        if (!aeLabel || aeLabel.length > 90 || NOT_ADD_TEXT.test(aeLabel)) continue;
        var aeCls = String(aeBtn.className || '');
        var aeDisabled = aeBtn.disabled === true
          || (aeBtn.getAttribute && (aeBtn.getAttribute('aria-disabled') === 'true' || aeBtn.getAttribute('disabled') !== null))
          || /(?:^|[\s_-])(disabled|soldout|sold-out|is-disabled|comet-v2-btn-disabled)(?:$|[\s_-])/i.test(aeCls);
        if (SHEIN_SOLD_OUT_TEXT.test(aeLabel) || AE_CANNOT_SHIP.test(aeLabel)) {
          if (!out.availabilityText) out.availabilityText = cut(aeLabel, LIMITS.text);
          continue;
        }
        if (!ADD_TEXT.test(aeLabel) || aeDisabled) continue;
        out.addToCartText = cut(aeLabel, LIMITS.text);
      }
      if (!out.availabilityText) {
        var aeQtyNodes = document.querySelectorAll('[data-pl="product-quantity"], .product-quantity-tip, [class*="quantity--info" i], [class*="stock-status" i], [class*="sold-out" i], [data-testid*="availability" i]');
        for (var aeq = 0; aeq < aeQtyNodes.length && !out.availabilityText; aeq++) {
          if (aeBlocked(aeQtyNodes[aeq])) continue;
          var aeqTxt = text(aeQtyNodes[aeq].textContent);
          if (!aeqTxt || aeqTxt.length > 140) continue;
          if (SHEIN_SOLD_OUT_TEXT.test(aeqTxt) || AE_CANNOT_SHIP.test(aeqTxt)) {
            out.availabilityText = 'Out of Stock';
          } else if (/\b\d+\s*(?:pieces?|pcs|pi[eè]ces?|unidades?|pe[cç]as?|stück|قطعة|قطع|حبة)\s*(?:available|disponibles?|dispon[ií]ve(?:l|is)|verfügbar|متوفرة?)?\b/i.test(aeqTxt)
            || /only\s*\d+\s*left|plus\s*que\s*\d+|بقي\s*\d+/i.test(aeqTxt)) {
            out.availabilityText = cut(aeqTxt, LIMITS.text);
          }
        }
      }
    } else {
    var controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]');
    for (var i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
      var control = controls[i2];
      var label = text(control.value) || text(control.textContent) || text(control.getAttribute && control.getAttribute('aria-label'));
      if (!label || !ADD_TEXT.test(label) || NOT_ADD_TEXT.test(label)) continue;
      /* « Add to basket shift + ALT + K » est un libellé d'accessibilité, pas un
         bouton : le raccourci clavier est retiré, et un libellé qui n'est QUE
         cela est écarté (mesuré le 06/10/2026 sur une page amazon.de rendue). */
      label = text(label.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
      if (!label) continue;
      var disabled = control.disabled === true
        || (control.getAttribute && (control.getAttribute('aria-disabled') === 'true' || control.getAttribute('disabled') !== null));
      out.addToCartText = cut(label + (disabled ? ' [disabled]' : ''), LIMITS.text);
    }
    }
  } catch (e) {}

  /* ── 7. Options : ce qui est AFFICHÉ comme choisi, et ce qui est publié ──── */
  /* Éléments de type OPTION seulement, hors navigation et hors recherche :
     mesuré le 06/10/2026, un sélecteur trop large rapportait « All Departments »
     et « Search Amazon » comme options de produit. Un libellé de barre de
     recherche n'est pas un choix de produit. */
  var NOT_A_CHOICE = /^(select|choose|choisir|sélectionner|please|اختر|--)|search|department|store name|catégorie|category/i;
  /* Actions et liens d'aide : ce ne sont PAS des valeurs de variante. Mesuré le
     26/10/2026 sur une fiche Zalando : le lien « Taille & coupe » et le bouton
     « Ajouter au panier » se retrouvaient dans la liste des TAILLES, et la
     feuille du client affichait « Taille : Taille & coupe ». */
  var ACTION_NOT_A_VALUE = /^(?:add|ajouter|acheter|buy|commander|checkout|panier|cart|sac|bag|wishlist|favoris|partager|share|guide|voir|see|learn|en\s+savoir\s+plus|taille\s*(?:&|et|\+)\s*coupe|size\s*(?:&|and|\+)\s*fit|size\s*guide|guide\s*des\s*tailles)\b/i;

  try {
    var selected = document.querySelectorAll('select option:checked, [role="option"][aria-selected="true"], [aria-checked="true"]');
    for (var v = 0; v < selected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; v++) {
      var option = selected[v];
      if (isInNavigation(option)) continue;
      /* Une CARTE de variante (li aria-checked) contient son prix et son stock :
         son texte entier n'est pas un libellé. L'image porte le nom. */
      var optionImg = option.querySelector && option.querySelector('img[alt]');
      var optionText = text(option.getAttribute && option.getAttribute('title'))
        || text(option.getAttribute && option.getAttribute('aria-label'))
        || text(optionImg && optionImg.getAttribute('alt'))
        || text(option.textContent);
      if (!optionText || optionText.length > LIMITS.label) continue;
      if (NOT_A_CHOICE.test(optionText)) continue;
      pushUnique(out.selectedVariantTexts, optionText, LIMITS.selectedTexts, LIMITS.label);
    }
    /* Les pastilles de variante « déjà choisies » (couleur/taille) ne portent pas
       toujours aria-checked : on accepte la classe « selected », mais seulement
       à l'intérieur d'un conteneur qui parle de variante. */
    var swatchSelected = document.querySelectorAll('[class*="selected" i]');
    for (var w = 0; w < swatchSelected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; w++) {
      var swatch = swatchSelected[w];
      if (isInNavigation(swatch)) continue;
      var context = swatch;
      var inVariants = false;
      for (var hop = 0; context && hop < 5; hop++) {
        var descriptor = String((context.id || '') + ' ' + (context.className || '')).toLowerCase();
        if (/variation|variant|swatch|twister|option|taille|size|color|couleur/.test(descriptor)) { inVariants = true; break; }
        context = context.parentNode;
      }
      if (!inVariants) continue;
      var swatchText = text(swatch.getAttribute && swatch.getAttribute('title')) || text(swatch.textContent) || text(swatch.getAttribute && swatch.getAttribute('aria-label'));
      if (!swatchText || swatchText.length > LIMITS.label || NOT_A_CHOICE.test(swatchText)) continue;
      pushUnique(out.selectedVariantTexts, swatchText, LIMITS.selectedTexts, LIMITS.label);
    }
  } catch (e) {}

  try {
    var options = document.querySelectorAll('select option, [role="option"], [role="radio"]');
    for (var o = 0; o < options.length && out.variantTexts.length < LIMITS.variantTexts; o++) {
      if (isInNavigation(options[o])) continue;
      var candidate = text(options[o].textContent) || text(options[o].getAttribute && options[o].getAttribute('aria-label'));
      if (!candidate || candidate.length > LIMITS.label) continue;
      if (NOT_A_CHOICE.test(candidate)) continue;
      pushUnique(out.variantTexts, candidate, LIMITS.variantTexts, LIMITS.label);
    }
  } catch (e) {}

  /* ── 7 bis. Amazon : le twister (pastilles couleur, taille, modèle) ───────
     Amazon ne met pas ses options dans un <select> mais dans des blocs
     «#variation_<dimension>_name» : la valeur CHOISIE est affichée dans «.selection»,
     les autres pastilles portent leur nom en «img[alt]» ou «li[title]». Sans cette
     lecture, une fiche à couleur + taille ne publie aucune option choisie, et le
     serveur ne peut pas vérifier la combinaison que le client a sélectionnée. */
  if (AMAZON_STRICT) {
    try {
      var twisterBlocks = document.querySelectorAll('[id^="variation_"][id$="_name"], #twister');
      for (var tb = 0; tb < twisterBlocks.length && tb < 12; tb++) {
        var twisterBlock = twisterBlocks[tb];
        if (isInNavigation(twisterBlock)) continue;
        var chosenNodes = twisterBlock.querySelectorAll('.selection, .a-button-selected img[alt], li.swatchSelect img[alt], li.swatchSelect[title]');
        for (var tc = 0; tc < chosenNodes.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; tc++) {
          var chosenNode = chosenNodes[tc];
          var chosenText = text(chosenNode.getAttribute && (chosenNode.getAttribute('alt') || chosenNode.getAttribute('title'))) || text(chosenNode.textContent);
          chosenText = text(String(chosenText).replace(/^click to select\s*/i, ''));
          if (!chosenText || chosenText.length > LIMITS.label || NOT_A_CHOICE.test(chosenText)) continue;
          pushUnique(out.selectedVariantTexts, chosenText, LIMITS.selectedTexts, LIMITS.label);
        }
        var twisterOptions = twisterBlock.querySelectorAll('li img[alt], li[title], select option');
        for (var to = 0; to < twisterOptions.length && out.variantTexts.length < LIMITS.variantTexts; to++) {
          var optionNode = twisterOptions[to];
          var optionLabel = text(optionNode.getAttribute && (optionNode.getAttribute('alt') || optionNode.getAttribute('title'))) || text(optionNode.textContent);
          optionLabel = text(String(optionLabel).replace(/^click to select\s*/i, ''));
          if (!optionLabel || optionLabel.length > LIMITS.label || NOT_A_CHOICE.test(optionLabel)) continue;
          pushUnique(out.variantTexts, optionLabel, LIMITS.variantTexts, LIMITS.label);
        }
      }
    } catch (e) {}
  }

  /* ── 7 ter. GROUPES DE VARIANTES (hors Amazon) — 23/10/2026 ───────────────
     Les boutiques du catalogue (vague 1) n'ont pas d'adaptateur : c'est cette
     lecture qui remplit la FEUILLE DE CHOIX. On lit des GROUPES nommés — le nom
     vient d'un <legend>, d'un <label for>, d'un aria-label ou du name du champ —
     et les VALEURS telles qu'affichées, plus celle qui est CHOISIE.

     Bornes et refus, dans l'esprit du reste du script :
       • 4 groupes, 20 valeurs par groupe, 60 caractères par libellé ;
       • un <select> à une seule option n'est pas un choix (quantité, tri) ;
       • les valeurs d'index (« 0 », « 1 ») et les libellés de navigation sont
         écartés : un indice n'est jamais un nom d'option ;
       • aucun clic, aucune requête : uniquement ce que la page affiche. */
  /* Noms de groupes qui ne sont JAMAIS des variantes de produit : tri, quantité,
     filtre, langue… Les publier ferait envoyer une valeur que la page n'affiche
     pas comme choix, et le serveur refuserait l'ajout (« sélection non prouvée »)
     pour une raison qui n'a rien à voir avec le produit. */
  var NOT_A_VARIANT_GROUP = /^(sort|sort by|sortby|trier|tri|order by|orderby|quantit\w*|quantity|qty|nombre|view|view by|affichage|filter|filtre|page|pages|lang|langue|language|devise|currency|pays|country|region|région|per page|items per page|afficher)\b/i;
  /* ── Libellés d'INTERFACE : jamais des valeurs (28/10/2026) ──────────────
     Fiche Zalando mesurée dans l'application : la feuille d'ajout n'offrait que
     « Taille » et « Votre taille », sans aucune pointure ni couleur. Le
     sélecteur de taille de la page contient deux boutons d'interface — le nom
     du groupe répété (« Taille ») et la recommandation (« Votre taille ») — et
     ces deux textes étaient publiés comme les deux VALEURS du groupe. Comme ce
     groupe portait déjà la dimension TAILLE, il masquait les vraies pointures
     du ProductGroup (ldGroupAlreadyCovered) : le client perdait tailles ET
     couleurs, et l'ajout échouait (« le marchand ne publie pas le stock »).

     Deux règles, aucune invention :
       • une valeur identique au NOM du groupe n'est pas une valeur ;
       • les libellés d'aide/recommandation connus (guide des tailles,
         « votre taille », « sélectionnez… », « toutes les couleurs ») non plus.
     Après ce crible, un groupe de moins de deux valeurs n'est pas un choix. */
  var UI_NOT_A_VALUE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|размер|مقاس)|(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e)\s*(?:&|et|\+)\s*(?:coupe|fit)|(?:size|taille|talla)\s*guide|guide\s+des\s+tailles|guía\s+de\s+tallas|gr(?:ö|oe)(?:ß|ss)entabelle|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|(?:todas\s+las\s+)?colores|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;
  /** Clé de comparaison d'un libellé : casse, espaces, ponctuation de fin. */
  function ciKey(value) {
    return text(String(value === null || value === undefined ? '' : value))
      .toLowerCase()
      .replace(/[\u2018\u2019\u02bc\u0060]/g, "'")
      .replace(/\s*[:*·•-]+\s*$/, '')
      .replace(/\s+/g, ' ');
  }
  /**
   * Prix écrit SUR une valeur (« 88,00 € », « 12,95 € TVA incluse »).
   *
   * On ne compose rien : on prend le texte de l'élément de prix s'il existe,
   * sinon la première séquence « nombre + devise » du libellé. Un texte sans
   * devise ou sans chiffre n'est pas un prix.
   */
  function priceOnValue(node) {
    if (!node) return '';
    try {
      var priceNodes = node.querySelectorAll('[class*="price" i], [data-testid*="price" i], [itemprop="price"]');
      for (var pn = 0; pn < priceNodes.length && pn < 3; pn++) {
        var priceText = text(priceNodes[pn].getAttribute && priceNodes[pn].getAttribute('content')) || text(priceNodes[pn].textContent);
        if (priceText && HAS_DIGIT.test(priceText) && CURRENCY_HINT.test(priceText)) return cut(priceText, LIMITS.label);
      }
    } catch (e) {}
    var raw = text(node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || text(node.textContent);
    if (!raw || raw.length > 120) return '';
    var match = /([0-9][0-9\s.,\u00a0]*)\s*([$\u20ac\u00a3\u00a5]|\b(?:EUR|USD|GBP|TND|DT|MAD|AED|SAR)\b|\bd\.?t\b)/i.exec(raw);
    return match ? cut(match[0], LIMITS.label) : '';
  }
  /* Le libellé d'une pastille contient souvent son prix (« 150 ml 12,95 € »).
     On retire le prix du libellé quand on le publie à part — sinon la feuille
     l'écrirait deux fois. */
  function labelWithoutPrice(label, price) {
    if (!label || !price) return label;
    if (label.indexOf(price) < 0) return label;
    return text(label.replace(price, ' '));
  }
  /* « à partir de 56,32 $ » : le prix n'est pas encore celui de la valeur. */
  function isFromPrice(node) {
    var raw = text(node && node.textContent);
    return /\bfrom\b|\bà\s+partir\s+de\b|\bab\s|\bstart(?:ing)?\s+(?:at|from)\b/i.test(raw);
  }
  /* État publié pour UNE valeur : false seulement si la page la désactive. */
  function valueAvailability(node) {
    if (!node) return null;
    if (node.disabled === true) return false;
    var ariaDisabled = node.getAttribute && node.getAttribute('aria-disabled');
    if (ariaDisabled === 'true') return false;
    var descriptor = String((node.className && String(node.className)) || '');
    var dataState = (node.getAttribute && (node.getAttribute('data-state') || node.getAttribute('data-availability'))) || '';
    if (/disabled|unavailable|out[-_ ]?of[-_ ]?stock|sold[-_ ]?out|rupture|epuise/i.test(descriptor + ' ' + String(dataState))) return false;
    return null;
  }
  /* Doublon EXACT (casse ignoree). Un test en sous-chaine (indexOf sur un
     join) supprimait a tort une valeur reelle : « S » etait jugee duplicate de
     « XS », donc une taille valide disparaissait de la feuille. */
  function ciExactContains(list, candidate) {
    var needle = String(candidate === null || candidate === undefined ? '' : candidate).toLowerCase();
    for (var ci = 0; ci < list.length; ci++) {
      if (String(list[ci]).toLowerCase() === needle) return true;
    }
    return false;
  }
  function pushVariantGroup(name, values, selected, options) {
    if (!name || !values.length) return;
    var label = cut(name, LIMITS.label);
    if (!label || NOT_A_CHOICE.test(label) || NOT_A_VARIANT_GROUP.test(label)) return;
    /* Le NOM du groupe n'est pas une de ses valeurs, et les libellés
       d'interface n'en sont pas non plus (voir UI_NOT_A_VALUE). Sans ce
       crible, « Taille » et « Votre taille » devenaient les deux tailles du
       produit et masquaient les vraies pointures lues dans le ProductGroup. */
    var groupKey = ciKey(label);
    var keptValues = [];
    for (var kv = 0; kv < values.length; kv++) {
      var candidateValue = text(values[kv]);
      if (!candidateValue) continue;
      if (ciKey(candidateValue) === groupKey) continue;
      if (UI_NOT_A_VALUE.test(candidateValue)) continue;
      if (ciExactContains(keptValues, candidateValue)) continue;
      keptValues.push(candidateValue);
    }
    /* Moins de deux valeurs distinctes = pas un choix (un groupe d'une seule
       valeur forcerait une sélection que la page n'offre pas). */
    if (keptValues.length < 2) return;
    values = keptValues;
    /* La sélection publiée ne peut porter que des valeurs retenues. */
    var keptSelected = [];
    for (var ks = 0; ks < (selected || []).length; ks++) {
      if (ciExactContains(values, selected[ks])) keptSelected.push(selected[ks]);
    }
    selected = keptSelected;
    /* Options TELLES QUE LUES, avant tout crible : la fusion avec le JSON-LD se
       fait après la boucle DOM et a besoin des valeurs que le DOM a nommées sans
       rien publier (une pointure désactivée n'a ni prix ni état). */
    DOM_OPTIONS[label.toLowerCase()] = (options || []).slice();
    /* Le DOM nomme les valeurs et dit laquelle est cochée ; le JSON-LD apporte ce
       que le DOM ne publie pas (prix / état par taille). La fusion se fait APRÈS
       la boucle DOM (voir plus bas) : la couleur affichée, qui décide quelles
       variantes prouvent quelque chose, n'est connue qu'à ce moment-là. */
    /* On publie TOUJOURS les choix que la page presente (au moins 2 valeurs
       distinctes), meme sans selection reperee : sans eux, la feuille mobile
       n'offrait aucune taille/couleur (cas Zalando, choix en input checkbox dans
       un label). L'integrite ne depend pas de cette presence : selected reste
       vide quand rien n'est prouve, donc aucune combinaison courante n'est
       affirmee a tort. Le serveur ne tire une preuve que des options/selected. */
    for (var g = 0; g < out.variantGroups.length; g++) {
      if (out.variantGroups[g].name.toLowerCase() === label.toLowerCase()) return;
    }
    if (out.variantGroups.length >= LIMITS.variantGroups) return;
    var publishedValues = values.slice(0, LIMITS.variantValues);
    var publishedOptions = [];
    if (options && options.length) {
      for (var po = 0; po < options.length && publishedOptions.length < LIMITS.variantValues; po++) {
        var option = options[po];
        if (!option || !option.value) continue;
        var known = false;
        for (var pv = 0; pv < publishedValues.length; pv++) {
          if (publishedValues[pv].toLowerCase() === String(option.value).toLowerCase()) { known = true; break; }
        }
        if (!known) continue;
        var optionPrice = option.price ? cut(option.price, LIMITS.label) : null;
        var optionState = option.available === true ? true : option.available === false ? false : null;
        var optionStock = typeof option.stock === 'number' && option.stock > 0 && option.stock <= 999 ? option.stock : null;
        var optionImage = option.image && /^https?:\/\//i.test(String(option.image)) ? cut(option.image, 600) : null;
        var optionGoodsId = option.goodsId && /^\d{5,16}$/.test(String(option.goodsId)) ? String(option.goodsId) : null;
        var optionSkuId = option.skuId && /^\d{5,24}$/.test(String(option.skuId)) ? String(option.skuId) : null;
        /* Rien de publié pour cette valeur (ni état, ni prix, ni stock, ni vignette/goodsId/skuId) = pas de
           ligne. Un état « inconnu » n'est pas un fait : le publier encombrerait
           la capture sans rien prouver. */
        if (optionState === null && !optionPrice && optionStock === null && !optionImage && !optionGoodsId && !optionSkuId) continue;
        var publishedItem = {
          value: cut(option.value, LIMITS.label),
          available: optionState,
          price: optionPrice,
          priceFrom: option.priceFrom === true,
          stock: optionStock,
        };
        if (optionImage) publishedItem.image = optionImage;
        if (optionGoodsId) publishedItem.goodsId = optionGoodsId;
        if (optionSkuId) publishedItem.skuId = optionSkuId;
        publishedOptions.push(publishedItem);
      }
    }
    var groupEntry = {
      name: label,
      values: publishedValues,
      selected: selected.slice(0, LIMITS.variantValues),
    };
    /* Absent quand la page ne publie rien de plus que les libellés : un tableau
       vide ferait croire à une lecture qui n'a rien trouvé. */
    if (publishedOptions.length) groupEntry.options = publishedOptions;
    out.variantGroups.push(groupEntry);
    /* La valeur affichée entre dans l'ÉVIDENCE des options choisies : le serveur
       vérifie que la combinaison demandée a bien été VUE sur la page, et les
       boutons radio natifs n'ont pas d'aria-checked pour l'alimenter. */
    for (var q = 0; q < selected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; q++) {
      pushUnique(out.selectedVariantTexts, selected[q], LIMITS.selectedTexts, LIMITS.label);
    }
  }
  /* ── 7 quater. GROUPES DE VARIANTES AMAZON (26/10/2026) ───────────────────
     Le bloc 7 ter est sauté sur Amazon (le DOM y est plein de prix de
     publicité), donc "variantGroups" restait VIDE : le serveur ne pouvait
     publier aucun devis PAR VALEUR, et changer de couleur ou de taille dans la
     feuille affichait « Prix en dinars calculé à l'ajout. » — alors que la
     combinaison affichée par la page, elle, avait son devis.

     Ici on ne relit PAS le DOM : on traduit en groupes ce que le lecteur
     Amazon a déjà établi pour chaque valeur (ASIN, état publié, prix de la
     carte, stock annoncé). Rien n'est ajouté : une valeur sans fait publié
     reste listée comme valeur, sans ligne d'option, et deux prix différents
     pour la même valeur ne publient aucun prix (on ne choisit pas). */
  function amazonVariantGroups(evidence) {
    var groups = [];
    if (!evidence || Object.prototype.toString.call(evidence.options) !== '[object Array]') return groups;
    for (var i = 0; i < evidence.options.length; i++) {
      var option = evidence.options[i];
      if (!option || !option.value) continue;
      var name = cut(option.dimension, LIMITS.label);
      if (!name || NOT_A_CHOICE.test(name) || NOT_A_VARIANT_GROUP.test(name)) continue;
      var group = null;
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].name.toLowerCase() === name.toLowerCase()) { group = groups[g]; break; }
      }
      if (!group) {
        if (groups.length >= LIMITS.variantGroups) continue;
        group = { name: name, values: [], selected: [], options: [] };
        groups.push(group);
      }
      var value = cut(option.value, LIMITS.label);
      if (!value || value.length > LIMITS.label) continue;
      if (!ciExactContains(group.values, value) && group.values.length < LIMITS.variantValues) group.values.push(value);
      if (option.selected && !ciExactContains(group.selected, value)) group.selected.push(value);
      var state = option.availabilityEvidence === 'available' ? true
        : option.availabilityEvidence === 'unavailable' ? false : null;
      var price = option.price ? cut(option.price, LIMITS.label) : '';
      var stock = typeof option.stock === 'number' && option.stock > 0 && option.stock <= 999 ? option.stock : null;
      if (state === null && !price && stock === null) continue;
      var row = null;
      for (var r = 0; r < group.options.length; r++) {
        if (String(group.options[r].value).toLowerCase() === value.toLowerCase()) { row = group.options[r]; break; }
      }
      if (!row) {
        if (group.options.length >= LIMITS.variantValues) continue;
        row = { value: value, available: null, price: null, priceFrom: false, stock: null };
        group.options.push(row);
      }
      /* Le NÉGATIF gagne : une valeur déclarée indisponible le reste. */
      if (state === false) row.available = false;
      else if (state === true && row.available !== false) row.available = true;
      if (price) {
        if (!row.price) row.price = price;
        else if (row.price !== price) row.price = null;
      }
      if (option.priceFrom === true && row.price) row.priceFrom = true;
      if (stock !== null && (row.stock === null || stock < row.stock)) row.stock = stock;
    }
    return groups;
  }
  function isIndexValue(value) { return /^\d{1,3}$/.test(String(value)); }

  /* ── 7 ter-0. CE QUE LE JSON-LD PUBLIE POUR CHAQUE VALEUR (26/10/2026) ────
     Zalando (et les "ProductGroup" en général) ne publient NI prix NI état par
     taille dans le DOM : tout est dans "hasVariant[].offers" (prix, devise,
     availability). Sans cette lecture, le client choisissait une taille que le
     serveur ne pouvait prouver ni en prix ni en stock ⇒ "PRICE_UNAVAILABLE"
     (« Pas de devis serveur en dinars »), et l'ajout était impossible alors que
     la page publiait tout.

     On ne devine rien : "size" / "color" et "offers.*" sont des champs NORME.
     Les options servent de preuve PAR VALEUR ; "selected" reste vide (un
     "ProductGroup" ne dit pas quelle variante est affichée). */
  function ldOfferOf(variant) {
    if (!variant || typeof variant !== 'object') return null;
    var offers = variant.offers;
    var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
    for (var i = 0; i < list.length && i < 4; i++) {
      var offer = list[i];
      if (!offer || typeof offer !== 'object') continue;
      if (/aggregateoffer/i.test(String(offer['@type'] || ''))) continue;
      return offer;
    }
    return null;
  }
  /** "availability" schema.org ⇒ true (en stock) / false (épuisé) / null (rien). */
  function ldAvailability(offer) {
    var raw = String(offerField(offer, ['availability']) || '').toLowerCase();
    if (!raw) return null;
    if (/outofstock|soldout|out_of_stock|discontinued/.test(raw)) return false;
    if (/instock|limitedavailability|onlineonly|instoreonly|backorder|preorder|madeorder/.test(raw)) return true;
    return null;
  }
  /** Toutes les variantes publiées, TELLES QUELLES (aucun choix encore). */
  function ldRows(product) {
    var rows = [];
    if (!product || typeof product !== 'object') return rows;
    var variants = Object.prototype.toString.call(product.hasVariant) === '[object Array]'
      ? product.hasVariant : (product.hasVariant ? [product.hasVariant] : []);
    for (var v = 0; v < variants.length && v < 120; v++) {
      var variant = variants[v];
      if (!variant || typeof variant !== 'object') continue;
      var offer = ldOfferOf(variant);
      var priceText = offer ? offerField(offer, ['price', 'lowPrice']) : '';
      var currencyText = offer ? offerField(offer, ['priceCurrency', 'currency']) : '';
      var stockNumber = offer ? Number(offerField(offer, ['inventoryLevel'])) : NaN;
      var url = variant.url || variant['@id'] || (offer && offer.url) || '';
      if (url && typeof url === 'object') url = url.url || url['@id'] || '';
      var vImg = '';
      if (typeof variant.image === 'string') vImg = variant.image;
      else if (Object.prototype.toString.call(variant.image) === '[object Array]' && variant.image[0]) {
        vImg = typeof variant.image[0] === 'string' ? variant.image[0] : (variant.image[0].url || variant.image[0].contentUrl || '');
      } else if (variant.image && typeof variant.image === 'object') {
        vImg = variant.image.url || variant.image.contentUrl || '';
      }
      var extraAttrs = {};
      if (Object.prototype.toString.call(variant.additionalProperty) === '[object Array]') {
        for (var ap = 0; ap < variant.additionalProperty.length && ap < 4; ap++) {
          var prop = variant.additionalProperty[ap];
          if (!prop || typeof prop !== 'object') continue;
          var pName = cut(prop.name || prop.propertyID || '', LIMITS.label);
          var pVal = cut(prop.value || '', LIMITS.label);
          if (pName && pVal) extraAttrs[pName] = pVal;
        }
      }
      rows.push({
        sku: cut(variant.sku || variant.mpn || variant.productID || '', LIMITS.label),
        size: cut(variant.size, LIMITS.label),
        color: cut(variant.color, LIMITS.label),
        extraAttrs: extraAttrs,
        image: /^https?:\/\//i.test(String(vImg || '')) ? String(vImg).slice(0, 600) : '',
        amount: priceText && HAS_DIGIT.test(priceText) ? cut(priceText, 40) : '',
        currency: String(currencyText || '').trim().toUpperCase().slice(0, 8),
        available: offer ? ldAvailability(offer) : null,
        stock: isFinite(stockNumber) && stockNumber > 0 && stockNumber <= 999 ? Math.floor(stockNumber) : null,
        url: String(url || ''),
      });
    }
    return rows;
  }
  function ldNormUrl(value) {
    var url = String(value || '').trim().toLowerCase();
    if (!url) return '';
    var mark = url.search(/[?#]/);
    if (mark >= 0) url = url.slice(0, mark);
    if (url.slice(-1) === '/') url = url.slice(0, -1);
    return url;
  }
  function ldPageHref() {
    try { return ldNormUrl(location.href); } catch (e) { return ''; }
  }
  /**
   * COULEUR DE LA PAGE — la seule dimension qui, sur un "ProductGroup", sépare
   * des variantes de PRIX différents. Sans elle, prendre la première variante de
   * chaque taille MÉLANGE deux couleurs : fiche affichée à 139.99 EUR dont la
   * pointure 35.5 était annoncée 149.95 (mesuré le 26/10/2026 sur deux fiches
   * Zalando, dont une seule fonctionnait). Trois preuves, dans cet ordre, et
   * jamais une supposition :
   *   1. la pastille couleur réellement cochée dans le DOM ;
   *   2. la variante dont l'URL EST la page ouverte ;
   *   3. la couleur écrite dans le nom publié du produit (JSON-LD / titre).
   */
  function ldPageColor(rows) {
    try {
      for (var g = 0; g < out.variantGroups.length; g++) {
        var groupName = String(out.variantGroups[g].name || '');
        if (!/colour|color|couleur|farbe|colore|kleur|لون/i.test(groupName)) continue;
        var chosen = out.variantGroups[g].selected || [];
        if (chosen.length) return String(chosen[0]);
      }
    } catch (e) {}
    var href = ldPageHref();
    if (href) {
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].color && ldNormUrl(rows[r].url) === href) return rows[r].color;
      }
    }
    var name = String((jsonLd && jsonLd.name) || out.title || '').toLowerCase();
    var best = '';
    if (name) {
      for (var i = 0; i < rows.length; i++) {
        var color = String(rows[i].color || '');
        if (color.length < 3 || name.indexOf(color.toLowerCase()) < 0) continue;
        if (color.length > best.length) best = color;
      }
    }
    return best;
  }
  /**
   * Ce que TOUTES les variantes d'une même valeur disent. Un désaccord = aucun
   * fait : deux montants (ou un "en stock" et un "épuisé") pour la même taille
   * signifient que la valeur décrit plusieurs articles — on ne choisit pas à la
   * place du marchand et on ne publie ni prix ni état.
   */
  function ldConsensus(rows) {
    var fact = { available: null, price: null, currency: '', stock: null, conflict: false };
    if (!rows || !rows.length) return fact;
    var amounts = [];
    var currencies = [];
    var states = [];
    var stocks = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.amount) pushUnique(amounts, row.amount, 8, 40);
      if (row.amount && row.currency) pushUnique(currencies, row.currency, 4, 8);
      if (row.available === true || row.available === false) states.push(row.available);
      if (typeof row.stock === 'number' && row.stock > 0) stocks.push(row.stock);
    }
    if (currencies.length === 1) fact.currency = currencies[0];
    if (amounts.length === 1) fact.price = amounts[0] + (currencies.length === 1 ? ' ' + currencies[0] : '');
    else if (amounts.length > 1) fact.conflict = true;
    if (states.length) {
      var allTrue = true;
      var allFalse = true;
      for (var s = 0; s < states.length; s++) {
        if (states[s] !== true) allTrue = false;
        if (states[s] !== false) allFalse = false;
      }
      fact.available = allTrue ? true : (allFalse ? false : null);
      if (!allTrue && !allFalse) fact.conflict = true;
    }
    if (stocks.length) {
      var lowest = stocks[0];
      for (var k = 1; k < stocks.length; k++) if (stocks[k] < lowest) lowest = stocks[k];
      fact.stock = lowest;
    }
    if (fact.conflict) { fact.price = null; fact.stock = null; }
    return fact;
  }
  /**
   * Le groupe publie-t-il plusieurs couleurs ? Si la couleur de la page n'est pas
   * prouvable ET que plusieurs couleurs coexistent, aucun fait ne peut être
   * attribué à cette fiche : on publie les valeurs (le DOM nomme les choix) mais
   * NI prix NI état — jamais le prix d'une autre couleur.
   */
  function ldColorsMany(rows) {
    var colors = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].color) pushUnique(colors, rows[i].color, 12, 60);
    }
    return colors.length > 1;
  }
  /** Groupes (taille / couleur) construits sur les seules variantes RETENUES. */
  function groupsFromRows(rows, withFacts) {
    var groups = [];
    var dimensions = [{ key: 'size', name: 'Taille' }, { key: 'color', name: 'Couleur' }];
    for (var d = 0; d < dimensions.length; d++) {
      var values = [];
      var buckets = {};
      for (var r = 0; r < rows.length && values.length < LIMITS.variantValues; r++) {
        var value = String(rows[r][dimensions[d].key] || '').trim();
        if (!value || NOT_A_CHOICE.test(value) || ACTION_NOT_A_VALUE.test(value)) continue;
        var key = value.toLowerCase();
        if (!buckets[key]) { buckets[key] = []; values.push(value); }
        buckets[key].push(rows[r]);
      }
      var options = [];
      for (var v = 0; withFacts && v < values.length; v++) {
        var fact = ldConsensus(buckets[values[v].toLowerCase()] || []);
        if (fact.available === null && !fact.price && fact.stock === null) continue;
        options.push({ value: values[v], available: fact.available, price: fact.price, priceFrom: false, stock: fact.stock });
      }
      if (values.length > 1) groups.push({ name: dimensions[d].name, values: values, selected: [], options: options });
    }
    return groups;
  }
  /**
   * Variantes retenues : celles de la couleur AFFICHÉE. Les variantes des autres
   * couleurs du même "ProductGroup" ne prouvent rien sur cette fiche — c'est
   * exactement ce qui affichait 149.95 EUR sur une pointure d'une fiche à 139.99.
   */
  function ldScopedRows(product) {
    var rows = ldRows(product);
    var pageColor = ldPageColor(rows);
    if (!pageColor) return { rows: rows, withFacts: !ldColorsMany(rows) };
    var scoped = [];
    for (var i = 0; i < rows.length; i++) {
      var color = String(rows[i].color || '');
      if (color && color.toLowerCase() !== pageColor.toLowerCase()) continue;
      scoped.push(rows[i]);
    }
    return { rows: scoped.length ? scoped : rows, withFacts: true };
  }
  /* Index construit APRÈS la boucle DOM : la couleur cochée n'est connue qu'à ce
     moment-là. Les options servent de preuve PAR VALEUR ; "selected" reste vide
     (un "ProductGroup" ne dit pas quelle variante est affichée). */
  var LD_GROUPS = [];
  var LD_OPTIONS = {};
  var DOM_OPTIONS = {};
  function ldBuild() {
    if (!jsonLd || IS_AMAZON) return;
    try {
      var scoped = ldScopedRows(jsonLd);
      LD_GROUPS = groupsFromRows(scoped.rows, scoped.withFacts);
      LD_OPTIONS = {};
      for (var i = 0; i < LD_GROUPS.length; i++) {
        LD_OPTIONS[LD_GROUPS[i].name.toLowerCase()] = LD_GROUPS[i].options;
      }
    } catch (e) { LD_GROUPS = []; LD_OPTIONS = {}; }
  }
  /** Options publiées pour cette valeur par le JSON-LD (jamais pour une autre). */
  function ldOptionsFor(name) {
    var key = String(name || '').toLowerCase();
    var rows = LD_OPTIONS[key];
    /* Le groupe DOM peut porter son nom dans la langue de la page (« Größe ») :
       on retombe alors sur la dimension, jamais sur un autre attribut. */
    if (!rows && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key)) rows = LD_OPTIONS['taille'];
    if (!rows && /colour|color|couleur|farbe|colore|kleur|لون/i.test(key)) rows = LD_OPTIONS['couleur'];
    return Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
  }
  /**
   * Fusionne, POUR UNE MÊME VALEUR, ce que dit le DOM et ce que dit le JSON-LD.
   *   • le NÉGATIF gagne : une valeur désactivée dans le DOM reste indisponible
   *     même si une offre dit « InStock » (la page a le dernier mot) ;
   *   • le prix vient du JSON-LD quand il existe (le DOM n'en publie pas par
   *     taille chez Zalando) ;
   *   • une ligne sans aucun fait (ni état, ni prix, ni stock) n'est pas publiée.
   */
  function mergeVariantOptions(domOptions, ldOptions) {
    var rows = Object.prototype.toString.call(domOptions) === '[object Array]' ? domOptions : [];
    var published = Object.prototype.toString.call(ldOptions) === '[object Array]' ? ldOptions : [];
    var out2 = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.value) continue;
      var extra = null;
      for (var l = 0; l < published.length; l++) {
        if (String(published[l].value).toLowerCase() === String(row.value).toLowerCase()) { extra = published[l]; break; }
      }
      var available = row.available === false || (extra && extra.available === false)
        ? false
        : (extra && extra.available === true) ? true
          : (row.available === true ? true : null);
      var price = (extra && extra.price) || row.price || null;
      var stock = (extra && typeof extra.stock === 'number' && extra.stock > 0) ? extra.stock
        : (typeof row.stock === 'number' && row.stock > 0 ? row.stock : null);
      var image = row.image || (extra && extra.image) || null;
      var goodsId = row.goodsId || (extra && extra.goodsId) || null;
      if (available === null && !price && stock === null && !image && !goodsId) continue;
      var mergedItem = {
        value: row.value,
        available: available,
        price: price,
        priceFrom: (extra && extra.priceFrom === true) || row.priceFrom === true,
        stock: stock,
      };
      if (image) mergedItem.image = image;
      if (goodsId) mergedItem.goodsId = goodsId;
      out2.push(mergedItem);
    }
    return out2;
  }
  function ldGroupAlreadyCovered(name) {
    var key = String(name || '').toLowerCase();
    var size = /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key);
    var color = /colour|color|couleur|farbe|colore|kleur|لون/i.test(key);
    for (var gi = 0; gi < out.variantGroups.length; gi++) {
      var known = String(out.variantGroups[gi].name || '').toLowerCase();
      if (size && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(known)) return true;
      if (color && /colour|color|couleur|farbe|colore|kleur|لون/i.test(known)) return true;
    }
    return false;
  }

  /* ── 7 quinquies. VARIANTES ET ÉVIDENCE SHEIN v2 (28/10/2026) ──────────────
     Fusionne les pastilles DOM (.product-intro__color, .product-intro__size,
     .goods-color, .goods-size) et l'état embarqué vérifié (SHEIN_STATE) :
       • Couleur active : available = état de la fiche, goodsId courant, vignette ;
       • Couleurs sœurs : goodsId de leur fiche (-p-<id>.html), vignette, et
         prix indicatif (priceFrom: true) quand publié — le VariantReader charge
         leur propre fiche au clic sans jamais emprunter le stock d'une autre ;
       • Tailles : prix SKU exact, stock restant et rupture (_soldout / stock=0). */
  if (IS_SHEIN) {
    try {
      sheinEnsureState();
      var sheinSoldOutRegex = /\b(sold\s*out|out\s*of\s*stock|épuisé|epuise|rupture(?:\s*de\s*stock)?|indisponible|ausverkauft|nicht\s*auf\s*lager|agotado|sin\s*existencias|esaurito|non\s*disponibile)\b|نفدت\s*الكمية|غير\s*متوفر/i;
      if (SHEIN_STATE && !out.availabilityText && !out.addToCartText) {
        if (SHEIN_STATE.inStock === false) out.availabilityText = 'Out of Stock';
        else if (SHEIN_STATE.inStock === true) out.availabilityText = 'InStock';
      }
      var sheinPageSoldOut = Boolean(out.availabilityText && sheinSoldOutRegex.test(out.availabilityText))
        || (!out.addToCartText && Boolean(SHEIN_STATE && SHEIN_STATE.inStock === false));
      var sheinPageAvail = !sheinPageSoldOut && (Boolean(out.addToCartText)
        || Boolean(out.availabilityText && /in\s*stock|instock|en\s*stock|disponible|auf\s*lager|disponibile|متوفر/i.test(out.availabilityText))
        || Boolean(SHEIN_STATE && SHEIN_STATE.inStock === true));
      var sheinHasAmbiguousDom = out.diagnostics.indexOf('price:ambiguous_scope') >= 0;
      var sheinSinglePagePrice = (!sheinHasAmbiguousDom && out.priceCandidates.length > 0 && out.priceCandidates[0].text)
        ? out.priceCandidates[0].text
        : (SHEIN_STATE && SHEIN_STATE.salePrice ? SHEIN_STATE.salePrice : '');

      /* 1. COULEURS (DOM + SHEIN_STATE) */
      var sheinHeaderColor = '';
      try {
        var cTitleNodes = document.querySelectorAll('.product-intro__color-title, .goods-color__title, [class*="product-intro__color-title" i], [class*="goods-color__title" i], [data-testid="color-title"]');
        for (var ct = 0; ct < cTitleNodes.length && !sheinHeaderColor; ct++) {
          if (sheinBlocked(cTitleNodes[ct]) || isInNavigation(cTitleNodes[ct])) continue;
          var ctRaw = text(cTitleNodes[ct].textContent);
          if (!ctRaw) continue;
          var ctClean = text(ctRaw.replace(/^(?:color|colour|couleur|farbe|colore|cor|لون|اللون)\s*[:：\-]?\s*/i, ''));
          if (ctClean && ctClean.length <= LIMITS.label && ctClean.toLowerCase() !== ctRaw.toLowerCase()) {
            sheinHeaderColor = ctClean;
          } else if (ctRaw.indexOf(':') >= 0 || ctRaw.indexOf('：') >= 0) {
            var parts = ctRaw.split(/[:：]/);
            var afterColon = text(parts.slice(1).join(':'));
            if (afterColon && afterColon.length <= LIMITS.label) sheinHeaderColor = afterColon;
          }
        }
      } catch (e) {}

      var sheinColorMap = {};
      var sheinColorOrder = [];
      var addSheinColor = function (val, info) {
        var cleanVal = cut(val, LIMITS.label);
        if (!cleanVal || NOT_A_CHOICE.test(cleanVal) || ACTION_NOT_A_VALUE.test(cleanVal)) return;
        var k = cleanVal.toLowerCase();
        if (!sheinColorMap[k]) {
          if (sheinColorOrder.length >= LIMITS.variantValues) return;
          sheinColorOrder.push(cleanVal);
          sheinColorMap[k] = {
            value: cleanVal,
            selected: Boolean(info.selected),
            disabled: Boolean(info.disabled),
            available: info.available === true ? true : (info.available === false ? false : null),
            image: info.image || null,
            goodsId: info.goodsId || null,
            price: info.price || null,
            priceFrom: Boolean(info.priceFrom)
          };
        } else {
          var ex = sheinColorMap[k];
          if (info.selected) ex.selected = true;
          if (info.disabled) { ex.disabled = true; ex.available = false; }
          else if (ex.available === null && info.available !== null && info.available !== undefined) ex.available = info.available;
          if (!ex.image && info.image) ex.image = info.image;
          if (!ex.goodsId && info.goodsId) ex.goodsId = info.goodsId;
          if (!ex.price && info.price) { ex.price = info.price; ex.priceFrom = Boolean(info.priceFrom); }
        }
      };

      if (SHEIN_STATE && SHEIN_STATE.colors && SHEIN_STATE.colors.length) {
        for (var scI = 0; scI < SHEIN_STATE.colors.length; scI++) {
          var scRow = SHEIN_STATE.colors[scI];
          addSheinColor(scRow.value, {
            selected: scRow.selected,
            disabled: scRow.available === false,
            available: scRow.available,
            image: scRow.image,
            goodsId: scRow.goodsId,
            price: scRow.price,
            priceFrom: scRow.priceFrom
          });
        }
      }

      try {
        var colorHosts = document.querySelectorAll('.product-intro__color, .goods-color, [class*="product-intro__color" i], [class*="goods-color" i], [data-testid*="color-selector" i], [data-testid*="color-list" i]');
        for (var chI = 0; chI < colorHosts.length && chI < 6; chI++) {
          if (sheinBlocked(colorHosts[chI]) || isInNavigation(colorHosts[chI])) continue;
          var swatches = colorHosts[chI].querySelectorAll('.product-intro__color-radio, .goods-color__radio, .goods-color-item, [class*="color-radio" i], [class*="color-item" i], [data-color-name], a[href*="-p-"], [role="radio"], li');
          for (var swI = 0; swI < swatches.length && swI < 30; swI++) {
            var sw = swatches[swI];
            if (sheinBlocked(sw) || isInNavigation(sw)) continue;
            var swImgEl = sw.querySelector ? sw.querySelector('img') : (String(sw.tagName || '').toUpperCase() === 'IMG' ? sw : null);
            var swLabel = text(sw.getAttribute && (sw.getAttribute('data-color-name') || sw.getAttribute('data-color') || sw.getAttribute('aria-label') || sw.getAttribute('title')))
              || text(swImgEl && swImgEl.getAttribute && (swImgEl.getAttribute('alt') || swImgEl.getAttribute('title')))
              || text(sw.textContent);
            if (!swLabel || swLabel.length > LIMITS.label) continue;
            var swImgUrl = sheinHttpsUrl(swImgEl && swImgEl.getAttribute && (swImgEl.getAttribute('src') || swImgEl.getAttribute('data-src')));
            var swHref = text(sw.getAttribute && (sw.getAttribute('href') || sw.getAttribute('data-href')));
            if (!swHref && sw.querySelector) {
              var innerLink = sw.querySelector('a[href]');
              if (innerLink) swHref = text(innerLink.getAttribute('href'));
            }
            var swGid = text(sw.getAttribute && (sw.getAttribute('data-goods-id') || sw.getAttribute('data-goodsid')));
            if (swGid && !/^\d{5,16}$/.test(swGid)) swGid = '';
            if (!swGid && swHref) swGid = sheinExtractGoodsIdFromUrl(swHref);
            var swSel = sheinNodeSelected(sw)
              || Boolean(sheinHeaderColor && swLabel.toLowerCase() === sheinHeaderColor.toLowerCase())
              || Boolean(swGid && SHEIN_GOODS_ID && swGid === SHEIN_GOODS_ID);
            var swDis = sheinNodeDisabled(sw);
            addSheinColor(swLabel, {
              selected: swSel,
              disabled: swDis,
              available: swDis ? false : null,
              image: swImgUrl || null,
              goodsId: swGid || (swSel && SHEIN_GOODS_ID ? SHEIN_GOODS_ID : null),
              price: null,
              priceFrom: false
            });
          }
        }
      } catch (e) {}

      var sheinActiveColor = sheinHeaderColor || (SHEIN_STATE && SHEIN_STATE.currentColor) || '';
      for (var co = 0; co < sheinColorOrder.length; co++) {
        var cEntry = sheinColorMap[sheinColorOrder[co].toLowerCase()];
        if (cEntry.selected) { sheinActiveColor = cEntry.value; break; }
      }
      if (sheinActiveColor && !sheinColorMap[sheinActiveColor.toLowerCase()]) {
        addSheinColor(sheinActiveColor, {
          selected: true,
          disabled: sheinPageSoldOut,
          available: sheinPageSoldOut ? false : (sheinPageAvail ? true : null),
          image: (SHEIN_STATE && SHEIN_STATE.images && SHEIN_STATE.images[0]) || null,
          goodsId: (SHEIN_STATE && SHEIN_STATE.goodsId) || SHEIN_GOODS_ID || null,
          price: null,
          priceFrom: false
        });
      }

      /* 2. TAILLES (DOM + SHEIN_STATE) */
      var sheinSizeMap = {};
      var sheinSizeOrder = [];
      var addSheinSize = function (val, info) {
        var cleanSize = cut(val, LIMITS.label);
        if (!cleanSize || SHEIN_SIZE_GUIDE_NOISE.test(cleanSize) || NOT_A_CHOICE.test(cleanSize) || ACTION_NOT_A_VALUE.test(cleanSize)) return;
        var sk = cleanSize.toLowerCase();
        if (!sheinSizeMap[sk]) {
          if (sheinSizeOrder.length >= LIMITS.variantValues) return;
          sheinSizeOrder.push(cleanSize);
          sheinSizeMap[sk] = {
            value: cleanSize,
            selected: Boolean(info.selected),
            disabled: Boolean(info.disabled),
            available: info.available === true ? true : (info.available === false ? false : null),
            stock: typeof info.stock === 'number' && info.stock > 0 && info.stock <= 999 ? info.stock : null,
            price: info.price || null,
            fromDom: Boolean(info.fromDom)
          };
        } else {
          var sx = sheinSizeMap[sk];
          if (info.selected) sx.selected = true;
          if (info.fromDom) sx.fromDom = true;
          if (info.disabled || info.available === false) {
            sx.disabled = true;
            sx.available = false;
            sx.stock = null;
          } else if (sx.available === null && info.available === true) {
            sx.available = true;
          }
          if (!sx.stock && typeof info.stock === 'number' && info.stock > 0 && info.stock <= 999 && sx.available !== false) {
            sx.stock = info.stock;
          }
          if (!sx.price && info.price) sx.price = info.price;
        }
      };

      if (SHEIN_STATE && SHEIN_STATE.sizes && SHEIN_STATE.sizes.length) {
        for (var ssI = 0; ssI < SHEIN_STATE.sizes.length; ssI++) {
          var ssRow = SHEIN_STATE.sizes[ssI];
          addSheinSize(ssRow.value, {
            selected: false,
            disabled: ssRow.available === false,
            available: ssRow.available,
            stock: ssRow.stock,
            price: ssRow.price,
            fromDom: false
          });
        }
      }

      try {
        var sizeHosts = document.querySelectorAll('.product-intro__size, .goods-size, [class*="product-intro__size" i], [class*="goods-size" i], [data-testid*="size-selector" i], [data-testid*="size-list" i]');
        for (var shI = 0; shI < sizeHosts.length && shI < 6; shI++) {
          if (sheinBlocked(sizeHosts[shI]) || isInNavigation(sizeHosts[shI])) continue;
          var sizePills = sizeHosts[shI].querySelectorAll('.product-intro__size-radio, .goods-size__radio, .goods-size__item, [class*="size-radio" i], [class*="size-item" i], [data-size], [role="radio"], li');
          for (var spI = 0; spI < sizePills.length && spI < 30; spI++) {
            var sp = sizePills[spI];
            if (sheinBlocked(sp) || isInNavigation(sp)) continue;
            var cleaned = sheinCleanSizeLabel(sp);
            if (!cleaned.label) continue;
            var spSel = sheinNodeSelected(sp);
            var spDis = sheinNodeDisabled(sp);
            addSheinSize(cleaned.label, {
              selected: spSel,
              disabled: spDis,
              available: spDis ? false : (sheinPageSoldOut ? false : (sheinPageAvail ? true : null)),
              stock: spDis ? null : cleaned.stock,
              price: (!spDis && sheinPageAvail && sheinSinglePagePrice) ? sheinSinglePagePrice : null,
              fromDom: true
            });
          }
        }
      } catch (e) {}

      var sheinActiveSize = '';
      var sheinSelectedSizeDisabled = false;
      for (var so = 0; so < sheinSizeOrder.length; so++) {
        var sEntryObj = sheinSizeMap[sheinSizeOrder[so].toLowerCase()];
        if (sEntryObj.selected) {
          sheinActiveSize = sEntryObj.value;
          if (sEntryObj.available === false || sEntryObj.disabled) sheinSelectedSizeDisabled = true;
          break;
        }
      }
      /* Si la taille cliquée sur la fiche est elle-même épuisée, la combinaison
         courante ne doit jamais être déclarée achetable. */
      if (sheinSelectedSizeDisabled) {
        out.addToCartText = null;
        out.availabilityText = 'Out of Stock';
      }

      var hasSizeGroup = sheinSizeOrder.length >= 2;
      var sheinExtraGroupsList = (SHEIN_STATE && SHEIN_STATE.extraGroups) || [];
      var hasExtraGroups = false;
      for (var egc = 0; egc < sheinExtraGroupsList.length; egc++) {
        if (sheinExtraGroupsList[egc] && sheinExtraGroupsList[egc].values && sheinExtraGroupsList[egc].values.length >= 2) {
          hasExtraGroups = true;
          break;
        }
      }
      /* Quand SHEIN v2 a identifié ses propres dimensions (Couleur / Taille / Type), tout
         groupe générique non nommé (« Option », « Variante ») issu de la passe DOM
         précédente est un doublon bruité des mêmes pastilles : on l'élimine avant
         publication pour ne jamais offrir deux sélecteurs redondants dans la feuille. */
      if (sheinColorOrder.length >= 2 || hasSizeGroup || hasExtraGroups) {
        for (var rgo = out.variantGroups.length - 1; rgo >= 0; rgo--) {
          if (/^(?:options?|variantes?|variants?|choix|choice)$/i.test(text(out.variantGroups[rgo].name))) {
            out.variantGroups.splice(rgo, 1);
          }
        }
      }
      if (sheinColorOrder.length >= 2) {
        var cValues = [];
        var cChosen = [];
        var cOptions = [];
        for (var cPub = 0; cPub < sheinColorOrder.length; cPub++) {
          var cObj = sheinColorMap[sheinColorOrder[cPub].toLowerCase()];
          cValues.push(cObj.value);
          var isCurrentColor = cObj.selected || (sheinActiveColor && cObj.value.toLowerCase() === sheinActiveColor.toLowerCase());
          if (isCurrentColor && !cChosen.length) cChosen.push(cObj.value);
          var cAvail = cObj.disabled || cObj.available === false
            ? false
            : (isCurrentColor ? (sheinPageSoldOut ? false : (sheinPageAvail ? true : cObj.available)) : null);
          var cPrice = isCurrentColor
            ? (!hasSizeGroup && !hasExtraGroups && cAvail === true && sheinSinglePagePrice ? sheinSinglePagePrice : null)
            : (cObj.price || null);
          var cPriceFrom = isCurrentColor ? false : Boolean(cObj.price);
          cOptions.push({
            value: cObj.value,
            available: cAvail,
            price: cPrice,
            priceFrom: cPriceFrom,
            stock: null,
            image: cObj.image || null,
            goodsId: cObj.goodsId || (isCurrentColor ? ((SHEIN_STATE && SHEIN_STATE.goodsId) || SHEIN_GOODS_ID || null) : null)
          });
          pushUnique(out.variantTexts, cObj.value, LIMITS.variantTexts, LIMITS.label);
        }
        for (var rgc = out.variantGroups.length - 1; rgc >= 0; rgc--) {
          if (/colour|color|couleur|farbe|colore|cor|kleur|لون/i.test(String(out.variantGroups[rgc].name || ''))) {
            out.variantGroups.splice(rgc, 1);
          }
        }
        pushVariantGroup('Couleur', cValues, cChosen, cOptions);
      } else if (sheinActiveColor) {
        pushUnique(out.selectedVariantTexts, sheinActiveColor, LIMITS.selectedTexts, LIMITS.label);
      }

      if (hasSizeGroup) {
        var szValues = [];
        var szChosen = [];
        var szOptions = [];
        var allowPageFallbackOnSize = !hasExtraGroups && !(SHEIN_STATE && SHEIN_STATE.hasRangePrice) && !(SHEIN_STATE && SHEIN_STATE.skus && SHEIN_STATE.skus.length > 0);
        for (var szPub = 0; szPub < sheinSizeOrder.length; szPub++) {
          var szObj = sheinSizeMap[sheinSizeOrder[szPub].toLowerCase()];
          szValues.push(szObj.value);
          if (szObj.selected && !szChosen.length) szChosen.push(szObj.value);
          var szAvail = szObj.disabled || szObj.available === false
            ? false
            : (sheinPageSoldOut ? false : szObj.available);
          var szPrice = szAvail === false ? null : (szObj.price || (allowPageFallbackOnSize && szAvail === true && sheinSinglePagePrice ? sheinSinglePagePrice : null));
          szOptions.push({
            value: szObj.value,
            available: szAvail,
            price: szPrice,
            priceFrom: false,
            stock: szAvail === false ? null : szObj.stock
          });
          pushUnique(out.variantTexts, szObj.value, LIMITS.variantTexts, LIMITS.label);
        }
        for (var rgs = out.variantGroups.length - 1; rgs >= 0; rgs--) {
          if (/size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(String(out.variantGroups[rgs].name || ''))) {
            out.variantGroups.splice(rgs, 1);
          }
        }
        pushVariantGroup('Taille', szValues, szChosen, szOptions);
      } else if (sheinActiveSize) {
        pushUnique(out.selectedVariantTexts, sheinActiveSize, LIMITS.selectedTexts, LIMITS.label);
      }

      /* 3. DIMENSIONS SUPPLÉMENTAIRES SHEIN (Type, Lot/Pack, Style, Âge distinct…) */
      for (var seg = 0; seg < sheinExtraGroupsList.length && out.variantGroups.length < LIMITS.variantGroups; seg++) {
        var segGroup = sheinExtraGroupsList[seg];
        if (!segGroup || !segGroup.values || segGroup.values.length < 2) continue;
        if (ldGroupAlreadyCovered(segGroup.name)) continue;
        var segOptions = [];
        for (var segV = 0; segV < segGroup.values.length; segV++) {
          var svLabel = segGroup.values[segV];
          var svAvail = segGroup.availMap && segGroup.availMap[svLabel.toLowerCase()] !== undefined
            ? segGroup.availMap[svLabel.toLowerCase()]
            : null;
          segOptions.push({
            value: svLabel,
            available: svAvail,
            price: null,
            priceFrom: false,
            stock: null
          });
          pushUnique(out.variantTexts, svLabel, LIMITS.variantTexts, LIMITS.label);
        }
        pushVariantGroup(segGroup.name, segGroup.values, segGroup.selected || [], segOptions);
      }

      out.shein = {
        readerVersion: 2,
        pageGoodsId: (SHEIN_STATE && SHEIN_STATE.goodsId) || SHEIN_GOODS_ID || null,
        selectedColor: sheinActiveColor || null,
        selectedSize: sheinActiveSize || null,
        skuId: (SHEIN_STATE && SHEIN_STATE.skuId) || null
      };
    } catch (e) {}
  }

  /* ── 7 sexies. VARIANTES ET MATRICE SKU ALIEXPRESS v2 (28/10/2026) ──────────
     AliExpress expose sur une même fiche (/item/<id>.html) plusieurs dimensions
     (Couleur, Taille, Type de prise, Capacité, Expédié depuis…) et leur matrice
     cartésienne de prix/stock. Ce bloc :
       1. fusionne les sélecteurs DOM ([data-pl="product-sku"]) et l'état embarqué
          vérifié (ALIEXPRESS_STATE) ;
       2. élimine les groupes génériques redondants (« Option », doublons DOM) ;
       3. publie pour chaque groupe ses valeurs, vignettes et disponibilités ;
       4. publie la matrice bornée des SKUs (out.aliexpress.skus) alignée sur les
          groupes à choix multiples afin que la feuille et le serveur cotent
          instantanément toute combinaison exacte en TND. */
  if (IS_ALIEXPRESS) {
    try {
      aeEnsureState();
      var aeSoldRegex = /\b(sold\s*out|out\s*of\s*stock|épuisé|epuise|rupture(?:\s*de\s*stock)?|indisponible|ausverkauft|agotado|esgotado|esaurito)\b|can'?t\s+ship\s+to|cannot\s+be\s+shipped|نفدت\s*الكمية|غير\s*متوفر/i;
      if (ALIEXPRESS_STATE && !out.availabilityText && !out.addToCartText) {
        if (ALIEXPRESS_STATE.inStock === false) out.availabilityText = 'Out of Stock';
        else if (ALIEXPRESS_STATE.inStock === true) out.availabilityText = 'InStock';
      }
      var aePageSoldOut = Boolean(out.availabilityText && aeSoldRegex.test(out.availabilityText))
        || (!out.addToCartText && Boolean(ALIEXPRESS_STATE && ALIEXPRESS_STATE.inStock === false));

      /* Groupes DOM de la fiche AliExpress */
      var aeGroups = [];
      var findOrCreateAeGroup = function (rawName) {
        var cleanName = cut(rawName, LIMITS.label);
        if (!cleanName || NOT_A_VARIANT_GROUP.test(cleanName)) return null;
        var dk = aeDimKey(cleanName);
        for (var gi = 0; gi < aeGroups.length; gi++) {
          if (aeDimKey(aeGroups[gi].name) === dk) return aeGroups[gi];
        }
        if (aeGroups.length >= LIMITS.variantGroups) return null;
        var grp = { name: cleanName, valuesOrder: [], valuesMap: {}, selected: '' };
        aeGroups.push(grp);
        return grp;
      };
      var upsertAeValue = function (grp, rawVal, info) {
        if (!grp) return;
        var vClean = cut(rawVal, LIMITS.label);
        if (!vClean || AE_GUIDE_NOISE.test(vClean) || NOT_A_CHOICE.test(vClean) || ACTION_NOT_A_VALUE.test(vClean)) return;
        var vk = vClean.toLowerCase();
        if (!grp.valuesMap[vk]) {
          if (grp.valuesOrder.length >= LIMITS.variantValues) return;
          grp.valuesOrder.push(vClean);
          grp.valuesMap[vk] = {
            value: vClean,
            selected: Boolean(info && info.selected),
            disabled: Boolean(info && info.disabled),
            image: (info && info.image) || null
          };
        } else {
          var ex = grp.valuesMap[vk];
          if (info && info.selected) ex.selected = true;
          if (info && info.disabled) ex.disabled = true;
          if (!ex.image && info && info.image) ex.image = info.image;
        }
        if (info && info.selected && !grp.selected) grp.selected = grp.valuesMap[vk].value;
      };

      /* 1. Propriétés embarquées (ordre et libellés complets) */
      if (ALIEXPRESS_STATE && ALIEXPRESS_STATE.properties) {
        for (var ap = 0; ap < ALIEXPRESS_STATE.properties.length; ap++) {
          var propDef = ALIEXPRESS_STATE.properties[ap];
          var gFromState = findOrCreateAeGroup(propDef.name);
          if (!gFromState) continue;
          for (var av = 0; av < propDef.values.length; av++) {
            upsertAeValue(gFromState, propDef.values[av].name, {
              selected: false,
              disabled: false,
              image: propDef.values[av].image
            });
          }
        }
      }

      /* 2. Pastilles DOM (sélection active en direct, états désactivés, vignettes) */
      try {
        var domProps = document.querySelectorAll('[data-pl="product-sku"] [class*="sku-item--property" i], [data-pl="product-sku"] [class*="sku--property" i], .sku-property, .product-sku [class*="property" i], [data-testid*="sku-property" i]');
        for (var dp = 0; dp < domProps.length && dp < 8; dp++) {
          var dCont = domProps[dp];
          if (aeBlocked(dCont) || isInNavigation(dCont)) continue;
          var dTitleEl = dCont.querySelector('[class*="sku-item--title" i], [class*="sku--title" i], .sku-title, [class*="property-title" i]');
          var dRawTitle = dTitleEl ? text(dTitleEl.textContent) : '';
          var dName = dRawTitle;
          var dHeaderVal = '';
          if (dRawTitle && (dRawTitle.indexOf(':') >= 0 || dRawTitle.indexOf('：') >= 0)) {
            var dParts = dRawTitle.split(/[:：]/);
            dName = text(dParts[0]);
            dHeaderVal = cut(dParts.slice(1).join(':'), LIMITS.label);
          }
          if (!dName) continue;
          var gFromDom = findOrCreateAeGroup(dName);
          if (!gFromDom) continue;
          /* Si le DOM affiche le nom dans la langue du client (« Couleur »), il devient le libellé affiché */
          gFromDom.name = cut(dName, LIMITS.label);
          var dPills = dCont.querySelectorAll('[data-sku-col], [class*="sku-item--box" i], [class*="sku-item--image" i], [class*="sku-item--text" i], .sku-property-item, [role="radio"]');
          for (var dpl = 0; dpl < dPills.length && dpl < 30; dpl++) {
            var dPill = dPills[dpl];
            var dCls = String(dPill.className || '');
            var dSel = AE_BEM_ACTIVE.test(dCls)
              || (dPill.getAttribute && (dPill.getAttribute('aria-checked') === 'true' || dPill.getAttribute('aria-selected') === 'true' || dPill.getAttribute('data-selected') === 'true'));
            var dDis = AE_BEM_DISABLED.test(dCls)
              || dPill.disabled === true
              || (dPill.getAttribute && (dPill.getAttribute('aria-disabled') === 'true' || dPill.getAttribute('disabled') !== null));
            var dImgEl = dPill.querySelector && dPill.querySelector('img');
            var dImgUrl = dImgEl ? aeCleanImageUrl(dImgEl.getAttribute('src') || dImgEl.getAttribute('data-src')) : '';
            var dVal = cut(
              (dPill.getAttribute && (dPill.getAttribute('title') || dPill.getAttribute('aria-label')))
              || (dImgEl && (dImgEl.getAttribute('alt') || dImgEl.getAttribute('title')))
              || dPill.textContent,
              LIMITS.label
            );
            if (!dVal) continue;
            upsertAeValue(gFromDom, dVal, { selected: dSel, disabled: dDis, image: dImgUrl || null });
          }
          if (!gFromDom.selected && dHeaderVal && gFromDom.valuesMap[dHeaderVal.toLowerCase()]) {
            gFromDom.selected = gFromDom.valuesMap[dHeaderVal.toLowerCase()].value;
            gFromDom.valuesMap[dHeaderVal.toLowerCase()].selected = true;
          }
        }
      } catch (e) {}

      /* 3. Repli ?sku_id= quand aucun clic DOM n'a encore eu lieu */
      if (ALIEXPRESS_URL_SKU_ID && ALIEXPRESS_STATE && ALIEXPRESS_STATE.skus) {
        var anyDomChosen = false;
        for (var adc = 0; adc < aeGroups.length; adc++) {
          if (aeGroups[adc].selected) { anyDomChosen = true; break; }
        }
        if (!anyDomChosen) {
          for (var usk = 0; usk < ALIEXPRESS_STATE.skus.length; usk++) {
            var uSku = ALIEXPRESS_STATE.skus[usk];
            if (String(uSku.skuId || '') !== ALIEXPRESS_URL_SKU_ID) continue;
            for (var uAttr in uSku.attributes) {
              if (!Object.prototype.hasOwnProperty.call(uSku.attributes, uAttr)) continue;
              for (var ug = 0; ug < aeGroups.length; ug++) {
                if (aeDimKey(aeGroups[ug].name) === aeDimKey(uAttr)) {
                  var uValKey = String(uSku.attributes[uAttr] || '').toLowerCase();
                  if (aeGroups[ug].valuesMap[uValKey]) {
                    aeGroups[ug].selected = aeGroups[ug].valuesMap[uValKey].value;
                    aeGroups[ug].valuesMap[uValKey].selected = true;
                  }
                }
              }
            }
            break;
          }
        }
      }

      /* Séparation des groupes à choix multiples (>=2 valeurs) et des attributs fixes (1 valeur) */
      var multiGroups = [];
      for (var mg = 0; mg < aeGroups.length; mg++) {
        if (aeGroups[mg].valuesOrder.length >= 2) {
          multiGroups.push(aeGroups[mg]);
        } else if (aeGroups[mg].valuesOrder.length === 1) {
          pushUnique(out.selectedVariantTexts, aeGroups[mg].valuesOrder[0], LIMITS.selectedTexts, LIMITS.label);
        }
      }

      /* Normalisation de la matrice SKU sur les noms exacts des multiGroups publiés */
      var normalizedSkus = [];
      var selectedSkuObj = null;
      if (ALIEXPRESS_STATE && ALIEXPRESS_STATE.skus && ALIEXPRESS_STATE.skus.length) {
        for (var ns = 0; ns < ALIEXPRESS_STATE.skus.length && normalizedSkus.length < 60; ns++) {
          var rawSku = ALIEXPRESS_STATE.skus[ns];
          var alignedAttrs = {};
          var alignedCount = 0;
          var matchesSelected = multiGroups.length > 0;
          for (var mg2 = 0; mg2 < multiGroups.length; mg2++) {
            var grpObj = multiGroups[mg2];
            var targetDk = aeDimKey(grpObj.name);
            var matchedVal = '';
            for (var rk in rawSku.attributes) {
              if (!Object.prototype.hasOwnProperty.call(rawSku.attributes, rk)) continue;
              if (aeDimKey(rk) === targetDk) {
                var candKey = String(rawSku.attributes[rk] || '').toLowerCase();
                matchedVal = grpObj.valuesMap[candKey] ? grpObj.valuesMap[candKey].value : cut(rawSku.attributes[rk], LIMITS.label);
                break;
              }
            }
            if (matchedVal) {
              alignedAttrs[grpObj.name] = matchedVal;
              alignedCount++;
              if (!grpObj.selected || grpObj.selected.toLowerCase() !== matchedVal.toLowerCase()) matchesSelected = false;
            } else {
              matchesSelected = false;
            }
          }
          if (multiGroups.length > 0 && alignedCount === multiGroups.length) {
            var domBlocked = false;
            for (var dbk = 0; dbk < multiGroups.length; dbk++) {
              var dbVal = alignedAttrs[multiGroups[dbk].name];
              var dbEntry = dbVal ? multiGroups[dbk].valuesMap[dbVal.toLowerCase()] : null;
              if (dbEntry && dbEntry.disabled) { domBlocked = true; break; }
            }
            var finalSkuAvail = (aePageSoldOut || domBlocked || rawSku.available === false) ? false : rawSku.available;
            var normSku = {
              skuId: rawSku.skuId || null,
              attributes: alignedAttrs,
              price: finalSkuAvail === false ? null : (rawSku.price || null),
              available: finalSkuAvail,
              stock: finalSkuAvail === false ? null : rawSku.stock,
              image: rawSku.image || null
            };
            normalizedSkus.push(normSku);
            if (matchesSelected && !selectedSkuObj) selectedSkuObj = normSku;
          }
        }
      }

      /* Si la combinaison sélectionnée sur la page est explicitement en rupture, aucun bouton actif ne doit tromper */
      if (selectedSkuObj && selectedSkuObj.available === false) {
        out.addToCartText = null;
        out.availabilityText = 'Out of Stock';
      } else if (selectedSkuObj && selectedSkuObj.available === true && !out.availabilityText && !out.addToCartText) {
        out.availabilityText = selectedSkuObj.stock && selectedSkuObj.stock <= 5
          ? ('Only ' + selectedSkuObj.stock + ' left')
          : 'InStock';
      }

      if (multiGroups.length > 0) {
        /* Nettoyage des groupes génériques redondants (« Option », doublons DOM) */
        out.variantGroups = [];
        for (var pubG = 0; pubG < multiGroups.length; pubG++) {
          var pg = multiGroups[pubG];
          var pgValues = [];
          var pgChosen = pg.selected ? [pg.selected] : [];
          var pgOptions = [];
          for (var pvIdx = 0; pvIdx < pg.valuesOrder.length; pvIdx++) {
            var pvName = pg.valuesOrder[pvIdx];
            pgValues.push(pvName);
            var pvMeta = pg.valuesMap[pvName.toLowerCase()];
            /* Agrégation honnête sur les SKUs portant cette valeur :
               • 1 seul groupe : chaque valeur correspond à 1 SKU exact (prix ferme + stock exact) ;
               • >=2 groupes : indisponible seulement si TOUS ses SKUs sont indisponibles ;
                 prix ferme seulement si tous ses SKUs disponibles partagent le même prix
                 (sinon prix min avec priceFrom: true, et la matrice out.aliexpress.skus fournit le prix exact par combinaison). */
            var skusForVal = [];
            for (var sfv = 0; sfv < normalizedSkus.length; sfv++) {
              if (String(normalizedSkus[sfv].attributes[pg.name] || '').toLowerCase() === pvName.toLowerCase()) {
                skusForVal.push(normalizedSkus[sfv]);
              }
            }
            var valAvail = pvMeta.disabled || aePageSoldOut ? false : null;
            var valPrice = null;
            var valPriceFrom = false;
            var valStock = null;
            var valSkuId = skusForVal.length === 1 ? skusForVal[0].skuId : null;
            if (valAvail !== false && skusForVal.length > 0) {
              var anyInStock = false;
              var allOutOfStock = true;
              var allKnownInStock = true;
              var minP = null;
              var minPText = null;
              var maxP = null;
              for (var skv = 0; skv < skusForVal.length; skv++) {
                var candSku = skusForVal[skv];
                if (candSku.available === true) {
                  anyInStock = true;
                  allOutOfStock = false;
                  var numP = candSku.price ? sheinNumericAmount(candSku.price) : null;
                  if (numP !== null) {
                    if (minP === null || numP < minP) { minP = numP; minPText = candSku.price; }
                    if (maxP === null || numP > maxP) { maxP = numP; }
                  }
                } else if (candSku.available === false) {
                  allKnownInStock = false;
                } else {
                  allOutOfStock = false;
                  allKnownInStock = false;
                }
              }
              if (allOutOfStock) {
                valAvail = false;
              } else if (multiGroups.length === 1 && anyInStock) {
                valAvail = true;
                valStock = skusForVal[0].stock;
              } else if (allKnownInStock && anyInStock) {
                valAvail = true;
              }
              if (valAvail !== false && minPText) {
                valPrice = minPText;
                valPriceFrom = (maxP !== null && minP !== null && Math.abs(maxP - minP) >= 0.005);
              }
            } else if (valAvail === null && !skusForVal.length && multiGroups.length === 1 && pvMeta.selected && out.addToCartText) {
              valAvail = true;
            }
            pgOptions.push({
              value: pvName,
              available: valAvail,
              price: valAvail === false ? null : valPrice,
              priceFrom: valAvail === false ? false : valPriceFrom,
              stock: valAvail === false ? null : valStock,
              image: pvMeta.image || null,
              skuId: valSkuId || null
            });
            pushUnique(out.variantTexts, pvName, LIMITS.variantTexts, LIMITS.label);
          }
          pushVariantGroup(pg.name, pgValues, pgChosen, pgOptions);
        }
      }

      out.aliexpress = {
        readerVersion: 2,
        pageItemId: (ALIEXPRESS_STATE && ALIEXPRESS_STATE.itemId) || ALIEXPRESS_ITEM_ID || null,
        selectedSkuId: (selectedSkuObj && selectedSkuObj.skuId) || ALIEXPRESS_URL_SKU_ID || null,
        skus: normalizedSkus
      };
    } catch (e) {}
  }

  if (!IS_AMAZON) {
    try {
      var selects = document.querySelectorAll('select');
      for (var sI = 0; sI < selects.length && out.variantGroups.length < LIMITS.variantGroups; sI++) {
        var selectNode = selects[sI];
        if (!selectNode || !selectNode.options || selectNode.options.length < 2) continue;
        if (isInNavigation(selectNode)) continue;
        if (IS_SHEIN && sheinBlocked(selectNode)) continue;
        var groupName = '';
        try {
          if (selectNode.id) {
            var forLabel = document.querySelector('label[for="' + String(selectNode.id).replace(/"/g, '') + '"]');
            groupName = text(forLabel && forLabel.textContent);
          }
        } catch (e) {}
        if (!groupName) groupName = text(selectNode.getAttribute && selectNode.getAttribute('aria-label'));
        if (!groupName) groupName = text(selectNode.getAttribute && selectNode.getAttribute('data-testid'));
        if (!groupName) groupName = text(selectNode.getAttribute && selectNode.getAttribute('name'));
        if (IS_SHEIN && ldGroupAlreadyCovered(groupName)) continue;
        var values = [];
        var chosen = [];
        var valueOptions = [];
        /* Un NOMBRE dans un <select> n'est une taille que si le groupe en est un
           (pointures 36–46) : ailleurs c'est une quantité ou un index. */
        var selectIsSize = /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(groupName);
        for (var oi = 0; oi < selectNode.options.length && values.length < LIMITS.variantValues; oi++) {
          var opt = selectNode.options[oi];
          var optLabel = text(opt.textContent);
          if (!optLabel || optLabel.length > LIMITS.label || NOT_A_CHOICE.test(optLabel)) continue;
          if (ACTION_NOT_A_VALUE.test(optLabel)) continue;
          if (!selectIsSize && isIndexValue(optLabel)) continue;
          if (ciExactContains(values, optLabel)) continue;
          values.push(optLabel);
          if (opt.selected) chosen.push(optLabel);
          valueOptions.push({
            value: optLabel,
            available: opt.disabled === true ? false : null,
            price: priceOnValue(opt) || null,
            priceFrom: isFromPrice(opt),
            stock: null,
          });
        }
        if (values.length > 1) pushVariantGroup(groupName, values, chosen, valueOptions);
      }

      /* Groupes de boutons radio : <fieldset><legend>Couleur</legend>… */
      var fieldsets = document.querySelectorAll('fieldset');
      for (var fi = 0; fi < fieldsets.length && out.variantGroups.length < LIMITS.variantGroups; fi++) {
        var fieldset = fieldsets[fi];
        if (isInNavigation(fieldset)) continue;
        if (IS_SHEIN && sheinBlocked(fieldset)) continue;
        var radios = fieldset.querySelectorAll('input[type="radio"]');
        if (!radios || radios.length < 2) continue;
        var legend = fieldset.querySelector('legend');
        var fsName = text(legend && legend.textContent);
        if (!fsName) fsName = text(radios[0].getAttribute && radios[0].getAttribute('name'));
        if (IS_SHEIN && ldGroupAlreadyCovered(fsName)) continue;
        var fsValues = [];
        var fsChosen = [];
        var fsOptions = [];
        for (var ri = 0; ri < radios.length && fsValues.length < LIMITS.variantValues; ri++) {
          var radio = radios[ri];
          var radioLabel = '';
          var radioScope = null;
          try {
            if (radio.id) {
              var radioFor = document.querySelector('label[for="' + String(radio.id).replace(/"/g, '') + '"]');
              radioLabel = text(radioFor && radioFor.textContent);
              radioScope = radioFor || null;
            }
          } catch (e) {}
          if (!radioLabel) radioLabel = text(radio.getAttribute && radio.getAttribute('aria-label'));
          if (!radioScope) radioScope = radio.parentNode || null;
          if (!radioLabel) radioLabel = text(radio.getAttribute && radio.getAttribute('value'));
          if (!radioLabel || radioLabel.length > LIMITS.label || NOT_A_CHOICE.test(radioLabel)) continue;
          fsValues.push(radioLabel);
          if (radio.checked) fsChosen.push(radioLabel);
          fsOptions.push({
            value: radioLabel,
            available: valueAvailability(radio) === false || valueAvailability(radioScope) === false ? false : null,
            price: priceOnValue(radioScope) || priceOnValue(radio) || null,
            priceFrom: isFromPrice(radioScope || radio),
            stock: null,
          });
        }
        if (fsValues.length > 1) pushVariantGroup(fsName, fsValues, fsChosen, fsOptions);
      }

      /* ── Boutons-pastilles / cartes de valeurs (23/10/2026) ───────────────
         Beaucoup de boutiques du catalogue n'utilisent ni <select> ni <fieldset> :
         elles rendent des boutons ou des cartes (« Rouge », « 42 », « 150 ml »)
         dans un conteneur dont le nom vient d'un aria-label, d'un data-testid ou
         d'une classe. C'est là que se trouve, pour CHAQUE valeur, son état
         (désactivée ⇒ indisponible) et parfois son prix.

         Bornes strictes : conteneur nommé, ≤ 12 conteneurs, ≤ 20 valeurs, libellé
         ≤ 40 caractères, jamais dans la navigation, valeurs d'index écartées.
         Aucun clic : on ne lit que ce qui est rendu. */
      try {
        var groupHosts = document.querySelectorAll(
          '[role="radiogroup"], [class*="swatch" i], [class*="variant" i], [class*="color" i], '
          + '[class*="colour" i], [class*="size" i], [class*="taille" i], [class*="couleur" i], '
          + '[data-testid*="variant" i], [data-testid*="size" i], [data-testid*="color" i]'
        );
        var acceptedGroupHosts = [];
        for (var gh = 0; gh < groupHosts.length && out.variantGroups.length < LIMITS.variantGroups && gh < 12; gh++) {
          var host = groupHosts[gh];
          if (!host || isInNavigation(host)) continue;
          var insideAcceptedHost = false;
          for (var agh = 0; agh < acceptedGroupHosts.length; agh++) {
            if (acceptedGroupHosts[agh] && acceptedGroupHosts[agh].contains && acceptedGroupHosts[agh].contains(host)) {
              insideAcceptedHost = true;
              break;
            }
          }
          if (insideAcceptedHost) continue;
          if (IS_SHEIN && sheinBlocked(host)) continue;
          /* Le libelle humain du groupe peut etre un titre dans le conteneur
             (Zalando : h3 « Taille » dans form.size-selector). On le lit avant de
             retomber sur la classe technique, qui produirait « size selector ». */
          var hostHeading = '';
          try {
            var headingEl = host.querySelector ? host.querySelector('h1,h2,h3,h4,h5,h6,legend') : null;
            if (headingEl && !isInNavigation(headingEl)) hostHeading = text(headingEl.textContent);
          } catch (e) { hostHeading = ''; }
          var hostDescriptor = text(host.getAttribute && (host.getAttribute('aria-label') || host.getAttribute('data-testid')))
            || text(String(host.id || '').replace(/[-_]+/g, ' '))
            || hostHeading
            || text(String(host.className || '').replace(/[-_]+/g, ' '));
          if (!hostDescriptor || hostDescriptor.length > LIMITS.label) continue;
          if (NOT_A_CHOICE.test(hostDescriptor) || NOT_A_VARIANT_GROUP.test(hostDescriptor)) continue;
          if (IS_SHEIN && ldGroupAlreadyCovered(hostDescriptor)) continue;
          var valueNodes = [];
          /* Pas de "a" : un LIEN n'est pas un choix. Il amenait « Taille & coupe »
             (guide des tailles Zalando) dans la liste des tailles. */
          try { valueNodes = host.querySelectorAll('[role="radio"], [role="option"], button, li, label'); } catch (e) { valueNodes = []; }
          var hostValues = [];
          var hostChosen = [];
          var hostOptions = [];
          for (var vn = 0; vn < valueNodes.length && hostValues.length < LIMITS.variantValues && vn < 40; vn++) {
            var valueNode = valueNodes[vn];
            if (isInNavigation(valueNode)) continue;
            var valueLabel = text(valueNode.getAttribute && valueNode.getAttribute('aria-label'))
              || text(valueNode.getAttribute && valueNode.getAttribute('title'))
              || text(valueNode.textContent);
            if (!valueLabel || valueLabel.length > 40 || NOT_A_CHOICE.test(valueLabel)) continue;
            /* Actions (panier, guide, partage) : jamais une valeur. */
            if (ACTION_NOT_A_VALUE.test(valueLabel)) continue;
            var valueButtonType = valueNode.tagName === 'BUTTON'
              ? String(valueNode.getAttribute && valueNode.getAttribute('type') || '').toLowerCase()
              : '';
            if (valueButtonType === 'submit') continue;
            /* Un NOMBRE SEUL est un index de pagination — SAUF quand il est porté
               par un vrai contrôle de choix : la pointure « 36 » est une taille
               publiée, pas un indice (mesuré 26/10/2026 : toutes les pointures
               entières disparaissaient de la feuille Zalando). */
            var isChoiceControl = false;
            try {
              isChoiceControl = valueNode.tagName === 'INPUT'
                || Boolean(valueNode.querySelector && valueNode.querySelector('input, select'));
            } catch (e) { isChoiceControl = false; }
            if (!isChoiceControl && isIndexValue(valueLabel)) continue;
            if (ciExactContains(hostValues, valueLabel)) continue;
            var checked = String(valueNode.getAttribute && (valueNode.getAttribute('aria-checked') || valueNode.getAttribute('aria-selected')) || '').toLowerCase();
            var classText = String(valueNode.className || '');
            /* Certaines boutiques (Zalando size-checkbox) portent l'etat sur un
               input radio/checkbox ENFANT du label/li cliquable, sans aria ni
               classe selected sur le conteneur. On lit alors l'entree cochee
               elle-meme, sans rien inventer (un input sans checked reste non
               selectionne). */
            var inputChecked = false;
            try {
              if (valueNode.tagName === 'INPUT') {
                inputChecked = valueNode.checked === true;
              } else if (valueNode.querySelector) {
                var checkedInput = valueNode.querySelector('input:checked');
                inputChecked = !!(checkedInput && checkedInput.checked === true);
              }
            } catch (e) { inputChecked = false; }
            var isChosen = checked === 'true'
              || /(^|\s)(selected|active|checked|is-selected)(\s|$)/i.test(classText)
              || inputChecked;
            var valuePrice = priceOnValue(valueNode);
            var cleanLabel = labelWithoutPrice(valueLabel, valuePrice) || valueLabel;
            if (ciExactContains(hostValues, cleanLabel)) continue;
            hostValues.push(cleanLabel);
            if (isChosen) hostChosen.push(cleanLabel);
            hostOptions.push({
              value: cleanLabel,
              available: valueAvailability(valueNode),
              price: valuePrice || null,
              priceFrom: isFromPrice(valueNode),
              stock: null,
            });
          }
          if (hostValues.length > 1) {
            var groupsBefore = out.variantGroups.length;
            pushVariantGroup(hostDescriptor, hostValues, hostChosen, hostOptions);
            if (out.variantGroups.length > groupsBefore) acceptedGroupHosts.push(host);
          }
        }
      } catch (e) {}
    } catch (e) {}

    /* ── 7 ter-2. Ce que seul le JSON-LD publie (26/10/2026) ────────────────
       Aucun conteneur DOM nommé n'a donné ce groupe (feuille sans tailles) : on
       publie alors le groupe du "ProductGroup", avec le prix et l'état PAR
       VALEUR, RESTREINT à la couleur affichée. Rien n'est inventé : ces champs
       sont ceux du marchand, et un désaccord entre variantes n'est pas publié. */
    try {
      ldBuild();
      /* 1. Ce que le JSON-LD ajoute aux groupes déjà lus dans le DOM (prix et
         état PAR VALEUR, jamais d'un groupe à l'autre). */
      for (var gm = 0; gm < out.variantGroups.length; gm++) {
        var groupKey = String(out.variantGroups[gm].name || '').toLowerCase();
        var domRows = DOM_OPTIONS[groupKey] || out.variantGroups[gm].options || [];
        var mergedOptions = mergeVariantOptions(domRows, ldOptionsFor(out.variantGroups[gm].name));
        if (mergedOptions.length) out.variantGroups[gm].options = mergedOptions;
      }
      /* 1 bis. Prix de la PAGE quand le "ProductGroup" n'en publie aucun
         global (couleurs contradictoires ⇒ "firstOffer" rend null) : les
         variantes de la couleur AFFICHÉE portent le montant ET la devise. Une
         fiche dont le DOM écrit «139,99» sans symbole passait pour non vérifiée
         (donc aucun devis en dinars) alors que l'offre du marchand dit
         «139.99 EUR». Ajouté SEULEMENT si la couleur est prouvée et que toutes
         ses variantes s'accordent sur un seul montant. */
      try {
        var ldPriceRows = ldScopedRows(jsonLd);
        if (ldPriceRows.withFacts && ldPriceRows.rows.length) {
          var ldFact = ldConsensus(ldPriceRows.rows);
          var ldPagePrice = ldFact.price;
          if (!ldPagePrice) {
            /* Si certaines tailles de la couleur affichée sont épuisées et d'autres en stock, ldConsensus marque un conflit d'état alors que le prix peut être 100% unanime (ou prouvé sur la taille cochée). */
            var ldUnanimousAmts = [];
            var ldUnanimousCurs = [];
            var domSelectedSize = '';
            for (var dsg = 0; dsg < out.variantGroups.length; dsg++) {
              if (/size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat/i.test(String(out.variantGroups[dsg].name || ''))
                && out.variantGroups[dsg].selected && out.variantGroups[dsg].selected.length === 1) {
                domSelectedSize = String(out.variantGroups[dsg].selected[0]).toLowerCase();
                break;
              }
            }
            for (var lpr = 0; lpr < ldPriceRows.rows.length; lpr++) {
              var prRow = ldPriceRows.rows[lpr];
              if (domSelectedSize && prRow.size && String(prRow.size).toLowerCase() !== domSelectedSize) continue;
              if (prRow.amount) pushUnique(ldUnanimousAmts, prRow.amount, 4, 40);
              if (prRow.currency) pushUnique(ldUnanimousCurs, prRow.currency, 4, 8);
            }
            if (ldUnanimousAmts.length === 1) {
              var resolvedCur = ldUnanimousCurs.length === 1 ? ldUnanimousCurs[0] : ldFact.currency;
              ldPagePrice = ldUnanimousAmts[0] + (resolvedCur ? ' ' + resolvedCur : '');
              if (!ldFact.currency && resolvedCur) ldFact.currency = resolvedCur;
            }
          }
          if (!out.images.length) {
            for (var lpi = 0; lpi < ldPriceRows.rows.length && out.images.length < LIMITS.images; lpi++) {
              if (ldPriceRows.rows[lpi].image) pushUnique(out.images, ldPriceRows.rows[lpi].image, LIMITS.images, 600);
            }
          }
          /* Devise publiée par les offres de CETTE couleur : c'est une donnée
             STRUCTURELLE du marchand ("priceCurrency"), pas une déduction. Sans
             elle, une page qui écrit «139,99» sans symbole laissait la devise
             non prouvée ⇒ aucun devis en dinars. */
          if (!out.currencyText && ldFact.currency) out.currencyText = cut(ldFact.currency, LIMITS.label);
          if (ldPagePrice) {
            var priceKnown = false;
            for (var cp = 0; cp < out.priceCandidates.length; cp++) {
              if (String(out.priceCandidates[cp].text || '').toLowerCase() === ldPagePrice.toLowerCase()) { priceKnown = true; break; }
            }
            if (!priceKnown) out.priceCandidates.unshift({ text: cut(ldPagePrice, LIMITS.text), source: 'json_ld' });
          }
        }
      } catch (e) {}
      /* 2. Ce qu'aucun conteneur DOM n'a donné (feuille sans tailles). */
      for (var ldp = 0; ldp < LD_GROUPS.length && out.variantGroups.length < LIMITS.variantGroups; ldp++) {
        if (ldGroupAlreadyCovered(LD_GROUPS[ldp].name)) continue;
        pushVariantGroup(LD_GROUPS[ldp].name, LD_GROUPS[ldp].values, LD_GROUPS[ldp].selected, LD_GROUPS[ldp].options);
      }
    } catch (e) {}
  }

  /* ── 8. Titre de secours et images visibles ─────────────────────────────── */
  /* Amazon : le titre VISIBLE de la fiche (#productTitle) est lu en premier — c'est le produit de cette page. */
  if (IS_AMAZON) {
    try {
      var amazonTitleEl = document.querySelector('#productTitle');
      var amazonTitle = amazonTitleEl ? cut(amazonTitleEl.textContent, LIMITS.text) : '';
      if (amazonTitle) out.title = amazonTitle;
    } catch (e) {}
  }
  if (IS_SHEIN) {
    try {
      sheinEnsureState();
      var sheinTitleEl = document.querySelector('.product-intro__head-name, .goods-title-h1, [data-testid="product-title"]');
      var sheinDomTitle = (sheinTitleEl && !sheinBlocked(sheinTitleEl)) ? cut(sheinTitleEl.textContent, LIMITS.text) : '';
      if (sheinDomTitle) out.title = sheinDomTitle;
      else if (!out.title && SHEIN_STATE && SHEIN_STATE.title) out.title = cut(SHEIN_STATE.title, LIMITS.text);
      if (!out.brand) {
        var sheinBrandEl = document.querySelector('.product-intro__brand-name, .goods-brand__name, [data-testid="product-brand"]');
        var sheinDomBrand = (sheinBrandEl && !sheinBlocked(sheinBrandEl)) ? cut(sheinBrandEl.textContent, LIMITS.label) : '';
        if (sheinDomBrand) out.brand = sheinDomBrand;
        else if (SHEIN_STATE && SHEIN_STATE.brand) out.brand = cut(SHEIN_STATE.brand, LIMITS.label);
      }
      if (SHEIN_STATE && SHEIN_STATE.images && SHEIN_STATE.images.length) {
        for (var shi = 0; shi < SHEIN_STATE.images.length && out.images.length < LIMITS.images; shi++) {
          pushUnique(out.images, SHEIN_STATE.images[shi], LIMITS.images, 600);
        }
      }
      var sheinGallerySelectors = [
        '.product-intro__main-img img',
        '.goods-gallery img',
        '.product-intro__thumbs img',
        'img[src*="ltwebstatic.com"]',
        'img[data-src*="ltwebstatic.com"]'
      ];
      for (var sgs = 0; sgs < sheinGallerySelectors.length && out.images.length < LIMITS.images; sgs++) {
        var sgNodes = [];
        try { sgNodes = document.querySelectorAll(sheinGallerySelectors[sgs]); } catch (e) { continue; }
        for (var sgn = 0; sgn < sgNodes.length && out.images.length < LIMITS.images; sgn++) {
          if (sheinBlocked(sgNodes[sgn])) continue;
          var sgUrl = sheinHttpsUrl(sgNodes[sgn].getAttribute && (sgNodes[sgn].getAttribute('src') || sgNodes[sgn].getAttribute('data-src')));
          if (sgUrl) pushUnique(out.images, sgUrl, LIMITS.images, 600);
        }
      }
    } catch (e) {}
  }
  if (IS_ALIEXPRESS) {
    try {
      aeEnsureState();
      var aeTitleEl = document.querySelector('[data-pl="product-title"], h1[data-pl="product-title"], .product-title-text, [class*="title--wrap" i] h1, h1');
      var aeDomTitle = (aeTitleEl && !aeBlocked(aeTitleEl)) ? cut(aeTitleEl.textContent, LIMITS.text) : '';
      if (aeDomTitle) out.title = aeDomTitle;
      else if (!out.title && ALIEXPRESS_STATE && ALIEXPRESS_STATE.title) out.title = cut(ALIEXPRESS_STATE.title, LIMITS.text);
      if (!out.brand && ALIEXPRESS_STATE && ALIEXPRESS_STATE.brand) {
        out.brand = cut(ALIEXPRESS_STATE.brand, LIMITS.label);
      }
      if (ALIEXPRESS_STATE && ALIEXPRESS_STATE.images && ALIEXPRESS_STATE.images.length) {
        for (var aei = 0; aei < ALIEXPRESS_STATE.images.length && out.images.length < LIMITS.images; aei++) {
          pushUnique(out.images, ALIEXPRESS_STATE.images[aei], LIMITS.images, 600);
        }
      }
      var aeGallerySelectors = [
        '[class*="image-view" i] img',
        '.images-view-item img',
        '[class*="slider--img" i] img',
        'img[src*="alicdn.com/kf/"]',
        'img[src*="ae01.alicdn.com"]'
      ];
      for (var ags = 0; ags < aeGallerySelectors.length && out.images.length < LIMITS.images; ags++) {
        var agNodes = [];
        try { agNodes = document.querySelectorAll(aeGallerySelectors[ags]); } catch (e) { continue; }
        for (var agn = 0; agn < agNodes.length && out.images.length < LIMITS.images; agn++) {
          if (aeBlocked(agNodes[agn])) continue;
          var agUrl = aeCleanImageUrl(agNodes[agn].getAttribute && (agNodes[agn].getAttribute('src') || agNodes[agn].getAttribute('data-src')));
          if (agUrl) pushUnique(out.images, agUrl, LIMITS.images, 600);
        }
      }
    } catch (e) {}
  }
  if (!out.title) { try { out.title = cut(document.title, LIMITS.text) || null; } catch (e) {} }
  if (AMAZON_STRICT) {
    /* Images PRODUIT d'abord. Mesuré le 06/10/2026 : la lecture générique
       («img[src^=http]») rapportait les sprites de la barre de navigation — donc
       une vignette d'interface à la place de la photo de l'article. L'ordre de la
       galerie est celui publié par «data-a-dynamic-image» (JSON ordonné). */
    try {
      var gallerySelectors = ['#landingImage', '#imgTagWrapperId img', '#imageBlock img', '#main-image-container img', '#altImages img'];
      for (var gs = 0; gs < gallerySelectors.length && out.images.length < LIMITS.images; gs++) {
        var galleryNodes = [];
        try { galleryNodes = document.querySelectorAll(gallerySelectors[gs]); } catch (e) { continue; }
        for (var gn = 0; gn < galleryNodes.length && out.images.length < LIMITS.images; gn++) {
          var galleryImage = galleryNodes[gn];
          var hires = galleryImage.getAttribute && galleryImage.getAttribute('data-old-hires');
          var src = hires || (galleryImage.getAttribute && galleryImage.getAttribute('src'));
          if (src && /^https?:\/\//i.test(String(src))) pushUnique(out.images, src, LIMITS.images, 600);
        }
      }
      var dynamicNodes = [];
      try { dynamicNodes = document.querySelectorAll('[data-a-dynamic-image]'); } catch (e) {}
      for (var dn = 0; dn < dynamicNodes.length && out.images.length < LIMITS.images; dn++) {
        var dynamicRaw = dynamicNodes[dn].getAttribute && dynamicNodes[dn].getAttribute('data-a-dynamic-image');
        if (!dynamicRaw) continue;
        var dynamicMap = null;
        try { dynamicMap = JSON.parse(dynamicRaw); } catch (e) { continue; }
        for (var dynamicKey in dynamicMap) {
          if (!Object.prototype.hasOwnProperty.call(dynamicMap, dynamicKey)) continue;
          if (/^https?:\/\//i.test(dynamicKey)) pushUnique(out.images, dynamicKey, LIMITS.images, 600);
          if (out.images.length >= LIMITS.images) break;
        }
      }
    } catch (e) {}
  }
  try {
    var images = document.querySelectorAll('img[src^="http"]');
    for (var g = 0; g < images.length && out.images.length < LIMITS.images; g++) {
      var width = parseInt(images[g].getAttribute('width') || '0', 10);
      if (width && width < 200) continue;
      pushUnique(out.images, images[g].getAttribute('src'), LIMITS.images, 600);
    }
  } catch (e) {}

  if (AMAZON_STRICT) {
    try { out.amazon = collectAmazonEvidence(); }
    catch (e) { out.amazon = { readerVersion: 2, pageAsin: AMAZON_ASIN || null, selectedAsin: null, selectedValues: [], options: [], variants: [] }; }
    /* Les valeurs AFFICHÉES COMME CHOISIES dans les données du twister entrent
       dans l'évidence de sélection : le serveur vérifie que la combinaison
       demandée à l'ajout a bien été VUE sur la page. Une fiche rendue sans le DOM
       du twister n'en publiait aucune — l'ajout était refusé « stock non
       confirmé » alors que la page affichait la couleur et la taille choisies. */
    /* Groupes PAR VALEUR (prix de la carte, état, stock) : sans eux, le serveur
       ne peut publier aucun devis par taille/couleur et la feuille reste sur
       « Prix en dinars calculé à l'ajout. » dès qu'on change de valeur. */
    try {
      var amazonGroups = amazonVariantGroups(out.amazon);
      for (var ag = 0; ag < amazonGroups.length; ag++) {
        pushVariantGroup(amazonGroups[ag].name, amazonGroups[ag].values, amazonGroups[ag].selected, amazonGroups[ag].options);
      }
    } catch (e) {}
    if (out.amazon && out.amazon.selectedValues) {
      for (var sv = 0; sv < out.amazon.selectedValues.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; sv++) {
        pushUnique(out.selectedVariantTexts, out.amazon.selectedValues[sv], LIMITS.selectedTexts, LIMITS.label);
      }
    }
  }

  /* ── 8 bis. MATRICE UNIVERSELLE DES VARIANTES (variantMatrix) ──────────────
     Construit en UNE SEULE lecture la matrice des combinaisons connues en
     inspectant dans l'ordre :
       1. Données embarquées dans la page (JSON-LD ProductGroup, scripts SSR/hydratation) ;
       2. État préchargé en mémoire navigateur (window.gbRawData, twister, runParams…) ;
       3. Réponses réseau déjà reçues par la page (window.__aywebsNetPayloads) ;
       4. Preuves DOM des cartes de variantes ([data-asin], pastilles avec prix).
     RÈGLE STRICTE : on n'extrapole JAMAIS le prix de base aux autres variantes.
     Une combinaison dont le prix n'est pas prouvé porte price = null (plus son
     variantUrl / variantId si disponible pour une lecture delta ciblée). */
  try {
    var matrixSeen = {};
    var matrixGroupNames = { color: null, size: null };
    for (var mgi = 0; mgi < out.variantGroups.length; mgi++) {
      var mgName = String(out.variantGroups[mgi].name || '');
      if (!matrixGroupNames.color && /colour|color|couleur|farbe|colore|cor|kleur|لون/i.test(mgName)) {
        matrixGroupNames.color = mgName;
      } else if (!matrixGroupNames.size && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(mgName)) {
        matrixGroupNames.size = mgName;
      }
    }
    var pushMatrixEntry = function (entry) {
      if (!entry || !entry.attributes || out.variantMatrix.length >= LIMITS.matrixEntries) return;
      var keys = [];
      for (var k in entry.attributes) {
        if (Object.prototype.hasOwnProperty.call(entry.attributes, k) && entry.attributes[k]) keys.push(k);
      }
      if (!keys.length) return;
      keys.sort();
      var sigParts = [];
      for (var si = 0; si < keys.length; si++) {
        sigParts.push(keys[si].toLowerCase() + '=' + String(entry.attributes[keys[si]]).toLowerCase());
      }
      var sig = sigParts.join('|');
      var existingIdx = matrixSeen[sig];
      if (existingIdx !== undefined) {
        var prev = out.variantMatrix[existingIdx];
        if (!prev.price && entry.price && !entry.priceFrom) {
          prev.price = cut(entry.price, 60);
          prev.priceFrom = false;
          if (entry.evidenceSource) prev.evidenceSource = entry.evidenceSource;
        }
        if (prev.available === null && entry.available !== null && entry.available !== undefined) prev.available = entry.available;
        if (!prev.stock && typeof entry.stock === 'number' && entry.stock > 0) prev.stock = entry.stock;
        if (!prev.image && entry.image) prev.image = entry.image;
        if (!prev.variantUrl && entry.variantUrl) prev.variantUrl = entry.variantUrl;
        if (!prev.variantId && entry.variantId) prev.variantId = entry.variantId;
        if ((!prev.quantityTiers || !prev.quantityTiers.length) && entry.quantityTiers && entry.quantityTiers.length) {
          prev.quantityTiers = entry.quantityTiers;
        }
        return;
      }
      matrixSeen[sig] = out.variantMatrix.length;
      out.variantMatrix.push({
        variantId: entry.variantId ? cut(entry.variantId, 80) : null,
        variantUrl: entry.variantUrl && /^https?:\/\//i.test(String(entry.variantUrl)) ? String(entry.variantUrl).slice(0, 600) : null,
        attributes: entry.attributes,
        price: entry.price && !entry.priceFrom ? cut(entry.price, 60) : null,
        priceFrom: Boolean(entry.priceFrom),
        available: entry.available === true ? true : (entry.available === false ? false : null),
        stock: typeof entry.stock === 'number' && entry.stock > 0 && entry.stock <= 999 ? Math.floor(entry.stock) : null,
        image: entry.image && /^https?:\/\//i.test(String(entry.image)) ? String(entry.image).slice(0, 600) : null,
        evidenceSource: entry.evidenceSource || null,
        quantityTiers: entry.quantityTiers && entry.quantityTiers.length ? entry.quantityTiers : undefined
      });
    };

    /* ── A. Zalando : pastilles couleur rendues en liens <a href="...html"> + hydratation JSON ── */
    var matrixPageHost = '';
    try { matrixPageHost = String((location && location.hostname) || '').toLowerCase().replace(/^(?:www|smile)\./, ''); } catch (e) { matrixPageHost = ''; }
    var IS_ZALANDO = /(?:^|\.)zalando\.[a-z.]{2,6}$/i.test(matrixPageHost);
    if (IS_ZALANDO && !matrixGroupNames.color && out.variantGroups.length < LIMITS.variantGroups) {
      try {
        var zalColorHosts = document.querySelectorAll('[data-testid*="color" i], [class*="color-picker" i], [class*="color_picker" i], [aria-label*="Couleur" i], [aria-label*="Color" i], [aria-label*="Farbe" i]');
        for (var zch = 0; zch < zalColorHosts.length && zch < 6; zch++) {
          var zHost = zalColorHosts[zch];
          if (!zHost || isInNavigation(zHost)) continue;
          var zLinks = zHost.querySelectorAll('a[href*=".html"], button, [role="radio"]');
          var zValues = [];
          var zSelected = [];
          var zOptions = [];
          var zPageHref = ldPageHref();
          for (var zli = 0; zli < zLinks.length && zValues.length < LIMITS.variantValues; zli++) {
            var zEl = zLinks[zli];
            var zImg = zEl.querySelector ? zEl.querySelector('img') : null;
            var zLabel = text(zEl.getAttribute && (zEl.getAttribute('aria-label') || zEl.getAttribute('title')))
              || text(zImg && zImg.getAttribute && (zImg.getAttribute('alt') || zImg.getAttribute('title')));
            zLabel = zLabel.replace(/^(?:couleur|color|farbe)\s*[:\-]\s*/i, '').trim();
            if (!zLabel || zLabel.length > LIMITS.label || NOT_A_CHOICE.test(zLabel) || ACTION_NOT_A_VALUE.test(zLabel)) continue;
            if (ciExactContains(zValues, zLabel)) continue;
            var zHrefRaw = text(zEl.getAttribute && zEl.getAttribute('href'));
            var zAbsUrl = '';
            if (zHrefRaw) {
              try { zAbsUrl = new URL(zHrefRaw, location.href).href; } catch (e) { zAbsUrl = ''; }
            }
            var zChecked = String(zEl.getAttribute && (zEl.getAttribute('aria-current') || zEl.getAttribute('aria-checked') || zEl.getAttribute('aria-selected')) || '').toLowerCase();
            var zIsCurrent = zChecked === 'true' || zChecked === 'page' || (zAbsUrl && zPageHref && ldNormUrl(zAbsUrl) === zPageHref);
            var zThumb = zImg && zImg.getAttribute ? (zImg.getAttribute('src') || '') : '';
            zValues.push(zLabel);
            if (zIsCurrent && !zSelected.length) zSelected.push(zLabel);
            zOptions.push({
              value: zLabel,
              available: null,
              price: null,
              priceFrom: false,
              stock: null,
              image: /^https?:\/\//i.test(zThumb) ? zThumb.slice(0, 600) : null
            });
          }
          if (zValues.length >= 2) {
            pushVariantGroup('Couleur', zValues, zSelected, zOptions);
            matrixGroupNames.color = 'Couleur';
            break;
          }
        }
      } catch (e) {}
    }

    /* ── B. SHEIN : matrice SKUs embarqués / préchargés / réseau + couleurs sœurs ── */
    if (IS_SHEIN) {
      var sheinBuildSiblingUrl = function (targetGid) {
        if (!targetGid || !/^\d{5,16}$/.test(String(targetGid))) return null;
        try {
          var baseHref = String(out.canonicalUrl || location.href || '');
          if (/-p-\d{5,16}\.html/i.test(baseHref)) {
            return baseHref.replace(/-p-\d{5,16}(\.html)/i, '-p-' + targetGid + '$1');
          }
          return location.origin + '/product-p-' + targetGid + '.html';
        } catch (e) { return null; }
      };
      var sheinColorGroup = null;
      var sheinSizeGroup = null;
      for (var sgIdx = 0; sgIdx < out.variantGroups.length; sgIdx++) {
        if (out.variantGroups[sgIdx].name === 'Couleur') sheinColorGroup = out.variantGroups[sgIdx];
        else if (out.variantGroups[sgIdx].name === 'Taille') sheinSizeGroup = out.variantGroups[sgIdx];
      }
      var sheinColorImgByVal = {};
      var sheinColorGidByVal = {};
      if (sheinColorGroup && sheinColorGroup.options) {
        for (var sci = 0; sci < sheinColorGroup.options.length; sci++) {
          var scOpt = sheinColorGroup.options[sci];
          if (!scOpt || !scOpt.value) continue;
          var scKey = scOpt.value.toLowerCase();
          if (scOpt.image) sheinColorImgByVal[scKey] = scOpt.image;
          if (scOpt.goodsId) sheinColorGidByVal[scKey] = scOpt.goodsId;
        }
      }
      var sheinCoveredColors = {};
      if (SHEIN_STATE && SHEIN_STATE.skus && SHEIN_STATE.skus.length) {
        for (var ssk = 0; ssk < SHEIN_STATE.skus.length; ssk++) {
          var sSku = SHEIN_STATE.skus[ssk];
          if (!sSku || !sSku.attributes) continue;
          var sAttrsCopy = {};
          for (var sak in sSku.attributes) {
            if (!Object.prototype.hasOwnProperty.call(sSku.attributes, sak)) continue;
            if (sak === 'Couleur' && !sheinColorGroup) continue;
            sAttrsCopy[sak] = sSku.attributes[sak];
          }
          if (sSku.attributes['Couleur']) sheinCoveredColors[sSku.attributes['Couleur'].toLowerCase()] = true;
          var sColKey = sSku.attributes['Couleur'] ? sSku.attributes['Couleur'].toLowerCase() : '';
          var sThumb = (sColKey && sheinColorImgByVal[sColKey]) || sSku.image || null;
          var sGid = sSku.goodsId || (sColKey && sheinColorGidByVal[sColKey]) || null;
          pushMatrixEntry({
            variantId: sSku.skuId || (sGid ? 'shein:' + sGid : null),
            variantUrl: sGid ? sheinBuildSiblingUrl(sGid) : null,
            attributes: sAttrsCopy,
            price: sSku.price || null,
            priceFrom: false,
            available: sSku.available,
            stock: sSku.stock,
            image: sThumb,
            evidenceSource: sSku.evidenceSource || 'embedded_json',
            quantityTiers: (sSku.quantityTiers && sSku.quantityTiers.length) ? sSku.quantityTiers : ((SHEIN_STATE && SHEIN_STATE.quantityTiers) || undefined)
          });
        }
      } else if (sheinSizeGroup && sheinSizeGroup.options && sheinSizeGroup.options.length) {
        var domColorVal = (out.shein && out.shein.selectedColor) || '';
        for (var dsz = 0; dsz < sheinSizeGroup.options.length; dsz++) {
          var dOpt = sheinSizeGroup.options[dsz];
          if (!dOpt || !dOpt.value) continue;
          var dAttrs = { 'Taille': dOpt.value };
          if (sheinColorGroup && domColorVal) {
            dAttrs['Couleur'] = domColorVal;
            sheinCoveredColors[domColorVal.toLowerCase()] = true;
          }
          pushMatrixEntry({
            variantId: (out.shein && out.shein.pageGoodsId) ? ('shein:' + out.shein.pageGoodsId + ':' + dOpt.value) : null,
            variantUrl: (out.shein && out.shein.pageGoodsId) ? sheinBuildSiblingUrl(out.shein.pageGoodsId) : null,
            attributes: dAttrs,
            price: dOpt.price || null,
            priceFrom: Boolean(dOpt.priceFrom),
            available: dOpt.available,
            stock: dOpt.stock,
            image: (domColorVal && sheinColorImgByVal[domColorVal.toLowerCase()]) || null,
            evidenceSource: 'dom'
          });
        }
      }
      /* Couleurs sœurs SHEIN :
         - Si la fiche n'a PAS de tailles (couleur seule), on publie l'entrée couleur (prix uniquement s'il n'est pas priceFrom).
         - Si la fiche a des tailles et que la couleur sœur n'a pas de SKUs embarqués, l'URL sœur reste portée par Couleur.options[].goodsId sans jamais prêter le prix de la couleur courante. */
      if (sheinColorGroup && sheinColorGroup.options && !sheinSizeGroup) {
        for (var sco = 0; sco < sheinColorGroup.options.length; sco++) {
          var cOptOnly = sheinColorGroup.options[sco];
          if (!cOptOnly || !cOptOnly.value || sheinCoveredColors[cOptOnly.value.toLowerCase()]) continue;
          pushMatrixEntry({
            variantId: cOptOnly.goodsId ? 'shein:' + cOptOnly.goodsId : null,
            variantUrl: cOptOnly.goodsId ? sheinBuildSiblingUrl(cOptOnly.goodsId) : null,
            attributes: { 'Couleur': cOptOnly.value },
            price: (!cOptOnly.priceFrom && cOptOnly.price) ? cOptOnly.price : null,
            priceFrom: Boolean(cOptOnly.priceFrom),
            available: cOptOnly.available,
            stock: null,
            image: cOptOnly.image || null,
            evidenceSource: 'embedded_json'
          });
        }
      }
    }

    /* ── C. JSON-LD ProductGroup & Hydratation Zalando (hasVariant[] + simples[] + cache réseau) ── */
    if (!IS_AMAZON && !IS_SHEIN && !IS_ALIEXPRESS) {
      var ldScopedCheck = ldScopedRows(jsonLd);
      if (ldScopedCheck.withFacts) {
        var allJsonLdRows = ldRows(jsonLd);
        var colorGroupObj = null;
        for (var cg = 0; cg < out.variantGroups.length; cg++) {
          if (matrixGroupNames.color && out.variantGroups[cg].name === matrixGroupNames.color) {
            colorGroupObj = out.variantGroups[cg];
            break;
          }
        }
        var allowedColors = null;
        if (colorGroupObj && colorGroupObj.values && colorGroupObj.values.length) {
          allowedColors = {};
          for (var aci = 0; aci < colorGroupObj.values.length; aci++) {
            allowedColors[String(colorGroupObj.values[aci]).toLowerCase()] = colorGroupObj.values[aci];
          }
        }
        var ldRowsForMatrix = colorGroupObj ? allJsonLdRows : ldScopedCheck.rows;
        for (var lmr = 0; lmr < ldRowsForMatrix.length; lmr++) {
          var lRow = ldRowsForMatrix[lmr];
          var mAttrs = {};
          if (colorGroupObj && lRow.color) {
            var matchedColLabel = allowedColors ? allowedColors[lRow.color.toLowerCase()] : lRow.color;
            if (!matchedColLabel) continue;
            mAttrs[colorGroupObj.name] = matchedColLabel;
            if (lRow.image && colorGroupObj.options) {
              for (var cgo = 0; cgo < colorGroupObj.options.length; cgo++) {
                if (colorGroupObj.options[cgo].value.toLowerCase() === matchedColLabel.toLowerCase() && !colorGroupObj.options[cgo].image) {
                  colorGroupObj.options[cgo].image = lRow.image;
                }
              }
            }
          }
          if (lRow.size) {
            mAttrs[matrixGroupNames.size || 'Taille'] = lRow.size;
          }
          if (lRow.extraAttrs) {
            for (var exk in lRow.extraAttrs) {
              if (Object.prototype.hasOwnProperty.call(lRow.extraAttrs, exk) && lRow.extraAttrs[exk]) {
                mAttrs[exk] = lRow.extraAttrs[exk];
              }
            }
          }
          var resolvedUrl = '';
          if (lRow.url) {
            try { resolvedUrl = new URL(lRow.url, location.href).href; } catch (e) { resolvedUrl = ''; }
          }
          var rowPrice = lRow.amount ? (lRow.amount + (lRow.currency ? ' ' + lRow.currency : '')) : null;
          pushMatrixEntry({
            variantId: lRow.sku || null,
            variantUrl: resolvedUrl || null,
            attributes: mAttrs,
            price: rowPrice,
            priceFrom: false,
            available: lRow.available,
            stock: lRow.stock,
            image: lRow.image || null,
            evidenceSource: 'json_ld'
          });
        }
      }
      /* Hydratation JSON / cache réseau Zalando (simples[] avec offre par taille) */
      if (IS_ZALANDO) {
        var parseZalandoSimples = function (node, evSource, fallbackColor) {
          if (!node || typeof node !== 'object') return;
          var simples = node.simples || (node.product && node.product.simples) || (node.data && node.data.product && node.data.product.simples) || null;
          if (Object.prototype.toString.call(simples) === '[object Array]') {
            var zCol = text(node.color && (node.color.label || node.color.name) || (node.product && node.product.color && (node.product.color.label || node.product.color.name)) || fallbackColor || '');
            for (var zs = 0; zs < simples.length && zs < 40; zs++) {
              var sItem = simples[zs];
              if (!sItem || typeof sItem !== 'object') continue;
              var szName = text((sItem.size && (sItem.size.local || sItem.size.label || sItem.size)) || sItem.sizeLabel || '');
              if (!szName) continue;
              var sOffer = sItem.offer || (Object.prototype.toString.call(sItem.allOffers) === '[object Array]' ? sItem.allOffers[0] : null) || sItem;
              var sPriceNode = sOffer && sOffer.price ? (sOffer.price.promotional || sOffer.price.original || sOffer.price) : null;
              var sAmt = sPriceNode && sPriceNode.amount !== undefined ? Number(sPriceNode.amount) : NaN;
              /* Zalando GraphQL exprime parfois amount en centimes entiers quand formatted est présent ; on préfère formatted s'il contient une décimale ou devise, sinon amount décimal. */
              var sFormatted = text(sPriceNode && (sPriceNode.formatted || sPriceNode.display) || '');
              var sCur = text((sPriceNode && sPriceNode.currency) || out.currencyText || '').toUpperCase();
              var sPriceStr = '';
              if (sFormatted && HAS_DIGIT.test(sFormatted)) {
                sPriceStr = CURRENCY_HINT.test(sFormatted) ? sFormatted : (sCur ? sFormatted + ' ' + sCur : sFormatted);
              } else if (isFinite(sAmt) && sAmt > 0) {
                sPriceStr = sAmt.toFixed(2) + (sCur ? ' ' + sCur : '');
              }
              var stockStatus = String((sOffer && sOffer.stock && (sOffer.stock.status || sOffer.stock)) || '').toUpperCase();
              var zAvail = stockStatus === 'OUT_OF_STOCK' ? false : (stockStatus === 'IN_STOCK' || stockStatus === 'LOW_ON_STOCK' ? true : null);
              var zQty = sOffer && sOffer.stock && typeof sOffer.stock.quantity === 'number' ? sOffer.stock.quantity : null;
              var zAttrs = {};
              if (matrixGroupNames.color && zCol) zAttrs[matrixGroupNames.color] = zCol;
              zAttrs[matrixGroupNames.size || 'Taille'] = szName;
              pushMatrixEntry({
                variantId: text(sItem.sku || ''),
                variantUrl: null,
                attributes: zAttrs,
                price: sPriceStr || null,
                priceFrom: false,
                available: zAvail,
                stock: zQty,
                image: null,
                evidenceSource: evSource
              });
            }
          }
        };
        try {
          var zJsonScripts = document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__');
          for (var zjs = 0; zjs < zJsonScripts.length && zjs < 20; zjs++) {
            var zRaw = zJsonScripts[zjs].textContent || '';
            if (!zRaw || zRaw.length > 500000 || zRaw.indexOf('simples') < 0) continue;
            var zParsed = null;
            try { zParsed = JSON.parse(zRaw); } catch (e) { zParsed = null; }
            if (zParsed) parseZalandoSimples(zParsed, 'embedded_json', '');
          }
          var zNet = GLOBAL_WIN && GLOBAL_WIN.__aywebsNetPayloads;
          if (Object.prototype.toString.call(zNet) === '[object Array]') {
            for (var zni = 0; zni < zNet.length && zni < 25; zni++) {
              if (zNet[zni] && zNet[zni].body) parseZalandoSimples(zNet[zni].body, 'network_cache', '');
            }
          }
        } catch (e) {}
      }
    }

    /* ── D. Amazon : jointure dimensionValuesDisplayData x prix ASIN prouvés (buybox / cartes [data-asin] / réseau) ── */
    if (AMAZON_STRICT && out.amazon) {
      var activeAsin = out.amazon.selectedAsin || out.amazon.pageAsin || AMAZON_ASIN || '';
      var activeBuyboxPrice = null;
      if (out.priceCandidates && out.priceCandidates.length > 0) {
        for (var apci = 0; apci < out.priceCandidates.length; apci++) {
          var apCand = out.priceCandidates[apci];
          if (apCand && apCand.text && (apCand.source === 'a11y_label' || apCand.source === 'amazon_buybox' || apCand.source === 'dom_price' || out.priceCandidates.length === 1)) {
            activeBuyboxPrice = apCand.text;
            break;
          }
        }
      }
      var asinFacts = {};
      var recordAsinFact = function (asinCode, info) {
        if (!asinCode) return;
        var aKey = String(asinCode).toUpperCase();
        if (!asinFacts[aKey]) {
          asinFacts[aKey] = { price: null, conflict: false, available: null, stock: null, image: null, source: info.source || 'dom' };
        }
        var slot = asinFacts[aKey];
        if (info.price && !info.priceFrom) {
          if (!slot.price && !slot.conflict) {
            slot.price = info.price;
            if (info.source) slot.source = info.source;
          } else if (slot.price && slot.price !== info.price) {
            slot.price = null;
            slot.conflict = true;
          }
        }
        if (info.available === false) slot.available = false;
        else if (info.available === true && slot.available !== false) slot.available = true;
        if (!slot.stock && typeof info.stock === 'number' && info.stock > 0) slot.stock = info.stock;
        if (!slot.image && info.image) slot.image = info.image;
      };
      var joinedStockText = [out.availabilityText || ''].concat(out.stockTexts || []).join(' | ');
      var activeAvail = null;
      if (/currently unavailable|out of stock|temporarily out of stock|actuellement indisponible|derzeit nicht verfügbar|nicht auf lager/i.test(joinedStockText)) {
        activeAvail = false;
      } else if ((out.purchaseAction && out.purchaseAction.present && !out.purchaseAction.disabled)
        || /\bin stock\b|en stock|auf lager|disponible|disponibilità immediata/i.test(joinedStockText)) {
        activeAvail = true;
      }
      if (activeAsin && (activeBuyboxPrice || activeAvail !== null)) {
        recordAsinFact(activeAsin, {
          price: activeBuyboxPrice,
          priceFrom: false,
          available: activeAvail,
          stock: null,
          image: (out.images && out.images[0]) || null,
          source: 'dom'
        });
      }
      if (out.amazon.options && out.amazon.options.length) {
        for (var aoi = 0; aoi < out.amazon.options.length; aoi++) {
          var aOpt = out.amazon.options[aoi];
          if (!aOpt || !aOpt.asin) continue;
          var aOptEv = String(aOpt.availabilityEvidence || aOpt.availability || '').toUpperCase();
          var aOptAvail = aOptEv === 'UNAVAILABLE' ? false : (aOptEv === 'AVAILABLE' ? true : (aOptEv === 'SELECTED' ? activeAvail : null));
          recordAsinFact(aOpt.asin, {
            price: aOpt.price || null,
            priceFrom: Boolean(aOpt.priceFrom),
            available: aOptAvail,
            stock: aOpt.stock || null,
            image: aOpt.image || null,
            source: 'dom'
          });
        }
      }
      /* Réponses réseau twister / ajax déjà reçues par la page Amazon (Source #3) */
      try {
        var amzNet = GLOBAL_WIN && GLOBAL_WIN.__aywebsNetPayloads;
        if (Object.prototype.toString.call(amzNet) === '[object Array]') {
          for (var ani = 0; ani < amzNet.length && ani < 25; ani++) {
            var aBody = amzNet[ani] && amzNet[ani].body;
            if (!aBody || typeof aBody !== 'object') continue;
            var priceMap = aBody.asinToPrice || aBody.priceMap || (aBody.Value && aBody.Value.content && aBody.Value.content.twisterSlotJson) || null;
            if (priceMap && typeof priceMap === 'object') {
              for (var pmAsin in priceMap) {
                if (!Object.prototype.hasOwnProperty.call(priceMap, pmAsin) || !/^[A-Z0-9]{10}$/i.test(pmAsin)) continue;
                var pmVal = priceMap[pmAsin];
                var pmStr = typeof pmVal === 'string' ? text(pmVal) : text(pmVal && (pmVal.displayPrice || pmVal.price || pmVal.priceAmount) || '');
                if (pmStr && HAS_DIGIT.test(pmStr) && CURRENCY_HINT.test(pmStr)) {
                  recordAsinFact(pmAsin, { price: pmStr, priceFrom: false, available: true, stock: null, image: null, source: 'network_cache' });
                }
              }
            }
          }
        }
      } catch (e) {}
      var amzOrigin = '';
      try { amzOrigin = String(location.origin || ''); } catch (e) { amzOrigin = ''; }
      if (out.amazon.variants && out.amazon.variants.length) {
        for (var avi = 0; avi < out.amazon.variants.length; avi++) {
          var aVar = out.amazon.variants[avi];
          if (!aVar || !aVar.asin) continue;
          var aAttrs = {};
          var aAttrCount = 0;
          if (Object.prototype.toString.call(aVar.dimensions) === '[object Array]') {
            for (var adi = 0; adi < aVar.dimensions.length; adi++) {
              var aDim = aVar.dimensions[adi];
              if (!aDim || !aDim.name || !aDim.value) continue;
              var matchedGroup = aDim.name;
              for (var agm = 0; agm < out.variantGroups.length; agm++) {
                if (out.variantGroups[agm].name.toLowerCase() === String(aDim.name).toLowerCase()) {
                  matchedGroup = out.variantGroups[agm].name;
                  break;
                }
              }
              aAttrs[matchedGroup] = aDim.value;
              aAttrCount++;
            }
          } else if (aVar.values && typeof aVar.values === 'object') {
            for (var adim in aVar.values) {
              if (!Object.prototype.hasOwnProperty.call(aVar.values, adim)) continue;
              aAttrs[adim] = aVar.values[adim];
              aAttrCount++;
            }
          }
          if (!aAttrCount) continue;
          var aFact = asinFacts[String(aVar.asin).toUpperCase()] || null;
          pushMatrixEntry({
            variantId: 'asin:' + String(aVar.asin).toUpperCase(),
            variantUrl: amzOrigin ? (amzOrigin + '/dp/' + String(aVar.asin).toUpperCase()) : null,
            attributes: aAttrs,
            price: aFact ? aFact.price : null,
            priceFrom: false,
            available: aFact ? aFact.available : null,
            stock: aFact ? aFact.stock : null,
            image: aFact ? aFact.image : null,
            evidenceSource: aFact ? aFact.source : 'embedded_json'
          });
        }
      }
    }

    /* ── E. AliExpress : projection dans variantMatrix (en conservant out.aliexpress.skus) ── */
    if (IS_ALIEXPRESS && out.aliexpress && out.aliexpress.skus && out.aliexpress.skus.length) {
      for (var aem = 0; aem < out.aliexpress.skus.length; aem++) {
        var aeSku = out.aliexpress.skus[aem];
        if (!aeSku || !aeSku.attributes) continue;
        pushMatrixEntry({
          variantId: aeSku.skuId ? ('ae:' + aeSku.skuId) : null,
          variantUrl: null,
          attributes: aeSku.attributes,
          price: aeSku.price || null,
          priceFrom: false,
          available: aeSku.available,
          stock: aeSku.stock,
          image: aeSku.image || null,
          evidenceSource: 'embedded_json'
        });
      }
    }
  } catch (e) {}

  /* ── 9. Bornes finales + sortie JSON ────────────────────────────────────── */
  if (out.priceCandidates.length > LIMITS.priceCandidates) out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
  if (!out.title) out.title = null;
  if (!out.capturedAt) out.capturedAt = new Date().toISOString();
  try {
    var serializedOut = JSON.stringify(out);
    /* Garde-fou contre « TOO_LARGE » (64 Ko octets / caractères) sur les fiches
       denses : on réduit progressivement « out.variantMatrix » et « out.aliexpress.skus »
       en préservant les premières entrées (combinaison active en tête). */
    var byteCount = function (str) {
      try { return encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, 'x').length; }
      catch (e) { return str.length * 2; }
    };
    while (
      ((out.variantMatrix && out.variantMatrix.length > 0) || (out.aliexpress && out.aliexpress.skus && out.aliexpress.skus.length > 0))
      && (serializedOut.length > 56000 || byteCount(serializedOut) > 56000)
    ) {
      if (out.variantMatrix && out.variantMatrix.length > 0) {
        out.variantMatrix = out.variantMatrix.slice(0, Math.floor(out.variantMatrix.length * 0.7));
      }
      if (out.aliexpress && out.aliexpress.skus && out.aliexpress.skus.length > 0) {
        out.aliexpress.skus = out.aliexpress.skus.slice(0, Math.floor(out.aliexpress.skus.length * 0.7));
      }
      serializedOut = JSON.stringify(out);
    }
    return serializedOut;
  } catch (e) { return '{}'; }
})();`;

/**
 * Script passif en lecture seule injecté AVANT le chargement de la page WebView
 * (`injectedJavaScriptBeforeContentLoaded`) pour mémoriser dans un anneau borné
 * (`window.__aywebsNetPayloads`, max 25 entrées JSON produit/variantes ≤ 180 Ko)
 * les réponses réseau déjà demandées par la boutique lors de l'ouverture de la
 * fiche (Source #3 : `network_cache`). Ne modifie AUCUN en-tête, cookie, jeton
 * ni flux de réponse du marchand.
 */
export const AYWEBS_NETWORK_OBSERVER_SCRIPT = String.raw`(function () {
  try {
    if (window.__aywebsNetObserverInstalled) return;
    window.__aywebsNetObserverInstalled = true;
    window.__aywebsNetPayloads = window.__aywebsNetPayloads || [];
    var RELEVANT_URL = /product|goods|detail|sku|variant|twister|graphql|item|offer|price|pdp/i;
    var pushPayload = function (reqUrl, bodyObj) {
      try {
        if (!bodyObj || typeof bodyObj !== 'object') return;
        var list = window.__aywebsNetPayloads;
        if (!list || list.length >= 25) {
          if (list && list.length >= 25) list.shift();
          else return;
        }
        list.push({ url: String(reqUrl || '').slice(0, 300), body: bodyObj, ts: Date.now() });
      } catch (e) {}
    };
    if (typeof window.fetch === 'function') {
      var origFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var reqUrl = '';
        try { reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''; } catch (e) {}
        var p = origFetch.apply(this, args);
        if (reqUrl && RELEVANT_URL.test(reqUrl) && p && typeof p.then === 'function') {
          p.then(function (res) {
            try {
              if (!res || !res.clone) return;
              var ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
              if (ct && ct.indexOf('json') < 0 && ct.indexOf('javascript') < 0) return;
              res.clone().text().then(function (txt) {
                if (!txt || txt.length > 180000) return;
                try { pushPayload(reqUrl, JSON.parse(txt)); } catch (e) {}
              })['catch'](function () {});
            } catch (e) {}
          })['catch'](function () {});
        }
        return p;
      };
    }
    if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype) {
      var origOpen = window.XMLHttpRequest.prototype.open;
      var origSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        try { this.__aywebsUrl = String(url || ''); } catch (e) {}
        return origOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        try {
          if (xhr.__aywebsUrl && RELEVANT_URL.test(xhr.__aywebsUrl) && xhr.addEventListener) {
            xhr.addEventListener('load', function () {
              try {
                if (xhr.responseType && xhr.responseType !== '' && xhr.responseType !== 'text' && xhr.responseType !== 'json') return;
                if (xhr.responseType === 'json' && xhr.response && typeof xhr.response === 'object') {
                  pushPayload(xhr.__aywebsUrl, xhr.response);
                  return;
                }
                var txt = typeof xhr.responseText === 'string' ? xhr.responseText : '';
                if (!txt || txt.length > 180000) return;
                pushPayload(xhr.__aywebsUrl, JSON.parse(txt));
              } catch (e) {}
            });
          }
        } catch (e) {}
        return origSend.apply(this, arguments);
      };
    }
  } catch (e) {}
})();`;

/**
 * Build the independently versioned script served for a registered store.
 * The extraction core and trust boundaries stay shared; a reader profile is
 * scoped to that store's domains and selects its own price-reading policy.
 * Calling without a store keeps the legacy bundle for old app builds.
 */
export function buildAyWebsCaptureScript(storeId?: string | null): string {
  const reader = ayWebsCaptureReader(storeId);
  if (!reader) return AYWEBS_CAPTURE_SCRIPT;
  const store = findAyWebsStore(reader.storeId);
  if (!store) return AYWEBS_CAPTURE_SCRIPT;
  const profile = JSON.stringify({
    storeId: reader.storeId,
    version: reader.version,
    priceMode: reader.priceMode,
    domains: store.domains,
  });
  const coreExpression = AYWEBS_CAPTURE_SCRIPT.trim().replace(/[\s;]+$/, '');
  return [
    '(function () {',
    '  var w = window;',
    '  var key = "__AYWEBS_CAPTURE_READER__";',
    '  var previous = w[key];',
    '  var requested = ' + profile + ';',
    '  var host = String((w.location && w.location.hostname) || "").toLowerCase().replace(/^www\\./, "");',
    '  var matches = false;',
    '  for (var i = 0; i < requested.domains.length; i++) {',
    '    var domain = String(requested.domains[i] || "").toLowerCase();',
    '    if (host === domain || host.slice(-(domain.length + 1)) === "." + domain) { matches = true; break; }',
    '  }',
    '  w[key] = matches ? requested : null;',
    '  try { return (' + coreExpression + '); }',
    '  finally { if (previous === undefined) { try { delete w[key]; } catch (e) { w[key] = null; } } else { w[key] = previous; } }',
    '})()',
  ].join('\n');
}
