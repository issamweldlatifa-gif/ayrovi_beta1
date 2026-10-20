/**
 * AYWEBs — LECTEUR DE PAGE DU WebView (réécriture du 20/10/2026).
 *
 * L'ancien script est SUPPRIMÉ et réécrit. Deux lectures, un seul contrat de sortie
 * (`AyWebsCapturedPage`, shared/aywebsCapture.ts) :
 *
 *  • AMAZON — zone d'achat seulement. Le prix vient du bloc d'achat (« #corePrice_feature_div »
 *    et équivalents), jamais d'un prix barré, d'un carrousel sponsorisé ou d'une
 *    recommandation. Deux montants distincts dans la zone d'achat ⇒ AUCUN candidat
 *    (diagnostic « price:ambiguous »). Amazon ne publie pas de JSON-LD de prix : il n'est pas lu.
 *
 *  • AUTRES BOUTIQUES — données structurées d'abord : JSON-LD Product (prix, devise,
 *    disponibilité, état), balises meta de prix, puis prix affichés. Chaque montant trouvé
 *    est publié tel quel : c'est le SERVEUR qui tranche (ambiguïté, corroboration).
 *
 * ── CE QUE LE SCRIPT NE FAIT PAS ────────────────────────────────────────────
 *   • aucune décision métier (c'est `webviewCapture.ts`) ;
 *   • aucun cookie, stockage local, champ de formulaire ni HTML ;
 *   • aucun nombre calculé, aucun identifiant de variante publié.
 *
 * ── RÈGLES D'ÉCRITURE ───────────────────────────────────────────────────────
 *   • ES5 uniquement (vieux WebViews) : ni `let`/`const`, ni flèches, ni gabarits ;
 *   • aucune exception ne remonte : chaque section est isolée par try/catch ;
 *   • bornes strictes (nombre et longueur).
 */

/** Chemin de service du script (le client le récupère puis le rejoue). */
export const AYWEBS_CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';

