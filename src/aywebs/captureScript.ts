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
    images: [], capturedAt: null, pageLang: null, amazon: null, diagnostics: []
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
      while (after < source.length && /\s/.test(source.charAt(after))) after++;
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
  function collectAmazonEvidence() {
    var result = { readerVersion: 1, pageAsin: AMAZON_ASIN || null, selectedAsin: null, options: [], variants: [] };
    if (!AMAZON_STRICT) return result;
    var variationValues = null;
    var dimensionKeys = [];
    var dimensionNames = [];
    var scripts = [];
    try { scripts = document.querySelectorAll('script:not([src])'); } catch (e) { scripts = []; }
    for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts; s++) {
      var source = scripts[s].textContent || '';
      if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars) continue;
      if (!variationValues) variationValues = amazonReadJsonValue(source, 'variationValues');
      if (variationValues && !dimensionNames.length) {
        for (var dimensionKey in variationValues) {
          if (!Object.prototype.hasOwnProperty.call(variationValues, dimensionKey) || dimensionNames.length >= AMAZON_EVIDENCE_LIMITS.dimensions) continue;
          dimensionKeys.push(dimensionKey);
          dimensionNames.push(amazonDimensionName(dimensionKey, 'dimension_' + (dimensionNames.length + 1)));
        }
      }
      var displayMap = amazonReadJsonValue(source, 'dimensionValuesDisplayData');
      if (displayMap && typeof displayMap === 'object') {
        for (var displayAsin in displayMap) {
          if (!Object.prototype.hasOwnProperty.call(displayMap, displayAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants) continue;
          var validDisplayAsin = amazonValidAsin(displayAsin);
          var displayDimensions = amazonNormalizeDimensions(displayMap[displayAsin], dimensionKeys, variationValues, false);
          if (validDisplayAsin && displayDimensions.length) amazonMergeVariant(result, validDisplayAsin, displayDimensions, 'dimensionValuesDisplayData');
        }
      }
      var asinMap = amazonReadJsonValue(source, 'asinVariationValues');
      if (asinMap && typeof asinMap === 'object') {
        for (var mappedAsin in asinMap) {
          if (!Object.prototype.hasOwnProperty.call(asinMap, mappedAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants) continue;
          var validMappedAsin = amazonValidAsin(mappedAsin);
          var mappedDimensions = amazonNormalizeDimensions(asinMap[mappedAsin], dimensionKeys, variationValues, true);
          if (validMappedAsin && mappedDimensions.length) amazonMergeVariant(result, validMappedAsin, mappedDimensions, 'asinVariationValues');
        }
      }
    }
    var blocks = [];
    try { blocks = document.querySelectorAll('#twister [id^="variation_"], #twister [id^="inline-twister-row-"], [id^="variation_"][id$="_name"]'); } catch (e) { blocks = []; }
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
        if (!label) label = text(item.textContent);
        label = text(label.replace(/^click to select\s*/i, ''));
        if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label || NOT_A_CHOICE.test(label)) continue;
        var optionAsin = amazonAsinFromNode(item);
        var selected = amazonNodeIsSelected(item);
        /* Ancien tracé : le swatch CHOISI porte data-dp-url vide = la fiche ouverte elle-même. */
        if (selected && !optionAsin && AMAZON_ASIN && item.hasAttribute && item.hasAttribute('data-dp-url')) optionAsin = AMAZON_ASIN;
        var state = amazonNodeAvailability(item);
        amazonAddOption(result, dimension, label, optionAsin, selected, state, 'twister_dom');
        if (selected && optionAsin) pushUnique(selectedAsins, optionAsin, 10, 10);
      }
    }
    var selectedField = null;
    try { selectedField = document.querySelector('#ASIN, input[name="ASIN"]'); } catch (e) {}
    var fieldAsin = amazonValidAsin(selectedField && (selectedField.value || selectedField.getAttribute('value')));
    if (fieldAsin) result.selectedAsin = fieldAsin;
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
  function amazonAddOption(result, dimension, value, asin, selected, state, source) {
    var key = dimension + '|' + value.toLowerCase() + '|' + (asin || '');
    for (var i = 0; i < result.options.length; i++) {
      var old = result.options[i];
      if ((old.dimension + '|' + old.value.toLowerCase() + '|' + (old.asin || '')) === key) return;
    }
    if (result.options.length < AMAZON_EVIDENCE_LIMITS.options) {
      result.options.push({ dimension: cut(dimension, 40), value: cut(value, AMAZON_EVIDENCE_LIMITS.label), asin: asin || null, selected: !!selected, availabilityEvidence: state, source: source });
    }
    if (asin) amazonMergeVariant(result, asin, [{ name: dimension, value: value }], source);
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
    for (var hops = 0; node && hops < 8; hops++) {
      if (isStruckNode(node)) return true;
      var descriptor = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
      if (/sponsored|sp-sponsored|carousel|nav-assist|similar|recommendation|adplace|a-text-price|deal-badge|apex_desktop_right/.test(descriptor)) return true;
      /* Offres annexes de la zone d'achat. Constaté sur une fiche US récupérée le
         18/10/2026 (texte rendu, pas le DOM) : « Add a protection plan » avec
         2-Year Protection Plan $39.99 et Complete Protect $16.99/month, affiché
         dans la colonne d'achat. Ces prix ne sont pas le prix vendu : sans ce
         filtre, deux montants distincts font abstenir le lecteur sur une fiche saine. */
      if (/attach|protection|warranty|insurance|popover|a-modal|upsell|add-?on|cross-?sell/.test(descriptor)) return true;
      node = node.parentNode;
    }
    if (element.getAttribute) {
      if (element.getAttribute('aria-hidden') === 'true') return true;
      var style = String(element.getAttribute('style') || '');
      if (/display:\s*none|visibility:\s*hidden/i.test(style)) return true;
    }
    return false;
  }
  /** Prix d'un élément Amazon : «.a-offscreen» s'il est rempli, sinon reconstruction
      à partir des spans (le cas MESURÉ : «.a-offscreen» vide dans le bloc). */
  function amazonPriceText(element) {
    if (!element) return '';
    var offscreen = '';
    try { var off = element.querySelector('.a-offscreen'); offscreen = text(off && off.textContent); } catch (e) {}
    if (offscreen && HAS_DIGIT.test(offscreen)) return offscreen;
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
      if (ownText && HAS_DIGIT.test(ownText) && CURRENCY_HINT.test(ownText) && ownText.length <= LIMITS.text) return ownText;
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
      var AMAZON_PRICE_SELECTORS = [
        '#apex-pricetopay-accessibility-label',
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
      /* Un seul montant distinct dans la zone d'achat ⇒ on publie UNE lecture
         (la première : l'étiquette d'accessibilité d'Amazon, que le lecteur
         serveur lit aussi en premier). Deux lectures du même montant venant de
         la MÊME famille de preuve ne sont pas une corroboration : le crible
         serveur les verrait comme un prix non corroboré à deux candidats, donc
         « ambigu » — un refus pour rien. Plus d'un montant distinct ⇒
         ABSTENTION : la page a des prix concurrents, on ne choisit pas. */
      var buyboxMismatch = amazonBuyboxAsinMismatch();
      if (buyboxMismatch) diag('price:buybox_asin_mismatch');
      /* Plusieurs montants distincts dans la zone d'achat : abstention, motif explicite pour le serveur. */
      if (amazonDistinctCount > 1) diag('price:ambiguous_buybox:' + amazonDistinctCount);
      if (amazonDistinctCount === 1 && !buyboxMismatch) {
        out.priceCandidates.push({ text: cut(amazonReadings[0], LIMITS.text), source: 'dom' });
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
    var ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|ajouter\s+au\s+panier|acheter|أضف\s*إلى\s*السلة|اشترِ/i;
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

  /* ── 8. Titre de secours et images visibles ─────────────────────────────── */
  /* Amazon : le titre VISIBLE de la fiche (#productTitle) est lu en premier — c'est le produit de cette page. */
  if (IS_AMAZON) {
    try {
      var amazonTitleEl = document.querySelector('#productTitle');
      var amazonTitle = amazonTitleEl ? cut(amazonTitleEl.textContent, LIMITS.text) : '';
      if (amazonTitle) out.title = amazonTitle;
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
    catch (e) { out.amazon = { readerVersion: 1, pageAsin: AMAZON_ASIN || null, selectedAsin: null, options: [], variants: [] }; }
  }

  /* ── 9. Bornes finales + sortie JSON ────────────────────────────────────── */
  if (out.priceCandidates.length > LIMITS.priceCandidates) out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
  if (!out.title) out.title = null;
  if (!out.capturedAt) out.capturedAt = new Date().toISOString();
  try { return JSON.stringify(out); } catch (e) { return '{}'; }
})();`;
