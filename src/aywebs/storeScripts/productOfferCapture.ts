import type { AyWebsCaptureReaderDefinition } from '../captureReaders/contract';

/**
 * One capture engine for product-offer readers. Adopted from Zalando: the
 * merchant source only gathers evidence; this engine owns the payload, URL,
 * variant group and offer publication, bounds and WebView serialization.
 */
export function buildProductOfferCapture(
  reader: AyWebsCaptureReaderDefinition,
  domains: readonly string[],
  source: string,
  { strictOfferIdentity = false, runtimeProfile = false }: { strictOfferIdentity?: boolean; runtimeProfile?: boolean } = {},
): string {
  const profile = runtimeProfile ? 'hostOfferProfile' : JSON.stringify({ storeId: reader.storeId, version: reader.version, priceMode: reader.priceMode });
  return String.raw`(function () {
    var READER_PROFILE = ${profile};
    var domains = ${runtimeProfile ? 'hostOfferProfile.domains' : JSON.stringify(domains)};
    var host = String(typeof location !== 'undefined' && location.hostname || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
    var matched = false;
    for (var di = 0; di < domains.length; di++) {
        if (host === domains[di] || host.slice(-(domains[di].length + 1)) === '.' + domains[di]) { matched = true; break; }
    }
    if (!matched) return null;
    var scopedOfferIds = ${strictOfferIdentity};
    var GLOBAL_WIN = null;
    try { GLOBAL_WIN = document.defaultView || (typeof window !== 'undefined' ? window : null); } catch (e) {}
    var LIMITS = { priceCandidates: 4, variantTexts: 30, selectedTexts: 5, images: 4, label: 60, text: 300, variantGroups: 4, variantValues: 20, matrixEntries: 120 };
    var DOM_OPTIONS = {};
    var out = {
        v: 1,
        url: "",
        canonicalUrl: null,
        title: null,
        brand: null,
        priceCandidates: [],
        currencyText: null,
        availabilityText: null,
        addToCartText: null,
        conditionText: null,
        selectedVariantTexts: [],
        variantTexts: [],
        variantGroups: [],
        variantMatrix: [],
        images: [],
        capturedAt: null,
        pageLang: null,
        amazon: null,
        shein: null,
        aliexpress: null,
        reader: READER_PROFILE ? {
            id: READER_PROFILE.storeId || null,
            version: READER_PROFILE.version || 0
        } : null,
        diagnostics: []
    };
    function diag(code) {
        out.diagnostics.length < 16 && out.diagnostics.push(code);
    }
    function text(value) {
        return null == value ? "" : String(value).replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
    }
    function cut(value, max) {
        return text(value).slice(0, max);
    }
    function pushUnique(list, value, max, size) {
        var v = cut(value, size);
        if (v) {
            for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === v.toLowerCase()) return;
            list.length < max && list.push(v);
        }
    }
    try {
        out.url = function() {
            var href = text(location && location.href);
            if (!href) return "";
            if (href.length <= 500) return cut(href, 600);
            try {
                var hashPos = href.indexOf("#"), noHash = hashPos >= 0 ? href.slice(0, hashPos) : href, qPos = noHash.indexOf("?");
                if (qPos < 0) return cut(noHash, 600);
                for (var basePart = noHash.slice(0, qPos), queryPart = noHash.slice(qPos + 1), dropKey = /^(?:utm_[^=]*|spm|scm|scm_id|scm-url|pvid|pdp_npi|pdp_ext_f|utparam-url|algo_pvid|algo_exp_id|curpageloguid|gatewayadapt|gps-id|btsid|ws_ab_test|_t|aff_fcid|aff_fsk|aff_platform|sk|aff_trace_key|terminal_id|afsmartredirect|sourcetype|channel|_randl_shipto|_evo_buckets|src_identifier|src_module|src_tab_page_id|page_kw|ici|_bg_fs|_p_rfs|top_gallery_url|_x_[^=]*|refer_page_[^=]*|sprefix|crid|dib|dib_tag|qid|fbclid|gclid|srsltid)$/i, parts = queryPart.split("&"), kept = [], qp = 0; qp < parts.length; qp++) {
                    var seg = parts[qp];
                    if (seg) {
                        var eqIdx = seg.indexOf("="), kName = eqIdx >= 0 ? seg.slice(0, eqIdx) : seg;
                        dropKey.test(kName) || kept.push(seg);
                    }
                }
                return cut(kept.length ? basePart + "?" + kept.join("&") : basePart, 600);
            } catch (e) {
                return cut(href, 600);
            }
        }();
    } catch (e) {
        out.url = "";
    }
    try {
        out.capturedAt = (new Date).toISOString();
    } catch (e) {
        out.capturedAt = null;
    }
    try {
        out.pageLang = cut(document.documentElement && document.documentElement.getAttribute("lang"), 20) || null;
    } catch (e) {}
    var NOT_A_CHOICE = /^(select|choose|choisir|sélectionner|please|اختر|--)|search|department|store name|catégorie|category/i, ACTION_NOT_A_VALUE = /^(?:add|ajouter|acheter|buy|commander|checkout|panier|cart|sac|bag|wishlist|favoris|partager|share|guide|voir|see|learn|en\s+savoir\s+plus|taille\s*(?:&|et|\+)\s*coupe|size\s*(?:&|and|\+)\s*fit|size\s*guide|guide\s*des\s*tailles)\b/i, BARE_DIMENSION_PLACEHOLDER = /^(?:taille|size|talla|taglia|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس|المقاس|قياس|couleur|colou?r|farbe|colore|لون|اللون)$/i, UI_PLACEHOLDER_INLINE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس)|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;
    var NOT_A_VARIANT_GROUP = /^(sort|sort by|sortby|trier|tri|order by|orderby|quantit\w*|quantity|qty|nombre|view|view by|affichage|filter|filtre|page|pages|lang|langue|language|devise|currency|pays|country|region|région|per page|items per page|afficher)\b/i, UI_NOT_A_VALUE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|размер|مقاس)|(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e)\s*(?:&|et|\+)\s*(?:coupe|fit)|(?:size|taille|talla)\s*guide|guide\s+des\s+tailles|guía\s+de\s+tallas|gr(?:ö|oe)(?:ß|ss)entabelle|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|(?:todas\s+las\s+)?colores|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;
    function ciKey(value) {
        return text(String(null == value ? "" : value)).toLowerCase().replace(/[\u2018\u2019\u02bc\u0060]/g, "'").replace(/\s*[:*·•-]+\s*$/, "").replace(/\s+/g, " ");
    }
    function ciExactContains(list, candidate) {
        for (var needle = String(null == candidate ? "" : candidate).toLowerCase(), ci = 0; ci < list.length; ci++) if (String(list[ci]).toLowerCase() === needle) return !0;
        return !1;
    }
    function pushVariantGroup(name, values, selected, options) {
        if (name && values.length) {
            var label = cut(name, 60);
            if (label && !NOT_A_CHOICE.test(label) && !NOT_A_VARIANT_GROUP.test(label)) {
                for (var groupKey = ciKey(label), keptValues = [], kv = 0; kv < values.length; kv++) {
                    var candidateValue = text(values[kv]);
                    candidateValue && ciKey(candidateValue) !== groupKey && (UI_NOT_A_VALUE.test(candidateValue) || ciExactContains(keptValues, candidateValue) || keptValues.push(candidateValue));
                }
                if (!(keptValues.length < 2)) {
                    values = keptValues;
                    for (var keptSelected = [], ks = 0; ks < (selected || []).length; ks++) ciExactContains(values, selected[ks]) && keptSelected.push(selected[ks]);
                    selected = keptSelected, DOM_OPTIONS[label.toLowerCase()] = (options || []).slice();
                    for (var g = 0; g < out.variantGroups.length; g++) if (out.variantGroups[g].name.toLowerCase() === label.toLowerCase()) return;
                    if (!(out.variantGroups.length >= 4)) {
                        var publishedValues = values.slice(0, 20), publishedOptions = [];
                        if (options && options.length) for (var po = 0; po < options.length && publishedOptions.length < 20; po++) {
                            var option = options[po];
                            if (option && option.value) {
                                for (var known = !1, pv = 0; pv < publishedValues.length; pv++) if (publishedValues[pv].toLowerCase() === String(option.value).toLowerCase()) {
                                    known = !0;
                                    break;
                                }
                                if (known) {
                                    var optionPrice = option.price ? cut(option.price, 60) : null, optionState = !0 === option.available || !1 !== option.available && null, optionStock = "number" == typeof option.stock && option.stock > 0 && option.stock <= 999 ? option.stock : null, optionImage = option.image && /^https?:\/\//i.test(String(option.image)) ? cut(option.image, 600) : null, optionGoodsId = option.goodsId && /^\d{5,16}$/.test(String(option.goodsId)) ? String(option.goodsId) : null, optionSkuId = option.skuId && /^\d{5,24}$/.test(String(option.skuId)) ? String(option.skuId) : null;
                                    if (null !== optionState || optionPrice || null !== optionStock || optionImage || optionGoodsId || optionSkuId) {
                                        var publishedItem = {
                                            value: cut(option.value, 60),
                                            available: optionState,
                                            price: optionPrice,
                                            priceFrom: !0 === option.priceFrom,
                                            stock: optionStock
                                        };
                                        optionImage && (publishedItem.image = optionImage), optionGoodsId && (publishedItem.goodsId = optionGoodsId),
                                        optionSkuId && (publishedItem.skuId = optionSkuId), publishedOptions.push(publishedItem);
                                    }
                                }
                            }
                        }
                        var groupEntry = {
                            name: label,
                            values: publishedValues,
                            selected: selected.slice(0, 20)
                        };
                        publishedOptions.length && (groupEntry.options = publishedOptions), out.variantGroups.push(groupEntry);
                        for (var q = 0; q < selected.length && out.selectedVariantTexts.length < 5; q++) pushUnique(out.selectedVariantTexts, selected[q], 5, 60);
                    }
                }
            }
        }
    }
    var matrixSeen = Object.create(null);
    var ambiguousMatrix = Object.create(null);
    var pushMatrixEntry = function (entry) {
      if (!entry || !entry.attributes || out.variantMatrix.length >= LIMITS.matrixEntries) return;
      var keys = [];
      for (var k in entry.attributes) {
        if (Object.prototype.hasOwnProperty.call(entry.attributes, k) && entry.attributes[k]) keys.push(k);
      }
      if (!keys.length) return;
      var sigParts = [];
      for (var si = 0; si < keys.length; si++) {
        sigParts.push(JSON.stringify([keys[si].toLowerCase(), String(entry.attributes[keys[si]]).toLowerCase()]));
      }
      var sig = JSON.stringify(sigParts.sort());
      var existingIdx = matrixSeen[sig];
      if (existingIdx !== undefined) {
        var prev = out.variantMatrix[existingIdx];
        // The same combination tied to conflicting merchant identities is ambiguous.
        // Never attach either product's price, availability, identity or image.
        if (ambiguousMatrix[sig] || (scopedOfferIds && prev.variantId && entry.variantId && prev.variantId !== entry.variantId)) {
          ambiguousMatrix[sig] = true;
          prev.price = null; prev.available = null; prev.stock = null;
          prev.variantId = null; prev.variantUrl = null; prev.image = null;
          prev.evidenceSource = null;
          return;
        }
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

    // Sources are trusted scripts built with the server; they only collect page facts.
    try { (${source})(); } catch (e) { return '{}'; }
    out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
    out.title = out.title || null;
    function byteCount(value) {
        try { return encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, 'x').length; }
        catch (e) { return 2 * value.length; }
    }
    try {
        var serialized = JSON.stringify(out);
        while (byteCount(serialized) > 56000) {
            if (!out.variantMatrix.length) return '{}';
            out.variantMatrix = out.variantMatrix.slice(0, Math.floor(0.7 * out.variantMatrix.length));
            serialized = JSON.stringify(out);
        }
        return serialized;
    } catch (e) { return '{}'; }
})();`;
}
