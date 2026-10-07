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

/** Chemin de service du script (le client le récupère une fois puis le rejoue). */
export const AYWEBS_CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';

export const AYWEBS_CAPTURE_SCRIPT = String.raw`(function () {
  var LIMITS = { priceCandidates: 4, variantTexts: 30, selectedTexts: 5, images: 4, label: 60, text: 300 };
  var out = {
    v: 1, url: '', canonicalUrl: null, title: null, brand: null,
    priceCandidates: [], currencyText: null, availabilityText: null,
    addToCartText: null, conditionText: null, selectedVariantTexts: [], variantTexts: [],
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
  var CURRENCY_HINT = /[$\u20ac\u00a3\u00a5]|\b(EUR|USD|GBP|JPY|TND|DT|MAD|AED|SAR)\b|\bd\.?t\b/i;
  var HAS_DIGIT = /[0-9]/;

  try { out.url = cut(location && location.href, 600); } catch (e) { out.url = ''; }
  try { out.capturedAt = new Date().toISOString(); } catch (e) { out.capturedAt = null; }
  try { out.pageLang = cut(document.documentElement && document.documentElement.getAttribute('lang'), 20) || null; } catch (e) {}

  /* ── 1. JSON-LD : la seule donnée MACHINE publiée par le marchand ───────── */
  var jsonLd = null;
  try {
    var blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (var b = 0; b < blocks.length && !jsonLd; b++) {
      var raw = blocks[b].textContent || '';
      if (!raw || raw.length > 400000) continue;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      jsonLd = findProduct(parsed);
    }
  } catch (e) {}

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
      if (String(types[t] || '').toLowerCase() === 'product') return node;
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
    return offers && typeof offers === 'object' ? offers : null;
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

  var offer = firstOffer(jsonLd);
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
    if (ogImage && /^https?:\/\//i.test(ogImage)) pushUnique(out.images, ogImage, LIMITS.images, 600);
    out.canonicalUrl = cut(meta(['meta[property="og:url"]']), 600) || null;
  } catch (e) {}

  try {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute('href')) out.canonicalUrl = cut(canonical.getAttribute('href'), 600);
  } catch (e) {}

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

  /* ── 4. DOM visible — dernier recours, borné ──────────────────────────────
     Deux pièges évités : (a) un texte SANS devise n'est pas retenu (les pages
     qui coupent le prix en deux spans donnent « 6 » tout seul — ce n'est pas un
     prix) ; (b) on lit au plus deux éléments, pour ne pas ramasser un prix de
     publicité ou de produit recommandé. */
  try {
    /* Le PANIER D'ACHAT d'abord : les sélecteurs de bloc d'achat des grandes
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
    var controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]');
    var ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|ajouter\s+au\s+panier|acheter|أضف\s*إلى\s*السلة|اشترِ/i;
    for (var i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
      var control = controls[i2];
      var label = text(control.value) || text(control.textContent) || text(control.getAttribute && control.getAttribute('aria-label'));
      if (!label || !ADD_TEXT.test(label)) continue;
      /* « Add to basket shift + ALT + K » est un libellé d'accessibilité, pas un
         bouton : le raccourci clavier est retiré, et un libellé qui n'est QUE
         cela est écarté (mesuré le 06/10/2026 sur une page amazon.de rendue). */
      label = text(label.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
      if (!label) continue;
      var disabled = control.disabled === true
        || (control.getAttribute && (control.getAttribute('aria-disabled') === 'true' || control.getAttribute('disabled') !== null));
      out.addToCartText = cut(label + (disabled ? ' [disabled]' : ''), LIMITS.text);
    }
  } catch (e) {}

  /* ── 7. Options : ce qui est AFFICHÉ comme choisi, et ce qui est publié ──── */
  /* Éléments de type OPTION seulement, hors navigation et hors recherche :
     mesuré le 06/10/2026, un sélecteur trop large rapportait « All Departments »
     et « Search Amazon » comme options de produit. Un libellé de barre de
     recherche n'est pas un choix de produit. */
  var NOT_A_CHOICE = /^(select|choose|choisir|sélectionner|please|اختر|--)|search|department|store name|catégorie|category/i;
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

  /* ── 8. Titre de secours et images visibles ─────────────────────────────── */
  if (!out.title) { try { out.title = cut(document.title, LIMITS.text) || null; } catch (e) {} }
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