export const AYWEBS_CAPTURE_SCRIPT = String.raw`(function () {
  var LIMITS = { priceCandidates: 4, selectedTexts: 5, variantTexts: 30, images: 4, text: 300 };
  var out = {
    v: 1, url: '', canonicalUrl: null, title: null, brand: null,
    priceCandidates: [], currencyText: null, availabilityText: null,
    addToCartText: null, conditionText: null, selectedVariantTexts: [], variantTexts: [],
    images: [], capturedAt: null, pageLang: null, diagnostics: []
  };

  function clean(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cut(value, max) { return clean(value).slice(0, max); }
  function pushUnique(list, value, max, size) {
    var v = cut(value, size);
    if (!v) return;
    for (var i = 0; i < list.length; i++) { if (list[i].toLowerCase() === v.toLowerCase()) return; }
    if (list.length < max) list.push(v);
  }
  function diag(code) { if (out.diagnostics.length < 16) out.diagnostics.push(code); }
  function one(selector, root) {
    try { return (root || document).querySelector(selector); } catch (e) { return null; }
  }
  function all(selector, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); } catch (e) { return []; }
  }
  function hasClass(el, name) {
    var c = el && el.className;
    return typeof c === 'string' && (' ' + c + ' ').indexOf(' ' + name + ' ') !== -1;
  }
  function inside(el, names) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (names.indexOf(n.tagName) !== -1) return true;
      if (n.tagName === 'BODY') break;
    }
    return false;
  }
  /* Un prix barré (ancien prix, prix de référence) n'est jamais le prix de vente. */
  function struck(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.tagName === 'S' || n.tagName === 'DEL' || hasClass(n, 'a-text-price')) return true;
      if (n.tagName === 'BODY') break;
    }
    return false;
  }
  function disabledControl(el) {
    if (!el) return true;
    if (el.disabled === true || el.getAttribute('disabled') !== null) return true;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    return hasClass(el, 'a-button-disabled');
  }
  function metaContent(selector) {
    var el = one(selector);
    return el ? cut(el.getAttribute('content'), 60) : '';
  }

  var host = '';
  try { host = String(location.hostname || '').toLowerCase(); } catch (e) { host = ''; }
  var isAmazon = /(^|\.)amazon\.[a-z.]+$/.test(host);

  /* ── 1. Page ─────────────────────────────────────────────────────────────── */
  try {
    out.url = String(location.href || '');
    var canonical = one('link[rel="canonical"]');
    var ogUrl = one('meta[property="og:url"]');
    var canonicalHref = canonical ? canonical.getAttribute('href') : (ogUrl ? ogUrl.getAttribute('content') : null);
    if (canonicalHref) out.canonicalUrl = cut(canonicalHref, 600);
    var lang = document.documentElement && document.documentElement.getAttribute('lang');
    if (lang) out.pageLang = cut(lang, 20);
  } catch (e) { diag('page:unreadable'); }

  /* ── 2. Données structurées (JSON-LD) — hors Amazon ─────────────────────── */
  var ld = { name: null, brand: null, price: null, currency: null, availability: null, condition: null, images: [] };
  function findProducts(node, depth, list) {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (node.length !== undefined && typeof node !== 'string') {
      for (var i = 0; i < node.length && list.length < 20; i++) findProducts(node[i], depth + 1, list);
      return;
    }
    var type = node['@type'];
    var isProduct = type === 'Product' || (type && type.indexOf && type.indexOf('Product') !== -1);
    if (isProduct) list.push(node);
    if (node['@graph']) findProducts(node['@graph'], depth + 1, list);
    if (node.hasVariant) findProducts(node.hasVariant, depth + 1, list);
  }
  function firstOffer(product) {
    var offers = product.offers;
    if (!offers) return null;
    if (offers.length !== undefined) return offers.length ? offers[0] : null;
    return offers;
  }
  var ldUsable = false;
  try {
    {
      var scripts = all('script[type="application/ld+json"]');
      var products = [];
      for (var sIdx = 0; sIdx < scripts.length && products.length < 20; sIdx++) {
        var parsed = null;
        try { parsed = JSON.parse(scripts[sIdx].textContent); } catch (e) { parsed = null; }
        if (parsed) findProducts(parsed, 0, products);
      }
      if (products.length) {
        var product = products[0];
        ld.name = product.name ? cut(product.name, 300) : null;
        if (product.brand) ld.brand = cut(typeof product.brand === 'string' ? product.brand : (product.brand.name || ''), 100) || null;
        var offer = firstOffer(product);
        if (offer) {
          if (offer.price !== undefined && offer.price !== null && offer.price !== '') ld.price = cut(offer.price, 40);
          if (offer.priceCurrency) ld.currency = cut(offer.priceCurrency, 8).toUpperCase();
          if (offer.availability) ld.availability = cut(offer.availability, 120);
          if (offer.itemCondition) ld.condition = cut(offer.itemCondition, 120);
        }
        var imgs = product.image;
        if (imgs) {
          if (typeof imgs === 'string') ld.images.push(imgs);
          else if (imgs.length !== undefined) for (var im = 0; im < imgs.length && ld.images.length < LIMITS.images; im++) { if (typeof imgs[im] === 'string') ld.images.push(imgs[im]); }
        }
        /* Amazon : un seul produit publié ⇒ JSON-LD utilisable ; plusieurs ⇒ ignoré (publicités). */
        ldUsable = products.length === 1;
        diag('json_ld:product');
      }
    }
  } catch (e) { diag('json_ld:error'); }

  /* ── 3. Titre et marque ──────────────────────────────────────────────────── */
  try {
    var titleText = '';
    if (isAmazon) {
      var productTitle = one('#productTitle');
      titleText = productTitle ? cut(productTitle.textContent, LIMITS.text) : '';
    }
    if (!titleText && !isAmazon) {
      var ogTitle = metaContent('meta[property="og:title"]');
      titleText = ogTitle || (ld.name || '');
    }
    if (!titleText) {
      var h1 = one('h1');
      titleText = h1 ? cut(h1.textContent, LIMITS.text) : '';
    }
    out.title = titleText || null;
    if (!out.title) diag('title:none');
    else diag(isAmazon ? 'title:productTitle' : 'title:structured');
    if (!isAmazon) out.brand = ld.brand || metaContent('meta[property="product:brand"]') || null;
  } catch (e) { diag('title:error'); }

  /* ── 4. Prix ─────────────────────────────────────────────────────────────── */
  if (isAmazon) {
    var BUYBOX_ROOTS = ['#corePrice_feature_div', '#corePriceDisplay_desktop_feature_div', '#apex_desktop', '#desktop_buybox', '#buybox'];
    try {
      var priceNodes = [];
      var buyboxRoot = null;
      for (var r = 0; r < BUYBOX_ROOTS.length && !buyboxRoot; r++) {
        var root = one(BUYBOX_ROOTS[r]);
        if (!root) continue;
        var found = all('.a-price', root).filter(function (node) { return !struck(node); });
        if (found.length) { buyboxRoot = root; priceNodes = found; diag('buybox:' + BUYBOX_ROOTS[r].replace(/^#/, '')); }
      }
      var amounts = [];
      for (var p = 0; p < priceNodes.length; p++) {
        var pt = amazonPriceText(priceNodes[p]);
        if (!pt) continue;
        var key = pt.replace(/\s+/g, '');
        var seen = false;
        for (var q = 0; q < amounts.length; q++) { if (amounts[q].key === key) seen = true; }
        if (!seen) amounts.push({ key: key, text: pt, node: priceNodes[p] });
      }
      if (amounts.length === 0) {
        diag('price:none_in_buybox');
      } else if (amounts.length > 1) {
        diag('price:ambiguous');
      } else {
        out.priceCandidates.push({ text: amounts[0].text, source: 'dom' });
        diag('price:buybox');
        var symbolNode = one('.a-price-symbol', amounts[0].node);
        var currencyFromSymbol = symbolNode ? cut(symbolNode.textContent, 8) : '';
        var isoMatch = amounts[0].text.match(/\b(EUR|USD|GBP|JPY|CAD|AUD|SGD|MXN|BRL|TND|AED|SAR|MAD)\b/);
        if (currencyFromSymbol) out.currencyText = currencyFromSymbol;
        else if (isoMatch) out.currencyText = isoMatch[1];
        else if (/[$\u20ac\u00a3\u00a5]/.test(amounts[0].text)) out.currencyText = amounts[0].text.match(/[$\u20ac\u00a3\u00a5]/)[0];
      }
      if (amounts.length === 0 && priceNodes.length === 0 && ldUsable && ld.price !== null) {
        var amazonLd = ld.currency ? ld.price + ' ' + ld.currency : ld.price;
        out.priceCandidates.push({ text: cut(amazonLd, LIMITS.text), source: 'json_ld' });
        diag('price:json_ld');
        if (ld.currency) out.currencyText = ld.currency;
      }
    } catch (e) { diag('price:error'); }
  } else {
    try {
      if (ld.price !== null) {
        var ldText = ld.currency ? ld.price + ' ' + ld.currency : ld.price;
        out.priceCandidates.push({ text: cut(ldText, LIMITS.text), source: 'json_ld' });
        diag('price:json_ld');
      }
      var metaAmount = metaContent('meta[property="product:price:amount"]') || metaContent('meta[property="og:price:amount"]');
      var metaCurrency = metaContent('meta[property="product:price:currency"]') || metaContent('meta[property="og:price:currency"]');
      if (metaAmount) {
        out.priceCandidates.push({ text: cut(metaCurrency ? metaAmount + ' ' + metaCurrency : metaAmount, LIMITS.text), source: 'meta' });
        diag('price:meta');
      }
      var domTexts = [];
      var candidates = all('[class],[id],[itemprop="price"]');
      for (var c = 0; c < candidates.length && domTexts.length < LIMITS.priceCandidates; c++) {
        var node = candidates[c];
        var marker = (node.className && typeof node.className === 'string' ? node.className : '') + ' ' + (node.id || '') + ' ' + (node.getAttribute('itemprop') || '');
        if (!/price|prix|amount|montant/i.test(marker)) continue;
        if (inside(node, ['NAV', 'HEADER', 'FOOTER'])) continue;
        if (struck(node)) continue;
        var text = cut(node.textContent, 60);
        if (!text || text.length > 40 || !/[0-9]/.test(text)) continue;
        if (!/[$\u20ac\u00a3\u00a5]|\b(EUR|USD|GBP|TND)\b|[0-9][.,][0-9]{2}\b/.test(text)) continue;
        pushUnique(domTexts, text, LIMITS.priceCandidates, 60);
      }
      for (var d = 0; d < domTexts.length; d++) out.priceCandidates.push({ text: domTexts[d], source: 'dom' });
      if (domTexts.length) diag('price:dom');
      if (ld.currency) out.currencyText = ld.currency;
      else if (metaCurrency) out.currencyText = metaCurrency;
    } catch (e) { diag('price:error'); }
  }

  /* ── 5. Disponibilité, état et bouton d'achat ───────────────────────────── */
  try {
    if (isAmazon) {
      var availability = one('#availability') || one('#outOfStock');
      if (availability) out.availabilityText = cut(availability.textContent, LIMITS.text) || null;
      else if (ldUsable && ld.availability) out.availabilityText = ld.availability;
    } else if (ld.availability) {
      out.availabilityText = ld.availability;
      diag('availability:json_ld');
    }
    if (ld.condition && (!isAmazon || ldUsable)) out.conditionText = ld.condition;
    if (out.availabilityText) diag('availability:found');
  } catch (e) { diag('availability:error'); }

  try {
    if (isAmazon) {
      var addButton = one('#add-to-cart-button') || one('input#add-to-cart-button');
      if (!addButton) {
        diag('buy:absent');
      } else if (disabledControl(addButton)) {
        /* Amazon : un contrôle désactivé ne publie AUCUN libellé (il prouverait un stock inexistant). */
        diag('buy:disabled');
      } else {
        var amazonLabel = addButton.tagName === 'INPUT' ? addButton.getAttribute('value') : addButton.textContent;
        out.addToCartText = cut(amazonLabel, LIMITS.text) || null;
        diag('buy:enabled');
      }
    } else {
      var CONTROLS = 'button, input[type="submit"], input[type="button"], a[role="button"]';
      var controls = all(CONTROLS);
      for (var k = 0; k < controls.length && !out.addToCartText; k++) {
        var control = controls[k];
        var label = control.tagName === 'INPUT' ? control.getAttribute('value') : control.textContent;
        var clabel = cut(label, LIMITS.text);
        if (!/ajouter|add to|acheter|buy/i.test(clabel)) continue;
        var disabled = disabledControl(control);
        out.addToCartText = cut(clabel + (disabled ? ' [disabled]' : ''), LIMITS.text);
        diag(disabled ? 'buy:disabled' : 'buy:enabled');
      }
      if (!out.addToCartText) diag('buy:absent');
    }
  } catch (e) { diag('buy:error'); }

  /* ── 6. Options (taille, couleur) — libellés bruts, option choisie à part ── */
  try {
    if (isAmazon) {
      var SELECTED = ['#twister .a-button-selected', '#variation_size_name .a-button-selected', '#variation_color_name .a-button-selected'];
      var OPTIONS = ['#twister .a-button-text', '#variation_size_name li', '#variation_color_name li'];
      for (var s = 0; s < SELECTED.length; s++) {
        var picked = all(SELECTED[s]);
        for (var si = 0; si < picked.length; si++) pushUnique(out.selectedVariantTexts, picked[si].textContent, LIMITS.selectedTexts, 60);
      }
      for (var o = 0; o < OPTIONS.length; o++) {
        var labels = all(OPTIONS[o]);
        for (var oi = 0; oi < labels.length; oi++) pushUnique(out.variantTexts, labels[oi].textContent, LIMITS.variantTexts, 60);
      }
    } else {
      var selects = all('select');
      for (var sel = 0; sel < selects.length; sel++) {
        var select = selects[sel];
        var marker2 = (select.id || '') + ' ' + (select.name || '');
        if (!/variant|size|taille|color|couleur|pointure/i.test(marker2)) continue;
        if (inside(select, ['NAV', 'HEADER', 'FOOTER'])) continue;
        var options = all('option', select);
        for (var op = 0; op < options.length; op++) {
          var optionText = cut(options[op].textContent, 60);
          if (!optionText || /^(choisir|select|choose|sélectionner)/i.test(optionText)) continue;
          if (options[op].selected) pushUnique(out.selectedVariantTexts, optionText, LIMITS.selectedTexts, 60);
          pushUnique(out.variantTexts, optionText, LIMITS.variantTexts, 60);
        }
      }
    }
  } catch (e) { diag('variants:error'); }

  /* ── 7. Images : l'image principale d'abord ─────────────────────────────── */
  try {
    if (isAmazon) {
      var main = one('#landingImage') || one('#imgTagWrapperId img');
      if (main) {
        var src = main.getAttribute('data-old-hires') || main.getAttribute('src');
        if (src && /^https?:\/\//i.test(src)) pushUnique(out.images, src, LIMITS.images, 600);
      }
      var dynamic = one('[data-a-dynamic-image]');
      if (dynamic && out.images.length < LIMITS.images) {
        var map = null;
        try { map = JSON.parse(dynamic.getAttribute('data-a-dynamic-image')); } catch (e) { map = null; }
        for (var key2 in map) {
          if (!Object.prototype.hasOwnProperty.call(map, key2)) continue;
          if (/^https?:\/\//i.test(key2)) pushUnique(out.images, key2, LIMITS.images, 600);
          if (out.images.length >= LIMITS.images) break;
        }
      }
    } else {
      for (var g = 0; g < ld.images.length; g++) {
        if (/^https?:\/\//i.test(ld.images[g])) pushUnique(out.images, ld.images[g], LIMITS.images, 600);
      }
      var ogImage = metaContent('meta[property="og:image"]');
      if (ogImage && /^https?:\/\//i.test(ogImage)) pushUnique(out.images, ogImage, LIMITS.images, 600);
    }
  } catch (e) { diag('images:error'); }

  /* ── 8. Sortie ───────────────────────────────────────────────────────────── */
  if (out.priceCandidates.length > LIMITS.priceCandidates) out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
  out.capturedAt = new Date().toISOString();
  try { return JSON.stringify(out); } catch (e) { return '{}'; }

  /* Prix Amazon d'un bloc « .a-price » : texte complet, sinon reconstruit depuis ses morceaux. */
  function amazonPriceText(node) {
    var off = one('.a-offscreen', node);
    var full = off ? cut(off.textContent, LIMITS.text) : '';
    if (full && /[0-9]/.test(full)) return full;
    var symbol = one('.a-price-symbol', node);
    var whole = one('.a-price-whole', node);
    var fraction = one('.a-price-fraction', node);
    if (!whole) return '';
    var w = cut(whole.textContent, 20).replace(/[.,\s]+$/, '');
    var f = fraction ? cut(fraction.textContent, 4) : '';
    if (!/[0-9]/.test(w)) return '';
    return cut((symbol ? symbol.textContent : '') + w + (f ? '.' + f : ''), LIMITS.text);
  }
})();`;
