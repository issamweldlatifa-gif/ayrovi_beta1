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
 *     de formulaire ni de HTML. Uniquement des textes DOM/métas et le libellé
 *     screen-reader du buybox Amazon — jamais de screenshot ou d'OCR ;
 *   • bornes strictes (longueurs, nombre d'éléments) côté client ET côté serveur ;
 *   • un texte de prix SANS chiffre ET sans devise n'est pas candidat : cela
 *     évite le piège des prix « coupés » (Amazon publie la partie entière et la
 *     partie décimale dans deux spans séparés : « 6 » + « 99 »).
 */

/** Chemin de service du script (le client le récupère une fois puis le rejoue). */
export const AYWEBS_CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';

export const AYWEBS_CAPTURE_SCRIPT = String.raw`(function () {
  var LIMITS = { priceCandidates: 5, variantTexts: 30, selectedTexts: 5, variantGroups: 12, variantValues: 30, selectedAttributes: 12, images: 4, label: 60, text: 300 };
  var out = {
    v: 1, url: '', canonicalUrl: null, title: null, description: null, brand: null,
    priceCandidates: [], currencyText: null, availabilityText: null,
    addToCartText: null, conditionText: null, selectedVariantTexts: [], variantTexts: [],
    variantGroups: [], selectedVariantAttributes: {},
    images: [], capturedAt: null, pageLang: null
  };

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
  function amazonDimensionAttribute(sourceKey) {
    var key = String(sourceKey || '').toLowerCase();
    var known = {
      size_name: 'size', ring_size: 'size', color_name: 'color', style_name: 'style',
      pattern_name: 'pattern', flavor_name: 'flavor', capacity: 'capacity',
      format_name: 'format', model_name: 'model', material_name: 'material',
      item_type_name: 'type', length_name: 'length', volume_name: 'volume'
    };
    if (Object.prototype.hasOwnProperty.call(known, key)) return known[key];
    if (!/^[a-z0-9_]{1,40}$/.test(key)) return '';
    return key.replace(/_name$/, '') || 'model';
  }
  /* Parse uniquement un objet JSON après un nom de donnée connu ; aucun eval de
     script marchand. Le twister Amazon est parfois échappé dans un script JS. */
  function jsonObjectAfterKey(raw, key) {
    var original = String(raw || '');
    var escapedQuote = String.fromCharCode(92) + '"';
    var sources = [original, original.split(escapedQuote).join('"')];
    var needle = '"' + key + '"';
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var source = sources[sourceIndex];
      var cursor = 0;
      while (cursor < source.length) {
        var at = source.indexOf(needle, cursor);
        if (at < 0) break;
        cursor = at + needle.length;
        var open = source.indexOf('{', cursor);
        if (open < 0) break;
        var depth = 0;
        var inString = false;
        var escaped = false;
        for (var index = open; index < source.length && index < open + 250000; index++) {
          var ch = source.charAt(index);
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === String.fromCharCode(92)) escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') { inString = true; continue; }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              try { return JSON.parse(source.slice(open, index + 1)); } catch (e) { break; }
            }
          }
        }
      }
    }
    return null;
  }
  function variantTextFromNode(node) {
    if (!node) return '';
    var sources = [
      node.getAttribute && node.getAttribute('title'),
      node.getAttribute && node.getAttribute('aria-label'),
      node.getAttribute && node.getAttribute('data-attribute-value'),
      node.getAttribute && node.getAttribute('data-value')
    ];
    var labelledBy = node.getAttribute && node.getAttribute('aria-labelledby');
    if (labelledBy) {
      var labelNode = document.getElementById(labelledBy.split(String.fromCharCode(32))[0]);
      if (labelNode) sources.push(labelNode.textContent);
    }
    try {
      var inner = node.querySelector('.a-button-text, .swatchText, [class*="dimension-text" i], label');
      if (inner) sources.push(inner.textContent);
    } catch (e) {}
    sources.push(node.textContent);
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var candidate = cut(sources[sourceIndex], LIMITS.label);
      if (candidate) return candidate;
    }
    /* Les swatches image-only portent parfois leur libellé sur le <li> parent. */
    var parent = node.parentNode;
    for (var hop = 0; parent && hop < 2; hop++, parent = parent.parentNode) {
      var parentTitle = parent.getAttribute && (parent.getAttribute('title') || parent.getAttribute('aria-label'));
      if (parentTitle) return cut(parentTitle, LIMITS.label);
    }
    return '';
  }
  var CURRENCY_HINT = /[$\u20ac\u00a3\u00a5]|\b(EUR|USD|GBP|JPY|TND|DT|MAD|AED|SAR)\b|\bd\.?t\b/i;
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
  var AYWEBS_STORE = /(^|\.)shein\.com$/i.test(host) || /(^|\.)shein\.co\.uk$/i.test(host) ? 'shein'
    : /(^|\.)temu\.com$/i.test(host) ? 'temu'
      : /(^|\.)aliexpress\.com$/i.test(host) ? 'aliexpress'
        : /(^|\.)zalando\.(?:fr|de)$/i.test(host) ? 'zalando' : '';
  var AYWEBS_CURRENCY_HINT = /[$\u20ac\u00a3\u00a5\u20b9\u20ba\u20bd\u20a9\u20aa]|\b(EUR|USD|GBP|JPY|CNY|RMB|TND|DT|MAD|AED|SAR|CHF|CAD|AUD|SGD|NZD|HKD|MXN|BRL|INR|TRY|RUB|KRW|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|ZAR|QAR|KWD|BHD|OMR|JOD|EGP|TWD|THB|MYR|IDR|PHP|VND)\b|\bd\.?t\b/i;
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
  var AMAZON_PRODUCT_ROOT = null;
  var AMAZON_TWISTER_ROOT = null;
  if (AMAZON_STRICT) {
    try {
      AMAZON_PRODUCT_ROOT = document.querySelector('#dp-container') || document.querySelector('#ppd')
        || document.querySelector('#dp') || document.querySelector('#centerCol');
      if (AMAZON_PRODUCT_ROOT) {
        AMAZON_TWISTER_ROOT = AMAZON_PRODUCT_ROOT.querySelector('#twister_feature_div, [data-feature-name="twister"]');
      }
    } catch (e) { AMAZON_PRODUCT_ROOT = null; AMAZON_TWISTER_ROOT = null; }
  }
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
  /** Contexte publicitaire / navigation / prix barré / caché — jamais un prix vendu. */
  function amazonBlocked(element) {
    if (!element) return true;
    if (isInNavigation(element)) return true;
    var node = element;
    for (var hops = 0; node && hops < 10; hops++) {
      var descriptor = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
      if (/sponsored|sp-sponsored|carousel|nav-assist|similar|recommendation|adplace|a-text-price|deal-badge|apex_desktop_right/.test(descriptor)) return true;
      if (node.nodeType === 1 && node.getAttribute) {
        if (node.getAttribute('aria-hidden') === 'true' || (node.hasAttribute && node.hasAttribute('hidden'))) return true;
        var style = String(node.getAttribute('style') || '');
        if (/display:\s*none|visibility:\s*(?:hidden|collapse)/i.test(style)) return true;
        /* Amazon garde parfois une copie responsive différente du prix dans le
           DOM. Lire seulement le style inline de l'élément ne suffit pas : le
           parent de la copie peut être masqué par une règle CSS ou un media query. */
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
  /** Prix d'un élément Amazon : «.a-offscreen» s'il est rempli, sinon reconstruction
      à partir des spans (le cas MESURÉ : «.a-offscreen» vide dans le bloc). */
  function amazonPriceText(element) {
    if (!element) return '';
    var offscreen = '';
    try { var off = element.querySelector('.a-offscreen'); offscreen = text(off && off.textContent); } catch (e) {}
    if (offscreen && HAS_DIGIT.test(offscreen)) {
      var offscreenAmount = amazonSingleAmount(offscreen);
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
        return amazonSingleAmount(ownText);
      }
      return '';
    }
    return symbol + whole + (fraction ? '.' + fraction : '');
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
  /**
   * Amazon mobile peut enrichir l'étiquette d'accessibilité avec un pourcentage
   * (« $179.98 with 10 percent savings »). Seul un suffixe de remise reconnu
   * est retiré, et ce texte ne corrobore le prix que s'il égale le buybox visible.
   * Toute autre valeur chiffrée dans l'étiquette entraîne l'abstention.
   */
  function amazonFindAmount(raw) {
    return String(raw || '').match(/(?:[$\u20ac\u00a3\u00a5\uffe5]\s*)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?(?:\s*[$\u20ac\u00a3\u00a5\uffe5]|\s*(?:EUR|USD|GBP|JPY|TND))?/i);
  }
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
   * Screen-reader label may append one explicit savings percentage. It is
   * usable only as a cross-check against the visible current-price node; it is
   * never emitted alone. Other extra numbers keep the label rejected.
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

  try { out.url = cut(location && location.href, 600); } catch (e) { out.url = ''; }
  try { out.capturedAt = new Date().toISOString(); } catch (e) { out.capturedAt = null; }
  try { out.pageLang = cut(document.documentElement && document.documentElement.getAttribute('lang'), 20) || null; } catch (e) {}

  /* ── 1. JSON-LD : la seule donnée MACHINE publiée par le marchand ───────── */
  var jsonLd = null;
  var jsonProducts = [];
  var merchantJsonProducts = [];
  var merchantJsonSeen = [];
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
      } else if (AYWEBS_STORE) {
        collectMerchantProducts(parsed, merchantJsonProducts, merchantJsonSeen, 0);
      } else if (!jsonLd) {
        jsonLd = findProduct(parsed);
      }
    }
  } catch (e) {}
  /* Amazon : le produit retenu est celui de l'ASIN affiché — pas « le premier
     produit de la page » (une fiche Amazon publie souvent le JSON-LD de plusieurs
     articles : accessoires, versions, publicités). */
  if (AMAZON_STRICT) jsonLd = amazonPickProduct(jsonProducts);
  if (AYWEBS_STORE) jsonLd = merchantPickProduct(merchantJsonProducts);

  function collectMerchantProducts(root, output, seen, depth) {
    depth = depth || 0;
    if (!root || typeof root !== 'object' || depth > 8 || output.length >= 120 || seen.indexOf(root) >= 0) return;
    if (Object.prototype.toString.call(root) === '[object Array]') {
      for (var i = 0; i < root.length && output.length < 120; i++) collectMerchantProducts(root[i], output, seen, depth + 1);
      return;
    }
    seen.push(root);
    var type = root['@type'];
    var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
    for (var t = 0; t < types.length; t++) {
      var productType = String(types[t] || '').toLowerCase();
      if (productType === 'product' || productType === 'productgroup') { output.push(root); break; }
    }
    var keys = ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant'];
    for (var k = 0; k < keys.length && output.length < 120; k++) {
      if (root[keys[k]]) collectMerchantProducts(root[keys[k]], output, seen, depth + 1);
    }
  }
  function merchantPickProduct(candidates) {
    function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
    if (!candidates || !candidates.length) return null;
    var uniqueCandidates = [];
    var seenObjects = [];
    var seenIdentities = [];
    for (var uniqueIndex = 0; uniqueIndex < candidates.length; uniqueIndex++) {
      var candidate = candidates[uniqueIndex];
      if (!candidate || seenObjects.indexOf(candidate) >= 0) continue;
      seenObjects.push(candidate);
      var identity = normalize(candidate.productGroupID || candidate.sku || candidate.productID || candidate.url || candidate['@id']);
      if (identity && seenIdentities.indexOf(identity) >= 0) continue;
      if (identity) seenIdentities.push(identity);
      uniqueCandidates.push(candidate);
    }
    candidates = uniqueCandidates;
    if (!candidates.length) return null;
    function normalizedUrl(raw) {
      if (!String(raw || '').trim()) return '';
      try {
        var value = new URL(String(raw), out.url || location.href);
        return String(value.hostname || '').toLowerCase().replace(/^www\./, '') + String(value.pathname || '').replace(/\/+$/, '');
      } catch (e) { return ''; }
    }
    function metaValue(selector) {
      try { var element = document.querySelector(selector); return text(element && element.getAttribute('content')); } catch (e) { return ''; }
    }
    var currentUrl = normalizedUrl(out.url || location.href);
    var canonicalNode = null;
    try { canonicalNode = document.querySelector('link[rel="canonical"]'); } catch (e) {}
    var canonicalUrl = normalizedUrl(canonicalNode && canonicalNode.href || metaValue('meta[property="og:url"]'));
    var currentTitle = text(document.querySelector('h1') && document.querySelector('h1').textContent)
      || metaValue('meta[property="og:title"]') || text(document.title);
    var expectedNames = [normalize(currentTitle), normalize(metaValue('meta[property="og:title"]'))].filter(function (value) { return value.length >= 8; });
    var pageIds = [];
    function addPageId(value) { var normalized = normalize(value); if (normalized.length >= 5 && pageIds.indexOf(normalized) < 0) pageIds.push(normalized); }
    try {
      var pageUrl = new URL(out.url || location.href);
      addPageId(pageUrl.searchParams.get('goods_id'));
      addPageId(pageUrl.searchParams.get('goodsId'));
      addPageId(pageUrl.searchParams.get('productId'));
      var path = pageUrl.pathname;
      var pathId = AYWEBS_STORE === 'shein' ? (path.match(/-p-(\d+)/i) || [])[1]
        : AYWEBS_STORE === 'temu' ? (path.match(/(?:goods-[^/]*?-|(?:^|\/)g-)(\d{6,})\.html$/i) || [])[1]
          : AYWEBS_STORE === 'aliexpress' ? (path.match(/\/(?:item|i)\/(\d{6,})\.html$/i) || [])[1]
            : (path.match(/-([a-z0-9]{5,}-[a-z0-9]{2,})\.html$/i) || [])[1];
      addPageId(pathId);
    } catch (e) {}
    var ranked = candidates.map(function (product) {
      var type = product && product['@type'];
      var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
      var isGroup = types.some(function (value) { return String(value || '').toLowerCase() === 'productgroup'; });
      var variants = Object.prototype.toString.call(product && product.hasVariant) === '[object Array]'
        ? product.hasVariant : product && product.hasVariant ? [product.hasVariant] : [];
      var productUrls = [product && product.url, product && product['@id']];
      var urlMatch = productUrls.some(function (value) {
        var normalized = normalizedUrl(value);
        return Boolean(normalized && (normalized === currentUrl || normalized === canonicalUrl));
      });
      var ids = [product && product.sku, product && product.productID, product && product.productGroupID, product && product.mpn, product && product.gtin, product && product.gtin13];
      for (var i = 0; i < variants.length && i < 120; i++) ids.push(variants[i] && variants[i].sku, variants[i] && variants[i].productID, variants[i] && variants[i].mpn);
      var idMatch = ids.some(function (value) { return pageIds.indexOf(normalize(value)) >= 0; });
      var name = normalize(product && product.name);
      var nameMatch = expectedNames.some(function (expected) {
        return expected === name || (Math.min(expected.length, name.length) >= 12 && (expected.indexOf(name) >= 0 || name.indexOf(expected) >= 0));
      });
      var score = (urlMatch ? 1000 : 0) + (idMatch ? 500 : 0) + (nameMatch ? 200 : 0)
        + (isGroup && variants.length ? 50 : 0) + (product && product.offers ? 5 : 0);
      return { product: product, score: score, isGroup: isGroup, hasVariants: variants.length > 0 };
    }).sort(function (a, b) { return b.score - a.score; });
    if (ranked[0] && ranked[0].score > 0 && (!ranked[1] || ranked[1].score !== ranked[0].score)) return ranked[0].product;
    if (ranked[0] && ranked[0].score > 0 && ranked[1] && ranked[1].score === ranked[0].score) {
      var tiedGroups = ranked.filter(function (candidate) { return candidate.score === ranked[0].score && candidate.isGroup && candidate.hasVariants; });
      return tiedGroups.length === 1 ? tiedGroups[0].product : null;
    }
    var variantGroups = ranked.filter(function (candidate) { return candidate.isGroup && candidate.hasVariants; });
    if (variantGroups.length === 1) return variantGroups[0].product;
    return candidates.length === 1 ? candidates[0] : null;
  }

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
      var productType = String(types[t] || '').toLowerCase();
      if (productType === 'product' || (AYWEBS_STORE && productType === 'productgroup')) return node;
    }
    var keys = ['@graph', 'mainEntity', 'itemListElement', 'item'];
    if (AYWEBS_STORE) keys.push('hasVariant');
    for (var k = 0; k < keys.length; k++) {
      if (node[keys[k]]) { var child = findProduct(node[keys[k]], depth + 1); if (child) return child; }
    }
    return null;
  }
  function merchantProductOffers(product, output, depth) {
    depth = depth || 0;
    if (!product || depth > 5 || output.length > 30) return;
    var offers = product.offers;
    if (Object.prototype.toString.call(offers) === '[object Array]') {
      for (var i = 0; i < offers.length && output.length < 30; i++) if (offers[i] && typeof offers[i] === 'object') output.push(offers[i]);
    } else if (offers && typeof offers === 'object') output.push(offers);
    var variants = product.hasVariant;
    if (Object.prototype.toString.call(variants) === '[object Array]') {
      for (var v = 0; v < variants.length && output.length < 30; v++) merchantProductOffers(variants[v], output, depth + 1);
    } else if (variants && typeof variants === 'object') merchantProductOffers(variants, output, depth + 1);
  }
  function firstOffer(product) {
    if (!product) return null;
    if (!AYWEBS_STORE) {
      var genericOffers = product.offers;
      if (Object.prototype.toString.call(genericOffers) === '[object Array]') return genericOffers[0] || null;
      return genericOffers && typeof genericOffers === 'object' ? genericOffers : null;
    }
    /* ProductGroup offers are evidence for the displayed selection only when
       every published leaf offer agrees. Never borrow the first size's stock. */
    var offers = [];
    merchantProductOffers(product, offers, 0);
    if (!offers.length || offers.length > 30) return null;
    var currencyRows = {};
    for (var c = 0; c < offers.length; c++) {
      var publishedCurrency = offerField(offers[c], ['priceCurrency']).toUpperCase();
      if (/^[A-Z]{3}$/.test(publishedCurrency)) currencyRows[publishedCurrency] = true;
    }
    var currencyKeys = Object.keys(currencyRows);
    if (currencyKeys.length && !out.currencyText) out.currencyText = currencyKeys.join(' ');
    var priceRows = {};
    var rowCount = 0;
    var selectedPrice = '';
    var selectedCurrency = '';
    for (var i = 0; i < offers.length; i++) {
      var candidate = offers[i];
      var price = offerField(candidate, ['price']);
      var currency = offerField(candidate, ['priceCurrency']).toUpperCase();
      if (!price || !HAS_DIGIT.test(price)) return null;
      var key = String(price) + '|' + String(currency);
      if (!Object.prototype.hasOwnProperty.call(priceRows, key)) {
        priceRows[key] = true;
        rowCount++;
        selectedPrice = String(price);
        selectedCurrency = String(currency);
      }
    }
    if (rowCount !== 1) return null;
    var availabilityRows = {};
    var availabilityCount = 0;
    var availabilityComplete = true;
    for (var a = 0; a < offers.length; a++) {
      var availability = offerField(offers[a], ['availability', 'inventoryLevel']);
      if (!availability) { availabilityComplete = false; continue; }
      var availabilityKey = String(availability).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(availabilityRows, availabilityKey)) {
        availabilityRows[availabilityKey] = String(availability);
        availabilityCount++;
      }
    }
    var result = { price: selectedPrice, priceCurrency: selectedCurrency };
    if (availabilityComplete && availabilityCount === 1) result.availability = availabilityRows[Object.keys(availabilityRows)[0]];
    else if (availabilityComplete && availabilityCount > 1) result.availability = Object.keys(availabilityRows).map(function (key) { return availabilityRows[key]; }).join(' | ');
    var conditionRows = {};
    for (var q = 0; q < offers.length; q++) {
      var condition = offerField(offers[q], ['itemCondition', 'condition']);
      if (condition) conditionRows[String(condition).toLowerCase()] = condition;
    }
    if (Object.keys(conditionRows).length === 1) result.itemCondition = conditionRows[Object.keys(conditionRows)[0]];
    return result;
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
      out.description = cut(jsonLd.description, LIMITS.text) || out.description;
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
    if (!out.description) out.description = cut(meta([
      'meta[name="description"]', 'meta[property="og:description"]',
      'meta[property="product:description"]', 'meta[name="twitter:description"]',
    ]), LIMITS.text) || null;
    var ogImage = meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
    if (ogImage && /^https?:\/\//i.test(ogImage)) pushUnique(out.images, ogImage, LIMITS.images, 600);
    out.canonicalUrl = cut(meta(['meta[property="og:url"]']), 600) || null;
  } catch (e) {}

  try {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute('href')) out.canonicalUrl = cut(canonical.getAttribute('href'), 600);
  } catch (e) {}
  /* Amazon pointe parfois son canonical vers un AUTRE domaine Amazon : mesuré le
     06/10/2026, une fiche amazon.de publiait «https://www.amazon.com/clp/<ASIN>».
     Le crible serveur refuse toute capture dont le canonical change d'hôte — à
     raison (anti-usurpation). La fiche n'y perd rien : son identité est l'ASIN.
     On ne transmet donc un canonical que s'il désigne le MÊME hôte. */
  if (AMAZON_STRICT && out.canonicalUrl) {
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
  if (AYWEBS_STORE && !AMAZON_STRICT) {
    try {
      var merchantStockSelectors = AYWEBS_STORE === 'shein'
        ? ['[data-testid*="availability" i]', '[data-testid*="stock" i]', '[class*="product-intro__stock" i]', '[class*="stock-status" i]', '[class*="sold-out" i]']
        : AYWEBS_STORE === 'temu'
          ? ['[data-testid*="availability" i]', '[data-testid*="sold-out" i]', '[class*="goods-status" i]', '[class*="stock-status" i]', '[class*="sold-out" i]']
          : AYWEBS_STORE === 'aliexpress'
            ? ['[data-testid*="availability" i]', '[data-pl*="quantity" i]', '[class*="product-quantity" i]', '[class*="stock-status" i]', '[class*="sold-out" i]']
            : ['[data-testid*="availability" i]', '[data-testid*="stock" i]', '[class*="availability-message" i]', '[class*="product-status" i]', '[class*="sold-out" i]'];
      var stockWords = /outofstock|out[\s_-]*of[\s_-]*stock|sold[\s_-]*out|unavailable|currently\s+unavailable|ausverkauft|nicht\s+verfügbar|rupture|épuis|indisponible|in[\s_-]*stock|instock|\bavailable\b|lieferbar|verfügbar|en\s+stock|disponible|nur\s+noch|nur wenige verfügbar|only\s+\d+\s+left|plus\s+que\s+\d+/i;
      var stockEvidence = out.availabilityText ? [out.availabilityText] : [];
      var stockSeen = {};
      for (var se = 0; se < stockEvidence.length; se++) stockSeen[stockEvidence[se].toLowerCase()] = true;
      for (var ms = 0; ms < merchantStockSelectors.length && stockEvidence.length < 5; ms++) {
        var stockNodes = [];
        try { stockNodes = document.querySelectorAll(merchantStockSelectors[ms]); } catch (e) { continue; }
        for (var mn = 0; mn < stockNodes.length && stockEvidence.length < 5; mn++) {
          var stockNode = stockNodes[mn];
          if (isInNavigation(stockNode)) continue;
          var stockParent = stockNode;
          var excludedStock = false;
          for (var sh = 0; stockParent && sh < 7; sh++, stockParent = stockParent.parentNode) {
            var stockDescriptor = String((stockParent.id || '') + ' ' + (stockParent.className || '') + ' '
              + (stockParent.getAttribute && (stockParent.getAttribute('data-testid') || stockParent.getAttribute('data-component-type')) || '')).toLowerCase();
            if (/sponsor|advert|recommend|related|carousel|cross.?sell|upsell/.test(stockDescriptor)
              || (stockParent.getAttribute && (stockParent.getAttribute('aria-hidden') === 'true' || stockParent.hasAttribute('hidden')))) {
              excludedStock = true;
              break;
            }
          }
          if (excludedStock) continue;
          var stockRaw = text([
            stockNode.getAttribute && stockNode.getAttribute('data-availability'),
            stockNode.getAttribute && stockNode.getAttribute('data-stock-status'),
            stockNode.getAttribute && stockNode.getAttribute('aria-label'),
            stockNode.getAttribute && stockNode.getAttribute('title'),
            stockNode.textContent,
          ].filter(Boolean).join(' '));
          if (!stockRaw || stockRaw.length > LIMITS.text || !stockWords.test(stockRaw)) continue;
          var stockKey = stockRaw.toLowerCase();
          if (!Object.prototype.hasOwnProperty.call(stockSeen, stockKey)) {
            stockSeen[stockKey] = true;
            stockEvidence.push(stockRaw);
          }
        }
      }
      if (stockEvidence.length) out.availabilityText = cut(stockEvidence.join(' | '), LIMITS.text);
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
      var amazonA11yReading = '';
      try {
        var amazonA11yLabel = document.querySelector('#apex-pricetopay-accessibility-label');
        if (amazonA11yLabel && !amazonBlocked(amazonA11yLabel)) {
          amazonA11yReading = amazonAccessibilityAmount(amazonA11yLabel.textContent);
        }
      } catch (e) {}
      var AMAZON_PRICE_SELECTORS = [
        '#corePriceDisplay_desktop_feature_div .priceToPay',
        '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)',
        '#corePrice_feature_div .a-price:not(.a-text-price)',
        '#corePrice_desktop .a-price:not(.a-text-price)',
        '#corePrice_mobile_feature_div .a-price:not(.a-text-price)',
        '#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price)',
        '#apex_desktop .a-price[data-a-color="base"]',
        '.priceToPay',
        '#price_inside_buybox',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#newBuyBoxPrice',
        '#tp_price_block_total_price_ww .a-offscreen',
        '#buybox .a-price:not(.a-text-price)',
        '#desktop_buybox .a-price:not(.a-text-price)',
        '#mobile_buybox .a-price:not(.a-text-price)'
      ];
      var amazonReadings = [];
      var amazonNodes = [];
      for (var s = 0; s < AMAZON_PRICE_SELECTORS.length && amazonReadings.length < 6; s++) {
        var nodes = [];
        try { nodes = document.querySelectorAll(AMAZON_PRICE_SELECTORS[s]); } catch (e) { continue; }
        for (var n = 0; n < nodes.length && amazonReadings.length < 6; n++) {
          var el = nodes[n];
          if (amazonNodes.indexOf(el) >= 0) continue;
          if (amazonBlocked(el)) continue;
          var value = amazonPriceText(el);
          if (!value || !HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value)) continue;
          if (value.length > LIMITS.text) continue;
          /* Le montant lu par le span peut encore être un texte collé
             (« $6.99$6.99 ») : le verdict de la Phase 0 est SERVEUR, mais on
             n'envoie pas un texte manifestement dupliqué. */
          if (!amazonPlausible(value)) continue;
          amazonNodes.push(el);
          amazonReadings.push(value);
        }
      }
      var amazonDistinct = {};
      for (var d = 0; d < amazonReadings.length; d++) {
        amazonDistinct[amazonReadings[d].replace(/[\s\u00a0\u202f]+/g, '')] = true;
      }
      var amazonDistinctCount = 0;
      for (var key in amazonDistinct) { if (Object.prototype.hasOwnProperty.call(amazonDistinct, key)) amazonDistinctCount++; }
      /* Prix courant dédié + label accessible qui donne exactement le même
         montant : deux représentations concordantes du même buybox Amazon.
         Le label accessible n'est jamais suffisant seul ; les copies responsive
         masquées restent exclues et tout montant visuel concurrent impose
         l'abstention. */
      if (amazonDistinctCount === 1) {
        var visibleAmount = cut(amazonReadings[0], LIMITS.text);
        var visibleKey = visibleAmount.replace(/[\s\u00a0\u202f]+/g, '').toLowerCase();
        var accessibilityKey = amazonA11yReading.replace(/[\s\u00a0\u202f]+/g, '').toLowerCase();
        if (!amazonA11yReading || accessibilityKey === visibleKey) {
          out.priceCandidates.push({ text: visibleAmount, source: 'dom' });
          if (amazonA11yReading) {
            out.priceCandidates.push({ text: amazonA11yReading, source: 'dom_accessibility' });
          }
        }
      }
    } else {
    if (AYWEBS_STORE) {
      /* Chaque adapter lit les sélecteurs de PRIX COURANT de sa fiche produit.
         On ne descend jamais dans un carrousel, une annonce ou un prix barré,
         et plusieurs montants contradictoires restent plusieurs preuves afin
         que le serveur refuse le devis au lieu d'en choisir un arbitrairement. */
      var merchantPriceSelectors = AYWEBS_STORE === 'shein'
        ? ['[data-testid="product-intro__head-price"]', '.product-intro__head-price', '[class*="product-intro__price" i]', '[data-testid*="price-current" i]']
        : AYWEBS_STORE === 'temu'
          ? ['[data-testid="goods-price-current"]', '[data-testid*="goods-price" i]', '[class*="goods-price__current" i]', '[class*="price--current" i]']
          : AYWEBS_STORE === 'aliexpress'
            ? ['[data-pl="product-price"]', '[class*="price--currentPriceText" i]', '[class*="product-price-value" i]', '[data-testid="product-price"]']
            : ['[data-testid="pdp-price"]', '[data-testid="product-price"]', '[data-testid="price"]', '[class*="price__final" i]', '[class*="z-price-pdp" i]'];
      /* The documented, merchant-published product price class is a last-resort
         fallback for storefront versions without the current PDP test IDs. */
      merchantPriceSelectors.push('[itemprop="price"]', '.product-price', '.price-value', '.price__value', '.price-current');
      var merchantPriceRead = false;
      for (var mp = 0; mp < merchantPriceSelectors.length && !merchantPriceRead; mp++) {
        var merchantPriceNodes = [];
        try { merchantPriceNodes = document.querySelectorAll(merchantPriceSelectors[mp]); } catch (e) { continue; }
        var merchantReadings = [];
        for (var mn2 = 0; mn2 < merchantPriceNodes.length && merchantReadings.length < 6; mn2++) {
          var priceNode = merchantPriceNodes[mn2];
          if (isInNavigation(priceNode)) continue;
          var priceParent = priceNode;
          var secondaryPrice = false;
          for (var ph = 0; priceParent && ph < 8; ph++, priceParent = priceParent.parentNode) {
            var priceDescriptor = String((priceParent.id || '') + ' ' + (priceParent.className || '')).toLowerCase();
            if (/sponsored|recommend|related|carousel|cross.?sell|upsell|old.price|compare.at|was.price|regular.price|strikethrough/.test(priceDescriptor)
              || (priceParent.getAttribute && (priceParent.getAttribute('aria-hidden') === 'true' || priceParent.hasAttribute('hidden')))) {
              secondaryPrice = true;
              break;
            }
          }
          if (secondaryPrice) continue;
          var priceValue = text(priceNode.getAttribute && (priceNode.getAttribute('content') || priceNode.getAttribute('data-price')))
            || text(priceNode.textContent);
          var publishedCurrency = '';
          var currencyNode = priceNode;
          for (var ch = 0; currencyNode && ch < 4; ch++, currencyNode = currencyNode.parentNode) {
            var currencyCandidate = text(currencyNode.getAttribute && (currencyNode.getAttribute('data-currency')
              || currencyNode.getAttribute('data-price-currency') || currencyNode.getAttribute('data-currency-code')
              || currencyNode.getAttribute('currency'))).toUpperCase();
            if (/^[A-Z]{3}$/.test(currencyCandidate)) { publishedCurrency = currencyCandidate; break; }
          }
          if (publishedCurrency && !new RegExp('\\b' + publishedCurrency + '\\b', 'i').test(priceValue)) {
            priceValue = text(priceValue + ' ' + publishedCurrency);
          }
          if (!priceValue || !HAS_DIGIT.test(priceValue) || !AYWEBS_CURRENCY_HINT.test(priceValue) || priceValue.length > LIMITS.text) continue;
          var normalizedReading = priceValue.replace(/[\s\u00a0\u202f]+/g, ' ').toLowerCase();
          if (merchantReadings.indexOf(normalizedReading) < 0) merchantReadings.push(normalizedReading);
          if (publishedCurrency && !out.currencyText) out.currencyText = publishedCurrency;
        }
        if (merchantReadings.length) {
          for (var mr = 0; mr < merchantReadings.length && out.priceCandidates.length < LIMITS.priceCandidates; mr++) {
            out.priceCandidates.push({ text: cut(merchantReadings[mr], LIMITS.text), source: 'dom' });
          }
          merchantPriceRead = true;
        }
      }
    } else {
      /* Generic fallback kept separate: merchant-specific adapters never use a
         broad class selector that can return a recommendation. */
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
    var ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|ajouter\s+au\s+panier|acheter|أضف\s*إلى\s*السلة|اشترِ/i;
    var NATIVE_ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|ajouter\s+(?:au\s+)?(?:panier|sac|cabas)|acheter|in\s+den\s+warenkorb|in\s+die\s+tasche|zum\s+warenkorb|jetzt\s+kaufen|أضف\s*إلى\s*السلة|اشترِ/i;
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
        if (!amazonLabel || !ADD_TEXT.test(amazonLabel)) continue;
        amazonLabel = text(amazonLabel.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
        if (!amazonLabel) continue;
        var amazonDisabled = amazonControl.disabled === true
          || (amazonControl.getAttribute && (amazonControl.getAttribute('aria-disabled') === 'true' || amazonControl.getAttribute('disabled') !== null));
        if (amazonDisabled) continue;
        out.addToCartText = cut(amazonLabel, LIMITS.text);
      }
    } else {
    var controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]');
    for (var i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
      var control = controls[i2];
      var label = text(control.value) || text(control.textContent) || text(control.getAttribute && control.getAttribute('aria-label'));
      if (!label || !(AYWEBS_STORE ? NATIVE_ADD_TEXT : ADD_TEXT).test(label)) continue;
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

  try {
    var selected = document.querySelectorAll('select option:checked, [role="option"][aria-selected="true"], [aria-checked="true"]');
    for (var v = 0; v < selected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; v++) {
      var option = selected[v];
      if (isInNavigation(option)) continue;
      var optionText = text(option.getAttribute && option.getAttribute('title')) || text(option.textContent) || text(option.getAttribute && option.getAttribute('aria-label'));
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

  /* ── 7b. Amazon twister : groupes publiés et choix COURANT, sans prix ──────
     Les noms viennent des dimensions twister (pas d'un sélecteur variation_* supposé) :
     le fixture Amazon.de réel utilise #twister_feature_div / inline-twister-*
     et peut ne pas contenir ces anciens IDs. Les contrôles DOM ne servent qu'à
     confirmer les valeurs visibles ; seuls les faits prix/stock seront relus
     après un changement de choix. */
  if (AMAZON_STRICT) {
    try {
      var dimensionData = null;
      var displayLabels = {};
      var twistScripts = AMAZON_TWISTER_ROOT ? AMAZON_TWISTER_ROOT.querySelectorAll('script') : [];
      for (var ts = 0; ts < twistScripts.length; ts++) {
        var scriptText = String(twistScripts[ts].textContent || '');
        var allDimensions = jsonObjectAfterKey(scriptText, 'sortedDimValuesForAllDims');
        if (allDimensions && typeof allDimensions === 'object' && Object.keys(allDimensions).length) dimensionData = allDimensions;
        var labelsData = jsonObjectAfterKey(scriptText, 'variationDisplayLabels');
        if (labelsData && typeof labelsData === 'object' && Object.keys(labelsData).length) displayLabels = labelsData;
      }
      if (!Object.keys(displayLabels).length && AMAZON_PRODUCT_ROOT) {
        var productScripts = AMAZON_PRODUCT_ROOT.querySelectorAll('script');
        for (var ps = 0; ps < productScripts.length; ps++) {
          var productScriptText = String(productScripts[ps].textContent || '');
          var productLabels = jsonObjectAfterKey(productScriptText, 'variationDisplayLabels');
          if (productLabels && typeof productLabels === 'object' && Object.keys(productLabels).length) displayLabels = productLabels;
        }
      }

      function ensureAmazonVariantGroup(sourceKey, label) {
        var attribute = amazonDimensionAttribute(sourceKey);
        if (!attribute || attribute === '__proto__' || attribute === 'constructor' || attribute === 'prototype') return null;
        for (var existingIndex = 0; existingIndex < out.variantGroups.length; existingIndex++) {
          if (out.variantGroups[existingIndex].attribute === attribute) {
            return out.variantGroups[existingIndex].sourceKey === sourceKey ? out.variantGroups[existingIndex] : null;
          }
        }
        if (out.variantGroups.length >= LIMITS.variantGroups) return null;
        var group = { attribute: attribute, sourceKey: sourceKey, label: cut(label || attribute, LIMITS.label), values: [], valueStates: [] };
        out.variantGroups.push(group);
        return group;
      }
      function pushAmazonVariantValue(group, rawValue) {
        var value = cut(rawValue, LIMITS.label);
        if (!group || !value || /^(select|choose|please|--|search|department)/i.test(value)) return '';
        pushUnique(group.values, value, LIMITS.variantValues, LIMITS.label);
        pushUnique(out.variantTexts, value, LIMITS.variantTexts, LIMITS.label);
        return group.values.filter(function (candidate) { return candidate.toLowerCase() === value.toLowerCase(); })[0] || value;
      }
      function matchAmazonVariantValue(group, rawValue) {
        var value = cut(rawValue, LIMITS.label).toLowerCase();
        if (!group || !value) return '';
        for (var valueIndex = 0; valueIndex < group.values.length; valueIndex++) {
          if (group.values[valueIndex].toLowerCase() === value) return group.values[valueIndex];
        }
        return '';
      }
      function setAmazonSelected(group, value) {
        if (!group || !value) return;
        if (Object.keys(out.selectedVariantAttributes).length >= LIMITS.selectedAttributes
          && !Object.prototype.hasOwnProperty.call(out.selectedVariantAttributes, group.attribute)) return;
        out.selectedVariantAttributes[group.attribute] = value;
        pushUnique(out.selectedVariantTexts, value, LIMITS.selectedTexts, LIMITS.label);
      }

      if (dimensionData && typeof dimensionData === 'object') {
        var dimensionKeys = Object.keys(dimensionData);
        for (var dk = 0; dk < dimensionKeys.length && out.variantGroups.length < LIMITS.variantGroups; dk++) {
          var sourceKey = String(dimensionKeys[dk] || '').toLowerCase();
          var entries = dimensionData[sourceKey];
          if (!Array.isArray(entries) || !entries.length) continue;
          var group = ensureAmazonVariantGroup(sourceKey, displayLabels[sourceKey] || amazonDimensionAttribute(sourceKey));
          if (!group) continue;
          var selectedDataValue = '';
          var selectedDataAmbiguous = false;
          for (var de = 0; de < entries.length && group.values.length < LIMITS.variantValues; de++) {
            var entry = entries[de] || {};
            var value = pushAmazonVariantValue(group, entry.dimensionValueDisplayText || entry.dimensionValue || '');
            var state = String(entry.dimensionValueState || '').toUpperCase();
            if (value && (state === 'AVAILABLE' || state === 'UNAVAILABLE' || state === 'SELECTED')) {
              var stateFound = false;
              for (var vs = 0; vs < group.valueStates.length; vs++) {
                if (group.valueStates[vs].value.toLowerCase() === value.toLowerCase()) {
                  group.valueStates[vs].state = state;
                  stateFound = true;
                  break;
                }
              }
              if (!stateFound) group.valueStates.push({ value: value, state: state });
            }
            if (value && state === 'SELECTED') {
              if (selectedDataValue && selectedDataValue.toLowerCase() !== value.toLowerCase()) selectedDataAmbiguous = true;
              else selectedDataValue = value;
            }
          }
          if (selectedDataAmbiguous) {
            for (var unknownState = 0; unknownState < group.valueStates.length; unknownState++) {
              if (group.valueStates[unknownState].state === 'SELECTED') group.valueStates[unknownState].state = 'UNKNOWN';
            }
            delete out.selectedVariantAttributes[group.attribute];
          } else if (selectedDataValue) {
            setAmazonSelected(group, selectedDataValue);
          }
        }
      }

      var variantContainers = AMAZON_TWISTER_ROOT ? AMAZON_TWISTER_ROOT.querySelectorAll('[id^="variation_"]') : [];
      for (var vc = 0; vc < variantContainers.length && out.variantGroups.length < LIMITS.variantGroups; vc++) {
        var container = variantContainers[vc];
        var containerId = String(container.id || '');
        var sourceKeyFromDom = containerId.slice('variation_'.length).toLowerCase();
        if (!sourceKeyFromDom) continue;
        var domGroup = ensureAmazonVariantGroup(sourceKeyFromDom, displayLabels[sourceKeyFromDom] || amazonDimensionAttribute(sourceKeyFromDom));
        if (!domGroup) continue;
        var optionNodes = container.querySelectorAll('select option, li[title], [role="option"], [role="radio"], [data-attribute-value], [data-value], .a-button, button[title]');
        for (var on = 0; on < optionNodes.length && domGroup.values.length < LIMITS.variantValues; on++) {
          pushAmazonVariantValue(domGroup, variantTextFromNode(optionNodes[on]));
        }
        var selectedNodes = container.querySelectorAll('select option:checked, [aria-checked="true"], [aria-selected="true"], .a-button-selected, li[class*="selected" i], button[class*="selected" i]');
        var selectedValue = '';
        var selectedAmbiguous = false;
        for (var sn = 0; sn < selectedNodes.length; sn++) {
          var matchedSelectedValue = matchAmazonVariantValue(domGroup, variantTextFromNode(selectedNodes[sn]));
          if (!matchedSelectedValue) { selectedAmbiguous = true; continue; }
          if (selectedValue && selectedValue.toLowerCase() !== matchedSelectedValue.toLowerCase()) selectedAmbiguous = true;
          else selectedValue = matchedSelectedValue;
        }
        if (selectedNodes.length) {
          if (!selectedAmbiguous && selectedValue) setAmazonSelected(domGroup, selectedValue);
          else if (Object.prototype.hasOwnProperty.call(out.selectedVariantAttributes, domGroup.attribute)) {
            delete out.selectedVariantAttributes[domGroup.attribute];
          }
        }
      }
      out.variantGroups = out.variantGroups.filter(function (group) { return group.values.length > 0; });
    } catch (e) {}
  }

  /* ── 7c. Options produit des adapters SHEIN / TEMU / AliExpress / Zalando ──
     Les dimensions viennent des libellés de contrôles produit (select, fieldset,
     groupes aria, data-attribute-name, sku-property). On ne forme jamais de
     combinaisons cartésiennes ni de stock depuis une pastille activée. */
  if (!AMAZON_STRICT && AYWEBS_STORE) {
    try {
      function genericDimension(raw) {
        var label = text(raw).toLowerCase().replace(/[_-]+/g, ' ');
        var dimensions = [
          { key: 'size', pattern: /\b(size|sizes|taille|tailles|pointure|pointures|shoe size|größe|gr[oö]sse)\b/i },
          { key: 'color', pattern: /\b(color|colour|couleur|couleurs|farbe|coloris)\b/i },
          { key: 'capacity', pattern: /\b(capacity|capacite|capacité|volume|contenance)\b/i },
          { key: 'storage', pattern: /\b(storage|stockage|memory|mémoire|ram|ssd)\b/i },
          { key: 'model', pattern: /\b(model|modèle|modele|variant|variante)\b/i },
          { key: 'style', pattern: /\b(style|style name|coupe|fit)\b/i },
          { key: 'pattern', pattern: /\b(pattern|motif|print)\b/i },
          { key: 'material', pattern: /\b(material|matière|matiere|fabric|tissu)\b/i },
          { key: 'format', pattern: /\b(format|edition|édition|type|bundle|lot)\b/i },
          { key: 'length', pattern: /\b(length|longueur)\b/i },
          { key: 'width', pattern: /\b(width|largeur)\b/i },
        ];
        for (var di = 0; di < dimensions.length; di++) {
          if (dimensions[di].pattern.test(label)) return { attribute: dimensions[di].key, sourceKey: dimensions[di].key, label: cut(raw, LIMITS.label) };
        }
        return null;
      }
      function groupDescriptor(node) {
        var parts = [];
        var current = node;
        for (var up = 0; current && up < 3; up++, current = current.parentNode) {
          if (!current.getAttribute) continue;
          var attrs = ['data-attribute-name', 'data-attribute', 'data-dimension', 'data-dimension-name', 'data-variant-attribute', 'data-variant-name', 'aria-label', 'name', 'id', 'data-testid', 'class'];
          for (var ai = 0; ai < attrs.length; ai++) {
            var raw = current.getAttribute(attrs[ai]);
            if (raw) parts.push(raw);
          }
          try {
            var labelNodes = current.querySelectorAll('legend,label,[data-attribute-name],[data-dimension],[class*="title" i],[class*="label" i],[class*="name" i]');
            for (var li = 0; li < labelNodes.length && li < 4; li++) {
              var labelText = text(labelNodes[li].textContent);
              if (labelText && labelText.length <= LIMITS.label) parts.push(labelText);
            }
          } catch (e) {}
        }
        for (var p = 0; p < parts.length; p++) {
          var dimension = genericDimension(parts[p]);
          if (dimension) return dimension;
        }
        return null;
      }
      function genericValueNodes(container) {
        if (!container) return [];
        var result = [];
        try {
          var nodes = container.querySelectorAll('select option,[role="option"],[role="radio"],[data-attribute-value],[data-value],[data-size],[data-color],button,li[title],.sku-item,input[type="radio"]');
          for (var ni = 0; ni < nodes.length && result.length < LIMITS.variantValues; ni++) result.push(nodes[ni]);
        } catch (e) {}
        return result;
      }
      function addGenericGroupValue(group, rawValue, isDisabled) {
        var value = cut(rawValue, LIMITS.label);
        if (!group || !value || NOT_A_CHOICE.test(value)
          || /^(?:size|sizes|taille|color|colour|couleur|choose|select|default title|one option)$/i.test(value)) return '';
        var existing = '';
        for (var vi = 0; vi < group.values.length; vi++) if (group.values[vi].toLowerCase() === value.toLowerCase()) existing = group.values[vi];
        if (!existing && group.values.length < LIMITS.variantValues) {
          group.values.push(value);
          pushUnique(out.variantTexts, value, LIMITS.variantTexts, LIMITS.label);
        }
        var published = existing || value;
        if (isDisabled && group.valueStates.length < LIMITS.variantValues) {
          var hasState = false;
          for (var st = 0; st < group.valueStates.length; st++) if (group.valueStates[st].value.toLowerCase() === published.toLowerCase()) hasState = true;
          if (!hasState) group.valueStates.push({ value: published, state: 'UNAVAILABLE' });
        }
        return published;
      }
      function nodeDisabled(node) {
        if (!node) return false;
        var aria = node.getAttribute && node.getAttribute('aria-disabled');
        var klass = String(node.className || '').toLowerCase();
        return node.disabled === true || aria === 'true' || (node.getAttribute && node.getAttribute('disabled') !== null)
          || /disabled|sold.?out|unavailable|out.of.stock/.test(klass);
      }
      function selectedGenericNode(node) {
        if (!node) return false;
        var aria = node.getAttribute && (node.getAttribute('aria-checked') || node.getAttribute('aria-selected') || node.getAttribute('aria-pressed') || node.getAttribute('data-selected'));
        var klass = String(node.className || '').toLowerCase();
        return node.selected === true || aria === 'true' || /(?:^|[ _-])(selected|active|current|is-checked|checked)(?:$|[ _-])/.test(klass);
      }
      function ensureGenericGroup(dimension) {
        if (!dimension) return null;
        for (var gi = 0; gi < out.variantGroups.length; gi++) {
          if (out.variantGroups[gi].attribute === dimension.attribute) return out.variantGroups[gi].sourceKey === dimension.sourceKey ? out.variantGroups[gi] : null;
        }
        if (out.variantGroups.length >= LIMITS.variantGroups) return null;
        var group = { attribute: dimension.attribute, sourceKey: dimension.sourceKey, label: dimension.label || dimension.attribute, values: [], valueStates: [] };
        out.variantGroups.push(group);
        return group;
      }
      function matchGenericValue(group, rawValue) {
        var value = cut(rawValue, LIMITS.label).toLowerCase();
        for (var vi = 0; group && vi < group.values.length; vi++) if (group.values[vi].toLowerCase() === value) return group.values[vi];
        return '';
      }
      function setGenericSelected(group, value) {
        if (!group || !value) return;
        if (Object.keys(out.selectedVariantAttributes).length >= LIMITS.selectedAttributes
          && !Object.prototype.hasOwnProperty.call(out.selectedVariantAttributes, group.attribute)) return;
        out.selectedVariantAttributes[group.attribute] = value;
        pushUnique(out.selectedVariantTexts, value, LIMITS.selectedTexts, LIMITS.label);
      }

      var genericGroupSelectors = 'select,fieldset,[role="group"],[data-attribute-name],[data-attribute],[data-dimension],[data-dimension-name],[data-variant-attribute],[data-variant-name],[class*="sku-property" i],[class*="sku-prop" i],[class*="goods-sku" i],[class*="variant" i],[class*="swatch" i],[class*="size" i],[class*="taille" i],[class*="color" i],[class*="colour" i],[class*="couleur" i],[data-testid*="size" i],[data-testid*="color" i],[data-testid*="variant" i]';
      var genericCandidates = [];
      try { genericCandidates = document.querySelectorAll(genericGroupSelectors); } catch (e) {}
      var unknownVariantValues = [];
      var unknownSelectedValues = [];
      var seenCandidate = [];
      for (var gc = 0; gc < genericCandidates.length && gc < 240; gc++) {
        var groupContainer = genericCandidates[gc];
        if (seenCandidate.indexOf(groupContainer) >= 0 || isInNavigation(groupContainer)) continue;
        seenCandidate.push(groupContainer);
        var dimension = groupDescriptor(groupContainer);
        var values = genericValueNodes(groupContainer);
        if (!values.length) continue;
        if (!dimension) {
          var unknownDescriptor = String((groupContainer.id || '') + ' ' + (groupContainer.className || '') + ' '
            + (groupContainer.getAttribute && (groupContainer.getAttribute('data-variant-attribute') || groupContainer.getAttribute('data-testid')) || '')).toLowerCase();
          if (/variant|sku|swatch|option|attribute|dimension/.test(unknownDescriptor)) {
            for (var uv = 0; uv < values.length && unknownVariantValues.length < LIMITS.variantTexts; uv++) {
              var unknownValue = variantTextFromNode(values[uv]);
              if (!unknownValue || NOT_A_CHOICE.test(unknownValue)) continue;
              pushUnique(unknownVariantValues, unknownValue, LIMITS.variantTexts, LIMITS.label);
              if (selectedGenericNode(values[uv])) pushUnique(unknownSelectedValues, unknownValue, LIMITS.selectedTexts, LIMITS.label);
            }
          }
          continue;
        }
        var group = ensureGenericGroup(dimension);
        if (!group) continue;
        var selectedMatches = [];
        for (var gv = 0; gv < values.length; gv++) {
          var optionNode = values[gv];
          var optionText = variantTextFromNode(optionNode);
          if (!optionText && String(optionNode.tagName || '').toLowerCase() === 'select') {
            try { optionText = variantTextFromNode(optionNode.options[optionNode.selectedIndex]); } catch (e) {}
          }
          var publishedValue = addGenericGroupValue(group, optionText, nodeDisabled(optionNode));
          if (publishedValue && selectedGenericNode(optionNode)) {
            var selectedDuplicate = false;
            for (var sm = 0; sm < selectedMatches.length; sm++) if (selectedMatches[sm].toLowerCase() === publishedValue.toLowerCase()) selectedDuplicate = true;
            if (!selectedDuplicate) selectedMatches.push(publishedValue);
          }
        }
        if (selectedMatches.length === 1) setGenericSelected(group, selectedMatches[0]);
      }
      if (AYWEBS_STORE) {
        out.variantTexts = [];
        out.selectedVariantTexts = [];
        for (var og = 0; og < out.variantGroups.length; og++) {
          for (var ov = 0; ov < out.variantGroups[og].values.length; ov++) pushUnique(out.variantTexts, out.variantGroups[og].values[ov], LIMITS.variantTexts, LIMITS.label);
        }
        for (var os = 0; os < Object.keys(out.selectedVariantAttributes).length; os++) {
          var selectedKey = Object.keys(out.selectedVariantAttributes)[os];
          pushUnique(out.selectedVariantTexts, out.selectedVariantAttributes[selectedKey], LIMITS.selectedTexts, LIMITS.label);
        }
        for (var uvi = 0; uvi < unknownVariantValues.length; uvi++) pushUnique(out.variantTexts, unknownVariantValues[uvi], LIMITS.variantTexts, LIMITS.label);
        for (var usi = 0; usi < unknownSelectedValues.length; usi++) pushUnique(out.selectedVariantTexts, unknownSelectedValues[usi], LIMITS.selectedTexts, LIMITS.label);
      }
      out.variantGroups = out.variantGroups.filter(function (item) { return item.values.length > 0; });
    } catch (e) {}
  }

  /* ── 8. Titre de secours et images visibles ─────────────────────────────── */
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

  /* ── 9. Bornes finales + sortie JSON ────────────────────────────────────── */
  if (out.priceCandidates.length > LIMITS.priceCandidates) out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
  if (!out.title) out.title = null;
  if (!out.capturedAt) out.capturedAt = new Date().toISOString();
  try { return JSON.stringify(out); } catch (e) { return '{}'; }
})();`;
