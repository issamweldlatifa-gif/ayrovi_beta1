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
import { AMAZON_MOBILE_CAPTURE_SCRIPT } from './storeScripts/amazon';
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
  try { host = String(location.hostname || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, ''); } catch (e) { host = ''; }
  var IS_AMAZON = /^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
  function hasSelector(selector) {
    try { return !!document.querySelector(selector); } catch (e) { return false; }
  }
  /* La coquille produit : une vraie fiche /dp ou /gp/aw/d (mobile web) en a toujours au moins un marqueur.
     Une page amazon.com qui n'en a aucun n'est pas une fiche produit (page de
     recherche, page de test) : elle garde le lecteur générique. */
  var AMAZON_STRICT = IS_AMAZON && (
    hasSelector('#dp-container') || hasSelector('#dp') || hasSelector('#ppd') || hasSelector('#centerCol')
    || hasSelector('#buybox') || hasSelector('#desktop_buybox') || hasSelector('#mobile_buybox')
    || hasSelector('#apex_desktop') || hasSelector('#apex_mobile')
    || hasSelector('#corePriceDisplay_desktop_feature_div') || hasSelector('#corePrice_desktop')
    || hasSelector('#corePrice_feature_div') || hasSelector('#corePrice_mobile_feature_div')
    || hasSelector('#corePriceDisplay_mobile_feature_div') || hasSelector('#newPitchPriceWrapper_feature_div')
    || hasSelector('#twister-plus-mobile-inline-twister') || hasSelector('#mobile-twister'));
  var AMAZON_ASIN = '';
  if (AMAZON_STRICT) {
    try {
      var asinMatch = String(location.pathname || '').match(/\/(?:dp|gp\/(?:product|aw\/d)|product|exec\/obidos\/ASIN|d(?:\/[^/]+)?)\/([A-Z0-9]{10})(?:[/?]|$)/i);
      if (asinMatch) AMAZON_ASIN = asinMatch[1].toUpperCase();
      if (!AMAZON_ASIN) {
        var canonicalLink = document.querySelector('link[rel="canonical"]');
        var canonicalHref = canonicalLink ? String(canonicalLink.getAttribute('href') || '') : '';
        var canonicalMatch = canonicalHref.match(/\/(?:dp|gp\/(?:product|aw\/d)|product|exec\/obidos\/ASIN|d(?:\/[^/]+)?)\/([A-Z0-9]{10})(?:[/?]|$)/i);
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
  var TEMU_GOODS_ID = '';
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
  if (IS_TEMU) {
    try {
      var temuQMatch = String(location.search || '').match(/[?&](?:goods_id|goodsId)=(\d{6,})(?:&|$)/i);
      if (temuQMatch) TEMU_GOODS_ID = temuQMatch[1];
      if (!TEMU_GOODS_ID) {
        var temuPMatch = String(location.pathname || '').match(/(?:^|[-/])g-(\d{6,})(?=[-./?]|$)/i);
        if (temuPMatch) TEMU_GOODS_ID = temuPMatch[1];
      }
      if (!TEMU_GOODS_ID) {
        var temuCanonEl = document.querySelector('link[rel="canonical"]');
        var temuCanonHref = temuCanonEl ? String(temuCanonEl.getAttribute('href') || '') : '';
        var temuCanonMatch = temuCanonHref.match(/(?:^|[-/])g-(\d{6,})(?=[-./?]|$)/i)
          || temuCanonHref.match(/[?&](?:goods_id|goodsId)=(\d{6,})(?:&|$)/i);
        if (temuCanonMatch) TEMU_GOODS_ID = temuCanonMatch[1];
      }
    } catch (e) {}
  }
  if (IS_ALIEXPRESS) {
    try {
      var aePath = String(location.pathname || '');
      var aePathMatch = aePath.match(/\/(?:item|i)\/(\d{6,20})(?:\.html)?(?:[/?]|$)/i)
        || aePath.match(/\/store\/product\/[^/]+\/(?:\d+_)?(\d{6,20})(?:\.html)?(?:[/?]|$)/i);
      if (aePathMatch) ALIEXPRESS_ITEM_ID = aePathMatch[1];
      if (!ALIEXPRESS_ITEM_ID) {
        var aeQueryMatch = String(location.search || '').match(/[?&](?:productId|itemId|item_id|_p_prod|_itemid|prodId)=(\d{6,20})(?:&|$)/i);
        if (aeQueryMatch) ALIEXPRESS_ITEM_ID = aeQueryMatch[1];
      }
      if (!ALIEXPRESS_ITEM_ID && !/^\/(?:p\/order|cart|shoppingcart)\b/i.test(aePath)) {
        var aeBundleMatch = String(location.search || '').match(/[?&]productIds=(\d{6,20})(?:%3A|:|%2C|,|%7C|\||&|$)/i);
        if (aeBundleMatch) ALIEXPRESS_ITEM_ID = aeBundleMatch[1];
      }
      if (!ALIEXPRESS_ITEM_ID) {
        var aeCanonEl = document.querySelector('link[rel="canonical"]');
        var aeCanonHref = aeCanonEl ? String(aeCanonEl.getAttribute('href') || '') : '';
        var aeCanonMatch = aeCanonHref.match(/\/(?:item|i)\/(\d{6,20})(?:\.html)?/i);
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
    '[class*="goods-detail" i] [class*="main-price" i]',
    '[class*="goods-detail" i] [class*="sale-price" i]',
    '[class*="product-price__main" i]',
    '[class*="main-price__price" i]',
    '[data-testid="product-price-sale"]'
  ];
  var TEMU_MAIN_PRICE_SCOPES = [
    '#goods_price [aria-label]',
    '#goods_price',
    '[id="goods_price"]',
    '[id*="goods_price" i]',
    '[data-testid="product-price-sale"]',
    '[data-testid="product-price-current"]',
    '[class*="goods-price" i] [class*="sale" i]',
    '[class*="price-wrap" i] [class*="sale" i]',
    '[class*="product-price" i] [class*="current" i]',
    '.goods-price__main'
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
    '[class*="price--currentPrice" i]',
    '[class*="bundle" i] [class*="currentPrice" i]',
    '[class*="pdp-price" i] [class*="current" i]',
    '[class*="H5Price" i]',
    '[class*="snow-price_SnowPrice__main" i]',
    '[class*="msku" i] [class*="price" i]',
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
  var SHEIN_BLOCKED_CONTEXT = /recommend|similar|also[-_ ]?like|related|carousel|review|comment|outfit|shop[-_ ]?the[-_ ]?look|match[-_ ]?with|often[-_ ]?bought|recently[-_ ]?viewed|(?:site|global|page)[-_ ]?(?:header|footer)/i;
  var AE_BLOCKED_CONTEXT = /recommend|more[-_ ]?to[-_ ]?love|similar|related|also[-_ ]?like|(?:bundle|combo)[-_ ]?(?:recommend|more|list|carousel|slider)|shipping|delivery|freight|installment|klarna|afterpay|choice[-_ ]?banner|review|comment|seller[-_ ]?rec|store[-_ ]?rec|(?:site|global|page)[-_ ]?(?:header|footer)/i;
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
        if (IS_SHEIN || IS_TEMU || IS_ALIEXPRESS) value = aeNormalizeSplitPrice(value);
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
  function aeNodeHidden(el) {
    var cur = el;
    for (var h = 0; cur && cur.nodeType === 1 && h < 6; h++) {
      if (cur.getAttribute && (cur.getAttribute('aria-hidden') === 'true' || cur.getAttribute('hidden') !== null)) return true;
      var st = String((cur.getAttribute && cur.getAttribute('style')) || '').toLowerCase();
      if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(st)) return true;
      try {
        if (GLOBAL_WIN && GLOBAL_WIN.getComputedStyle) {
          var cs = GLOBAL_WIN.getComputedStyle(cur);
          if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
        }
      } catch (e) {}
      cur = cur.parentNode;
    }
    return false;
  }
  var AE_OPEN_MODAL_CACHE = undefined;
  var AE_MODAL_CTA_RE = /(?:ajouter\s+(?:au\s+panier|[àa]\s+(?:ma|mes)\s+s[ée]lections?)|add\s+to\s+(?:cart|bag|my\s+picks|picks)|أضف\s*إلى(?:\s*(?:السلة|اختياراتي))?)/i;
  var AE_MODAL_CTA_EXACT_RE = /^(?:ajouter\s+(?:au\s+panier|[àa]\s+(?:ma|mes)\s+s[ée]lections?)|add\s+to\s+(?:cart|bag|my\s+picks|picks)|أضف\s*إلى(?:\s*(?:السلة|اختياراتي))?)$/i;
  var AE_MODAL_PROP_RE = /(?:couleur|color|colour|taille|size|mat[ée]riau|mati[èe]re|material|sp[ée]cification|mod[èe]le|لون|مقاس)\s*[:：]/i;
  function aeFindOpenSkuModal() {
    if (AE_OPEN_MODAL_CACHE !== undefined) return AE_OPEN_MODAL_CACHE;
    AE_OPEN_MODAL_CACHE = null;
    if (!IS_ALIEXPRESS) return null;
    try {
      var modalNodes = document.querySelectorAll(
        '[class*="msku-modal" i], [class*="msku-panel" i], [class*="msku-popup" i], [class*="msku-drawer" i], '
        + '[class*="sku-modal" i], [class*="sku-panel" i], [class*="sku-popup" i], [class*="sku-drawer" i], '
        + '[class*="comet-v2-modal" i], [class*="comet-v2-drawer" i], '
        + '[class*="drawer-content" i], [class*="drawer--wrap" i], [class*="popup--container" i], [class*="popup-content" i], [class*="bottom-sheet" i], '
        + '[role="dialog"], [aria-modal="true"]'
      );
      var best = null;
      for (var mi = 0; mi < modalNodes.length && mi < 16; mi++) {
        var mn = modalNodes[mi];
        if (!mn || aeNodeHidden(mn) || aeBlocked(mn)) continue;
        var mTxt = cut(text(mn.textContent), 1400);
        if (!mTxt) continue;
        if (/(?:added\s+to\s+(?:cart|bag)|ajout[eé]\s+au\s+panier|voir\s+le\s+panier|view\s+cart|تمت\s+إضافة)/i.test(mTxt)) continue;
        var hasSkuSignal = Boolean(
          mn.querySelector('[data-sku-col], [class*="sku-item" i], [class*="msku" i], [class*="sku-prop" i], [role="radio"]')
          || AE_MODAL_PROP_RE.test(mTxt)
          || AE_MODAL_CTA_RE.test(mTxt)
        );
        if (hasSkuSignal) best = mn;
      }
      /* Repli Rax / BundleDeals2 aux classes obfusquées sans role="dialog" :
         remonter depuis le bouton visible « Ajouter à mes sélections » jusqu'au tiroir ouvert. */
      if (!best && document.body) {
        var actionEls = document.body.querySelectorAll('button, [role="button"], div, span, a');
        var ctaEl = null;
        for (var ai = 0; ai < actionEls.length && ai < 900; ai++) {
          var ael = actionEls[ai];
          if (!ael || aeNodeHidden(ael) || aeBlocked(ael)) continue;
          if (ael.children && ael.children.length > 3) continue;
          var aTxt = text(ael.textContent);
          if (aTxt && aTxt.length <= 64 && AE_MODAL_CTA_EXACT_RE.test(aTxt)) {
            ctaEl = ael;
            break;
          }
        }
        if (ctaEl) {
          var cur = ctaEl.parentElement;
          var fallbackSheet = null;
          var fallbackIsFixed = false;
          for (var depth = 0; cur && cur !== document.body && cur !== document.documentElement && depth < 12; depth++) {
            var curTag = String(cur.tagName || '').toUpperCase();
            if (curTag === 'MAIN' || curTag === 'ARTICLE' || cur.querySelector('h1, [data-pl="product-title"]')) {
              break;
            }
            var curPos = '';
            try {
              var winRef = document.defaultView || window;
              var cs = winRef && winRef.getComputedStyle ? winRef.getComputedStyle(cur) : null;
              curPos = cs ? String(cs.position || '') : '';
            } catch (ePos) {}
            var cTxt = cut(text(cur.textContent), 1600);
            var hasPriceAndSignal = Boolean(
              cTxt
              && HAS_DIGIT.test(cTxt)
              && CURRENCY_HINT.test(cTxt)
              && (AE_MODAL_PROP_RE.test(cTxt) || cur.querySelector('img'))
            );
            if (hasPriceAndSignal) {
              fallbackSheet = cur;
              if (curPos === 'fixed') fallbackIsFixed = true;
              if (curPos === 'fixed' || curPos === 'absolute' || cur.parentElement === document.body) {
                break;
              }
            }
            cur = cur.parentElement;
          }
          if (fallbackSheet && (fallbackIsFixed || !ALIEXPRESS_ITEM_ID)) best = fallbackSheet;
        }
      }
      AE_OPEN_MODAL_CACHE = best;
    } catch (e) { AE_OPEN_MODAL_CACHE = null; }
    return AE_OPEN_MODAL_CACHE;
  }
  function collectScopedReadingsInRoot(rootNode, scopes) {
    var readings = [];
    var seenCompact = {};
    if (!rootNode || !rootNode.querySelectorAll) return readings;
    for (var s = 0; s < scopes.length; s++) {
      var nodes = [];
      try { nodes = rootNode.querySelectorAll(scopes[s]); } catch (e) { continue; }
      for (var n = 0; n < nodes.length && n < 4; n++) {
        if (aeBlocked(nodes[n]) || struckNode(nodes[n]) || aeNodeHidden(nodes[n])) continue;
        var value = aeNormalizeSplitPrice(scopeText(nodes[n]));
        if (!value || value.length > 80) continue;
        if (!HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value)) continue;
        if (amountCount(value) !== 1) continue;
        var compact = value.replace(/\s+/g, '').toLowerCase();
        if (!seenCompact[compact]) {
          seenCompact[compact] = true;
          readings.push(value);
        }
      }
      if (readings.length > 0) return readings;
    }
    return readings;
  }
  /* Montants distincts lus dans les conteneurs nommés (jamais plus de 6 nœuds). */
  function storeScopedPrices() {
    if (IS_SHEIN) {
      var mainReadings = collectScopedReadings(SHEIN_MAIN_PRICE_SCOPES);
      if (mainReadings.length > 0) return mainReadings;
    }
    if (IS_TEMU) {
      var temuReadings = collectScopedReadings(TEMU_MAIN_PRICE_SCOPES);
      if (temuReadings.length > 0) return temuReadings;
    }
    if (IS_ALIEXPRESS) {
      var aeOpenModal = aeFindOpenSkuModal();
      if (aeOpenModal) {
        var modalPriceScopes = [
          '[class*="price--currentPriceText" i]',
          '[class*="price--current" i]',
          '[class*="currentPrice" i]',
          '[class*="pdp-comp-price-current" i]',
          '.product-price-current',
          '[class*="H5Price" i]',
          '[class*="msku" i] [class*="price" i]',
          '[class*="sku" i] [class*="price" i]',
          '[class*="price" i]'
        ];
        var modalReadings = collectScopedReadingsInRoot(aeOpenModal, modalPriceScopes);
        if (modalReadings.length === 1) return modalReadings;
        /* Repli Rax / BundleDeals2 aux classes obfusquées sans « price » dans className :
           lecture bornée dans le tiroir ouvert uniquement (jamais la grille derrière). */
        var rawModalEls = aeOpenModal.querySelectorAll('div, span, p, strong, b');
        var obfReadings = [];
        var obfSeen = {};
        for (var rmi = 0; rmi < rawModalEls.length && obfReadings.length < 4; rmi++) {
          var rmEl = rawModalEls[rmi];
          if (!rmEl || aeBlocked(rmEl) || struckNode(rmEl) || aeNodeHidden(rmEl)) continue;
          if (rmEl.children && rmEl.children.length > 5) continue;
          var rmVal = aeNormalizeSplitPrice(scopeText(rmEl));
          if (!rmVal || rmVal.length > 36) continue;
          if (!HAS_DIGIT.test(rmVal) || !CURRENCY_HINT.test(rmVal)) continue;
          if (/(?:livraison|shipping|delivery|frais|total|économis|economis|coupon|pick\s+\d|articles?\s+pour)/i.test(rmVal)) continue;
          if (amountCount(rmVal) !== 1) continue;
          /* Ignorer un parent englobant si un enfant porte déjà ce montant */
          var childHasPrice = false;
          if (rmEl.children) {
            for (var rmc = 0; rmc < rmEl.children.length; rmc++) {
              var chPrice = aeNormalizeSplitPrice(scopeText(rmEl.children[rmc]));
              if (chPrice && HAS_DIGIT.test(chPrice) && CURRENCY_HINT.test(chPrice) && amountCount(chPrice) === 1) {
                childHasPrice = true;
                break;
              }
            }
          }
          if (childHasPrice) continue;
          var obfKey = rmVal.replace(/\s+/g, '').toLowerCase();
          if (!obfSeen[obfKey]) {
            obfSeen[obfKey] = true;
            obfReadings.push(rmVal);
          }
        }
        if (obfReadings.length === 1) return obfReadings;
        if (modalReadings.length > 0) return [modalReadings[0]];
        if (obfReadings.length > 0) return [obfReadings[0]];
        return [];
      }
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
  var SHEIN_LOW_STOCK_HINT = /(?:only\s*(\d{1,2})\s*left(?:\s*in\s*stock)?|(\d{1,2})\s*left\b|plus\s*que\s*(\d{1,2})(?:\s*en\s*stock)?|nur\s*noch\s*(\d{1,2})|solo\s*quedan\s*(\d{1,2})|ultimi\s*(\d{1,2})|بقي\s*(\d{1,2})\s*فقط|متبقي\s*(\d{1,2}))/i;
  var SHEIN_GENERIC_TITLE = /^(?:v[êe]tements\s+homme\s*(?:&|et)\s*femme|women'?s\s+clothing|mode\s+en\s+ligne|shop\s+online\s+fashion|shein\s*(?:[-|·]|official\b|$))/i;
  var SHEIN_GENERIC_LOGO_IMAGE = /(?:shein[-_]?logo|logo[-_]?shein|default[-_]?share|share[-_]?logo|site[-_]?logo|(?:^|[/_.-])(?:logo|s[-_]?logo|pwa[-_]?icon|app[-_]?icon|touch[-_]?icon|site[-_]?icon|manifest[-_]?icon|brand[-_]?mark|shein[-_]?app)(?:[/_.-]|$)|favicon|apple[-_]?touch[-_]?icon|placeholder|blank\.gif|1x1)/i;
  var SHEIN_BADGE_OR_ICON_URL = /(?:\/images3_acp\/|\/images3_ccc\/|\/she_dist\/|(?:^|[/_-])(?:badge|icon|label[-_]?img|brand[-_]?tag|brand[-_]?logo|banner[-_]?icon|quick[-_]?ship|truck|shipping[-_]?icon|service[-_]?icon|arrow|star|sprite)(?:[/_.-]|$))/i;
  var SHEIN_NON_GALLERY_ANCESTOR = /(?:product-intro__head|goods-name|goods-title|brand[-_]?name|title[-_]?tag|title[-_]?label|badge|quick[-_]?ship|shipping|delivery|freight|service|promise|coupon|promo|activity[-_]?bar|flash[-_]?sale|rank|comment|review|color-radio|goods-color|swatch)/i;
  function sheinIsProductGalleryImg(imgNode, url) {
    if (!url || SHEIN_GENERIC_LOGO_IMAGE.test(url) || SHEIN_BADGE_OR_ICON_URL.test(url)) return false;
    if (!imgNode || imgNode.nodeType !== 1) return true;
    try {
      var wAttr = parseInt((imgNode.getAttribute && imgNode.getAttribute('width')) || '0', 10);
      var hAttr = parseInt((imgNode.getAttribute && imgNode.getAttribute('height')) || '0', 10);
      if ((wAttr > 0 && wAttr < 80) || (hAttr > 0 && hAttr < 80)) return false;
      var natW = typeof imgNode.naturalWidth === 'number' ? imgNode.naturalWidth : 0;
      var natH = typeof imgNode.naturalHeight === 'number' ? imgNode.naturalHeight : 0;
      if ((natW > 0 && natW < 80) || (natH > 0 && natH < 80)) return false;
      var anc = imgNode;
      for (var hop = 0; anc && anc.nodeType === 1 && hop < 6; hop++) {
        var tag = String(anc.tagName || '').toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'button') return false;
        var cls = String(anc.className || '') + ' ' + String((anc.getAttribute && anc.getAttribute('data-testid')) || '');
        if (SHEIN_NON_GALLERY_ANCESTOR.test(cls)) return false;
        anc = anc.parentNode;
      }
    } catch (e) {}
    return true;
  }
  /* Déclencheur de liste déroulante de tailles groupées sur m.shein.com (ex. « 6-9M- 2-3Y ▼ ») :
     ce n'est PAS une taille atomique achetable, mais un groupe pliant plusieurs âges. */
  var SHEIN_GROUPED_RANGE_TRIGGER = /^\d{1,2}(?:\s*-\s*\d{1,2})?\s*(?:m|y|ans|mois|months?|years?)\s*-\s*\d{1,2}(?:\s*-\s*\d{1,2})?\s*(?:m|y|ans|mois|months?|years?)\b/i;

  function sheinHttpsUrl(rawUrl) {
    var u = text(rawUrl);
    if (!u || /^data:/i.test(u)) return '';
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u)) return '';
    if (SHEIN_GENERIC_LOGO_IMAGE.test(u)) return '';
    return cut(u, 600);
  }
  function extractElementImageUrl(el) {
    if (!el) return '';
    var pickFirstSrcset = function (rawSet) {
      var s = text(rawSet);
      if (!s) return '';
      var firstEntry = text(s.split(',')[0] || '');
      return text(firstEntry.split(/\s+/)[0] || '');
    };
    var pickBgUrl = function (bgRaw) {
      var bg = String(bgRaw || '');
      if (!bg || bg.indexOf('url(') < 0) return '';
      var m = bg.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
      return m ? m[1] : '';
    };
    try {
      var imgEl = String(el.tagName || '').toUpperCase() === 'IMG' ? el : (el.querySelector ? el.querySelector('img') : null);
      if (imgEl && imgEl.getAttribute) {
        var candidates = [
          imgEl.getAttribute('data-before-crop-src'),
          imgEl.getAttribute('data-src'),
          imgEl.getAttribute('data-lazy'),
          imgEl.getAttribute('data-lazy-src'),
          imgEl.getAttribute('data-original'),
          imgEl.currentSrc,
          imgEl.getAttribute('src'),
          pickFirstSrcset(imgEl.getAttribute('data-srcset')),
          pickFirstSrcset(imgEl.getAttribute('srcset'))
        ];
        for (var ci = 0; ci < candidates.length; ci++) {
          var normalized = sheinHttpsUrl(candidates[ci]);
          if (normalized) return normalized;
        }
      }
      if (el.querySelector) {
        var sourceEl = el.querySelector('picture source[srcset], source[data-srcset]');
        if (sourceEl && sourceEl.getAttribute) {
          var fromSource = sheinHttpsUrl(pickFirstSrcset(sourceEl.getAttribute('data-srcset') || sourceEl.getAttribute('srcset')));
          if (fromSource) return fromSource;
        }
      }
      var nodesForBg = [el];
      if (el.querySelectorAll) {
        var bgChildren = el.querySelectorAll('[style*="background"], [class*="img" i], [class*="swatch" i], span, i');
        for (var bc = 0; bc < bgChildren.length && nodesForBg.length < 6; bc++) nodesForBg.push(bgChildren[bc]);
      }
      for (var bi = 0; bi < nodesForBg.length; bi++) {
        var bn = nodesForBg[bi];
        if (!bn) continue;
        var inlineBg = (bn.style && bn.style.backgroundImage) || (bn.getAttribute && bn.getAttribute('style')) || '';
        var bgUrl = sheinHttpsUrl(pickBgUrl(inlineBg));
        if (bgUrl) return bgUrl;
        if (GLOBAL_WIN && typeof GLOBAL_WIN.getComputedStyle === 'function' && bn.nodeType === 1) {
          var compBg = GLOBAL_WIN.getComputedStyle(bn);
          var compUrl = sheinHttpsUrl(pickBgUrl(compBg && compBg.backgroundImage));
          if (compUrl) return compUrl;
        }
      }
    } catch (e) {}
    return '';
  }
  function sheinBaseSizeKey(rawVal) {
    var v = text(rawVal).toLowerCase();
    if (!v) return '';
    /* Normalise « 4Y (98-104 cm) » et « 4Y » sur le jeton de base « 4y » quand il faut relier
       le bouton mobile abrégé au libellé complet publié par l'état ou l'en-tête. */
    var stripped = text(v.replace(/\s*\([^)]*(?:cm|in|inch|kg|lb)[^)]*\)\s*$/i, ''));
    return stripped || v;
  }
  function sheinIsDropdownTrigger(el, labelText) {
    var clean = text(String(labelText || '').replace(/[▼▾⌄∨<>]/g, ''));
    if (SHEIN_GROUPED_RANGE_TRIGGER.test(clean)) return true;
    if (!el || !el.getAttribute) return false;
    var hasPopup = String(el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (hasPopup === 'true' || hasPopup === 'listbox' || hasPopup === 'menu') return true;
    var cls = String(el.className || '');
    if (/(?:size[-_]?dropdown|size[-_]?select[-_]?trigger|group[-_]?dropdown|more[-_]?size)/i.test(cls) && /[▼▾⌄]|\b-\b.*\b-\b/.test(String(el.textContent || ''))) {
      return true;
    }
    return false;
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
    if (!el) return { label: '', stock: null, price: '' };
    var rawText = text(el.textContent);
    var stockVal = null;
    if (rawText) {
      var sm = rawText.match(SHEIN_LOW_STOCK_HINT);
      if (sm) {
        var digits = sm[1] || sm[2] || sm[3] || sm[4] || sm[5] || sm[6] || sm[7] || sm[8];
        var parsedStock = parseInt(digits, 10);
        if (parsedStock > 0 && parsedStock <= 99) stockVal = parsedStock;
      }
    }
    var pillPriceAttr = text(el.getAttribute && (el.getAttribute('data-price') || el.getAttribute('data-sale-price')));
    var pillPrice = (pillPriceAttr && HAS_DIGIT.test(pillPriceAttr) && CURRENCY_HINT.test(pillPriceAttr) && amountCount(pillPriceAttr) === 1)
      ? cut(pillPriceAttr, LIMITS.label)
      : '';
    var stripArrows = function (s) {
      return text(String(s || '').replace(/[▼▾⌄∨]/g, ''));
    };
    var attrSize = stripArrows(el.getAttribute && (el.getAttribute('data-size') || el.getAttribute('data-attr-value') || el.getAttribute('data-value')));
    if (attrSize && !/^\d{5,}$/.test(attrSize) && !SHEIN_SIZE_GUIDE_NOISE.test(attrSize)) {
      if (sheinIsDropdownTrigger(el, attrSize)) return { label: '', stock: null, price: '' };
      return { label: cut(attrSize, LIMITS.label), stock: stockVal, price: pillPrice };
    }
    if (el.querySelector) {
      try {
        var inner = el.querySelector('.product-intro__size-radio-inner, .goods-size__item-text, [class*="size-radio-inner" i], [class*="size-name" i], [class*="size-label" i]');
        var innerTxt = stripArrows(inner && inner.textContent);
        if (innerTxt && !SHEIN_SIZE_GUIDE_NOISE.test(innerTxt)) {
          if (sheinIsDropdownTrigger(el, innerTxt)) return { label: '', stock: null, price: '' };
          return { label: cut(innerTxt, LIMITS.label), stock: stockVal, price: pillPrice };
        }
      } catch (e) {}
    }
    var aria = stripArrows(el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title')));
    var candidate = aria || stripArrows(rawText);
    if (candidate) {
      candidate = text(candidate.replace(SHEIN_LOW_STOCK_HINT, '').replace(/\b(?:sold\s*out|out\s*of\s*stock|épuisé|epuise|rupture|ausverkauft|agotado|esaurito)\b/gi, ''));
    }
    if (!candidate || candidate.length > 44 || SHEIN_SIZE_GUIDE_NOISE.test(candidate) || sheinIsDropdownTrigger(el, candidate)) {
      return { label: '', stock: stockVal, price: '' };
    }
    return { label: cut(candidate, LIMITS.label), stock: stockVal, price: pillPrice };
  }
  function sheinReadDomSelectedSize() {
    try {
      /* Sur m.shein.com, l'en-tête de section taille publie souvent le libellé complet
         « Taille: 4Y (98-104 cm) » alors que la pastille abrège « 4Y ». */
      var sizeHeaders = document.querySelectorAll('.product-intro__size-title, .goods-size__title, [class*="product-intro__size-title" i], [class*="goods-size__title" i], [data-testid="size-title"]');
      var headerChosen = '';
      for (var sh = 0; sh < sizeHeaders.length && !headerChosen; sh++) {
        if (sheinBlocked(sizeHeaders[sh]) || isInNavigation(sizeHeaders[sh])) continue;
        var shClone = null;
        try {
          shClone = sizeHeaders[sh].cloneNode(true);
          var guides = shClone.querySelectorAll('a, button, [class*="guide" i], [class*="switch" i]');
          for (var gi = 0; gi < guides.length; gi++) {
            if (guides[gi] && guides[gi].parentNode) guides[gi].parentNode.removeChild(guides[gi]);
          }
        } catch (e) { shClone = sizeHeaders[sh]; }
        var shRaw = text(shClone && shClone.textContent);
        if (shRaw && (shRaw.indexOf(':') >= 0 || shRaw.indexOf('：') >= 0)) {
          var shAfter = text(shRaw.split(/[:：]/).slice(1).join(':'));
          if (shAfter && shAfter.length <= 44 && !SHEIN_SIZE_GUIDE_NOISE.test(shAfter) && !SHEIN_GROUPED_RANGE_TRIGGER.test(shAfter)) {
            headerChosen = shAfter;
          }
        }
      }
      var containers = document.querySelectorAll('.product-intro__size, .goods-size, [class*="product-intro__size" i], [class*="goods-size" i], [class*="sku-size" i], [data-testid*="size" i]');
      for (var c = 0; c < containers.length && c < 8; c++) {
        if (sheinBlocked(containers[c]) || isInNavigation(containers[c])) continue;
        var pills = containers[c].querySelectorAll('.product-intro__size-radio, .goods-size__radio, .goods-size__item, [class*="size-radio" i], [class*="size-item" i], [data-size], [role="radio"], [role="option"], button, li');
        for (var p = 0; p < pills.length && p < 40; p++) {
          if (!sheinNodeSelected(pills[p])) continue;
          var parsed = sheinCleanSizeLabel(pills[p]);
          if (parsed.label) {
            if (headerChosen && sheinBaseSizeKey(headerChosen) === sheinBaseSizeKey(parsed.label) && headerChosen.length > parsed.label.length) {
              return headerChosen;
            }
            return parsed.label;
          }
        }
      }
      if (headerChosen) return headerChosen;
    } catch (e) {}
    return '';
  }
  function sheinUnwrapRootCandidate(cand, depth) {
    var d = typeof depth === 'number' ? depth : 0;
    if (!cand || typeof cand !== 'object' || d > 4) return null;
    if (cand.detail && typeof cand.detail === 'object' && (cand.detail.goods_id || cand.detail.goodsId || cand.detail.goods_name || cand.detail.salePrice || cand.detail.sale_price)) return cand;
    if (cand.productIntroData && typeof cand.productIntroData === 'object') return sheinUnwrapRootCandidate(cand.productIntroData, d + 1) || cand.productIntroData;
    if (cand.gbRawData && typeof cand.gbRawData === 'object') return sheinUnwrapRootCandidate(cand.gbRawData, d + 1) || cand.gbRawData;
    if (cand.goodsDetailv2SsrData && typeof cand.goodsDetailv2SsrData === 'object') return sheinUnwrapRootCandidate(cand.goodsDetailv2SsrData, d + 1) || cand.goodsDetailv2SsrData;
    if (cand.gbGoodsDetail && typeof cand.gbGoodsDetail === 'object') return sheinUnwrapRootCandidate(cand.gbGoodsDetail, d + 1) || cand.gbGoodsDetail;
    if (cand.goodsDetail && typeof cand.goodsDetail === 'object') return sheinUnwrapRootCandidate(cand.goodsDetail, d + 1) || cand.goodsDetail;
    if (cand.goodsDetailData && typeof cand.goodsDetailData === 'object') return sheinUnwrapRootCandidate(cand.goodsDetailData, d + 1) || cand.goodsDetailData;
    if (cand.productIntro && typeof cand.productIntro === 'object') return sheinUnwrapRootCandidate(cand.productIntro, d + 1) || cand.productIntro;
    if (cand.info && typeof cand.info === 'object') {
      var fromInfo = sheinUnwrapRootCandidate(cand.info, d + 1);
      if (fromInfo) return fromInfo;
    }
    if (cand.data && typeof cand.data === 'object') {
      var fromData = sheinUnwrapRootCandidate(cand.data, d + 1);
      if (fromData) return fromData;
    }
    if (cand.state && typeof cand.state === 'object') {
      var fromState = sheinUnwrapRootCandidate(cand.state, d + 1);
      if (fromState) return fromState;
    }
    if (cand.pageProps && typeof cand.pageProps === 'object') {
      var fromProps = sheinUnwrapRootCandidate(cand.pageProps, d + 1);
      if (fromProps) return fromProps;
    }
    if (cand.goodsInfo && typeof cand.goodsInfo === 'object') return cand;
    if (cand.goods_id || cand.goodsId || cand.goods_name || cand.salePrice || cand.sale_price || cand.attrSizeList || cand.sku_price_list || cand.relation_color) return cand;
    return null;
  }
  function sheinIndexExternalSkuPrices(root, detail, currency) {
    var map = {};
    if (!root || typeof root !== 'object') return map;
    var lists = [
      root.sku_price_list,
      detail && detail.sku_price_list,
      root.mall_prices,
      detail && detail.mall_prices,
      root.priceInfo && root.priceInfo.sku_price_list,
      root.mall_data && root.mall_data.sku_price_list
    ];
    for (var li = 0; li < lists.length; li++) {
      var arr = lists[li];
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        for (var ai = 0; ai < arr.length; ai++) {
          var item = arr[ai];
          if (!item || typeof item !== 'object') continue;
          var pObj = (item.price && (item.price.salePrice || item.price.sale_price || item.price.discountPrice || item.price))
            || item.salePrice || item.sale_price || item.discountPrice || null;
          var pStr = sheinFormatPriceObj(pObj, currency);
          var stRaw = item.stock !== undefined ? item.stock : item.quantity;
          var stNum = stRaw !== undefined && stRaw !== null && stRaw !== '' ? parseInt(String(stRaw), 10) : NaN;
          var rec = { price: pStr || '', stock: !isNaN(stNum) ? stNum : null };
          var keys = [item.sku_code, item.skuCode, item.sku_id, item.attr_value_id, item.attr_value_name, item.size_name];
          for (var ki = 0; ki < keys.length; ki++) {
            var k = text(keys[ki]).toLowerCase();
            if (k && (rec.price || rec.stock !== null)) map[k] = rec;
          }
        }
      } else if (arr && typeof arr === 'object') {
        for (var ok in arr) {
          if (!Object.prototype.hasOwnProperty.call(arr, ok)) continue;
          var oval = arr[ok];
          if (!oval || typeof oval !== 'object') continue;
          var opObj = (oval.price && (oval.price.salePrice || oval.price.sale_price || oval.price)) || oval.salePrice || oval.sale_price || oval;
          var opStr = sheinFormatPriceObj(opObj, currency);
          var ostRaw = oval.stock !== undefined ? oval.stock : oval.quantity;
          var ostNum = ostRaw !== undefined && ostRaw !== null && ostRaw !== '' ? parseInt(String(ostRaw), 10) : NaN;
          if (opStr || !isNaN(ostNum)) {
            map[text(ok).toLowerCase()] = { price: opStr || '', stock: !isNaN(ostNum) ? ostNum : null };
          }
        }
      }
    }
    return map;
  }
  function sheinParseRawObject(rawRoot) {
    var root = sheinUnwrapRootCandidate(rawRoot, 0);
    if (!root || typeof root !== 'object') return null;
    var detail = (root.detail && typeof root.detail === 'object') ? root.detail
      : (root.goodsInfo && typeof root.goodsInfo === 'object' ? root.goodsInfo : root);
    var rawGoodsId = text(detail.goods_id || root.goods_id || detail.goodsId || root.goodsId || '');
    if (rawGoodsId && !/^\d{5,16}$/.test(rawGoodsId)) rawGoodsId = '';
    /* Anti-résidu SPA : si l'URL courante porte un goods_id et que l'objet lu
       désigne un AUTRE goods_id, on rejette cet objet. */
    if (SHEIN_GOODS_ID && rawGoodsId && rawGoodsId !== SHEIN_GOODS_ID) return null;
    var commonCurrency = '';
    try {
      var gbCommon = (GLOBAL_WIN && GLOBAL_WIN.gbCommonInfo) || (typeof window !== 'undefined' ? window.gbCommonInfo : null);
      if (gbCommon && typeof gbCommon === 'object') {
        commonCurrency = text(gbCommon.currency || (gbCommon.currencyInfo && gbCommon.currencyInfo.currency) || '');
      }
    } catch (e) { commonCurrency = ''; }
    var currency = text(
      root.currency
      || (root.currencyInfo && (root.currencyInfo.code || root.currencyInfo.currency))
      || (detail.salePrice && detail.salePrice.currency)
      || (detail.sale_price && detail.sale_price.currency)
      || (root.sale_price && root.sale_price.currency)
      || (detail.retailPrice && detail.retailPrice.currency)
      || commonCurrency
      || ''
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) currency = '';
    var salePrice = sheinFormatPriceObj(
      detail.salePrice || detail.sale_price || detail.discountPrice || detail.unit_discount_price
      || root.salePrice || root.sale_price || root.price,
      currency
    );
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
    var rawColorsBuffer = [];
    var pageEffectiveGid = rawGoodsId || SHEIN_GOODS_ID || '';
    if (currentColor) {
      rawColorsBuffer.push({
        baseValue: cut(currentColor, LIMITS.label),
        goodsId: pageEffectiveGid || null,
        image: mainColorThumb || null,
        available: inStock,
        selected: true,
        price: null,
        priceFrom: false
      });
    }
    var relColors = root.relation_color || detail.relation_color || root.otherColorList || detail.otherColorList;
    if (Object.prototype.toString.call(relColors) === '[object Array]') {
      for (var rc = 0; rc < relColors.length && rawColorsBuffer.length < LIMITS.variantValues; rc++) {
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
        var rSameGid = false;
        for (var cExist = 0; cExist < rawColorsBuffer.length; cExist++) {
          if (rGid && rawColorsBuffer[cExist].goodsId && rawColorsBuffer[cExist].goodsId === rGid) {
            rSameGid = true;
            break;
          }
          if (!rGid && !rawColorsBuffer[cExist].goodsId && rawColorsBuffer[cExist].baseValue.toLowerCase() === rColor.toLowerCase()) {
            rSameGid = true;
            break;
          }
          if (rawColorsBuffer[cExist].baseValue.toLowerCase() === rColor.toLowerCase() && !rawColorsBuffer[cExist].goodsId && rGid) {
            rawColorsBuffer[cExist].goodsId = rGid;
            rSameGid = true;
            break;
          }
        }
        if (rSameGid) continue;
        var rSoldOut = rItem.is_on_sale === 0 || rItem.is_on_sale === '0' || rItem.stock === 0 || rItem.stock === '0' || rItem.is_sold_out === true;
        var rPrice = sheinFormatPriceObj(rItem.salePrice || rItem.sale_price || rItem.discountPrice || rItem.price, currency);
        var rImg = sheinHttpsUrl(rItem.goods_color_image || rItem.color_image || rItem.goods_thumb || rItem.original_img || '');
        rawColorsBuffer.push({
          baseValue: cut(rColor, LIMITS.label),
          goodsId: rGid || null,
          image: rImg || null,
          available: rSoldOut ? false : null,
          selected: Boolean(rGid && pageEffectiveGid && rGid === pageEffectiveGid),
          price: rPrice || null,
          priceFrom: Boolean(rPrice)
        });
      }
    }
    /* Désambiguïsation canonique par goods_id quand SHEIN traduit deux lavages distincts
       sous le même libellé français (ex. deux « Jean Bleu » avec deux goods_id différents). */
    var baseColorCounts = {};
    for (var bcc = 0; bcc < rawColorsBuffer.length; bcc++) {
      var bKey = rawColorsBuffer[bcc].baseValue.toLowerCase();
      baseColorCounts[bKey] = (baseColorCounts[bKey] || 0) + 1;
    }
    var colors = [];
    var colorLabelByGid = {};
    for (var fci = 0; fci < rawColorsBuffer.length; fci++) {
      var rcRow = rawColorsBuffer[fci];
      var rcKey = rcRow.baseValue.toLowerCase();
      var finalColorVal = (baseColorCounts[rcKey] > 1 && rcRow.goodsId)
        ? cut(rcRow.baseValue + ' · ' + String(rcRow.goodsId).slice(-4), LIMITS.label)
        : rcRow.baseValue;
      if (rcRow.goodsId) colorLabelByGid[rcRow.goodsId] = finalColorVal;
      if (rcRow.selected) currentColor = finalColorVal;
      colors.push({
        value: finalColorVal,
        goodsId: rcRow.goodsId,
        image: rcRow.image,
        available: rcRow.available,
        selected: rcRow.selected,
        price: rcRow.price,
        priceFrom: rcRow.priceFrom
      });
    }
    var externalSkuPrices = sheinIndexExternalSkuPrices(root, detail, currency);
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
      || root.skuList || detail.skuList
      || root.sku_price_list || detail.sku_price_list;
    var hasProvenUniformPrice = Boolean(
      (minRangeStr && maxRangeStr && minRangeStr === maxRangeStr)
      || (Object.prototype.toString.call(rawSizes) === '[object Array]' && rawSizes.length === 1)
    );
    var lookupExternalSku = function (entry) {
      if (!entry || typeof entry !== 'object') return null;
      var cands = [entry.sku_code, entry.skuCode, entry.sku_id, entry.attr_value_id, entry.attr_value_name, entry.size_name];
      for (var ci = 0; ci < cands.length; ci++) {
        var ck = text(cands[ci]).toLowerCase();
        if (ck && externalSkuPrices[ck]) return externalSkuPrices[ck];
      }
      return null;
    };
    var hasAnyExplicitSkuPrice = false;
    var distinctExplicitCount = 0;
    if (Object.prototype.toString.call(rawSizes) === '[object Array]') {
      for (var spCheck = 0; spCheck < rawSizes.length; spCheck++) {
        var spEntry = rawSizes[spCheck];
        if (!spEntry || typeof spEntry !== 'object') continue;
        var spObj = (spEntry.price && (spEntry.price.salePrice || spEntry.price.sale_price || spEntry.price.discountPrice || spEntry.price))
          || spEntry.salePrice || spEntry.sale_price || spEntry.discountPrice || null;
        var spExt = lookupExternalSku(spEntry);
        if (sheinFormatPriceObj(spObj, currency) || (spExt && spExt.price)) { hasAnyExplicitSkuPrice = true; break; }
      }
      var distinctExplicitPrices = {};
      for (var sz = 0; sz < rawSizes.length && skus.length < LIMITS.matrixEntries; sz++) {
        var sEntry = rawSizes[sz];
        if (!sEntry || typeof sEntry !== 'object') continue;
        var extRec = lookupExternalSku(sEntry);
        var sStockRaw = sEntry.stock !== undefined ? sEntry.stock : (sEntry.quantity !== undefined ? sEntry.quantity : (sEntry.inventory !== undefined ? sEntry.inventory : (extRec ? extRec.stock : undefined)));
        var sStockNum = sStockRaw !== undefined && sStockRaw !== null && sStockRaw !== '' ? parseInt(String(sStockRaw), 10) : NaN;
        var sSold = sEntry.is_sold_out === true || sEntry.sold_out === 1 || sEntry.is_on_sale === 0 || (!isNaN(sStockNum) && sStockNum <= 0);
        var sAvail = sSold ? false : (!isNaN(sStockNum) && sStockNum > 0 ? true : (sEntry.is_sold_out === false || sEntry.is_on_sale === 1 ? true : null));
        var sPriceObj = (sEntry.price && (sEntry.price.salePrice || sEntry.price.sale_price || sEntry.price.discountPrice || sEntry.price))
          || sEntry.salePrice || sEntry.sale_price || sEntry.discountPrice || null;
        var explicitSkuPrice = sheinFormatPriceObj(sPriceObj, currency) || (extRec && extRec.price ? extRec.price : '');
        if (explicitSkuPrice && !distinctExplicitPrices[explicitSkuPrice]) {
          distinctExplicitPrices[explicitSkuPrice] = true;
          distinctExplicitCount++;
        }
        /* Ne jamais étamper aveuglément salePrice sur toutes les tailles quand le
           marchand omet les prix par SKU ET omet min_price/max_price (m.shein.com SSR) :
           seule une uniformité prouvée (1 taille ou min === max) ou l'option marquée
           selected hérite du prix courant. */
        var sPrice = explicitSkuPrice || (
          !hasAnyExplicitSkuPrice && !hasRangePrice && sAvail === true && salePrice
          && (hasProvenUniformPrice || Boolean(sEntry.selected))
            ? salePrice
            : ''
        );
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
    if (typeof distinctExplicitCount === 'number' && distinctExplicitCount > 1) hasRangePrice = true;
    /* Si les couleurs sœurs dans relation_color embarquent déjà leur propre attrSizeList / skuList, on les ajoute directement à la matrice initiale ! */
    if (Object.prototype.toString.call(relColors) === '[object Array]') {
      for (var rci = 0; rci < relColors.length; rci++) {
        var rcItem = relColors[rci];
        if (!rcItem || typeof rcItem !== 'object') continue;
        var rcGid = text(rcItem.goods_id || rcItem.goodsId || '');
        if (!rcGid || (rawGoodsId && rcGid === rawGoodsId)) continue;
        var rcColor = colorLabelByGid[rcGid] || '';
        if (!rcColor) {
          if (Object.prototype.toString.call(rcItem.mainSaleAttribute) === '[object Array]' && rcItem.mainSaleAttribute[0]) {
            rcColor = text(rcItem.mainSaleAttribute[0].attr_value_name || rcItem.mainSaleAttribute[0].attr_value);
          }
          if (!rcColor) rcColor = text(rcItem.goods_color_name || rcItem.color_name || rcItem.attr_value_name || '');
        }
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
      /* Source #3 (network_cache) : peut contenir le produit courant, ses prix temps réel (realtime_data) OU une couleur sœur préchargée en AJAX. */
      var candidateBody = item.body.info || item.body.data || item.body.result || item.body;
      if (!baseState) {
        var parsedNet = sheinParseRawObject(candidateBody);
        if (parsedNet) {
          for (var pns = 0; pns < parsedNet.skus.length; pns++) parsedNet.skus[pns].evidenceSource = 'network_cache';
          baseState = parsedNet;
        }
        continue;
      }
      try {
        var netDetail = (candidateBody && (candidateBody.detail || (candidateBody.productIntroData && candidateBody.productIntroData.detail))) || candidateBody;
        var netGid = text(netDetail && (netDetail.goods_id || netDetail.goodsId) || '');
        /* Cas A : réponse temps réel (sku_price_list / mall_prices) de la FICHE COURANTE sur m.shein.com */
        if (!netGid || netGid === baseState.goodsId) {
          var rtCur = baseState.currency || text(candidateBody && (candidateBody.currency || (candidateBody.sale_price && candidateBody.sale_price.currency)) || '').toUpperCase();
          if (rtCur && /^[A-Z]{3}$/.test(rtCur) && !baseState.currency) baseState.currency = rtCur;
          var rtExtMap = sheinIndexExternalSkuPrices(candidateBody, netDetail, rtCur);
          for (var bsk = 0; bsk < baseState.skus.length; bsk++) {
            var bSku = baseState.skus[bsk];
            if (!bSku || (bSku.goodsId && baseState.goodsId && bSku.goodsId !== baseState.goodsId)) continue;
            var bLookupKeys = [
              bSku.skuId,
              bSku.attributes && bSku.attributes['Taille'],
              bSku.attributes && sheinBaseSizeKey(bSku.attributes['Taille'])
            ];
            for (var blk = 0; blk < bLookupKeys.length; blk++) {
              var lk = text(bLookupKeys[blk]).toLowerCase();
              if (lk && rtExtMap[lk]) {
                if (rtExtMap[lk].price) bSku.price = rtExtMap[lk].price;
                if (rtExtMap[lk].stock !== null) {
                  bSku.stock = rtExtMap[lk].stock > 0 && rtExtMap[lk].stock <= 999 ? rtExtMap[lk].stock : null;
                  bSku.available = rtExtMap[lk].stock > 0;
                }
                break;
              }
            }
          }
          for (var bsz = 0; bsz < baseState.sizes.length; bsz++) {
            var bSize = baseState.sizes[bsz];
            var szKeys = [bSize.value, sheinBaseSizeKey(bSize.value)];
            for (var szk = 0; szk < szKeys.length; szk++) {
              var skKey = text(szKeys[szk]).toLowerCase();
              if (skKey && rtExtMap[skKey]) {
                if (rtExtMap[skKey].price) bSize.price = rtExtMap[skKey].price;
                if (rtExtMap[skKey].stock !== null) {
                  bSize.stock = rtExtMap[skKey].stock > 0 && rtExtMap[skKey].stock <= 999 ? rtExtMap[skKey].stock : null;
                  bSize.available = rtExtMap[skKey].stock > 0;
                }
                break;
              }
            }
          }
          continue;
        }
        /* Cas B : couleur sœur déjà connue dans baseState.colors */
        var matchedSiblingColor = '';
        for (var sck = 0; sck < baseState.colors.length; sck++) {
          if (baseState.colors[sck].goodsId === netGid) { matchedSiblingColor = baseState.colors[sck].value; break; }
        }
        if (!matchedSiblingColor) continue;
        var netSizes = candidateBody.attrSizeList || (netDetail && netDetail.attrSizeList) || candidateBody.skuList || (netDetail && netDetail.skuList) || candidateBody.sku_price_list || (netDetail && netDetail.sku_price_list);
        if (Object.prototype.toString.call(netSizes) !== '[object Array]') continue;
        var netCur = baseState.currency || '';
        var sibExtMap = sheinIndexExternalSkuPrices(candidateBody, netDetail, netCur);
        for (var nsz = 0; nsz < netSizes.length && baseState.skus.length < LIMITS.matrixEntries; nsz++) {
          var nsEntry = netSizes[nsz];
          if (!nsEntry || typeof nsEntry !== 'object') continue;
          var nsVal = text(nsEntry.attr_value_name || nsEntry.attr_value || nsEntry.size_name || '');
          if (!nsVal) continue;
          var nsCode = text(nsEntry.sku_code || nsEntry.sku_id || '');
          var nsExt = sibExtMap[nsCode.toLowerCase()] || sibExtMap[nsVal.toLowerCase()] || null;
          var nsStockRaw = nsEntry.stock !== undefined ? nsEntry.stock : (nsExt ? nsExt.stock : undefined);
          var nsStock = nsStockRaw !== undefined && nsStockRaw !== null ? parseInt(String(nsStockRaw), 10) : NaN;
          var nsSold = nsEntry.is_sold_out === true || nsEntry.sold_out === 1 || (!isNaN(nsStock) && nsStock <= 0);
          var nsAvail = nsSold ? false : (!isNaN(nsStock) && nsStock > 0 ? true : (nsEntry.is_sold_out === false ? true : null));
          var nsPriceObj = (nsEntry.price && (nsEntry.price.salePrice || nsEntry.price.sale_price || nsEntry.price.discountPrice || nsEntry.price)) || nsEntry.salePrice || nsEntry.sale_price || null;
          var nsPrice = sheinFormatPriceObj(nsPriceObj, netCur) || (nsExt && nsExt.price ? nsExt.price : '');
          baseState.skus.push({
            skuId: nsCode || ('shein:' + netGid + ':' + nsVal),
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
  function sheinExtractVueComponentState() {
    try {
      var vueSelectors = ['.goods-detail', '.product-intro', '#goods-detail-v3', '[class*="goods-detail" i]', '#app'];
      for (var vs = 0; vs < vueSelectors.length; vs++) {
        var el = document.querySelector(vueSelectors[vs]);
        if (!el) continue;
        var candidates = [];
        if (el.__vue__ && typeof el.__vue__ === 'object') {
          candidates.push(el.__vue__.$data, el.__vue__.$store && el.__vue__.$store.state, el.__vue__);
        }
        var v3 = el.__vueParentComponent || (el._vnode && el._vnode.component);
        if (v3 && typeof v3 === 'object') {
          candidates.push(v3.setupState, v3.data, v3.props, v3.ctx);
        }
        for (var vc = 0; vc < candidates.length; vc++) {
          if (!candidates[vc] || typeof candidates[vc] !== 'object') continue;
          var parsedVue = sheinParseRawObject(candidates[vc]);
          if (parsedVue) return parsedVue;
        }
      }
    } catch (e) {}
    return null;
  }
  function sheinEnsureState() {
    if (SHEIN_STATE_CHECKED) return SHEIN_STATE;
    SHEIN_STATE_CHECKED = true;
    if (!IS_SHEIN) return null;
    try {
      var winKeys = [
        'gbRawData', 'productIntroData', 'gbProductIntroData', 'gbGoodsDetail',
        'goodsDetailv2SsrData', 'saGoodsDetailData', '__SSR_DATA__', 'saPagesInfo',
        '__INITIAL_STATE__', '__NUXT__', '__NEXT_DATA__', '__INITIAL_DATA__'
      ];
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
      var scriptKeys = ['gbRawData', 'productIntroData', 'gbProductIntroData', 'gbGoodsDetail', 'goodsDetailv2SsrData', '__SSR_DATA__', '__INITIAL_STATE__'];
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
      var vueState = sheinExtractVueComponentState();
      if (vueState) {
        for (var vsk = 0; vsk < vueState.skus.length; vsk++) vueState.skus[vsk].evidenceSource = 'preloaded_state';
        SHEIN_STATE = sheinMergeNetworkPayloads(vueState);
        return SHEIN_STATE;
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
      var aeNetList = (GLOBAL_WIN && GLOBAL_WIN.__aywebsNetPayloads) || (typeof window !== 'undefined' && window.__aywebsNetPayloads) || null;
      if (aeNetList && Object.prototype.toString.call(aeNetList) === '[object Array]') {
        for (var anp = aeNetList.length - 1; anp >= 0; anp--) {
          var anEntry = aeNetList[anp];
          if (!anEntry || !anEntry.body || typeof anEntry.body !== 'object') continue;
          var parsedNetAe = aeParseRawObject(anEntry.body);
          if (parsedNetAe) { ALIEXPRESS_STATE = parsedNetAe; return ALIEXPRESS_STATE; }
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
  var AE_COLON_DIM_HEAD = /^(Couleur|Color|Colour|Farbe|Colore|Cor|Kleur|اللون|لون|Taille|Size|Talla|Taglia|Gr(?:ö|oe)(?:ß|ss)e|Tamanho|المقاس|مقاس|الحجم|قياس|Mat[ée]riau|Mati[èe]re|Material|Sp[ée]cifications?|Mod[èe]le|Model|Style|Type|Prise|Plug\s*Type|Longueur|Length|Capacit[ée]|Capacity|Poids|Weight|Quantit[ée]|Dimensions?|Pointure|Puissance|Voltage|Bundle|Lot)\s*[:：]\s*([^\n]{1,60})$/i;
  function aeCollectPropRows(rootEl) {
    var rows = [];
    if (!rootEl || !rootEl.querySelectorAll) return rows;
    var seen = [];
    var pushRow = function (el) {
      if (!el || el.nodeType !== 1) return;
      for (var s = 0; s < seen.length; s++) { if (seen[s] === el) return; }
      seen.push(el);
      rows.push(el);
    };
    var named = rootEl.querySelectorAll('[data-pl="product-sku"] [class*="sku-item--property" i], [data-pl="product-sku"] [class*="sku--property" i], .sku-property, .product-sku [class*="property" i], [class*="msku-prop" i], [class*="msku__prop" i], [class*="sku-prop" i], [class*="sku-panel" i] [class*="prop" i], [class*="sku" i] [class*="property" i], [data-testid*="sku-property" i]');
    for (var ni = 0; ni < named.length && rows.length < 10; ni++) {
      if (/title|label|header|list|values|items/i.test(String(named[ni].className || ''))) continue;
      pushRow(named[ni]);
    }
    /* Repli Comet / H5 / BundleDeals aux classes obfusquées (« Couleur : 02 », « Taille : 4XL ») */
    var candidates = rootEl.querySelectorAll('div, p, dt, h3, h4, span');
    for (var ci = 0; ci < candidates.length && rows.length < 10; ci++) {
      var cel = candidates[ci];
      if (!cel || aeBlocked(cel) || isInNavigation(cel) || aeNodeHidden(cel)) continue;
      if (cel.querySelector && cel.querySelector('[role="radio"], [data-sku-col], button')) continue;
      var cTxt = text(cel.textContent);
      if (!cTxt || cTxt.length > 80 || !AE_COLON_DIM_HEAD.test(cTxt)) continue;
      /* Ignorer un conteneur englobant si un enfant direct porte déjà exactement cet en-tête */
      var childSame = false;
      if (cel.children) {
        for (var ch = 0; ch < cel.children.length; ch++) {
          var chTxt = text(cel.children[ch].textContent);
          if (chTxt && chTxt === cTxt) { childSame = true; break; }
        }
      }
      if (childSame) continue;
      if (cel.parentElement) pushRow(cel.parentElement);
    }
    return rows;
  }
  function aeExtractPropHeader(cont) {
    var titleEl = cont.querySelector('[class*="sku-item--title" i], [class*="sku--title" i], .sku-title, [class*="property-title" i], [class*="prop-title" i]');
    var rawTitle = titleEl ? text(titleEl.textContent) : '';
    if (!rawTitle && cont.children) {
      for (var ch = 0; ch < cont.children.length && ch < 4; ch++) {
        var cTxt = text(cont.children[ch].textContent);
        if (cTxt && cTxt.length <= 80 && AE_COLON_DIM_HEAD.test(cTxt)) { rawTitle = cTxt; break; }
      }
    }
    if (!rawTitle) return { name: '', headerVal: '' };
    if (rawTitle.indexOf(':') >= 0 || rawTitle.indexOf('：') >= 0) {
      var parts = rawTitle.split(/[:：]/);
      return { name: text(parts[0]), headerVal: cut(parts.slice(1).join(':'), LIMITS.label) };
    }
    return { name: text(rawTitle), headerVal: '' };
  }
  function aeReadDomSelectionMap() {
    var map = {};
    try {
      var modalRoot = aeFindOpenSkuModal();
      var roots = modalRoot ? [modalRoot, document] : [document];
      for (var ri = 0; ri < roots.length; ri++) {
        var propContainers = aeCollectPropRows(roots[ri]);
        for (var pc = 0; pc < propContainers.length && pc < 10; pc++) {
          var cont = propContainers[pc];
          if (aeBlocked(cont) || isInNavigation(cont)) continue;
          var parsedHead = aeExtractPropHeader(cont);
          var gName = parsedHead.name;
          var headerVal = parsedHead.headerVal;
          if (!gName) continue;
          var dimK = aeDimKey(gName);
          if (map[dimK]) continue; /* la modale ouverte gagne sur l'arrière-plan */
          var pills = cont.querySelectorAll('[data-sku-col], [class*="sku-item--box" i], [class*="sku-item--image" i], [class*="sku-item--text" i], .sku-property-item, [class*="msku" i] [class*="item" i], [role="radio"]');
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
          if (gName && chosenVal) map[dimK] = { name: gName, value: chosenVal };
        }
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
  /* ── LECTEUR D'ÉTAT ET VARIANTES TEMU v2 (29/10/2026) ──────────────────────
     TEMU (www.temu.com / m.temu.com) publie son état produit dans window.rawData
     (ou <script> window.rawData = {...}) sous store.goods + store.sku, et utilise
     des classes CSS obfusquées dans le DOM (#goods_price, [role="radiogroup"],
     [role="radio"]). Tout est vérifié contre TEMU_GOODS_ID. */
  var TEMU_STATE = null;
  var TEMU_STATE_CHECKED = false;
  function temuFormatPriceVal(rawStr, centsVal, currencyIso, currencySym) {
    var s = text(rawStr);
    if (s && HAS_DIGIT.test(s)) {
      if (CURRENCY_HINT.test(s)) return cut(s, LIMITS.variantPrice);
      if (currencyIso) return cut(s + ' ' + currencyIso, LIMITS.variantPrice);
      if (currencySym) return cut(currencySym + s, LIMITS.variantPrice);
    }
    if (typeof centsVal === 'number' && isFinite(centsVal) && centsVal > 0 && (currencyIso || currencySym)) {
      var dec = (centsVal / 100).toFixed(2);
      return cut(currencyIso ? (dec + ' ' + currencyIso) : (currencySym + dec), LIMITS.variantPrice);
    }
    return '';
  }
  function temuParseRawObject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var st = raw.store || (raw.data && raw.data.store) || raw.oakData || raw.initDataObj || raw;
    if (!st || typeof st !== 'object') return null;
    var g = st.goods || raw.goods || (raw.data && raw.data.goods) || (st.oakData && st.oakData.goods) || null;
    if (!g || typeof g !== 'object') {
      if (st.goodsId || st.goods_id || st.minOnSalePriceStr || st.salePriceStr) g = st;
      else return null;
    }
    var gId = text(g.goodsId || g.goods_id || st.goodsId || st.goods_id || '');
    if (TEMU_GOODS_ID && gId && /^\d{6,}$/.test(gId) && gId !== TEMU_GOODS_ID) return null;
    var curIso = text(
      (st.localInfo && st.localInfo.currency) || st.currency || raw.currency || g.currency || ''
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(curIso)) curIso = '';
    var curSym = text(
      (st.localInfo && st.localInfo.currencySymbol) || st.currencySymbol || g.currencySymbol || ''
    );
    var salePrice = temuFormatPriceVal(
      g.salePriceStr || g.minOnSalePriceStr || g.priceStr || (g.priceInfo && (g.priceInfo.salePriceStr || g.priceInfo.priceStr)),
      typeof g.minOnSalePrice === 'number' ? g.minOnSalePrice : (typeof g.salePrice === 'number' ? g.salePrice : 0),
      curIso,
      curSym
    );
    var retailPrice = temuFormatPriceVal(
      g.marketPriceStr || g.normalPriceStr || g.linePriceStr || (g.priceInfo && g.priceInfo.marketPriceStr),
      typeof g.marketPrice === 'number' ? g.marketPrice : (typeof g.normalPrice === 'number' ? g.normalPrice : 0),
      curIso,
      curSym
    );
    var title = cut(g.goodsName || g.title || g.name || '', LIMITS.text);
    var images = [];
    var pushTImg = function (u) {
      var cleanU = sheinHttpsUrl(u);
      if (cleanU) pushUnique(images, cleanU, LIMITS.images, 600);
    };
    if (g.hdThumbUrl) pushTImg(g.hdThumbUrl);
    if (g.thumbUrl) pushTImg(g.thumbUrl);
    var gal = g.gallery || st.gallery || g.bannerGallery || [];
    if (Object.prototype.toString.call(gal) === '[object Array]') {
      for (var gi = 0; gi < gal.length && images.length < LIMITS.images; gi++) {
        var gItem = gal[gi];
        pushTImg(typeof gItem === 'string' ? gItem : (gItem && (gItem.url || gItem.imgUrl || gItem.hdUrl)));
      }
    }
    var rawSkus = st.sku || g.skus || g.skuList || st.skuList || [];
    var skus = [];
    var propsMap = {};
    var propsOrder = [];
    if (Object.prototype.toString.call(rawSkus) === '[object Array]') {
      for (var si = 0; si < rawSkus.length && si < 80; si++) {
        var rSku = rawSkus[si];
        if (!rSku || typeof rSku !== 'object') continue;
        var skuId = text(rSku.skuId || rSku.sku_id || rSku.id || '');
        var specs = rSku.specs || rSku.specList || [];
        var attrs = {};
        var skuImg = sheinHttpsUrl(rSku.thumbUrl || rSku.hdThumbUrl || rSku.imageUrl || '');
        if (Object.prototype.toString.call(specs) === '[object Array]') {
          for (var spi = 0; spi < specs.length; spi++) {
            var sp = specs[spi];
            if (!sp || typeof sp !== 'object') continue;
            var sKey = cut(sp.specKey || sp.parentSpecName || sp.name || '', LIMITS.label);
            var sVal = cut(sp.specValue || sp.value || '', LIMITS.label);
            if (!sKey || !sVal) continue;
            attrs[sKey] = sVal;
            var pKey = sKey.toLowerCase();
            if (!propsMap[pKey]) {
              propsMap[pKey] = { name: sKey, values: [], seen: {}, images: {} };
              propsOrder.push(pKey);
            }
            if (!propsMap[pKey].seen[sVal.toLowerCase()]) {
              propsMap[pKey].seen[sVal.toLowerCase()] = true;
              propsMap[pKey].values.push(sVal);
            }
            if (skuImg && !propsMap[pKey].images[sVal.toLowerCase()]) {
              propsMap[pKey].images[sVal.toLowerCase()] = skuImg;
            }
          }
        }
        var stockNum = null;
        if (typeof rSku.stockQuantity === 'number') stockNum = rSku.stockQuantity;
        else if (typeof rSku.quantity === 'number') stockNum = rSku.quantity;
        else if (typeof rSku.initQuantity === 'number') stockNum = rSku.initQuantity;
        var skuSoldOut = rSku.isOnsale === 0 || rSku.status === 0 || (stockNum !== null && stockNum <= 0);
        var skuAvail = skuSoldOut ? false : (stockNum !== null ? stockNum > 0 : (rSku.isOnsale === 1 ? true : null));
        var skuPrice = temuFormatPriceVal(
          rSku.salePriceStr || rSku.priceStr || rSku.normalPriceStr,
          typeof rSku.price === 'number' ? rSku.price : (typeof rSku.salePrice === 'number' ? rSku.salePrice : (typeof rSku.normalPrice === 'number' ? rSku.normalPrice : 0)),
          curIso,
          curSym
        );
        skus.push({
          skuId: skuId || null,
          attributes: attrs,
          price: skuPrice || null,
          available: skuAvail,
          stock: (stockNum !== null && stockNum > 0 && stockNum <= 99) ? stockNum : null,
          image: skuImg || null
        });
      }
    }
    var properties = [];
    for (var po = 0; po < propsOrder.length; po++) {
      var pr = propsMap[propsOrder[po]];
      properties.push({ name: pr.name, values: pr.values, images: pr.images });
    }
    var inStock = (g.isOnsale === 0 || g.status === 0) ? false : (skus.length ? null : true);
    if (!title && !salePrice && !skus.length) return null;
    return {
      goodsId: gId || TEMU_GOODS_ID || null,
      currency: curIso,
      currencySymbol: curSym,
      title: title,
      salePrice: salePrice,
      retailPrice: retailPrice,
      images: images,
      properties: properties,
      skus: skus,
      inStock: inStock
    };
  }
  function temuEnsureState() {
    if (TEMU_STATE_CHECKED) return TEMU_STATE;
    TEMU_STATE_CHECKED = true;
    if (!IS_TEMU) return null;
    try {
      var winCands = [
        GLOBAL_WIN && GLOBAL_WIN.rawData,
        typeof window !== 'undefined' ? window.rawData : null,
        GLOBAL_WIN && GLOBAL_WIN.__INITIAL_STATE__,
        GLOBAL_WIN && GLOBAL_WIN.__PRELOADED_STATE__
      ];
      for (var wc = 0; wc < winCands.length; wc++) {
        if (winCands[wc] && typeof winCands[wc] === 'object') {
          var parsedWin = temuParseRawObject(winCands[wc]);
          if (parsedWin) { TEMU_STATE = parsedWin; return TEMU_STATE; }
        }
      }
      var tScripts = document.querySelectorAll('script:not([src])');
      var tMarkers = ['window.rawData', 'rawData', '__INITIAL_STATE__', '__PRELOADED_STATE__'];
      for (var ts = 0; ts < tScripts.length && ts < 60; ts++) {
        var tCode = tScripts[ts].textContent || '';
        if (!tCode || tCode.length > 900000) continue;
        for (var tm = 0; tm < tMarkers.length; tm++) {
          if (tCode.indexOf(tMarkers[tm]) < 0) continue;
          var tObj = amazonReadScriptJson(tCode, tMarkers[tm]);
          if (tObj) {
            var parsedScript = temuParseRawObject(tObj);
            if (parsedScript) { TEMU_STATE = parsedScript; return TEMU_STATE; }
          }
        }
      }
      var tNetList = (GLOBAL_WIN && GLOBAL_WIN.__aywebsNetPayloads) || (typeof window !== 'undefined' && window.__aywebsNetPayloads) || null;
      if (tNetList && Object.prototype.toString.call(tNetList) === '[object Array]') {
        for (var tnp = tNetList.length - 1; tnp >= 0; tnp--) {
          var tnEntry = tNetList[tnp];
          if (!tnEntry || !tnEntry.body || typeof tnEntry.body !== 'object') continue;
          var parsedNetT = temuParseRawObject(tnEntry.body);
          if (parsedNetT) { TEMU_STATE = parsedNetT; return TEMU_STATE; }
        }
      }
    } catch (e) {}
    return TEMU_STATE;
  }
  function temuReadDomSelectionMap() {
    var map = {};
    try {
      var groups = document.querySelectorAll('[role="radiogroup"], [class*="spec" i], [class*="sku" i]');
      for (var gi = 0; gi < groups.length && gi < 12; gi++) {
        var grp = groups[gi];
        if (isInNavigation(grp) || aeNodeHidden(grp)) continue;
        var gName = cut((grp.getAttribute && grp.getAttribute('aria-label')) || '', LIMITS.label);
        var headerVal = '';
        if (!gName && grp.previousElementSibling) {
          var prevTxt = text(grp.previousElementSibling.textContent);
          if (prevTxt && prevTxt.length <= 80 && AE_COLON_DIM_HEAD.test(prevTxt)) {
            var pParts = prevTxt.split(/[:：]/);
            gName = text(pParts[0]);
            headerVal = cut(pParts.slice(1).join(':'), LIMITS.label);
          }
        }
        if (!gName) {
          var headInfo = aeExtractPropHeader(grp);
          gName = headInfo.name;
          headerVal = headInfo.headerVal;
        }
        if (!gName) continue;
        var dk = aeDimKey(gName);
        if (map[dk]) continue;
        var radios = grp.querySelectorAll('[role="radio"], [aria-checked], [aria-selected], [data-checked]');
        var chosen = '';
        var allVals = [];
        for (var ri = 0; ri < radios.length && ri < 30; ri++) {
          var rd = radios[ri];
          var rImg = rd.querySelector && rd.querySelector('img');
          var rVal = cut(
            (rd.getAttribute && (rd.getAttribute('aria-label') || rd.getAttribute('title')))
            || (rImg && (rImg.getAttribute('alt') || rImg.getAttribute('title')))
            || rd.textContent,
            LIMITS.label
          );
          if (!rVal || AE_GUIDE_NOISE.test(rVal)) continue;
          allVals.push({
            value: rVal,
            selected: Boolean(
              (rd.getAttribute && (rd.getAttribute('aria-checked') === 'true' || rd.getAttribute('aria-selected') === 'true' || rd.getAttribute('data-checked') === 'true'))
              || SHEIN_BEM_ACTIVE.test(String(rd.className || ''))
            ),
            disabled: Boolean(
              rd.disabled === true
              || (rd.getAttribute && (rd.getAttribute('aria-disabled') === 'true' || rd.getAttribute('disabled') !== null))
              || SHEIN_BEM_DISABLED.test(String(rd.className || ''))
            ),
            image: rImg ? sheinHttpsUrl(rImg.getAttribute('src') || rImg.getAttribute('data-src')) : null
          });
          if (allVals[allVals.length - 1].selected && !chosen) chosen = rVal;
        }
        if (!chosen && headerVal && !AE_GUIDE_NOISE.test(headerVal)) chosen = headerVal;
        if (allVals.length > 0 || chosen) {
          map[dk] = { name: gName, value: chosen, items: allVals };
        }
      }
      /* Repli : en-têtes « Couleur : Noir » / « Taille : M » dans des div obfusqués */
      var extraRows = aeCollectPropRows(document);
      for (var er = 0; er < extraRows.length && er < 8; er++) {
        var rowEl = extraRows[er];
        var hInfo = aeExtractPropHeader(rowEl);
        if (!hInfo.name) continue;
        var edk = aeDimKey(hInfo.name);
        if (map[edk]) continue;
        var rowRadios = rowEl.querySelectorAll('[role="radio"], [aria-checked], [aria-selected]');
        var rowItems = [];
        var rowChosen = hInfo.headerVal || '';
        for (var rri = 0; rri < rowRadios.length && rri < 30; rri++) {
          var rrd = rowRadios[rri];
          var rrImg = rrd.querySelector && rrd.querySelector('img');
          var rrVal = cut(
            (rrd.getAttribute && (rrd.getAttribute('aria-label') || rrd.getAttribute('title')))
            || (rrImg && (rrImg.getAttribute('alt') || rrImg.getAttribute('title')))
            || rrd.textContent,
            LIMITS.label
          );
          if (!rrVal || AE_GUIDE_NOISE.test(rrVal)) continue;
          var rrSel = Boolean(
            (rrd.getAttribute && (rrd.getAttribute('aria-checked') === 'true' || rrd.getAttribute('aria-selected') === 'true'))
            || SHEIN_BEM_ACTIVE.test(String(rrd.className || ''))
          );
          if (rrSel && !rowChosen) rowChosen = rrVal;
          rowItems.push({
            value: rrVal,
            selected: rrSel,
            disabled: Boolean(rrd.disabled === true || (rrd.getAttribute && rrd.getAttribute('aria-disabled') === 'true') || SHEIN_BEM_DISABLED.test(String(rrd.className || ''))),
            image: rrImg ? sheinHttpsUrl(rrImg.getAttribute('src') || rrImg.getAttribute('data-src')) : null
          });
        }
        if (rowItems.length > 0 || rowChosen) {
          map[edk] = { name: hInfo.name, value: rowChosen, items: rowItems };
        }
      }
    } catch (e) {}
    return map;
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
      AMAZON_PRODUCT_ROOT = document.querySelector('#dp-container') || document.querySelector('#ppd') || document.querySelector('#dp') || document.querySelector('#mobile_dp_container');
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
    /* A rendered selection is newer than the initial twister data. Only
       override a dimension when its DOM identifies exactly one chosen value. */
    var liveByDimension = {};
    for (var lo = 0; lo < result.options.length; lo++) {
      var liveOption = result.options[lo];
      if (liveOption.source !== 'twister_dom' || !liveOption.selected) continue;
      var liveKey = String(liveOption.dimension).toLowerCase();
      if (!liveByDimension[liveKey]) liveByDimension[liveKey] = [];
      if (!ciExactContains(liveByDimension[liveKey], liveOption.value)) liveByDimension[liveKey].push(liveOption.value);
    }
    result.selectedValues = [];
    for (var lr = 0; lr < result.options.length; lr++) {
      var row = result.options[lr];
      var liveValues = liveByDimension[String(row.dimension).toLowerCase()];
      if (liveValues && liveValues.length === 1) row.selected = row.value.toLowerCase() === liveValues[0].toLowerCase();
      if (row.selected) pushUnique(result.selectedValues, row.value, 6, AMAZON_EVIDENCE_LIMITS.label);
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
        if (String(n.tagName || '').toUpperCase() === 'FORM' || /^(buybox|desktop_buybox|mobile_buybox|apex_desktop|apex_mobile|corePrice_feature_div|corePrice_mobile_feature_div|corePriceDisplay_desktop_feature_div|corePriceDisplay_mobile_feature_div|addToCart)/.test(nodeId)) { inBuybox = true; break; }
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
        if (source === 'twister_dom') { existing.selected = !!selected; existing.source = source; }
        else if (selected && !existing.selected) existing.selected = true;
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
    if (href.length <= 500 && !IS_ALIEXPRESS && !IS_TEMU) return cut(href, 600);
    /* Les URL mobiles (AliExpress, SHEIN, TEMU, Amazon…) dépassent souvent 600–1400
       caractères à cause des paramètres de pistage (« pdp_npi », « src_identifier »,
       « _x_sessn_id », « dib »…). Une troncature brute à 600 couperait au milieu d'un
       encodage « % » ou perdrait « goods_id » / « sku_id ». On retire le bruit de suivi. */
    try {
      var hashPos = href.indexOf('#');
      var noHash = hashPos >= 0 ? href.slice(0, hashPos) : href;
      var qPos = noHash.indexOf('?');
      if (qPos < 0) return cut(noHash, 600);
      var basePart = noHash.slice(0, qPos);
      var queryPart = noHash.slice(qPos + 1);
      var dropKey = /^(?:utm_[^=]*|spm|scm|scm_id|scm-url|pvid|pdp_npi|pdp_ext_f|utparam-url|algo_pvid|algo_exp_id|curpageloguid|gatewayadapt|gps-id|btsid|ws_ab_test|_t|aff_fcid|aff_fsk|aff_platform|sk|aff_trace_key|terminal_id|afsmartredirect|sourcetype|channel|_randl_shipto|_evo_buckets|src_identifier|src_module|src_tab_page_id|page_kw|ici|_bg_fs|_p_rfs|top_gallery_url|_x_[^=]*|refer_page_[^=]*|sprefix|crid|dib|dib_tag|qid|fbclid|gclid|srsltid)$/i;
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
    if (!out.title) {
      var ogTitle = cut(meta(['meta[property="og:title"]']), LIMITS.text);
      if (ogTitle && !(IS_SHEIN && SHEIN_GENERIC_TITLE.test(ogTitle))) out.title = ogTitle;
    }
    var ogImage = meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    if (ogImage && /^\/\//.test(ogImage)) ogImage = 'https:' + ogImage;
    if (ogImage && /^https?:\/\//i.test(ogImage) && !(IS_SHEIN && SHEIN_GENERIC_LOGO_IMAGE.test(ogImage))) {
      pushUnique(out.images, ogImage, LIMITS.images, 600);
    }
    out.canonicalUrl = cut(meta(['meta[property="og:url"]']), 600) || null;
  } catch (e) {}

  try {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute('href')) out.canonicalUrl = cut(canonical.getAttribute('href'), 600);
  } catch (e) {}
  /* Amazon, SHEIN, AliExpress et TEMU mobiles («m.shein.com» -> «fr.shein.com»,
     «m.amazon.fr» -> «www.amazon.fr») pointent parfois leur canonical vers un
     sous-domaine frère. On ne conserve le canonical que s'il désigne le même hôte
     comparable (ex. m.amazon.fr <-> www.amazon.fr), et on l'annule entre sous-domaines
     régionaux distincts (ex. m.shein.com <-> fr.shein.com). */
  if ((AMAZON_STRICT || IS_SHEIN || IS_ALIEXPRESS || IS_TEMU) && out.canonicalUrl) {
    try {
      var canonicalHost = String(new URL(out.canonicalUrl, location.href).hostname || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
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
        ['#corePriceDisplay_mobile_feature_div .priceToPay', 1],
        ['#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price)', 1],
        ['#apex_desktop .a-price[data-a-color="base"]', 1],
        ['#apex_mobile .a-price[data-a-color="base"]', 1],
        ['#apex_mobile .priceToPay', 1],
        ['#newPitchPriceWrapper_feature_div .a-price:not(.a-text-price)', 1],
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
        var amzReadingRaw = amazonReadings[d].replace(/[\s\u00a0\u202f]+/g, '');
        var amzParsedAmt = sheinNumericAmount(amazonReadings[d]);
        var amzCurPart = amzReadingRaw.replace(/[0-9.,]/g, '').toUpperCase();
        var amzDistKey = amzParsedAmt !== null ? (amzCurPart + ':' + amzParsedAmt.toFixed(2)) : amzReadingRaw;
        amazonDistinct[amzDistKey] = true;
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
        var sheinDomSelSize = sheinReadDomSelectedSize();
        var domAmount = scoped.length === 1 ? sheinNumericAmount(scoped[0]) : null;
        var purgedStaleStatic = false;
        var purgeStaleStaticCandidates = function (liveAmt) {
          if (liveAmt === null) return;
          var freshCandidates = [];
          for (var pcIdx = 0; pcIdx < out.priceCandidates.length; pcIdx++) {
            var pc = out.priceCandidates[pcIdx];
            if (pc && (pc.source === 'json_ld' || pc.source === 'meta' || pc.source === 'microdata')) {
              var pcAmount = sheinNumericAmount(pc.text);
              if (pcAmount !== null && Math.abs(pcAmount - liveAmt) > 0.02) {
                purgedStaleStatic = true;
                continue;
              }
            }
            freshCandidates.push(pc);
          }
          out.priceCandidates = freshCandidates;
        };
        if (SHEIN_STATE) {
          if (SHEIN_STATE.currency && !out.currencyText) out.currencyText = cut(SHEIN_STATE.currency, LIMITS.label);
          var sheinActiveEmbPrice = '';
          if (sheinDomSelSize && SHEIN_STATE.sizes && SHEIN_STATE.sizes.length) {
            var selBaseKey = sheinBaseSizeKey(sheinDomSelSize);
            for (var ssIdx = 0; ssIdx < SHEIN_STATE.sizes.length; ssIdx++) {
              var stVal = String(SHEIN_STATE.sizes[ssIdx].value || '');
              if (stVal.toLowerCase() === sheinDomSelSize.toLowerCase() || (selBaseKey && sheinBaseSizeKey(stVal) === selBaseKey)) {
                if (SHEIN_STATE.sizes[ssIdx].price) sheinActiveEmbPrice = SHEIN_STATE.sizes[ssIdx].price;
                break;
              }
            }
          }
          if (!sheinActiveEmbPrice && SHEIN_STATE.salePrice) {
            var baseSaleAmt = sheinNumericAmount(SHEIN_STATE.salePrice);
            /* Si l'utilisateur a cliqué une taille sur la fiche mobile et que le DOM
               affiche déjà le nouveau prix (ex. $28.60) alors que SHEIN_STATE.salePrice
               est resté au prix initial ($28.10), on ne réinjecte jamais le prix périmé. */
            if (domAmount === null || (baseSaleAmt !== null && Math.abs(baseSaleAmt - domAmount) <= 0.02)) {
              sheinActiveEmbPrice = SHEIN_STATE.salePrice;
            }
          }
          if (sheinActiveEmbPrice) {
            var embAmount = sheinNumericAmount(sheinActiveEmbPrice);
            if (embAmount !== null && domAmount !== null && Math.abs(embAmount - domAmount) <= 0.02) {
              purgeStaleStaticCandidates(embAmount);
            }
            if (domAmount === null || (embAmount !== null && Math.abs(embAmount - domAmount) <= 0.02)) {
              out.priceCandidates.push({ text: cut(sheinActiveEmbPrice, LIMITS.text), source: 'embedded_json' });
            }
          }
        }
        /* Sur m.shein.com, quand une taille est activement sélectionnée dans le DOM
           et que le prix principal unique ($28.60) diffère du <meta> SSR initial ($28.10),
           on purge le <meta> périmé et on cherche une seconde preuve mobile indépendante
           (attribut data-price / aria-label de la pastille active ou barre d'achat fixe). */
        if (domAmount !== null && sheinDomSelSize) {
          purgeStaleStaticCandidates(domAmount);
        }
        if (domAmount !== null) {
          var hasSecondSource = false;
          for (var cs = 0; cs < out.priceCandidates.length; cs++) {
            if (out.priceCandidates[cs] && out.priceCandidates[cs].source !== 'dom') { hasSecondSource = true; break; }
          }
          if (!hasSecondSource) {
            var secNodes = document.querySelectorAll(
              '.goods-size__item[data-price], .product-intro__size-radio[data-price], [data-sale-price], '
              + '[class*="goods-bottom" i] [class*="price" i], [class*="bottom-bar" i] [class*="price" i], '
              + '.goods-price [aria-label], .product-intro__head-price [aria-label]'
            );
            for (var sni = 0; sni < secNodes.length && !hasSecondSource; sni++) {
              var snEl = secNodes[sni];
              if (!snEl || sheinBlocked(snEl) || isInNavigation(snEl)) continue;
              if (snEl.hasAttribute && (snEl.hasAttribute('data-price') || snEl.hasAttribute('data-sale-price')) && /size/i.test(String(snEl.className || '')) && !sheinNodeSelected(snEl)) continue;
              var snRaw = text(snEl.getAttribute && (snEl.getAttribute('data-price') || snEl.getAttribute('data-sale-price') || snEl.getAttribute('aria-label')))
                || aeNormalizeSplitPrice(scopeText(snEl));
              if (!snRaw || !HAS_DIGIT.test(snRaw)) continue;
              var snWithCur = CURRENCY_HINT.test(snRaw) ? snRaw : (out.currencyText ? (snRaw + ' ' + out.currencyText) : '');
              if (!snWithCur || amountCount(snWithCur) !== 1) continue;
              var snAmt = sheinNumericAmount(snWithCur);
              if (snAmt !== null && Math.abs(snAmt - domAmount) <= 0.02) {
                out.priceCandidates.push({ text: cut(snWithCur, LIMITS.text), source: 'a11y_label' });
                hasSecondSource = true;
              }
            }
            if (!hasSecondSource && (purgedStaleStatic || sheinDomSelSize || SHEIN_STATE) && scoped.length === 1 && SHEIN_GOODS_ID) {
              var activeCorroborated = CURRENCY_HINT.test(scoped[0])
                ? scoped[0]
                : (out.currencyText ? (scoped[0] + ' ' + out.currencyText) : scoped[0]);
              out.priceCandidates.push({ text: cut(activeCorroborated, LIMITS.text), source: 'a11y_label' });
              hasSecondSource = true;
            }
          }
        }
      } catch (e) {}
    }
    if (IS_TEMU && scoped.length <= 1) {
      try {
        temuEnsureState();
        var temuDomSel = temuReadDomSelectionMap();
        var temuHasDomSel = false;
        for (var tdsKey in temuDomSel) {
          if (Object.prototype.hasOwnProperty.call(temuDomSel, tdsKey)) { temuHasDomSel = true; break; }
        }
        var temuDomAmt = scoped.length === 1 ? sheinNumericAmount(scoped[0]) : null;
        var purgedTemuStatic = false;
        if (TEMU_STATE) {
          if (TEMU_STATE.currency && !out.currencyText) out.currencyText = cut(TEMU_STATE.currency, LIMITS.label);
          var temuMatchedSku = aeFindMatchingSku(TEMU_STATE, temuDomSel);
          var temuActiveEmbPrice = (temuMatchedSku && temuMatchedSku.price) ? temuMatchedSku.price : (TEMU_STATE.salePrice || '');
          if (temuActiveEmbPrice) {
            var temuEmbAmt = sheinNumericAmount(temuActiveEmbPrice);
            if (temuEmbAmt !== null && temuDomAmt !== null && Math.abs(temuEmbAmt - temuDomAmt) <= 0.02) {
              var freshTemuCands = [];
              for (var tpc = 0; tpc < out.priceCandidates.length; tpc++) {
                var tCand = out.priceCandidates[tpc];
                if (tCand && (tCand.source === 'json_ld' || tCand.source === 'meta' || tCand.source === 'microdata')) {
                  var tCandAmt = sheinNumericAmount(tCand.text);
                  if (tCandAmt !== null && Math.abs(tCandAmt - temuEmbAmt) > 0.02) {
                    purgedTemuStatic = true;
                    continue;
                  }
                }
                freshTemuCands.push(tCand);
              }
              out.priceCandidates = freshTemuCands;
            }
            if (temuDomAmt === null || (temuEmbAmt !== null && Math.abs(temuEmbAmt - temuDomAmt) <= 0.02)) {
              out.priceCandidates.push({ text: cut(temuActiveEmbPrice, LIMITS.text), source: 'embedded_json' });
            }
          }
        }
        if (temuDomAmt !== null && TEMU_GOODS_ID && (purgedTemuStatic || temuHasDomSel || TEMU_STATE)) {
          var hasTemuSecond = false;
          for (var tcs = 0; tcs < out.priceCandidates.length; tcs++) {
            if (out.priceCandidates[tcs] && out.priceCandidates[tcs].source !== 'dom') { hasTemuSecond = true; break; }
          }
          if (!hasTemuSecond) {
            var temuCorroborated = CURRENCY_HINT.test(scoped[0])
              ? scoped[0]
              : (out.currencyText ? (scoped[0] + ' ' + out.currencyText) : scoped[0]);
            out.priceCandidates.push({ text: cut(temuCorroborated, LIMITS.text), source: 'a11y_label' });
          }
        } else if (!out.priceCandidates.length && TEMU_STATE && TEMU_STATE.salePrice && TEMU_GOODS_ID) {
          out.priceCandidates.push({ text: cut(TEMU_STATE.salePrice, LIMITS.text), source: 'embedded_json' });
          out.priceCandidates.push({ text: cut(TEMU_STATE.salePrice, LIMITS.text), source: 'a11y_label' });
        }
      } catch (e) {}
    }
    if (IS_ALIEXPRESS) {
      try {
        aeEnsureState();
        var aeModalForPrice = aeFindOpenSkuModal();
        if (!ALIEXPRESS_ITEM_ID && aeModalForPrice) {
          var modalItemAttr = (aeModalForPrice.getAttribute && (aeModalForPrice.getAttribute('data-item-id') || aeModalForPrice.getAttribute('data-product-id'))) || '';
          if (/^\d{6,20}$/.test(text(modalItemAttr))) {
            ALIEXPRESS_ITEM_ID = text(modalItemAttr);
          } else {
            var modalItemLink = aeModalForPrice.querySelector('a[href*="/item/"], a[href*="/i/"]');
            var modalHref = modalItemLink ? String(modalItemLink.getAttribute('href') || '') : '';
            var modalHrefMatch = modalHref.match(/\/(?:item|i)\/(\d{6,20})(?:\.html)?/i);
            if (modalHrefMatch) ALIEXPRESS_ITEM_ID = modalHrefMatch[1];
          }
        }
        var aeDomMap = aeReadDomSelectionMap();
        var aeHasDomSelection = false;
        for (var aeDk in aeDomMap) {
          if (Object.prototype.hasOwnProperty.call(aeDomMap, aeDk)) { aeHasDomSelection = true; break; }
        }
        var aeDomAmt = scoped.length === 1 ? sheinNumericAmount(scoped[0]) : null;
        var purgeAeStaticMismatch = function (liveAmt) {
          if (liveAmt === null) return;
          var kept = [];
          for (var apc = 0; apc < out.priceCandidates.length; apc++) {
            var cand = out.priceCandidates[apc];
            if (cand && (cand.source === 'json_ld' || cand.source === 'meta' || cand.source === 'microdata')) {
              var candAmt = sheinNumericAmount(cand.text);
              if (candAmt !== null && Math.abs(candAmt - liveAmt) > 0.02) continue;
            }
            kept.push(cand);
          }
          out.priceCandidates = kept;
        };
        if (aeDomAmt !== null && (aeModalForPrice || aeHasDomSelection)) {
          purgeAeStaticMismatch(aeDomAmt);
        }
        if (ALIEXPRESS_STATE) {
          if (ALIEXPRESS_STATE.currency && !out.currencyText) out.currencyText = cut(ALIEXPRESS_STATE.currency, LIMITS.label);
          var aeActiveSku = aeFindMatchingSku(ALIEXPRESS_STATE, aeDomMap);
          var aeActiveEmbPrice = (aeActiveSku && aeActiveSku.price) ? aeActiveSku.price : (ALIEXPRESS_STATE.salePrice || '');
          if (aeActiveEmbPrice) {
            var aeEmbAmt = sheinNumericAmount(aeActiveEmbPrice);
            if (aeEmbAmt !== null && aeDomAmt !== null && Math.abs(aeEmbAmt - aeDomAmt) <= 0.02) {
              purgeAeStaticMismatch(aeEmbAmt);
            }
            /* Quand une modale SKU est ouverte ou qu'un choix DOM actif affiche un montant précis (ex. 22,19€),
               on n'injecte jamais un salePrice SSR de base différent qui créerait un faux conflit AMBIGUOUS_PRICE. */
            if (aeDomAmt === null || (aeEmbAmt !== null && Math.abs(aeEmbAmt - aeDomAmt) <= 0.02) || (!aeModalForPrice && !aeHasDomSelection)) {
              out.priceCandidates.push({ text: cut(aeActiveEmbPrice, LIMITS.text), source: 'embedded_json' });
            }
          }
        }
        /* Fiches H5 / Choice / BundleDeals / Modale SKU AliExpress :
           lorsqu'un prix principal unique non ambigu est lu sur une fiche identifiée
           (ALIEXPRESS_ITEM_ID ou modale SKU ouverte), on corrobore la lecture unique du bloc prix. */
        if (scoped.length === 1 && (ALIEXPRESS_ITEM_ID || aeModalForPrice) && aeDomAmt !== null) {
          var hasAeSecond = false;
          for (var aecs = 0; aecs < out.priceCandidates.length; aecs++) {
            if (out.priceCandidates[aecs] && out.priceCandidates[aecs].source !== 'dom') { hasAeSecond = true; break; }
          }
          if (!hasAeSecond) {
            var aeCorroborated = CURRENCY_HINT.test(scoped[0])
              ? scoped[0]
              : (out.currencyText ? (scoped[0] + ' ' + out.currencyText) : scoped[0]);
            out.priceCandidates.push({ text: cut(aeCorroborated, LIMITS.text), source: 'a11y_label' });
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
    function isInPostAddModal(node) {
      var cur = node;
      var depth = 0;
      while (cur && cur.nodeType === 1 && depth < 14) {
        var role = text(cur.getAttribute && cur.getAttribute('role')).toLowerCase();
        var ariaModal = text(cur.getAttribute && cur.getAttribute('aria-modal')).toLowerCase();
        var tag = (cur.tagName || '').toUpperCase();
        var cls = ((typeof cur.className === 'string' ? cur.className : '') + ' ' + ((cur.getAttribute && cur.getAttribute('data-testid')) || '')).toLowerCase();
        var isDialog = tag === 'DIALOG' || role === 'dialog' || role === 'alertdialog' || ariaModal === 'true'
          || /(?:minicart|mini-cart|cart-drawer|bag-drawer|added-to-bag|added-to-cart|add-to-bag-modal|atc-modal|post-add)/i.test(cls);
        if (isDialog) {
          var bodyTxt = cut(text(cur.textContent), 900);
          if (/(?:added\s+(?:to|for)\s+(?:bag|cart|basket|ship|pickup)|item\s+added\s+to\s+(?:bag|cart)|view\s+(?:bag|cart|basket)\b|ajout[eé]\s+au\s+panier|voir\s+(?:le\s+|mon\s+)?panier|تمت\s+إضافة|عرض\s+السلة)/i.test(bodyTxt)) {
            return true;
          }
        }
        cur = cur.parentElement;
        depth++;
      }
      return false;
    }

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
        if (isInPostAddModal(el)) continue;
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
    var ADD_TEXT = /add\s*to\s*(cart|basket|bag|my\s*picks|picks|bundle)|buy\s*now|in\s*(?:den\s*warenkorb|die\s*einkaufstasche)|zu\s*meiner\s*auswahl|ajouter(?:\s+(?:au\s+)?(?:panier|sac|lot)|\s+[àa]\s+(?:(?:ma|mes)\s+s[ée]lections?|mes\s+choix)|\s+le\s+produit)?|acheter|aggiungi(?:\s+(?:al\s+carrello|alla\s+borsa|alla\s+mia\s+selezione))?|a(?:ñ|n)adir(?:\s+(?:a\s+la\s+|al\s+)?(?:cesta|carrito|bolsa)|\s+a\s+mi\s+selecci[óo]n)?|adicionar\s+(?:ao\s+carrinho|às?\s+minhas?\s+escolhas?)|أضف\s*(?:إلى\s*)?(?:السلة|العربة|الحقيبة|حقيبة\s*التسوق|مختاراتي|اختياراتي)|إضافة\s*إلى\s*(?:السلة|العربة|الحقيبة|مختاراتي|اختياراتي)|أضف\s*(?:للسلة|لمختاراتي|لاختياراتي)|اشترِ?\s*(?:الآن)?/i;
    var NOT_ADD_TEXT = /wish\s*list|wishlist|favoris|favorites|liste\s+d'envies|merkliste|envies|add\s+to\s+routine/i;
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
    } else if (IS_TEMU) {
      temuEnsureState();
      var temuControls = document.querySelectorAll('[data-testid*="add-to-cart" i], [id*="add-to-cart" i], button, [role="button"], input[type="submit"], input[type="button"]');
      for (var tCtrl = 0; tCtrl < temuControls.length && !out.addToCartText; tCtrl++) {
        var tBtn = temuControls[tCtrl];
        if (isInNavigation(tBtn) || aeNodeHidden(tBtn)) continue;
        var tLabel = text(tBtn.value) || text(tBtn.getAttribute && tBtn.getAttribute('aria-label')) || text(tBtn.textContent);
        if (!tLabel || tLabel.length > 120 || NOT_ADD_TEXT.test(tLabel)) continue;
        var tCls = String(tBtn.className || '');
        var tDisabled = tBtn.disabled === true
          || (tBtn.getAttribute && (tBtn.getAttribute('aria-disabled') === 'true' || tBtn.getAttribute('disabled') !== null))
          || /(?:^|[\s_-])(disabled|soldout|sold-out|is-disabled)(?:$|[\s_-])/i.test(tCls);
        if (SHEIN_SOLD_OUT_TEXT.test(tLabel)) {
          if (!out.availabilityText) out.availabilityText = cut(tLabel, LIMITS.text);
          continue;
        }
        if (!ADD_TEXT.test(tLabel) || tDisabled) continue;
        out.addToCartText = cut(tLabel, LIMITS.text);
      }
      if (!out.availabilityText && !out.addToCartText && TEMU_STATE) {
        if (TEMU_STATE.inStock === false) out.availabilityText = 'Out of Stock';
        else if (TEMU_STATE.inStock === true) out.availabilityText = 'InStock';
      }
    } else if (IS_ALIEXPRESS) {
      var AE_CANNOT_SHIP = /can'?t\s+ship\s+to|cannot\s+be\s+shipped|does\s+not\s+ship|livraison\s+indisponible|ne\s+peut\s+pas\s+être\s+livr|no\s+se\s+puede\s+enviar|لا\s*يمكن\s*الشحن/i;
      var aeModalCtrlRoot = aeFindOpenSkuModal();
      var aeBtnRoots = aeModalCtrlRoot ? [aeModalCtrlRoot, document] : [document];
      for (var abr = 0; abr < aeBtnRoots.length && !out.addToCartText; abr++) {
        var aeControls = aeBtnRoots[abr].querySelectorAll('[data-pl="product-action"] button, [class*="action--sticky" i] button, .product-action button, [class*="add-to-cart" i], [data-testid*="add-to-cart" i], button, [role="button"], input[type="submit"], input[type="button"]');
        for (var aeCtrl = 0; aeCtrl < aeControls.length && !out.addToCartText; aeCtrl++) {
          var aeBtn = aeControls[aeCtrl];
          if (isInNavigation(aeBtn) || aeBlocked(aeBtn) || aeNodeHidden(aeBtn)) continue;
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
      }
      if (!out.addToCartText && aeModalCtrlRoot) {
        var raxBtnNodes = aeModalCtrlRoot.querySelectorAll('div, span, a');
        for (var rbi = 0; rbi < raxBtnNodes.length && rbi < 300 && !out.addToCartText; rbi++) {
          var rbEl = raxBtnNodes[rbi];
          if (!rbEl || aeBlocked(rbEl) || aeNodeHidden(rbEl)) continue;
          if (rbEl.children && rbEl.children.length > 2) continue;
          var rbTxt = text(rbEl.textContent);
          if (rbTxt && rbTxt.length <= 64 && AE_MODAL_CTA_EXACT_RE.test(rbTxt) && !NOT_ADD_TEXT.test(rbTxt)) {
            out.addToCartText = cut(rbTxt, LIMITS.text);
          }
        }
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
    var controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]');
    for (var i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
      var control = controls[i2];
      var ctrlDialog = control;
      var ctrlDepth = 0;
      var skipPostAddCtrl = false;
      while (ctrlDialog && ctrlDialog.nodeType === 1 && ctrlDepth < 14) {
        var cRole = text(ctrlDialog.getAttribute && ctrlDialog.getAttribute('role')).toLowerCase();
        var cAria = text(ctrlDialog.getAttribute && ctrlDialog.getAttribute('aria-modal')).toLowerCase();
        var cTag = (ctrlDialog.tagName || '').toUpperCase();
        var cCls = ((typeof ctrlDialog.className === 'string' ? ctrlDialog.className : '') + ' ' + ((ctrlDialog.getAttribute && ctrlDialog.getAttribute('data-testid')) || '')).toLowerCase();
        if (cTag === 'DIALOG' || cRole === 'dialog' || cRole === 'alertdialog' || cAria === 'true'
          || /(?:minicart|mini-cart|cart-drawer|bag-drawer|added-to-bag|added-to-cart|add-to-bag-modal|atc-modal|post-add)/i.test(cCls)) {
          var cTxt = cut(text(ctrlDialog.textContent), 900);
          if (/(?:added\s+(?:to|for)\s+(?:bag|cart|basket|ship|pickup)|item\s+added\s+to\s+(?:bag|cart)|view\s+(?:bag|cart|basket)\b|ajout[eé]\s+au\s+panier|voir\s+(?:le\s+|mon\s+)?panier|تمت\s+إضافة|عرض\s+السلة)/i.test(cTxt)) {
            skipPostAddCtrl = true;
            break;
          }
        }
        ctrlDialog = ctrlDialog.parentElement;
        ctrlDepth++;
      }
      if (skipPostAddCtrl) continue;
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
  var BARE_DIMENSION_PLACEHOLDER = /^(?:taille|size|talla|taglia|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس|المقاس|قياس|couleur|colou?r|farbe|colore|لون|اللون)$/i;
  var UI_PLACEHOLDER_INLINE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس)|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;

  try {
    var selected = document.querySelectorAll('select option:checked, [role="option"][aria-selected="true"], [aria-checked="true"]');
    for (var v = 0; v < selected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; v++) {
      var option = selected[v];
      if (isInNavigation(option)) continue;
      if (String(option.tagName || '').toUpperCase() === 'OPTION' && option.disabled === true && text(option.getAttribute && option.getAttribute('value')) === '') continue;
      /* Une CARTE de variante (li aria-checked) contient son prix et son stock :
         son texte entier n'est pas un libellé. L'image porte le nom. */
      var optionImg = option.querySelector && option.querySelector('img[alt]');
      var optionText = text(option.getAttribute && option.getAttribute('title'))
        || text(option.getAttribute && option.getAttribute('aria-label'))
        || text(optionImg && optionImg.getAttribute('alt'))
        || text(option.textContent);
      if (!optionText || optionText.length > LIMITS.label) continue;
      if (NOT_A_CHOICE.test(optionText) || BARE_DIMENSION_PLACEHOLDER.test(optionText) || UI_PLACEHOLDER_INLINE.test(optionText) || ACTION_NOT_A_VALUE.test(optionText)) continue;
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
        var colorHosts = document.querySelectorAll('.product-intro__color, .goods-color, [class*="product-intro__color" i], [class*="goods-color" i], [class*="sku-color" i], [data-testid*="color-selector" i], [data-testid*="color-list" i]');
        var domSwatchesRaw = [];
        for (var chI = 0; chI < colorHosts.length && chI < 6; chI++) {
          if (sheinBlocked(colorHosts[chI]) || isInNavigation(colorHosts[chI])) continue;
          var swatches = colorHosts[chI].querySelectorAll('.product-intro__color-radio, .goods-color__radio, .goods-color-item, .goods-color__item, [class*="color-radio" i], [class*="color-item" i], [data-color-name], a[href*="-p-"], [role="radio"], li');
          for (var swI = 0; swI < swatches.length && swI < 30; swI++) {
            var sw = swatches[swI];
            if (sheinBlocked(sw) || isInNavigation(sw)) continue;
            var swImgEl = sw.querySelector ? sw.querySelector('img') : (String(sw.tagName || '').toUpperCase() === 'IMG' ? sw : null);
            var swLabel = text(sw.getAttribute && (sw.getAttribute('data-color-name') || sw.getAttribute('data-color') || sw.getAttribute('aria-label') || sw.getAttribute('title')))
              || text(swImgEl && swImgEl.getAttribute && (swImgEl.getAttribute('alt') || swImgEl.getAttribute('title')))
              || text(sw.textContent);
            if (!swLabel || swLabel.length > LIMITS.label) continue;
            var swImgUrl = extractElementImageUrl(sw);
            var swHref = text(sw.getAttribute && (sw.getAttribute('href') || sw.getAttribute('data-href')));
            if (!swHref && sw.querySelector) {
              var innerLink = sw.querySelector('a[href]');
              if (innerLink) swHref = text(innerLink.getAttribute('href'));
            }
            var swGid = text(sw.getAttribute && (sw.getAttribute('data-goods-id') || sw.getAttribute('data-goodsid')));
            if (swGid && !/^\d{5,16}$/.test(swGid)) swGid = '';
            if (!swGid && swHref) swGid = sheinExtractGoodsIdFromUrl(swHref);
            var swNodeSel = sheinNodeSelected(sw) || Boolean(swGid && SHEIN_GOODS_ID && swGid === SHEIN_GOODS_ID);
            if (!swGid && swNodeSel && SHEIN_GOODS_ID) swGid = SHEIN_GOODS_ID;
            /* Déduplication par goods_id dans le DOM (ex. <li> contenant <div role="radio">) */
            var swAlreadySeen = false;
            for (var dsr = 0; dsr < domSwatchesRaw.length; dsr++) {
              if (swGid && domSwatchesRaw[dsr].goodsId === swGid) {
                if (!domSwatchesRaw[dsr].image && swImgUrl) domSwatchesRaw[dsr].image = swImgUrl;
                if (swNodeSel) domSwatchesRaw[dsr].nodeSel = true;
                swAlreadySeen = true;
                break;
              }
              if (!swGid && !domSwatchesRaw[dsr].goodsId && domSwatchesRaw[dsr].baseLabel.toLowerCase() === swLabel.toLowerCase()) {
                if (!domSwatchesRaw[dsr].image && swImgUrl) domSwatchesRaw[dsr].image = swImgUrl;
                swAlreadySeen = true;
                break;
              }
            }
            if (swAlreadySeen) continue;
            domSwatchesRaw.push({
              baseLabel: swLabel,
              goodsId: swGid || null,
              image: swImgUrl || null,
              nodeSel: swNodeSel,
              disabled: sheinNodeDisabled(sw)
            });
          }
        }
        var domBaseCounts = {};
        for (var dbc = 0; dbc < domSwatchesRaw.length; dbc++) {
          var dbKey = domSwatchesRaw[dbc].baseLabel.toLowerCase();
          domBaseCounts[dbKey] = (domBaseCounts[dbKey] || 0) + 1;
        }
        for (var dsi = 0; dsi < domSwatchesRaw.length; dsi++) {
          var dSw = domSwatchesRaw[dsi];
          var dSwKey = dSw.baseLabel.toLowerCase();
          /* Si SHEIN_STATE a déjà nommé ce goodsId (y compris désambiguïsé « Jean Bleu · 4567 »), on reprend son libellé exact. */
          var resolvedSwLabel = '';
          if (dSw.goodsId) {
            for (var cko = 0; cko < sheinColorOrder.length; cko++) {
              var cKnown = sheinColorMap[sheinColorOrder[cko].toLowerCase()];
              if (cKnown && cKnown.goodsId === dSw.goodsId) { resolvedSwLabel = cKnown.value; break; }
            }
          }
          if (!resolvedSwLabel) {
            resolvedSwLabel = (domBaseCounts[dSwKey] > 1 && dSw.goodsId)
              ? cut(dSw.baseLabel + ' · ' + String(dSw.goodsId).slice(-4), LIMITS.label)
              : dSw.baseLabel;
          }
          var dSwSel = dSw.nodeSel
            || Boolean(!domBaseCounts[dSwKey] || domBaseCounts[dSwKey] === 1 ? (sheinHeaderColor && dSw.baseLabel.toLowerCase() === sheinHeaderColor.toLowerCase()) : false);
          addSheinColor(resolvedSwLabel, {
            selected: dSwSel,
            disabled: dSw.disabled,
            available: dSw.disabled ? false : null,
            image: dSw.image,
            goodsId: dSw.goodsId || (dSwSel && SHEIN_GOODS_ID ? SHEIN_GOODS_ID : null),
            price: null,
            priceFrom: false
          });
        }
      } catch (e) {}

      var sheinActiveColor = sheinHeaderColor || (SHEIN_STATE && SHEIN_STATE.currentColor) || '';
      for (var co = 0; co < sheinColorOrder.length; co++) {
        var cEntry = sheinColorMap[sheinColorOrder[co].toLowerCase()];
        if (cEntry.selected && (!sheinHeaderColor || cEntry.value.toLowerCase() === sheinHeaderColor.toLowerCase() || cEntry.value.toLowerCase().indexOf(sheinHeaderColor.toLowerCase() + ' · ') === 0)) { sheinActiveColor = cEntry.value; break; }
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
      var sheinExtraGroupsList = (SHEIN_STATE && SHEIN_STATE.extraGroups) || [];
      var hasExtraGroups = false;
      for (var egc = 0; egc < sheinExtraGroupsList.length; egc++) {
        if (sheinExtraGroupsList[egc] && sheinExtraGroupsList[egc].values && sheinExtraGroupsList[egc].values.length >= 2) {
          hasExtraGroups = true;
          break;
        }
      }
      var addSheinSize = function (val, info) {
        var cleanSize = cut(val, LIMITS.label);
        if (!cleanSize || SHEIN_SIZE_GUIDE_NOISE.test(cleanSize) || SHEIN_GROUPED_RANGE_TRIGGER.test(cleanSize) || NOT_A_CHOICE.test(cleanSize) || ACTION_NOT_A_VALUE.test(cleanSize)) return;
        var sk = cleanSize.toLowerCase();
        var matchedKey = sheinSizeMap[sk] ? sk : '';
        if (!matchedKey) {
          /* Relie « 4Y » (pastille DOM abrégée) et « 4Y (98-104 cm) » (état ou en-tête) sans créer de doublon. */
          var candBase = sheinBaseSizeKey(cleanSize);
          if (candBase) {
            for (var eso = 0; eso < sheinSizeOrder.length; eso++) {
              var existLabel = sheinSizeOrder[eso];
              if (sheinBaseSizeKey(existLabel) === candBase && (existLabel.toLowerCase() === candBase || cleanSize.toLowerCase() === candBase)) {
                matchedKey = existLabel.toLowerCase();
                /* Préserve le libellé le plus informatif (ex. « 4Y (98-104 cm) » plutôt que « 4Y »). */
                if (cleanSize.length > existLabel.length) {
                  var upgradedEntry = sheinSizeMap[matchedKey];
                  delete sheinSizeMap[matchedKey];
                  upgradedEntry.value = cleanSize;
                  matchedKey = sk;
                  sheinSizeMap[matchedKey] = upgradedEntry;
                  sheinSizeOrder[eso] = cleanSize;
                }
                break;
              }
            }
          }
        }
        if (!matchedKey) {
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
          var sx = sheinSizeMap[matchedKey];
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

      var domHeaderFullSize = sheinReadDomSelectedSize();
      try {
        var sizeHosts = document.querySelectorAll('.product-intro__size, .goods-size, [class*="product-intro__size" i], [class*="goods-size" i], [class*="sku-size" i], [data-testid*="size-selector" i], [data-testid*="size-list" i]');
        for (var shI = 0; shI < sizeHosts.length && shI < 6; shI++) {
          if (sheinBlocked(sizeHosts[shI]) || isInNavigation(sizeHosts[shI])) continue;
          var sizePills = sizeHosts[shI].querySelectorAll('.product-intro__size-radio, .goods-size__radio, .goods-size__item, [class*="size-radio" i], [class*="size-item" i], [class*="dropdown-item" i], [data-size], [role="radio"], [role="option"], option, li');
          for (var spI = 0; spI < sizePills.length && spI < 40; spI++) {
            var sp = sizePills[spI];
            if (sheinBlocked(sp) || isInNavigation(sp)) continue;
            /* Ignore un <li> parent qui enveloppe lui-même plusieurs pastilles enfants */
            if (String(sp.tagName || '').toUpperCase() === 'LI' && sp.querySelector && sp.querySelectorAll('[role="radio"], .goods-size__item, .product-intro__size-radio').length > 1) continue;
            var cleaned = sheinCleanSizeLabel(sp);
            if (!cleaned.label) continue;
            var spSel = sheinNodeSelected(sp) || (String(sp.tagName || '').toUpperCase() === 'OPTION' && Boolean(sp.selected));
            var spDis = sheinNodeDisabled(sp);
            var effectiveSizeLabel = (spSel && domHeaderFullSize && sheinBaseSizeKey(domHeaderFullSize) === sheinBaseSizeKey(cleaned.label) && domHeaderFullSize.length > cleaned.label.length)
              ? domHeaderFullSize
              : cleaned.label;
            /* RÈGLE STRICTE : le prix affiché sur la page ne prouve QUE la taille activement
               sélectionnée (spSel === true) — jamais les autres tailles non sélectionnées ! */
            var pillProvenPrice = spDis
              ? null
              : (cleaned.price || (spSel && !hasExtraGroups && sheinPageAvail && sheinSinglePagePrice ? sheinSinglePagePrice : null));
            addSheinSize(effectiveSizeLabel, {
              selected: spSel,
              disabled: spDis,
              available: spDis ? false : (sheinPageSoldOut ? false : (sheinPageAvail ? true : null)),
              stock: spDis ? null : cleaned.stock,
              price: pillProvenPrice,
              fromDom: true
            });
          }
        }
      } catch (e) {}

      /* A live header is preferred to stale embedded or responsive selections. */
      if (domHeaderFullSize) {
        for (var shs = 0; shs < sheinSizeOrder.length; shs++) {
          var headerSizeEntry = sheinSizeMap[sheinSizeOrder[shs].toLowerCase()];
          headerSizeEntry.selected = sheinBaseSizeKey(headerSizeEntry.value) === sheinBaseSizeKey(domHeaderFullSize);
        }
      }
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
          var isCurrentColor = sheinActiveColor && cObj.value.toLowerCase() === sheinActiveColor.toLowerCase();
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
        for (var szPub = 0; szPub < sheinSizeOrder.length; szPub++) {
          var szObj = sheinSizeMap[sheinSizeOrder[szPub].toLowerCase()];
          szValues.push(szObj.value);
          if (szObj.selected && !szChosen.length) szChosen.push(szObj.value);
          var szAvail = szObj.disabled || szObj.available === false
            ? false
            : (sheinPageSoldOut ? false : szObj.available);
          /* Jamais d'héritage aveugle du prix de page sur les tailles non sélectionnées :
             seules les tailles portant un prix SKU prouvé (SHEIN_STATE / cache réseau / data-price)
             ou la taille activement sélectionnée sur la page reçoivent un prix. */
          var szPrice = szAvail === false
            ? null
            : (szObj.price || (szObj.selected && !hasExtraGroups && szAvail === true && sheinSinglePagePrice ? sheinSinglePagePrice : null));
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

      /* 2. Pastilles DOM (sélection active en direct, états désactivés, vignettes — modale SKU ouverte prioritaire) */
      try {
        var aeVarModal = aeFindOpenSkuModal();
        var aeVarRoots = aeVarModal ? [aeVarModal, document] : [document];
        var seenDomDim = {};
        for (var avr = 0; avr < aeVarRoots.length; avr++) {
          var domProps = aeCollectPropRows(aeVarRoots[avr]);
          for (var dp = 0; dp < domProps.length && dp < 10; dp++) {
            var dCont = domProps[dp];
            if (/title|label/i.test(String(dCont.className || ''))) continue;
            if (aeBlocked(dCont) || isInNavigation(dCont)) continue;
            var dHead = aeExtractPropHeader(dCont);
            var dName = dHead.name;
            var dHeaderVal = dHead.headerVal;
            if (!dName) continue;
            var dDimK = aeDimKey(dName);
            if (avr > 0 && seenDomDim[dDimK]) continue;
            seenDomDim[dDimK] = true;
            var gFromDom = findOrCreateAeGroup(dName);
            if (!gFromDom) continue;
            /* Si le DOM affiche le nom dans la langue du client (« Couleur »), il devient le libellé affiché */
            gFromDom.name = cut(dName, LIMITS.label);
            var dPills = dCont.querySelectorAll('[data-sku-col], [class*="sku-item--box" i], [class*="sku-item--image" i], [class*="sku-item--text" i], .sku-property-item, [class*="msku" i] [class*="item" i], [role="radio"]');
            var activePillImgUrl = '';
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
              if (dSel && dImgUrl && !activePillImgUrl) activePillImgUrl = dImgUrl;
              var dVal = cut(
                (dPill.getAttribute && (dPill.getAttribute('title') || dPill.getAttribute('aria-label')))
                || (dImgEl && (dImgEl.getAttribute('alt') || dImgEl.getAttribute('title')))
                || dPill.textContent,
                LIMITS.label
              );
              if (!dVal) continue;
              upsertAeValue(gFromDom, dVal, { selected: dSel, disabled: dDis, image: dImgUrl || null });
            }
            if (!gFromDom.selected && dHeaderVal && !AE_GUIDE_NOISE.test(dHeaderVal)) {
              if (gFromDom.valuesMap[dHeaderVal.toLowerCase()]) {
                gFromDom.selected = gFromDom.valuesMap[dHeaderVal.toLowerCase()].value;
                gFromDom.valuesMap[dHeaderVal.toLowerCase()].selected = true;
              } else {
                upsertAeValue(gFromDom, dHeaderVal, { selected: true, disabled: false, image: activePillImgUrl || null });
              }
              if (gFromDom.valuesOrder.length < 2) {
                pushUnique(out.selectedVariantTexts, cut(dName + ' : ' + dHeaderVal, LIMITS.label), LIMITS.selectedTexts, LIMITS.label);
              }
            }
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

      /* Modale H5 CSR sans runParams : si toutes les dimensions multi-choix ont une valeur
         sélectionnée dans le DOM et que le bouton d'ajout est actif, on publie la combinaison
         exacte affichée avec son prix vérifié. */
      var allMultiChosen = multiGroups.length > 0;
      for (var amc = 0; amc < multiGroups.length; amc++) {
        if (!multiGroups[amc].selected) { allMultiChosen = false; break; }
      }
      if (!normalizedSkus.length && allMultiChosen && out.addToCartText && !aePageSoldOut) {
        var domComboAttrs = {};
        var domComboImg = null;
        for (var dca = 0; dca < multiGroups.length; dca++) {
          var mgEntry = multiGroups[dca];
          domComboAttrs[mgEntry.name] = mgEntry.selected;
          var selMeta = mgEntry.valuesMap[mgEntry.selected.toLowerCase()];
          if (!domComboImg && selMeta && selMeta.image) domComboImg = selMeta.image;
        }
        var domComboPrice = out.priceCandidates.length > 0 ? out.priceCandidates[0].text : null;
        var synthSku = {
          skuId: ALIEXPRESS_URL_SKU_ID || null,
          attributes: domComboAttrs,
          price: domComboPrice,
          available: true,
          stock: null,
          image: domComboImg
        };
        normalizedSkus.push(synthSku);
        selectedSkuObj = synthSku;
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
            } else if (valAvail === null && !skusForVal.length && (multiGroups.length === 1 || allMultiChosen) && pvMeta.selected && out.addToCartText) {
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

  /* ── 7 septies. VARIANTES ET MATRICE SKU TEMU v2 (29/10/2026) ───────────── */
  if (IS_TEMU) {
    try {
      temuEnsureState();
      var temuDomGroups = temuReadDomSelectionMap();
      var temuGroups = [];
      var findOrCreateTemuGroup = function (rawName) {
        var cleanN = cut(rawName, LIMITS.label);
        if (!cleanN || NOT_A_VARIANT_GROUP.test(cleanN)) return null;
        var dk = aeDimKey(cleanN);
        for (var tgi2 = 0; tgi2 < temuGroups.length; tgi2++) {
          if (aeDimKey(temuGroups[tgi2].name) === dk) return temuGroups[tgi2];
        }
        if (temuGroups.length >= LIMITS.variantGroups) return null;
        var nGrp = { name: cleanN, valuesOrder: [], valuesMap: {}, selected: '' };
        temuGroups.push(nGrp);
        return nGrp;
      };
      var upsertTemuValue = function (grp, rawVal, info) {
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

      if (TEMU_STATE && TEMU_STATE.properties) {
        for (var tp = 0; tp < TEMU_STATE.properties.length; tp++) {
          var tProp = TEMU_STATE.properties[tp];
          var tgState = findOrCreateTemuGroup(tProp.name);
          if (!tgState) continue;
          for (var tpv = 0; tpv < tProp.values.length; tpv++) {
            var tpVal = tProp.values[tpv];
            upsertTemuValue(tgState, tpVal, {
              selected: false,
              disabled: false,
              image: (tProp.images && tProp.images[tpVal.toLowerCase()]) || null
            });
          }
        }
      }
      for (var tdk in temuDomGroups) {
        if (!Object.prototype.hasOwnProperty.call(temuDomGroups, tdk)) continue;
        var tdEntry = temuDomGroups[tdk];
        var tgDom = findOrCreateTemuGroup(tdEntry.name);
        if (!tgDom) continue;
        tgDom.name = cut(tdEntry.name, LIMITS.label);
        if (tdEntry.items) {
          for (var tdi = 0; tdi < tdEntry.items.length; tdi++) {
            upsertTemuValue(tgDom, tdEntry.items[tdi].value, tdEntry.items[tdi]);
          }
        }
        if (!tgDom.selected && tdEntry.value) {
          upsertTemuValue(tgDom, tdEntry.value, { selected: true, disabled: false, image: null });
        }
      }

      var temuMulti = [];
      for (var tmg = 0; tmg < temuGroups.length; tmg++) {
        if (temuGroups[tmg].valuesOrder.length >= 2) {
          temuMulti.push(temuGroups[tmg]);
        } else if (temuGroups[tmg].valuesOrder.length === 1) {
          pushUnique(out.selectedVariantTexts, temuGroups[tmg].valuesOrder[0], LIMITS.selectedTexts, LIMITS.label);
        } else if (temuGroups[tmg].selected) {
          pushUnique(out.selectedVariantTexts, cut(temuGroups[tmg].name + ' : ' + temuGroups[tmg].selected, LIMITS.label), LIMITS.selectedTexts, LIMITS.label);
        }
      }

      var temuNormSkus = [];
      if (TEMU_STATE && TEMU_STATE.skus && TEMU_STATE.skus.length && temuMulti.length > 0) {
        for (var tns = 0; tns < TEMU_STATE.skus.length && temuNormSkus.length < 80; tns++) {
          var trSku = TEMU_STATE.skus[tns];
          var tAligned = {};
          var tCount = 0;
          for (var tmg2 = 0; tmg2 < temuMulti.length; tmg2++) {
            var tGrp = temuMulti[tmg2];
            var wantDk = aeDimKey(tGrp.name);
            var mVal = '';
            for (var trk in trSku.attributes) {
              if (!Object.prototype.hasOwnProperty.call(trSku.attributes, trk)) continue;
              if (aeDimKey(trk) === wantDk) {
                var cKey = String(trSku.attributes[trk] || '').toLowerCase();
                mVal = tGrp.valuesMap[cKey] ? tGrp.valuesMap[cKey].value : cut(trSku.attributes[trk], LIMITS.label);
                break;
              }
            }
            if (mVal) { tAligned[tGrp.name] = mVal; tCount++; }
          }
          if (tCount === temuMulti.length) {
            var tNorm = {
              variantId: trSku.skuId ? ('temu:' + trSku.skuId) : null,
              attributes: tAligned,
              price: trSku.available === false ? null : (trSku.price || null),
              priceFrom: false,
              available: trSku.available,
              stock: trSku.available === false ? null : trSku.stock,
              image: trSku.image || null,
              evidenceSource: 'embedded_json'
            };
            temuNormSkus.push(tNorm);
            if (out.variantMatrix.length < 120) out.variantMatrix.push(tNorm);
          }
        }
      }

      if (temuMulti.length > 0) {
        out.variantGroups = [];
        var allTemuChosen = true;
        for (var atc = 0; atc < temuMulti.length; atc++) {
          if (!temuMulti[atc].selected) { allTemuChosen = false; break; }
        }
        for (var tpgIdx = 0; tpgIdx < temuMulti.length; tpgIdx++) {
          var tpg = temuMulti[tpgIdx];
          var tpgValues = [];
          var tpgChosen = tpg.selected ? [tpg.selected] : [];
          var tpgOptions = [];
          for (var tpv2 = 0; tpv2 < tpg.valuesOrder.length; tpv2++) {
            var tvName = tpg.valuesOrder[tpv2];
            tpgValues.push(tvName);
            var tvMeta = tpg.valuesMap[tvName.toLowerCase()];
            var matchingTSkus = [];
            for (var mts = 0; mts < temuNormSkus.length; mts++) {
              if (String(temuNormSkus[mts].attributes[tpg.name] || '').toLowerCase() === tvName.toLowerCase()) {
                matchingTSkus.push(temuNormSkus[mts]);
              }
            }
            var tvAvail = tvMeta.disabled ? false : null;
            var tvPrice = null;
            var tvPriceFrom = false;
            var tvStock = null;
            if (tvAvail !== false && matchingTSkus.length > 0) {
              var anyTIn = false;
              var allTOut = true;
              var minTP = null;
              var minTPText = null;
              var maxTP = null;
              for (var tsk = 0; tsk < matchingTSkus.length; tsk++) {
                var tcSku = matchingTSkus[tsk];
                if (tcSku.available !== false) {
                  anyTIn = true;
                  allTOut = false;
                  var numTP = tcSku.price ? sheinNumericAmount(tcSku.price) : null;
                  if (numTP !== null) {
                    if (minTP === null || numTP < minTP) { minTP = numTP; minTPText = tcSku.price; }
                    if (maxTP === null || numTP > maxTP) { maxTP = numTP; }
                  }
                }
              }
              if (allTOut) tvAvail = false;
              else if (anyTIn) {
                tvAvail = true;
                if (temuMulti.length === 1 && matchingTSkus.length === 1) tvStock = matchingTSkus[0].stock;
              }
              if (tvAvail !== false && minTPText) {
                tvPrice = minTPText;
                tvPriceFrom = (maxTP !== null && minTP !== null && Math.abs(maxTP - minTP) >= 0.005);
              }
            } else if (tvAvail === null && !matchingTSkus.length && (temuMulti.length === 1 || allTemuChosen) && tvMeta.selected && out.addToCartText) {
              tvAvail = true;
            }
            tpgOptions.push({
              value: tvName,
              available: tvAvail,
              price: tvAvail === false ? null : tvPrice,
              priceFrom: tvAvail === false ? false : tvPriceFrom,
              stock: tvAvail === false ? null : tvStock,
              image: tvMeta.image || null
            });
            pushUnique(out.variantTexts, tvName, LIMITS.variantTexts, LIMITS.label);
          }
          pushVariantGroup(tpg.name, tpgValues, tpgChosen, tpgOptions);
        }
        if (!temuNormSkus.length && allTemuChosen && out.addToCartText && out.priceCandidates.length > 0) {
          var tComboAttrs = {};
          for (var tca = 0; tca < temuMulti.length; tca++) {
            tComboAttrs[temuMulti[tca].name] = temuMulti[tca].selected;
          }
          out.variantMatrix.push({
            variantId: null,
            attributes: tComboAttrs,
            price: out.priceCandidates[0].text,
            priceFrom: false,
            available: true,
            stock: null,
            image: null,
            evidenceSource: 'dom'
          });
        }
      }

      out.temu = {
        readerVersion: 2,
        pageGoodsId: (TEMU_STATE && TEMU_STATE.goodsId) || TEMU_GOODS_ID || null,
        salePrice: (TEMU_STATE && TEMU_STATE.salePrice) || null,
        retailPrice: (TEMU_STATE && TEMU_STATE.retailPrice) || null
      };
    } catch (e) {}
  }

  if (!IS_AMAZON && !(IS_TEMU && out.variantGroups.length > 0) && !(IS_ALIEXPRESS && out.variantGroups.length > 0)) {
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
          if (!optLabel || optLabel.length > LIMITS.label || NOT_A_CHOICE.test(optLabel) || BARE_DIMENSION_PLACEHOLDER.test(optLabel) || UI_NOT_A_VALUE.test(optLabel)) continue;
          if (ACTION_NOT_A_VALUE.test(optLabel)) continue;
          if (!selectIsSize && isIndexValue(optLabel)) continue;
          if (ciExactContains(values, optLabel)) continue;
          var optRawVal = text(opt.getAttribute && opt.getAttribute('value'));
          var isPlaceholderOpt = opt.disabled === true && optRawVal === '';
          if (isPlaceholderOpt) continue;
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
  /* Amazon (desktop + mobile m.amazon.* / /gp/aw/d/) : le titre VISIBLE de la fiche est lu en premier. */
  if (IS_AMAZON) {
    try {
      var amazonTitleEl = document.querySelector('#productTitle, h1#title, #title_feature_div h1, [data-hook="product-title"]');
      var amazonTitle = amazonTitleEl ? cut(amazonTitleEl.textContent, LIMITS.text) : '';
      if (amazonTitle) out.title = amazonTitle;
    } catch (e) {}
  }
  if (IS_SHEIN) {
    try {
      sheinEnsureState();
      if (out.title && SHEIN_GENERIC_TITLE.test(out.title)) out.title = null;
      var sheinTitleEl = document.querySelector(
        '.product-intro__head-name, .goods-title-h1, .goods-name, [class*="goods-name__text" i], '
        + '[class*="detail-title" i] h1, [data-testid="product-title"], .goods-detail h1'
      );
      var sheinDomTitle = (sheinTitleEl && !sheinBlocked(sheinTitleEl)) ? cut(sheinTitleEl.textContent, LIMITS.text) : '';
      if (sheinDomTitle && !SHEIN_GENERIC_TITLE.test(sheinDomTitle)) out.title = sheinDomTitle;
      else if (SHEIN_STATE && SHEIN_STATE.title && !SHEIN_GENERIC_TITLE.test(SHEIN_STATE.title)) out.title = cut(SHEIN_STATE.title, LIMITS.text);
      if (!out.brand) {
        var sheinBrandEl = document.querySelector('.product-intro__brand-name, .goods-brand__name, [class*="brand-name" i], [data-testid="product-brand"]');
        var sheinDomBrand = (sheinBrandEl && !sheinBlocked(sheinBrandEl)) ? cut(sheinBrandEl.textContent, LIMITS.label) : '';
        if (sheinDomBrand) out.brand = sheinDomBrand;
        else if (SHEIN_STATE && SHEIN_STATE.brand) out.brand = cut(SHEIN_STATE.brand, LIMITS.label);
      }
      var sheinRealImages = [];
      if (SHEIN_STATE && SHEIN_STATE.images && SHEIN_STATE.images.length) {
        for (var shi = 0; shi < SHEIN_STATE.images.length && sheinRealImages.length < LIMITS.images; shi++) {
          if (sheinIsProductGalleryImg(null, SHEIN_STATE.images[shi])) {
            pushUnique(sheinRealImages, SHEIN_STATE.images[shi], LIMITS.images, 600);
          }
        }
      }
      var sheinGallerySelectors = [
        '.product-intro__main-img img',
        '.goods-gallery img',
        '.goods-img-swiper img',
        '[class*="goods-detail" i] img',
        '[class*="goods-banner" i] img',
        '[class*="goods-img" i] img',
        '[class*="main-picture" i] img',
        '[class*="product-image" i] img',
        '.product-intro__thumbs img',
        'img[src*="/images3_pi/"]',
        'img[data-src*="/images3_pi/"]',
        'img[data-before-crop-src*="/images3_pi/"]',
        'img[data-lazy*="/images3_pi/"]',
        'img[src*="/images3_spmp/"]',
        'img[data-src*="/images3_spmp/"]',
        'img[data-before-crop-src*="/images3_spmp/"]',
        'img[src*="ltwebstatic.com"]',
        'img[data-src*="ltwebstatic.com"]',
        'img[data-before-crop-src*="ltwebstatic.com"]',
        'img[data-lazy*="ltwebstatic.com"]'
      ];
      for (var sgs = 0; sgs < sheinGallerySelectors.length && sheinRealImages.length < LIMITS.images; sgs++) {
        var sgNodes = [];
        try { sgNodes = document.querySelectorAll(sheinGallerySelectors[sgs]); } catch (e) { continue; }
        for (var sgn = 0; sgn < sgNodes.length && sheinRealImages.length < LIMITS.images; sgn++) {
          if (sheinBlocked(sgNodes[sgn]) || isInNavigation(sgNodes[sgn])) continue;
          var sgUrl = extractElementImageUrl(sgNodes[sgn]);
          if (sgUrl && sheinIsProductGalleryImg(sgNodes[sgn], sgUrl)) {
            pushUnique(sheinRealImages, sgUrl, LIMITS.images, 600);
          }
        }
      }
      /* Purger tout badge (images3_acp/, images3_ccc/, icône camion) déjà lu dans og:image ou JSON-LD */
      var filteredExistingSheinImgs = [];
      for (var eoi = 0; eoi < out.images.length; eoi++) {
        if (sheinIsProductGalleryImg(null, out.images[eoi])) {
          pushUnique(filteredExistingSheinImgs, out.images[eoi], LIMITS.images, 600);
        }
      }
      if (sheinRealImages.length) {
        for (var fei = 0; fei < filteredExistingSheinImgs.length && sheinRealImages.length < LIMITS.images; fei++) {
          pushUnique(sheinRealImages, filteredExistingSheinImgs[fei], LIMITS.images, 600);
        }
        out.images = sheinRealImages;
      } else {
        out.images = filteredExistingSheinImgs;
      }
    } catch (e) {}
  }
  if (IS_ALIEXPRESS) {
    try {
      aeEnsureState();
      var AE_GENERIC_TITLE = /^(?:aliexpress(?:\s*[-|·:].*)?|bundle\s*deals?(?:\s*[-|·:].*)?|offres?\s*group[ée]es?(?:\s*[-|·:].*)?|choice(?:\s*[-|·:].*)?|super\s*deals?(?:\s*[-|·:].*)?)$/i;
      if (out.title && AE_GENERIC_TITLE.test(out.title)) out.title = null;
      var aeModalHero = aeFindOpenSkuModal();
      var aeTitleEl = null;
      if (aeModalHero) {
        aeTitleEl = aeModalHero.querySelector('[class*="title--wrap" i], [class*="pdp-title" i], [class*="product-title" i], [class*="goods-title" i], [class*="item-title" i], a[href*="/item/"]');
      }
      if (!aeTitleEl && !aeModalHero) {
        aeTitleEl = document.querySelector(
          '[data-pl="product-title"], h1[data-pl="product-title"], .product-title-text, '
          + '[class*="title--wrap" i] h1, [class*="title--wrap" i], [class*="pdp-title" i], '
          + '[class*="product-title" i], [class*="goods-title" i], [class*="item-title" i], h1'
        );
      }
      var aeDomTitle = (aeTitleEl && !aeBlocked(aeTitleEl)) ? cut(aeTitleEl.textContent, LIMITS.text) : '';
      if (aeDomTitle && !AE_GENERIC_TITLE.test(aeDomTitle)) out.title = aeDomTitle;
      else if (ALIEXPRESS_STATE && ALIEXPRESS_STATE.title && !AE_GENERIC_TITLE.test(ALIEXPRESS_STATE.title)) out.title = cut(ALIEXPRESS_STATE.title, LIMITS.text);
      if (!out.brand && ALIEXPRESS_STATE && ALIEXPRESS_STATE.brand) {
        out.brand = cut(ALIEXPRESS_STATE.brand, LIMITS.label);
      }
      var aeRealImages = [];
      var aeModalAltTitle = '';
      if (aeModalHero) {
        var modalImgs = aeModalHero.querySelectorAll('img[src*="alicdn.com"], img[data-src*="alicdn.com"], img');
        for (var ami = 0; ami < modalImgs.length && aeRealImages.length < LIMITS.images; ami++) {
          var amUrl = aeCleanImageUrl(extractElementImageUrl(modalImgs[ami]));
          if (amUrl) pushUnique(aeRealImages, amUrl, LIMITS.images, 600);
          if (!aeModalAltTitle) {
            var rawAlt = cut(modalImgs[ami].getAttribute('alt') || '', LIMITS.text);
            if (rawAlt && rawAlt.length >= 8 && !/^https?:/i.test(rawAlt) && !AE_GENERIC_TITLE.test(rawAlt)) {
              aeModalAltTitle = rawAlt;
            }
          }
        }
      }
      if (!out.title && aeModalHero) {
        if (aeModalAltTitle) {
          out.title = aeModalAltTitle;
        } else if (Boolean(out.addToCartText) || (out.variantGroups && out.variantGroups.length > 0)) {
          var aeVarSummary = [];
          for (var avgi = 0; out.variantGroups && avgi < out.variantGroups.length && aeVarSummary.length < 3; avgi++) {
            var avg = out.variantGroups[avgi];
            if (avg && avg.selectedValue) aeVarSummary.push(avg.selectedValue);
          }
          out.title = aeVarSummary.length > 0
            ? cut('AliExpress · ' + aeVarSummary.join(' · '), LIMITS.text)
            : (ALIEXPRESS_ITEM_ID ? ('AliExpress #' + ALIEXPRESS_ITEM_ID) : 'Article AliExpress');
        }
      }
      if (ALIEXPRESS_STATE && ALIEXPRESS_STATE.images && ALIEXPRESS_STATE.images.length) {
        for (var aei = 0; aei < ALIEXPRESS_STATE.images.length && aeRealImages.length < LIMITS.images; aei++) {
          pushUnique(aeRealImages, ALIEXPRESS_STATE.images[aei], LIMITS.images, 600);
        }
      }
      var aeGallerySelectors = [
        '[class*="image-view" i] img',
        '.images-view-item img',
        '[class*="slider--img" i] img',
        '[class*="pdp-mobile" i] img',
        'img[src*="alicdn.com/kf/"]',
        'img[data-src*="alicdn.com/kf/"]',
        'img[src*="ae01.alicdn.com"]'
      ];
      for (var ags = 0; ags < aeGallerySelectors.length && aeRealImages.length < LIMITS.images; ags++) {
        var agNodes = [];
        try { agNodes = document.querySelectorAll(aeGallerySelectors[ags]); } catch (e) { continue; }
        for (var agn = 0; agn < agNodes.length && aeRealImages.length < LIMITS.images; agn++) {
          if (aeBlocked(agNodes[agn])) continue;
          var agUrl = aeCleanImageUrl(extractElementImageUrl(agNodes[agn]));
          if (agUrl) pushUnique(aeRealImages, agUrl, LIMITS.images, 600);
        }
      }
      if (aeRealImages.length) {
        for (var aex = 0; aex < out.images.length && aeRealImages.length < LIMITS.images; aex++) {
          pushUnique(aeRealImages, out.images[aex], LIMITS.images, 600);
        }
        out.images = aeRealImages;
      }
    } catch (e) {}
  }
  if (IS_TEMU) {
    try {
      temuEnsureState();
      var temuTitleEl = document.querySelector('[data-testid="product-title"], [class*="goods-title" i], [class*="goodsName" i], h1');
      var temuDomTitle = (temuTitleEl && !isInNavigation(temuTitleEl)) ? cut(temuTitleEl.textContent, LIMITS.text) : '';
      if (temuDomTitle) out.title = temuDomTitle;
      else if (TEMU_STATE && TEMU_STATE.title) out.title = cut(TEMU_STATE.title, LIMITS.text);
      var temuRealImages = [];
      if (TEMU_STATE && TEMU_STATE.images && TEMU_STATE.images.length) {
        for (var tsi = 0; tsi < TEMU_STATE.images.length && temuRealImages.length < LIMITS.images; tsi++) {
          pushUnique(temuRealImages, TEMU_STATE.images[tsi], LIMITS.images, 600);
        }
      }
      var temuGalNodes = document.querySelectorAll('[data-testid*="gallery" i] img, [class*="goods-gallery" i] img, img[src*="kwcdn.com"], img[data-src*="kwcdn.com"]');
      for (var tgi = 0; tgi < temuGalNodes.length && temuRealImages.length < LIMITS.images; tgi++) {
        if (isInNavigation(temuGalNodes[tgi])) continue;
        var tgUrl = extractElementImageUrl(temuGalNodes[tgi]);
        if (tgUrl) pushUnique(temuRealImages, tgUrl, LIMITS.images, 600);
      }
      if (temuRealImages.length) {
        for (var tex = 0; tex < out.images.length && temuRealImages.length < LIMITS.images; tex++) {
          pushUnique(temuRealImages, out.images[tex], LIMITS.images, 600);
        }
        out.images = temuRealImages;
      }
    } catch (e) {}
  }
  if (!out.title) {
    try {
      var docTitle = cut(document.title, LIMITS.text);
      if (docTitle
        && !(IS_SHEIN && SHEIN_GENERIC_TITLE.test(docTitle))
        && !(IS_ALIEXPRESS && /^(?:aliexpress(?:\s*[-|·:].*)?|bundle\s*deals?(?:\s*[-|·:].*)?|offres?\s*group[ée]es?(?:\s*[-|·:].*)?|choice(?:\s*[-|·:].*)?|super\s*deals?(?:\s*[-|·:].*)?)$/i.test(docTitle))
      ) {
        out.title = docTitle;
      }
      if (!out.title && IS_ALIEXPRESS && ALIEXPRESS_ITEM_ID) out.title = 'AliExpress #' + ALIEXPRESS_ITEM_ID;
    } catch (e) {}
  }
  var AMAZON_BANNER_IMAGE = /\/images\/G\/|nav-sprite|transparent-pixel|grey-pixel|amazon[-_]?logo|prime[-_]?logo|play-button-overlay/i;
  if (AMAZON_STRICT) {
    /* Images PRODUIT d'abord (avant og:image qui porte parfois une bannière rayon
       comme « WOMEN'S CLOTHING » sous /images/G/01/). */
    try {
      var amazonRealImages = [];
      var gallerySelectors = ['#landingImage', '[data-a-image-name="landingImage"]', '#main-image-container img', '#mobile-image-block img', '#immersive-main img', '#imgTagWrapperId img', '#imageBlock img', '#altImages img'];
      for (var gs = 0; gs < gallerySelectors.length && amazonRealImages.length < LIMITS.images; gs++) {
        var galleryNodes = [];
        try { galleryNodes = document.querySelectorAll(gallerySelectors[gs]); } catch (e) { continue; }
        for (var gn = 0; gn < galleryNodes.length && amazonRealImages.length < LIMITS.images; gn++) {
          var galleryImage = galleryNodes[gn];
          var hires = galleryImage.getAttribute && galleryImage.getAttribute('data-old-hires');
          var src = hires || (galleryImage.getAttribute && galleryImage.getAttribute('src'));
          if (src && /^https?:\/\//i.test(String(src)) && !AMAZON_BANNER_IMAGE.test(String(src))) {
            pushUnique(amazonRealImages, src, LIMITS.images, 600);
          }
        }
      }
      var dynamicNodes = [];
      try { dynamicNodes = document.querySelectorAll('[data-a-dynamic-image]'); } catch (e) {}
      for (var dn = 0; dn < dynamicNodes.length && amazonRealImages.length < LIMITS.images; dn++) {
        var dynamicRaw = dynamicNodes[dn].getAttribute && dynamicNodes[dn].getAttribute('data-a-dynamic-image');
        if (!dynamicRaw) continue;
        var dynamicMap = null;
        try { dynamicMap = JSON.parse(dynamicRaw); } catch (e) { continue; }
        for (var dynamicKey in dynamicMap) {
          if (!Object.prototype.hasOwnProperty.call(dynamicMap, dynamicKey)) continue;
          if (/^https?:\/\//i.test(dynamicKey) && !AMAZON_BANNER_IMAGE.test(dynamicKey)) {
            pushUnique(amazonRealImages, dynamicKey, LIMITS.images, 600);
          }
          if (amazonRealImages.length >= LIMITS.images) break;
        }
      }
      var filteredAmazonExisting = [];
      for (var fae = 0; fae < out.images.length; fae++) {
        if (!AMAZON_BANNER_IMAGE.test(String(out.images[fae] || ''))) {
          pushUnique(filteredAmazonExisting, out.images[fae], LIMITS.images, 600);
        }
      }
      if (amazonRealImages.length) {
        for (var fam = 0; fam < filteredAmazonExisting.length && amazonRealImages.length < LIMITS.images; fam++) {
          pushUnique(amazonRealImages, filteredAmazonExisting[fam], LIMITS.images, 600);
        }
        out.images = amazonRealImages;
      } else {
        out.images = filteredAmazonExisting;
      }
    } catch (e) {}
  }
  try {
    var images = document.querySelectorAll('img[src^="http"]');
    for (var g = 0; g < images.length && out.images.length < LIMITS.images; g++) {
      var width = parseInt(images[g].getAttribute('width') || '0', 10);
      if (width && width < 200) continue;
      if (IS_SHEIN && !sheinIsProductGalleryImg(images[g], images[g].getAttribute('src'))) continue;
      if (AMAZON_STRICT && AMAZON_BANNER_IMAGE.test(String(images[g].getAttribute('src') || ''))) continue;
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
    try { matrixPageHost = String((location && location.hostname) || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, ''); } catch (e) { matrixPageHost = ''; }
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
            var zThumb = extractElementImageUrl(zEl);
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
          /* Préserve l'origine active du WebView (ex. https://m.shein.com) et le préfixe
             de langue éventuel (/fr/, /us/, /ar/…) afin de conserver la session et la devise. */
          var curPath = String((location && location.pathname) || '');
          var locMatch = curPath.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
          var locPrefix = (locMatch && locMatch[1].toLowerCase() !== 'product') ? ('/' + locMatch[1].toLowerCase()) : '';
          return location.origin + locPrefix + '/-p-' + targetGid + '.html';
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
    window.__aywebsLastTouchAt = window.__aywebsLastTouchAt || 0;
    try {
      var markTouch = function () { window.__aywebsLastTouchAt = Date.now(); };
      document.addEventListener('click', markTouch, true);
    } catch (e) {}
    var RELEVANT_URL = /product|goods|detail|sku|variant|twister|graphql|item|offer|price|pdp|realtime|mall|bff|mtop|bundle|oak|poppy/i;
    var MAX_TEXT_LEN = 650000;
    var parseJsonOrJsonp = function (rawTxt) {
      if (!rawTxt || typeof rawTxt !== 'string') return null;
      var trimmed = rawTxt.replace(/^\s+|\s+$/g, '');
      if (!trimmed) return null;
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        try { return JSON.parse(trimmed); } catch (e) { return null; }
      }
      var m = trimmed.match(/^[a-zA-Z0-9_$.]+\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?$/);
      if (m && m[1]) {
        try { return JSON.parse(m[1]); } catch (e2) { return null; }
      }
      return null;
    };
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
              if (ct && ct.indexOf('json') < 0 && ct.indexOf('javascript') < 0 && ct.indexOf('text/plain') < 0) return;
              res.clone().text().then(function (txt) {
                if (!txt || txt.length > MAX_TEXT_LEN) return;
                var parsed = parseJsonOrJsonp(txt);
                if (parsed) pushPayload(reqUrl, parsed);
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
                if (!txt || txt.length > MAX_TEXT_LEN) return;
                var parsed = parseJsonOrJsonp(txt);
                if (parsed) pushPayload(xhr.__aywebsUrl, parsed);
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
 * Amazon uses its own standalone reader; remaining stores still use the legacy
 * shared core until their independent readers have been migrated and tested.
 * Calling without a store keeps the legacy bundle for old app builds.
 */
export function buildAyWebsCaptureScript(storeId?: string | null): string {
  const reader = ayWebsCaptureReader(storeId);
  if (!reader) return AYWEBS_CAPTURE_SCRIPT;
  if (reader.storeId === 'amazon') return AMAZON_MOBILE_CAPTURE_SCRIPT;
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
    '  var host = String((w.location && w.location.hostname) || "").toLowerCase().replace(/^(?:www\\d*|m\\d*|mobile|wap|touch|smile)\\./, "");',
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
