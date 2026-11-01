/** Dedicated Zalando reader. Derived from the legacy structured-only reader, with other merchant branches removed. ES5. */
export const ZALANDO_MOBILE_CAPTURE_SCRIPT = String.raw`(function() {
    var zalHost = String(location.hostname || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
    if (!/^(?:[a-z0-9-]+\.)*zalando\.(?:de|fr|it|es|nl|be|at)$/.test(zalHost)) return null;
    var GLOBAL_WIN = null;
    try {
        GLOBAL_WIN = "undefined" != typeof document && document && document.defaultView ? document.defaultView : "undefined" != typeof window ? window : null;
    } catch (e) {
        GLOBAL_WIN = null;
    }
    var READER_PROFILE = {
        storeId: "zalando",
        version: 2,
        priceMode: "structured_only"
    }, out = {
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
    var CURRENCY_HINT = /[$\u20ac\u00a3\u00a5\u20ba]|(?:^|[^A-Za-z])(EUR|USD|GBP|JPY|TND|DT|MAD|AED|SAR|CAD|AUD|SGD|BRL|MXN|PLN|TRY|CHF|SEK)(?=$|[^A-Za-z])|\bd\.?t\b/i, HAS_DIGIT = /[0-9]/, host = "";
    try {
        host = String(location.hostname || "").toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, "");
    } catch (e) {
        host = "";
    }
    function scopeText(element) {
        if (!element) return "";
        var clone = null;
        try {
            clone = element.cloneNode(!0);
        } catch (e) {
            return text(element.textContent);
        }
        try {
            for (var struck = clone.querySelectorAll('del, s, strike, [class*="original" i], [class*="retail" i], [class*="crossed" i], [class*="line-through" i], [class*="strike" i], [class*="market" i], [class*="old-price" i], [class*="list-price" i], [class*="delprice" i], [class*="del-price" i], [class*="price-del" i], [class*="club-price" i], [class*="member-price" i], [class*="vip-price" i], [class*="installment" i], [class*="klarna" i], [class*="afterpay" i], [class*="clearpay" i], [class*="estimat" i], [class*="coupon" i], [class*="discount-label" i], [class*="price-discount" i], [class*="off-tag" i]'), i = 0; i < struck.length; i++) struck[i] && struck[i].parentNode && struck[i].parentNode.removeChild(struck[i]);
            for (var children = clone.querySelectorAll("span, div, em, b, strong, small, p"), c = 0; c < children.length; c++) {
                var childText = text(children[c].textContent);
                childText && /^[-+]?\s*\d{1,2}\s*%(?:\s*off)?$/i.test(childText) && children[c].parentNode && children[c].parentNode.removeChild(children[c]);
            }
        } catch (e) {}
        return text(clone.textContent);
    }
    var STRUCK_HINT = /original|retail|crossed|line-through|strike|market|old-price|list-price|delprice|del-price|price-del|club-price|member-price|vip-price|installment|klarna|afterpay|clearpay|estimat|coupon|discount-label|price-discount|off-tag/i;
    function struckNode(node) {
        for (var current = node, hop = 0; current && 1 === current.nodeType && hop < 4; hop++) {
            var tag = String(current.tagName || "").toLowerCase();
            if ("del" === tag || "s" === tag || "strike" === tag) return !0;
            if (STRUCK_HINT.test(String(current.className || ""))) return !0;
            current = current.parentNode;
        }
        return !1;
    }
    function amountCount(value) {
        var hits = String(value || "").match(/[0-9]+(?:[.,][0-9]{1,2})?/g);
        return hits ? hits.length : 0;
    }
    var GENERIC_LOGO_IMAGE = /(?:default[-_]?share|share[-_]?logo|site[-_]?logo|(?:^|[/_.-])(?:logo|s[-_]?logo|pwa[-_]?icon|app[-_]?icon|touch[-_]?icon|site[-_]?icon|manifest[-_]?icon|brand[-_]?mark)(?:[/_.-]|$)|favicon|apple[-_]?touch[-_]?icon|placeholder|blank\.gif|1x1)/i;
    function productImageUrl(rawUrl) {
        var u = text(rawUrl);
        return !u || /^data:/i.test(u) ? "" : (0 === u.indexOf("//") && (u = "https:" + u), 
        /^https?:\/\//i.test(u) ? GENERIC_LOGO_IMAGE.test(u) ? "" : cut(u, 600) : "");
    }
    function extractElementImageUrl(el) {
        if (!el) return "";
        var pickFirstSrcset = function(rawSet) {
            var s = text(rawSet);
            if (!s) return "";
            var firstEntry = text(s.split(",")[0] || "");
            return text(firstEntry.split(/\s+/)[0] || "");
        }, pickBgUrl = function(bgRaw) {
            var bg = String(bgRaw || "");
            if (!bg || bg.indexOf("url(") < 0) return "";
            var m = bg.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
            return m ? m[1] : "";
        };
        try {
            var imgEl = "IMG" === String(el.tagName || "").toUpperCase() ? el : el.querySelector ? el.querySelector("img") : null;
            if (imgEl && imgEl.getAttribute) for (var candidates = [ imgEl.getAttribute("data-before-crop-src"), imgEl.getAttribute("data-src"), imgEl.getAttribute("data-lazy"), imgEl.getAttribute("data-lazy-src"), imgEl.getAttribute("data-original"), imgEl.currentSrc, imgEl.getAttribute("src"), pickFirstSrcset(imgEl.getAttribute("data-srcset")), pickFirstSrcset(imgEl.getAttribute("srcset")) ], ci = 0; ci < candidates.length; ci++) {
                var normalized = productImageUrl(candidates[ci]);
                if (normalized) return normalized;
            }
            if (el.querySelector) {
                var sourceEl = el.querySelector("picture source[srcset], source[data-srcset]");
                if (sourceEl && sourceEl.getAttribute) {
                    var fromSource = productImageUrl(pickFirstSrcset(sourceEl.getAttribute("data-srcset") || sourceEl.getAttribute("srcset")));
                    if (fromSource) return fromSource;
                }
            }
            var nodesForBg = [ el ];
            if (el.querySelectorAll) for (var bgChildren = el.querySelectorAll('[style*="background"], [class*="img" i], [class*="swatch" i], span, i'), bc = 0; bc < bgChildren.length && nodesForBg.length < 6; bc++) nodesForBg.push(bgChildren[bc]);
            for (var bi = 0; bi < nodesForBg.length; bi++) {
                var bn = nodesForBg[bi];
                if (bn) {
                    var bgUrl = productImageUrl(pickBgUrl(bn.style && bn.style.backgroundImage || bn.getAttribute && bn.getAttribute("style") || ""));
                    if (bgUrl) return bgUrl;
                    if (GLOBAL_WIN && "function" == typeof GLOBAL_WIN.getComputedStyle && 1 === bn.nodeType) {
                        var compBg = GLOBAL_WIN.getComputedStyle(bn), compUrl = productImageUrl(pickBgUrl(compBg && compBg.backgroundImage));
                        if (compUrl) return compUrl;
                    }
                }
            }
        } catch (e) {}
        return "";
    }
    function isInNavigation(el) {
        for (var node = el, hops = 0; node && hops < 6; hops++) {
            var tag = String(node.tagName || "").toLowerCase();
            if ("header" === tag || "nav" === tag) return !0;
            if ("search" === (node.getAttribute && node.getAttribute("role"))) return !0;
            var id = String((node.id || "") + " " + (node.className || "")).toLowerCase();
            if (/navbar|nav-|search|department/.test(id)) return !0;
            node = node.parentNode;
        }
        return !1;
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
    var jsonLd = null;
    try {
        for (var blocks = document.querySelectorAll('script[type="application/ld+json"]'), b = 0; b < blocks.length; b++) {
            var raw = blocks[b].textContent || "";
            if (raw && !(raw.length > 4e5)) {
                var parsed = null;
                try {
                    parsed = JSON.parse(raw);
                } catch (e) {
                    continue;
                }
                jsonLd || (jsonLd = findProduct(parsed));
            }
        }
    } catch (e) {}
    function findProduct(node, depth) {
        if (depth = depth || 0, !node || depth > 6) return null;
        if ("[object Array]" === Object.prototype.toString.call(node)) {
            for (var i = 0; i < node.length; i++) {
                var found = findProduct(node[i], depth + 1);
                if (found) return found;
            }
            return null;
        }
        if ("object" != typeof node) return null;
        for (var type = node["@type"], types = "[object Array]" === Object.prototype.toString.call(type) ? type : [ type ], t = 0; t < types.length; t++) {
            var nodeType = String(types[t] || "").toLowerCase();
            if ("product" === nodeType || "productgroup" === nodeType) return node;
        }
        for (var keys = [ "@graph", "mainEntity", "itemListElement", "item" ], k = 0; k < keys.length; k++) if (node[keys[k]]) {
            var child = findProduct(node[keys[k]], depth + 1);
            if (child) return child;
        }
        return null;
    }
    function offerField(offer, names) {
        if (!offer) return "";
        for (var i = 0; i < names.length; i++) {
            var value = offer[names[i]];
            if (null != value) {
                if ("object" != typeof value) return String(value);
                if (void 0 !== value.value) return String(value.value);
                if (void 0 !== value.name) return String(value.name);
            }
        }
        return "";
    }
    var offer = function(product) {
        if (!product) return null;
        var offers = product.offers;
        if ("[object Array]" === Object.prototype.toString.call(offers)) return offers[0] || null;
        if (offers && "object" == typeof offers) return offers;
        for (var variants = "[object Array]" === Object.prototype.toString.call(product.hasVariant) ? product.hasVariant : product.hasVariant ? [ product.hasVariant ] : [], collected = [], amounts = [], v = 0; v < variants.length && v < 120 && collected.length < 30; v++) {
            var variant = variants[v];
            if (variant && "object" == typeof variant) for (var nested = "[object Array]" === Object.prototype.toString.call(variant.offers) ? variant.offers : variant.offers ? [ variant.offers ] : [], n = 0; n < nested.length && collected.length < 30; n++) {
                var nestedOffer = nested[n];
                if (nestedOffer && "object" == typeof nestedOffer && !/aggregateoffer/i.test(String(nestedOffer["@type"] || ""))) {
                    collected.push(nestedOffer);
                    var amount = String(void 0 === nestedOffer.price || null === nestedOffer.price ? "" : nestedOffer.price);
                    amount && amounts.indexOf(amount) < 0 && amounts.push(amount);
                }
            }
        }
        return collected.length && 1 === amounts.length ? collected[0] : null;
    }(jsonLd);
    try {
        if (jsonLd) {
            out.title = cut(jsonLd.name, 300) || out.title;
            var brand = jsonLd.brand;
            "[object Array]" === Object.prototype.toString.call(brand) && (brand = brand[0]), 
            brand && "object" == typeof brand && (brand = brand.name), out.brand = cut(brand, 120) || null;
            var images = jsonLd.image;
            "[object Array]" !== Object.prototype.toString.call(images) && (images = images ? [ images ] : []);
            for (var im = 0; im < images.length && out.images.length < 4; im++) (src = images[im]) && "object" == typeof src && (src = src.url || src.contentUrl), 
            src && /^https?:\/\//i.test(String(src)) && pushUnique(out.images, src, 4, 600);
        }
        if (offer) {
            var priceText = offerField(offer, [ "price", "lowPrice", "highPrice" ]), currencyText = offerField(offer, [ "priceCurrency", "currency" ]);
            priceText && HAS_DIGIT.test(priceText) && out.priceCandidates.push({
                text: cut(priceText + " " + currencyText, 300),
                source: "json_ld"
            }), currencyText && (out.currencyText = cut(currencyText, 60));
            var availability = offerField(offer, [ "availability", "inventoryLevel" ]);
            availability && (out.availabilityText = cut(availability, 300));
            var condition = offerField(offer, [ "itemCondition", "condition" ]);
            condition && (out.conditionText = cut(condition, 120));
        }
    } catch (e) {}
    try {
        var meta = function(selectors) {
            for (var i = 0; i < selectors.length; i++) {
                var el = document.querySelector(selectors[i]);
                if (el) {
                    var value = text(el.getAttribute("content"));
                    if (value) return value;
                }
            }
            return "";
        }, metaPrice = meta([ 'meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]' ]), metaCurrency = meta([ 'meta[property="product:price:currency"]', 'meta[property="og:price:currency"]', 'meta[itemprop="priceCurrency"]' ]);
        if (metaPrice && HAS_DIGIT.test(metaPrice) && out.priceCandidates.push({
            text: cut(metaPrice + " " + metaCurrency, 300),
            source: "meta"
        }), metaCurrency && !out.currencyText && (out.currencyText = cut(metaCurrency, 60)), 
        !out.title) {
            var ogTitle = cut(meta([ 'meta[property="og:title"]' ]), 300);
            ogTitle && (out.title = ogTitle);
        }
        var ogImage = meta([ 'meta[property="og:image"]', 'meta[name="twitter:image"]' ]);
        ogImage && /^\/\//.test(ogImage) && (ogImage = "https:" + ogImage), ogImage && /^https?:\/\//i.test(ogImage) && pushUnique(out.images, ogImage, 4, 600), 
        out.canonicalUrl = cut(meta([ 'meta[property="og:url"]' ]), 600) || null;
    } catch (e) {}
    try {
        var canonical = document.querySelector('link[rel="canonical"]');
        canonical && canonical.getAttribute("href") && (out.canonicalUrl = cut(canonical.getAttribute("href"), 600));
    } catch (e) {}
    try {
        var item = document.querySelector('[itemprop="price"]');
        if (item) {
            var itemPrice = text(item.getAttribute("content")) || text(item.textContent), itemCurrency = "", currencyEl = document.querySelector('[itemprop="priceCurrency"]');
            currencyEl && (itemCurrency = text(currencyEl.getAttribute("content")) || text(currencyEl.textContent)), 
            itemPrice && HAS_DIGIT.test(itemPrice) && out.priceCandidates.push({
                text: cut(itemPrice + " " + itemCurrency, 300),
                source: "microdata"
            }), itemCurrency && !out.currencyText && (out.currencyText = cut(itemCurrency, 60));
        }
        var availabilityEl = document.querySelector('[itemprop="availability"]');
        if (availabilityEl && !out.availabilityText) {
            var availabilityText = text(availabilityEl.getAttribute("href")) || text(availabilityEl.getAttribute("content")) || text(availabilityEl.textContent);
            availabilityText && (out.availabilityText = cut(availabilityText, 300));
        }
    } catch (e) {}
    try {
        if (READER_PROFILE && "named_containers" === READER_PROFILE.priceMode) {
            var scoped = function(scopes) {
                for (var readings = [], seenCompact = {}, s = 0; s < scopes.length; s++) {
                    var nodes = [];
                    try {
                        nodes = document.querySelectorAll(scopes[s]);
                    } catch (e) {
                        continue;
                    }
                    for (var n = 0; n < nodes.length && n < 4; n++) if (!struckNode(nodes[n])) {
                        var value = scopeText(nodes[n]);
                        if (value && !(value.length > 80) && HAS_DIGIT.test(value) && CURRENCY_HINT.test(value) && 1 === amountCount(value)) {
                            var compact = value.replace(/\s+/g, "").toLowerCase();
                            seenCompact[compact] || (seenCompact[compact] = !0, readings.push(value));
                        }
                    }
                    if (readings.length > 4) break;
                }
                return readings;
            }([ ".product-intro__head-price", '[class*="product-intro" i] [class*="price" i]', '[class*="goods-detail" i] [class*="price" i]', '[data-testid*="product-price" i]', '[data-testid*="price" i]' ]);
            1 === scoped.length ? out.priceCandidates.push({
                text: cut(scoped[0], 300),
                source: "dom"
            }) : scoped.length > 1 ? diag("price:ambiguous_scope") : diag("price:no_named_container");
        } else if (READER_PROFILE && "structured_only" === READER_PROFILE.priceMode) out.priceCandidates.length || diag("price:structured_only_no_candidate"); else {
            function isInPostAddModal(node) {
                for (var cur = node, depth = 0; cur && 1 === cur.nodeType && depth < 14; ) {
                    var role = text(cur.getAttribute && cur.getAttribute("role")).toLowerCase(), ariaModal = text(cur.getAttribute && cur.getAttribute("aria-modal")).toLowerCase(), tag = (cur.tagName || "").toUpperCase(), cls = (("string" == typeof cur.className ? cur.className : "") + " " + (cur.getAttribute && cur.getAttribute("data-testid") || "")).toLowerCase();
                    if ("DIALOG" === tag || "dialog" === role || "alertdialog" === role || "true" === ariaModal || /(?:minicart|mini-cart|cart-drawer|bag-drawer|added-to-bag|added-to-cart|add-to-bag-modal|atc-modal|post-add)/i.test(cls)) {
                        var bodyTxt = cut(text(cur.textContent), 900);
                        if (/(?:added\s+(?:to|for)\s+(?:bag|cart|basket|ship|pickup)|item\s+added\s+to\s+(?:bag|cart)|view\s+(?:bag|cart|basket)\b|ajout[eé]\s+au\s+panier|voir\s+(?:le\s+|mon\s+)?panier|تمت\s+إضافة|عرض\s+السلة)/i.test(bodyTxt)) return !0;
                    }
                    cur = cur.parentElement, depth++;
                }
                return !1;
            }
            for (var selectors = [ "#corePriceDisplay_desktop_feature_div .a-offscreen", "#corePrice_feature_div .a-offscreen", "#price_inside_buybox", "#priceblock_ourprice, #priceblock_dealprice", ".a-price .a-offscreen", '[data-testid*="price" i]', "[data-price]", ".product-price, .price-value, .price__value, .product__price, .price-current", '[class*="price" i] [class*="offscreen" i]' ], taken = 0, s = 0; s < selectors.length && taken < 2; s++) {
                var nodes = [];
                try {
                    nodes = document.querySelectorAll(selectors[s]);
                } catch (e) {
                    continue;
                }
                for (var n = 0; n < nodes.length && taken < 2; n++) {
                    var el, value;
                    isInPostAddModal(el = nodes[n]) || (value = text(el.getAttribute && el.getAttribute("data-price")) || text(el.textContent)) && HAS_DIGIT.test(value) && CURRENCY_HINT.test(value) && (value.length > 300 || (out.priceCandidates.push({
                        text: cut(value, 300),
                        source: "dom"
                    }), taken++));
                }
            }
        }
    } catch (e) {}
    try {
        for (var ADD_TEXT = /add\s*to\s*(cart|basket|bag|my\s*picks|picks|bundle)|buy\s*now|in\s*(?:den\s*warenkorb|die\s*einkaufstasche)|zu\s*meiner\s*auswahl|ajouter(?:\s+(?:au\s+)?(?:panier|sac|lot)|\s+[àa]\s+(?:(?:ma|mes)\s+s[ée]lections?|mes\s+choix)|\s+le\s+produit)?|acheter|aggiungi(?:\s+(?:al\s+carrello|alla\s+borsa|alla\s+mia\s+selezione))?|a(?:ñ|n)adir(?:\s+(?:a\s+la\s+|al\s+)?(?:cesta|carrito|bolsa)|\s+a\s+mi\s+selecci[óo]n)?|adicionar\s+(?:ao\s+carrinho|às?\s+minhas?\s+escolhas?)|أضف\s*(?:إلى\s*)?(?:السلة|العربة|الحقيبة|حقيبة\s*التسوق|مختاراتي|اختياراتي)|إضافة\s*إلى\s*(?:السلة|العربة|الحقيبة|مختاراتي|اختياراتي)|أضف\s*(?:للسلة|لمختاراتي|لاختياراتي)|اشترِ?\s*(?:الآن)?/i, NOT_ADD_TEXT = /wish\s*list|wishlist|favoris|favorites|liste\s+d'envies|merkliste|envies|add\s+to\s+routine/i, controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]'), i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
            for (var control = controls[i2], ctrlDialog = control, ctrlDepth = 0, skipPostAddCtrl = !1; ctrlDialog && 1 === ctrlDialog.nodeType && ctrlDepth < 14; ) {
                var cRole = text(ctrlDialog.getAttribute && ctrlDialog.getAttribute("role")).toLowerCase(), cAria = text(ctrlDialog.getAttribute && ctrlDialog.getAttribute("aria-modal")).toLowerCase(), cTag = (ctrlDialog.tagName || "").toUpperCase(), cCls = (("string" == typeof ctrlDialog.className ? ctrlDialog.className : "") + " " + (ctrlDialog.getAttribute && ctrlDialog.getAttribute("data-testid") || "")).toLowerCase();
                if ("DIALOG" === cTag || "dialog" === cRole || "alertdialog" === cRole || "true" === cAria || /(?:minicart|mini-cart|cart-drawer|bag-drawer|added-to-bag|added-to-cart|add-to-bag-modal|atc-modal|post-add)/i.test(cCls)) {
                    var cTxt = cut(text(ctrlDialog.textContent), 900);
                    if (/(?:added\s+(?:to|for)\s+(?:bag|cart|basket|ship|pickup)|item\s+added\s+to\s+(?:bag|cart)|view\s+(?:bag|cart|basket)\b|ajout[eé]\s+au\s+panier|voir\s+(?:le\s+|mon\s+)?panier|تمت\s+إضافة|عرض\s+السلة)/i.test(cTxt)) {
                        skipPostAddCtrl = !0;
                        break;
                    }
                }
                ctrlDialog = ctrlDialog.parentElement, ctrlDepth++;
            }
            if (!skipPostAddCtrl) {
                var label = text(control.value) || text(control.textContent) || text(control.getAttribute && control.getAttribute("aria-label"));
                if (label && ADD_TEXT.test(label) && !NOT_ADD_TEXT.test(label) && (label = text(label.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, "")))) {
                    var disabled = !0 === control.disabled || control.getAttribute && ("true" === control.getAttribute("aria-disabled") || null !== control.getAttribute("disabled"));
                    out.addToCartText = cut(label + (disabled ? " [disabled]" : ""), 300);
                }
            }
        }
    } catch (e) {}
    var NOT_A_CHOICE = /^(select|choose|choisir|sélectionner|please|اختر|--)|search|department|store name|catégorie|category/i, ACTION_NOT_A_VALUE = /^(?:add|ajouter|acheter|buy|commander|checkout|panier|cart|sac|bag|wishlist|favoris|partager|share|guide|voir|see|learn|en\s+savoir\s+plus|taille\s*(?:&|et|\+)\s*coupe|size\s*(?:&|and|\+)\s*fit|size\s*guide|guide\s*des\s*tailles)\b/i, BARE_DIMENSION_PLACEHOLDER = /^(?:taille|size|talla|taglia|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس|المقاس|قياس|couleur|colou?r|farbe|colore|لون|اللون)$/i, UI_PLACEHOLDER_INLINE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|مقاس)|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;
    try {
        for (var selected = document.querySelectorAll('select option:checked, [role="option"][aria-selected="true"], [aria-checked="true"]'), v = 0; v < selected.length && out.selectedVariantTexts.length < 5; v++) {
            var option = selected[v];
            if (!isInNavigation(option) && ("OPTION" !== String(option.tagName || "").toUpperCase() || !0 !== option.disabled || "" !== text(option.getAttribute && option.getAttribute("value")))) {
                var optionImg = option.querySelector && option.querySelector("img[alt]"), optionText = text(option.getAttribute && option.getAttribute("title")) || text(option.getAttribute && option.getAttribute("aria-label")) || text(optionImg && optionImg.getAttribute("alt")) || text(option.textContent);
                !optionText || optionText.length > 60 || NOT_A_CHOICE.test(optionText) || BARE_DIMENSION_PLACEHOLDER.test(optionText) || UI_PLACEHOLDER_INLINE.test(optionText) || ACTION_NOT_A_VALUE.test(optionText) || pushUnique(out.selectedVariantTexts, optionText, 5, 60);
            }
        }
        for (var swatchSelected = document.querySelectorAll('[class*="selected" i]'), w = 0; w < swatchSelected.length && out.selectedVariantTexts.length < 5; w++) {
            var swatch = swatchSelected[w];
            if (!isInNavigation(swatch)) {
                for (var context = swatch, inVariants = !1, hop = 0; context && hop < 5; hop++) {
                    var descriptor = String((context.id || "") + " " + (context.className || "")).toLowerCase();
                    if (/variation|variant|swatch|twister|option|taille|size|color|couleur/.test(descriptor)) {
                        inVariants = !0;
                        break;
                    }
                    context = context.parentNode;
                }
                if (inVariants) {
                    var swatchText = text(swatch.getAttribute && swatch.getAttribute("title")) || text(swatch.textContent) || text(swatch.getAttribute && swatch.getAttribute("aria-label"));
                    !swatchText || swatchText.length > 60 || NOT_A_CHOICE.test(swatchText) || pushUnique(out.selectedVariantTexts, swatchText, 5, 60);
                }
            }
        }
    } catch (e) {}
    try {
        for (var options = document.querySelectorAll('select option, [role="option"], [role="radio"]'), o = 0; o < options.length && out.variantTexts.length < 30; o++) if (!isInNavigation(options[o])) {
            var candidate = text(options[o].textContent) || text(options[o].getAttribute && options[o].getAttribute("aria-label"));
            !candidate || candidate.length > 60 || NOT_A_CHOICE.test(candidate) || pushUnique(out.variantTexts, candidate, 30, 60);
        }
    } catch (e) {}
    var NOT_A_VARIANT_GROUP = /^(sort|sort by|sortby|trier|tri|order by|orderby|quantit\w*|quantity|qty|nombre|view|view by|affichage|filter|filtre|page|pages|lang|langue|language|devise|currency|pays|country|region|région|per page|items per page|afficher)\b/i, UI_NOT_A_VALUE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|размер|مقاس)|(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e)\s*(?:&|et|\+)\s*(?:coupe|fit)|(?:size|taille|talla)\s*guide|guide\s+des\s+tailles|guía\s+de\s+tallas|gr(?:ö|oe)(?:ß|ss)entabelle|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|(?:todas\s+las\s+)?colores|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;
    function ciKey(value) {
        return text(String(null == value ? "" : value)).toLowerCase().replace(/[\u2018\u2019\u02bc\u0060]/g, "'").replace(/\s*[:*·•-]+\s*$/, "").replace(/\s+/g, " ");
    }
    function priceOnValue(node) {
        if (!node) return "";
        try {
            for (var priceNodes = node.querySelectorAll('[class*="price" i], [data-testid*="price" i], [itemprop="price"]'), pn = 0; pn < priceNodes.length && pn < 3; pn++) {
                var priceText = text(priceNodes[pn].getAttribute && priceNodes[pn].getAttribute("content")) || text(priceNodes[pn].textContent);
                if (priceText && HAS_DIGIT.test(priceText) && CURRENCY_HINT.test(priceText)) return cut(priceText, 60);
            }
        } catch (e) {}
        var raw = text(node.getAttribute && (node.getAttribute("aria-label") || node.getAttribute("title"))) || text(node.textContent);
        if (!raw || raw.length > 120) return "";
        var match = /([0-9][0-9\s.,\u00a0]*)\s*([$\u20ac\u00a3\u00a5]|\b(?:EUR|USD|GBP|TND|DT|MAD|AED|SAR)\b|\bd\.?t\b)/i.exec(raw);
        return match ? cut(match[0], 60) : "";
    }
    function labelWithoutPrice(label, price) {
        return label && price ? label.indexOf(price) < 0 ? label : text(label.replace(price, " ")) : label;
    }
    function isFromPrice(node) {
        var raw = text(node && node.textContent);
        return /\bfrom\b|\bà\s+partir\s+de\b|\bab\s|\bstart(?:ing)?\s+(?:at|from)\b/i.test(raw);
    }
    function valueAvailability(node) {
        if (!node) return null;
        if (!0 === node.disabled) return !1;
        if ("true" === (node.getAttribute && node.getAttribute("aria-disabled"))) return !1;
        var descriptor = String(node.className && String(node.className) || ""), dataState = node.getAttribute && (node.getAttribute("data-state") || node.getAttribute("data-availability")) || "";
        return !/disabled|unavailable|out[-_ ]?of[-_ ]?stock|sold[-_ ]?out|rupture|epuise/i.test(descriptor + " " + String(dataState)) && null;
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
    function isIndexValue(value) {
        return /^\d{1,3}$/.test(String(value));
    }
    function ldOfferOf(variant) {
        if (!variant || "object" != typeof variant) return null;
        for (var offers = variant.offers, list = "[object Array]" === Object.prototype.toString.call(offers) ? offers : offers ? [ offers ] : [], i = 0; i < list.length && i < 4; i++) {
            var offer = list[i];
            if (offer && "object" == typeof offer && !/aggregateoffer/i.test(String(offer["@type"] || ""))) return offer;
        }
        return null;
    }
    function ldAvailability(offer) {
        var raw = String(offerField(offer, [ "availability" ]) || "").toLowerCase();
        return raw ? !/outofstock|soldout|out_of_stock|discontinued/.test(raw) && (!!/instock|limitedavailability|onlineonly|instoreonly|backorder|preorder|madeorder/.test(raw) || null) : null;
    }
    function ldRows(product) {
        var rows = [];
        if (!product || "object" != typeof product) return rows;
        for (var variants = "[object Array]" === Object.prototype.toString.call(product.hasVariant) ? product.hasVariant : product.hasVariant ? [ product.hasVariant ] : [], v = 0; v < variants.length && v < 120; v++) {
            var variant = variants[v];
            if (variant && "object" == typeof variant) {
                var offer = ldOfferOf(variant), priceText = offer ? offerField(offer, [ "price", "lowPrice" ]) : "", currencyText = offer ? offerField(offer, [ "priceCurrency", "currency" ]) : "", stockNumber = offer ? Number(offerField(offer, [ "inventoryLevel" ])) : NaN, url = variant.url || variant["@id"] || offer && offer.url || "";
                url && "object" == typeof url && (url = url.url || url["@id"] || "");
                var vImg = "";
                "string" == typeof variant.image ? vImg = variant.image : "[object Array]" === Object.prototype.toString.call(variant.image) && variant.image[0] ? vImg = "string" == typeof variant.image[0] ? variant.image[0] : variant.image[0].url || variant.image[0].contentUrl || "" : variant.image && "object" == typeof variant.image && (vImg = variant.image.url || variant.image.contentUrl || "");
                var extraAttrs = {};
                if ("[object Array]" === Object.prototype.toString.call(variant.additionalProperty)) for (var ap = 0; ap < variant.additionalProperty.length && ap < 4; ap++) {
                    var prop = variant.additionalProperty[ap];
                    if (prop && "object" == typeof prop) {
                        var pName = cut(prop.name || prop.propertyID || "", 60), pVal = cut(prop.value || "", 60);
                        pName && pVal && (extraAttrs[pName] = pVal);
                    }
                }
                rows.push({
                    sku: cut(variant.sku || variant.mpn || variant.productID || "", 60),
                    size: cut(variant.size, 60),
                    color: cut(variant.color, 60),
                    extraAttrs: extraAttrs,
                    image: /^https?:\/\//i.test(String(vImg || "")) ? String(vImg).slice(0, 600) : "",
                    amount: priceText && HAS_DIGIT.test(priceText) ? cut(priceText, 40) : "",
                    currency: String(currencyText || "").trim().toUpperCase().slice(0, 8),
                    available: offer ? ldAvailability(offer) : null,
                    stock: isFinite(stockNumber) && stockNumber > 0 && stockNumber <= 999 ? Math.floor(stockNumber) : null,
                    url: String(url || "")
                });
            }
        }
        return rows;
    }
    function ldNormUrl(value) {
        var url = String(value || "").trim().toLowerCase();
        if (!url) return "";
        var mark = url.search(/[?#]/);
        return mark >= 0 && (url = url.slice(0, mark)), "/" === url.slice(-1) && (url = url.slice(0, -1)), 
        url;
    }
    function ldPageHref() {
        try {
            return ldNormUrl(location.href);
        } catch (e) {
            return "";
        }
    }
    function ldConsensus(rows) {
        var fact = {
            available: null,
            price: null,
            currency: "",
            stock: null,
            conflict: !1
        };
        if (!rows || !rows.length) return fact;
        for (var amounts = [], currencies = [], states = [], stocks = [], i = 0; i < rows.length; i++) {
            var row = rows[i];
            row.amount && pushUnique(amounts, row.amount, 8, 40), row.amount && row.currency && pushUnique(currencies, row.currency, 4, 8), 
            !0 !== row.available && !1 !== row.available || states.push(row.available), "number" == typeof row.stock && row.stock > 0 && stocks.push(row.stock);
        }
        if (1 === currencies.length && (fact.currency = currencies[0]), 1 === amounts.length ? fact.price = amounts[0] + (1 === currencies.length ? " " + currencies[0] : "") : amounts.length > 1 && (fact.conflict = !0), 
        states.length) {
            for (var allTrue = !0, allFalse = !0, s = 0; s < states.length; s++) !0 !== states[s] && (allTrue = !1), 
            !1 !== states[s] && (allFalse = !1);
            fact.available = !!allTrue || !allFalse && null, allTrue || allFalse || (fact.conflict = !0);
        }
        if (stocks.length) {
            for (var lowest = stocks[0], k = 1; k < stocks.length; k++) stocks[k] < lowest && (lowest = stocks[k]);
            fact.stock = lowest;
        }
        return fact.conflict && (fact.price = null, fact.stock = null), fact;
    }
    function ldColorsMany(rows) {
        for (var colors = [], i = 0; i < rows.length; i++) rows[i].color && pushUnique(colors, rows[i].color, 12, 60);
        return colors.length > 1;
    }
    function ldScopedRows(product) {
        var rows = ldRows(product), pageColor = function(rows) {
            try {
                for (var g = 0; g < out.variantGroups.length; g++) {
                    var groupName = String(out.variantGroups[g].name || "");
                    if (/colour|color|couleur|farbe|colore|kleur|لون/i.test(groupName)) {
                        var chosen = out.variantGroups[g].selected || [];
                        if (chosen.length) return String(chosen[0]);
                    }
                }
            } catch (e) {}
            var href = ldPageHref();
            if (href) for (var r = 0; r < rows.length; r++) if (rows[r].color && ldNormUrl(rows[r].url) === href) return rows[r].color;
            var name = String(jsonLd && jsonLd.name || out.title || "").toLowerCase(), best = "";
            if (name) for (var i = 0; i < rows.length; i++) {
                var color = String(rows[i].color || "");
                color.length < 3 || name.indexOf(color.toLowerCase()) < 0 || color.length > best.length && (best = color);
            }
            return best;
        }(rows);
        if (!pageColor) return {
            rows: rows,
            withFacts: !ldColorsMany(rows)
        };
        for (var scoped = [], i = 0; i < rows.length; i++) {
            var color = String(rows[i].color || "");
            color && color.toLowerCase() !== pageColor.toLowerCase() || scoped.push(rows[i]);
        }
        return {
            rows: scoped.length ? scoped : rows,
            withFacts: !0
        };
    }
    var src, LD_GROUPS = [], LD_OPTIONS = {}, DOM_OPTIONS = {};
    function ldOptionsFor(name) {
        var key = String(name || "").toLowerCase(), rows = LD_OPTIONS[key];
        return !rows && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key) && (rows = LD_OPTIONS.taille), 
        !rows && /colour|color|couleur|farbe|colore|kleur|لون/i.test(key) && (rows = LD_OPTIONS.couleur), 
        "[object Array]" === Object.prototype.toString.call(rows) ? rows : [];
    }
    function mergeVariantOptions(domOptions, ldOptions) {
        var i, rows = "[object Array]" === Object.prototype.toString.call(domOptions) ? domOptions : [], published = "[object Array]" === Object.prototype.toString.call(ldOptions) ? ldOptions : [], out2 = [];
        for (i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row && row.value) {
                for (var extra = null, l = 0; l < published.length; l++) if (String(published[l].value).toLowerCase() === String(row.value).toLowerCase()) {
                    extra = published[l];
                    break;
                }
                var available = !(!1 === row.available || extra && !1 === extra.available) && (!(!extra || !0 !== extra.available) || !0 === row.available || null), price = extra && extra.price || row.price || null, stock = extra && "number" == typeof extra.stock && extra.stock > 0 ? extra.stock : "number" == typeof row.stock && row.stock > 0 ? row.stock : null, image = row.image || extra && extra.image || null, goodsId = row.goodsId || extra && extra.goodsId || null;
                if (null !== available || price || null !== stock || image || goodsId) {
                    var mergedItem = {
                        value: row.value,
                        available: available,
                        price: price,
                        priceFrom: extra && !0 === extra.priceFrom || !0 === row.priceFrom,
                        stock: stock
                    };
                    image && (mergedItem.image = image), goodsId && (mergedItem.goodsId = goodsId), 
                    out2.push(mergedItem);
                }
            }
        }
        return out2;
    }
    function ldGroupAlreadyCovered(name) {
        for (var key = String(name || "").toLowerCase(), size = /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key), color = /colour|color|couleur|farbe|colore|kleur|لون/i.test(key), gi = 0; gi < out.variantGroups.length; gi++) {
            var known = String(out.variantGroups[gi].name || "").toLowerCase();
            if (size && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(known)) return !0;
            if (color && /colour|color|couleur|farbe|colore|kleur|لون/i.test(known)) return !0;
        }
        return !1;
    }
    try {
        for (var selects = document.querySelectorAll("select"), sI = 0; sI < selects.length && out.variantGroups.length < 4; sI++) {
            var selectNode = selects[sI];
            if (selectNode && selectNode.options && !(selectNode.options.length < 2) && !isInNavigation(selectNode)) {
                var groupName = "";
                try {
                    if (selectNode.id) {
                        var forLabel = document.querySelector('label[for="' + String(selectNode.id).replace(/"/g, "") + '"]');
                        groupName = text(forLabel && forLabel.textContent);
                    }
                } catch (e) {}
                groupName || (groupName = text(selectNode.getAttribute && selectNode.getAttribute("aria-label"))), 
                groupName || (groupName = text(selectNode.getAttribute && selectNode.getAttribute("data-testid"))), 
                groupName || (groupName = text(selectNode.getAttribute && selectNode.getAttribute("name")));
                for (var values = [], chosen = [], valueOptions = [], selectIsSize = /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(groupName), oi = 0; oi < selectNode.options.length && values.length < 20; oi++) {
                    var opt = selectNode.options[oi], optLabel = text(opt.textContent);
                    if (!(!optLabel || optLabel.length > 60 || NOT_A_CHOICE.test(optLabel) || BARE_DIMENSION_PLACEHOLDER.test(optLabel) || UI_NOT_A_VALUE.test(optLabel)) && !ACTION_NOT_A_VALUE.test(optLabel) && (selectIsSize || !isIndexValue(optLabel)) && !ciExactContains(values, optLabel)) {
                        var optRawVal = text(opt.getAttribute && opt.getAttribute("value"));
                        !0 === opt.disabled && "" === optRawVal || (values.push(optLabel), opt.selected && chosen.push(optLabel), 
                        valueOptions.push({
                            value: optLabel,
                            available: !0 !== opt.disabled && null,
                            price: priceOnValue(opt) || null,
                            priceFrom: isFromPrice(opt),
                            stock: null
                        }));
                    }
                }
                values.length > 1 && pushVariantGroup(groupName, values, chosen, valueOptions);
            }
        }
        for (var fieldsets = document.querySelectorAll("fieldset"), fi = 0; fi < fieldsets.length && out.variantGroups.length < 4; fi++) {
            var fieldset = fieldsets[fi];
            if (!isInNavigation(fieldset)) {
                var radios = fieldset.querySelectorAll('input[type="radio"]');
                if (radios && !(radios.length < 2)) {
                    var legend = fieldset.querySelector("legend"), fsName = text(legend && legend.textContent);
                    fsName || (fsName = text(radios[0].getAttribute && radios[0].getAttribute("name")));
                    for (var fsValues = [], fsChosen = [], fsOptions = [], ri = 0; ri < radios.length && fsValues.length < 20; ri++) {
                        var radio = radios[ri], radioLabel = "", radioScope = null;
                        try {
                            if (radio.id) {
                                var radioFor = document.querySelector('label[for="' + String(radio.id).replace(/"/g, "") + '"]');
                                radioLabel = text(radioFor && radioFor.textContent), radioScope = radioFor || null;
                            }
                        } catch (e) {}
                        radioLabel || (radioLabel = text(radio.getAttribute && radio.getAttribute("aria-label"))), 
                        radioScope || (radioScope = radio.parentNode || null), radioLabel || (radioLabel = text(radio.getAttribute && radio.getAttribute("value"))), 
                        !radioLabel || radioLabel.length > 60 || NOT_A_CHOICE.test(radioLabel) || (fsValues.push(radioLabel), 
                        radio.checked && fsChosen.push(radioLabel), fsOptions.push({
                            value: radioLabel,
                            available: !1 !== valueAvailability(radio) && !1 !== valueAvailability(radioScope) && null,
                            price: priceOnValue(radioScope) || priceOnValue(radio) || null,
                            priceFrom: isFromPrice(radioScope || radio),
                            stock: null
                        }));
                    }
                    fsValues.length > 1 && pushVariantGroup(fsName, fsValues, fsChosen, fsOptions);
                }
            }
        }
        try {
            for (var groupHosts = document.querySelectorAll('[role="radiogroup"], [class*="swatch" i], [class*="variant" i], [class*="color" i], [class*="colour" i], [class*="size" i], [class*="taille" i], [class*="couleur" i], [data-testid*="variant" i], [data-testid*="size" i], [data-testid*="color" i]'), acceptedGroupHosts = [], gh = 0; gh < groupHosts.length && out.variantGroups.length < 4 && gh < 12; gh++) if ((host = groupHosts[gh]) && !isInNavigation(host)) {
                for (var insideAcceptedHost = !1, agh = 0; agh < acceptedGroupHosts.length; agh++) if (acceptedGroupHosts[agh] && acceptedGroupHosts[agh].contains && acceptedGroupHosts[agh].contains(host)) {
                    insideAcceptedHost = !0;
                    break;
                }
                if (!insideAcceptedHost) {
                    var hostHeading = "";
                    try {
                        var headingEl = host.querySelector ? host.querySelector("h1,h2,h3,h4,h5,h6,legend") : null;
                        headingEl && !isInNavigation(headingEl) && (hostHeading = text(headingEl.textContent));
                    } catch (e) {
                        hostHeading = "";
                    }
                    var hostDescriptor = text(host.getAttribute && (host.getAttribute("aria-label") || host.getAttribute("data-testid"))) || text(String(host.id || "").replace(/[-_]+/g, " ")) || hostHeading || text(String(host.className || "").replace(/[-_]+/g, " "));
                    if (hostDescriptor && !(hostDescriptor.length > 60) && !NOT_A_CHOICE.test(hostDescriptor) && !NOT_A_VARIANT_GROUP.test(hostDescriptor)) {
                        var valueNodes = [];
                        try {
                            valueNodes = host.querySelectorAll('[role="radio"], [role="option"], button, li, label');
                        } catch (e) {
                            valueNodes = [];
                        }
                        for (var hostValues = [], hostChosen = [], hostOptions = [], vn = 0; vn < valueNodes.length && hostValues.length < 20 && vn < 40; vn++) {
                            var valueNode = valueNodes[vn];
                            if (!isInNavigation(valueNode)) {
                                var valueLabel = text(valueNode.getAttribute && valueNode.getAttribute("aria-label")) || text(valueNode.getAttribute && valueNode.getAttribute("title")) || text(valueNode.textContent);
                                if (!(!valueLabel || valueLabel.length > 40 || NOT_A_CHOICE.test(valueLabel) || ACTION_NOT_A_VALUE.test(valueLabel) || "submit" === ("BUTTON" === valueNode.tagName ? String(valueNode.getAttribute && valueNode.getAttribute("type") || "").toLowerCase() : ""))) {
                                    var isChoiceControl = !1;
                                    try {
                                        isChoiceControl = "INPUT" === valueNode.tagName || Boolean(valueNode.querySelector && valueNode.querySelector("input, select"));
                                    } catch (e) {
                                        isChoiceControl = !1;
                                    }
                                    if ((isChoiceControl || !isIndexValue(valueLabel)) && !ciExactContains(hostValues, valueLabel)) {
                                        var checked = String(valueNode.getAttribute && (valueNode.getAttribute("aria-checked") || valueNode.getAttribute("aria-selected")) || "").toLowerCase(), classText = String(valueNode.className || ""), inputChecked = !1;
                                        try {
                                            if ("INPUT" === valueNode.tagName) inputChecked = !0 === valueNode.checked; else if (valueNode.querySelector) {
                                                var checkedInput = valueNode.querySelector("input:checked");
                                                inputChecked = !(!checkedInput || !0 !== checkedInput.checked);
                                            }
                                        } catch (e) {
                                            inputChecked = !1;
                                        }
                                        var isChosen = "true" === checked || /(^|\s)(selected|active|checked|is-selected)(\s|$)/i.test(classText) || inputChecked, valuePrice = priceOnValue(valueNode), cleanLabel = labelWithoutPrice(valueLabel, valuePrice) || valueLabel;
                                        ciExactContains(hostValues, cleanLabel) || (hostValues.push(cleanLabel), isChosen && hostChosen.push(cleanLabel), 
                                        hostOptions.push({
                                            value: cleanLabel,
                                            available: valueAvailability(valueNode),
                                            price: valuePrice || null,
                                            priceFrom: isFromPrice(valueNode),
                                            stock: null
                                        }));
                                    }
                                }
                            }
                        }
                        if (hostValues.length > 1) {
                            var groupsBefore = out.variantGroups.length;
                            pushVariantGroup(hostDescriptor, hostValues, hostChosen, hostOptions), out.variantGroups.length > groupsBefore && acceptedGroupHosts.push(host);
                        }
                    }
                }
            }
        } catch (e) {}
    } catch (e) {}
    try {
        !function() {
            if (jsonLd) try {
                var scoped = ldScopedRows(jsonLd);
                LD_GROUPS = function(rows, withFacts) {
                    for (var groups = [], dimensions = [ {
                        key: "size",
                        name: "Taille"
                    }, {
                        key: "color",
                        name: "Couleur"
                    } ], d = 0; d < dimensions.length; d++) {
                        for (var values = [], buckets = {}, r = 0; r < rows.length && values.length < 20; r++) {
                            var value = String(rows[r][dimensions[d].key] || "").trim();
                            if (value && !NOT_A_CHOICE.test(value) && !ACTION_NOT_A_VALUE.test(value)) {
                                var key = value.toLowerCase();
                                buckets[key] || (buckets[key] = [], values.push(value)), buckets[key].push(rows[r]);
                            }
                        }
                        for (var options = [], v = 0; withFacts && v < values.length; v++) {
                            var fact = ldConsensus(buckets[values[v].toLowerCase()] || []);
                            (null !== fact.available || fact.price || null !== fact.stock) && options.push({
                                value: values[v],
                                available: fact.available,
                                price: fact.price,
                                priceFrom: !1,
                                stock: fact.stock
                            });
                        }
                        values.length > 1 && groups.push({
                            name: dimensions[d].name,
                            values: values,
                            selected: [],
                            options: options
                        });
                    }
                    return groups;
                }(scoped.rows, scoped.withFacts), LD_OPTIONS = {};
                for (var i = 0; i < LD_GROUPS.length; i++) LD_OPTIONS[LD_GROUPS[i].name.toLowerCase()] = LD_GROUPS[i].options;
            } catch (e) {
                LD_GROUPS = [], LD_OPTIONS = {};
            }
        }();
        for (var gm = 0; gm < out.variantGroups.length; gm++) {
            var groupKey = String(out.variantGroups[gm].name || "").toLowerCase(), mergedOptions = mergeVariantOptions(DOM_OPTIONS[groupKey] || out.variantGroups[gm].options || [], ldOptionsFor(out.variantGroups[gm].name));
            mergedOptions.length && (out.variantGroups[gm].options = mergedOptions);
        }
        try {
            var ldPriceRows = ldScopedRows(jsonLd);
            if (ldPriceRows.withFacts && ldPriceRows.rows.length) {
                var ldFact = ldConsensus(ldPriceRows.rows), ldPagePrice = ldFact.price;
                if (!ldPagePrice) {
                    for (var ldUnanimousAmts = [], ldUnanimousCurs = [], domSelectedSize = "", dsg = 0; dsg < out.variantGroups.length; dsg++) if (/size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat/i.test(String(out.variantGroups[dsg].name || "")) && out.variantGroups[dsg].selected && 1 === out.variantGroups[dsg].selected.length) {
                        domSelectedSize = String(out.variantGroups[dsg].selected[0]).toLowerCase();
                        break;
                    }
                    for (var lpr = 0; lpr < ldPriceRows.rows.length; lpr++) {
                        var prRow = ldPriceRows.rows[lpr];
                        domSelectedSize && prRow.size && String(prRow.size).toLowerCase() !== domSelectedSize || (prRow.amount && pushUnique(ldUnanimousAmts, prRow.amount, 4, 40), 
                        prRow.currency && pushUnique(ldUnanimousCurs, prRow.currency, 4, 8));
                    }
                    if (1 === ldUnanimousAmts.length) {
                        var resolvedCur = 1 === ldUnanimousCurs.length ? ldUnanimousCurs[0] : ldFact.currency;
                        ldPagePrice = ldUnanimousAmts[0] + (resolvedCur ? " " + resolvedCur : ""), !ldFact.currency && resolvedCur && (ldFact.currency = resolvedCur);
                    }
                }
                if (!out.images.length) for (var lpi = 0; lpi < ldPriceRows.rows.length && out.images.length < 4; lpi++) ldPriceRows.rows[lpi].image && pushUnique(out.images, ldPriceRows.rows[lpi].image, 4, 600);
                if (!out.currencyText && ldFact.currency && (out.currencyText = cut(ldFact.currency, 60)), 
                ldPagePrice) {
                    for (var priceKnown = !1, cp = 0; cp < out.priceCandidates.length; cp++) if (String(out.priceCandidates[cp].text || "").toLowerCase() === ldPagePrice.toLowerCase()) {
                        priceKnown = !0;
                        break;
                    }
                    priceKnown || out.priceCandidates.unshift({
                        text: cut(ldPagePrice, 300),
                        source: "json_ld"
                    });
                }
            }
        } catch (e) {}
        for (var ldp = 0; ldp < LD_GROUPS.length && out.variantGroups.length < 4; ldp++) ldGroupAlreadyCovered(LD_GROUPS[ldp].name) || pushVariantGroup(LD_GROUPS[ldp].name, LD_GROUPS[ldp].values, LD_GROUPS[ldp].selected, LD_GROUPS[ldp].options);
    } catch (e) {}
    if (!out.title) try {
        var docTitle = cut(document.title, 300);
        docTitle && (out.title = docTitle), out.title;
    } catch (e) {}
    try {
        images = document.querySelectorAll('img[src^="http"]');
        for (var g = 0; g < images.length && out.images.length < 4; g++) {
            var width = parseInt(images[g].getAttribute("width") || "0", 10);
            width && width < 200 || pushUnique(out.images, images[g].getAttribute("src"), 4, 600);
        }
    } catch (e) {}
    try {
        for (var matrixSeen = {}, matrixGroupNames = {
            color: null,
            size: null
        }, mgi = 0; mgi < out.variantGroups.length; mgi++) {
            var mgName = String(out.variantGroups[mgi].name || "");
            !matrixGroupNames.color && /colour|color|couleur|farbe|colore|cor|kleur|لون/i.test(mgName) ? matrixGroupNames.color = mgName : !matrixGroupNames.size && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(mgName) && (matrixGroupNames.size = mgName);
        }
        var pushMatrixEntry = function(entry) {
            if (entry && entry.attributes && !(out.variantMatrix.length >= 120)) {
                var keys = [];
                for (var k in entry.attributes) Object.prototype.hasOwnProperty.call(entry.attributes, k) && entry.attributes[k] && keys.push(k);
                if (keys.length) {
                    keys.sort();
                    for (var sigParts = [], si = 0; si < keys.length; si++) sigParts.push(keys[si].toLowerCase() + "=" + String(entry.attributes[keys[si]]).toLowerCase());
                    var sig = sigParts.join("|"), existingIdx = matrixSeen[sig];
                    if (void 0 !== existingIdx) {
                        var prev = out.variantMatrix[existingIdx];
                        return prev.price || !entry.price || entry.priceFrom || (prev.price = cut(entry.price, 60), 
                        prev.priceFrom = !1, entry.evidenceSource && (prev.evidenceSource = entry.evidenceSource)), 
                        null === prev.available && null !== entry.available && void 0 !== entry.available && (prev.available = entry.available), 
                        !prev.stock && "number" == typeof entry.stock && entry.stock > 0 && (prev.stock = entry.stock), 
                        !prev.image && entry.image && (prev.image = entry.image), !prev.variantUrl && entry.variantUrl && (prev.variantUrl = entry.variantUrl), 
                        !prev.variantId && entry.variantId && (prev.variantId = entry.variantId), void (prev.quantityTiers && prev.quantityTiers.length || !entry.quantityTiers || !entry.quantityTiers.length || (prev.quantityTiers = entry.quantityTiers));
                    }
                    matrixSeen[sig] = out.variantMatrix.length, out.variantMatrix.push({
                        variantId: entry.variantId ? cut(entry.variantId, 80) : null,
                        variantUrl: entry.variantUrl && /^https?:\/\//i.test(String(entry.variantUrl)) ? String(entry.variantUrl).slice(0, 600) : null,
                        attributes: entry.attributes,
                        price: entry.price && !entry.priceFrom ? cut(entry.price, 60) : null,
                        priceFrom: Boolean(entry.priceFrom),
                        available: !0 === entry.available || !1 !== entry.available && null,
                        stock: "number" == typeof entry.stock && entry.stock > 0 && entry.stock <= 999 ? Math.floor(entry.stock) : null,
                        image: entry.image && /^https?:\/\//i.test(String(entry.image)) ? String(entry.image).slice(0, 600) : null,
                        evidenceSource: entry.evidenceSource || null,
                        quantityTiers: entry.quantityTiers && entry.quantityTiers.length ? entry.quantityTiers : void 0
                    });
                }
            }
        }, matrixPageHost = "";
        try {
            matrixPageHost = String(location && location.hostname || "").toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, "");
        } catch (e) {
            matrixPageHost = "";
        }
        var IS_ZALANDO = /(?:^|\.)zalando\.[a-z.]{2,6}$/i.test(matrixPageHost);
        if (IS_ZALANDO && !matrixGroupNames.color && out.variantGroups.length < 4) try {
            for (var zalColorHosts = document.querySelectorAll('[data-testid*="color" i], [class*="color-picker" i], [class*="color_picker" i], [aria-label*="Couleur" i], [aria-label*="Color" i], [aria-label*="Farbe" i]'), zch = 0; zch < zalColorHosts.length && zch < 6; zch++) {
                var zHost = zalColorHosts[zch];
                if (zHost && !isInNavigation(zHost)) {
                    for (var zLinks = zHost.querySelectorAll('a[href*=".html"], button, [role="radio"]'), zValues = [], zSelected = [], zOptions = [], zPageHref = ldPageHref(), zli = 0; zli < zLinks.length && zValues.length < 20; zli++) {
                        var zEl = zLinks[zli], zImg = zEl.querySelector ? zEl.querySelector("img") : null, zLabel = text(zEl.getAttribute && (zEl.getAttribute("aria-label") || zEl.getAttribute("title"))) || text(zImg && zImg.getAttribute && (zImg.getAttribute("alt") || zImg.getAttribute("title")));
                        if (!(!(zLabel = zLabel.replace(/^(?:couleur|color|farbe)\s*[:\-]\s*/i, "").trim()) || zLabel.length > 60 || NOT_A_CHOICE.test(zLabel) || ACTION_NOT_A_VALUE.test(zLabel) || ciExactContains(zValues, zLabel))) {
                            var zHrefRaw = text(zEl.getAttribute && zEl.getAttribute("href")), zAbsUrl = "";
                            if (zHrefRaw) try {
                                zAbsUrl = new URL(zHrefRaw, location.href).href;
                            } catch (e) {
                                zAbsUrl = "";
                            }
                            var zChecked = String(zEl.getAttribute && (zEl.getAttribute("aria-current") || zEl.getAttribute("aria-checked") || zEl.getAttribute("aria-selected")) || "").toLowerCase(), zIsCurrent = "true" === zChecked || "page" === zChecked || zAbsUrl && zPageHref && ldNormUrl(zAbsUrl) === zPageHref, zThumb = extractElementImageUrl(zEl);
                            zValues.push(zLabel), zIsCurrent && !zSelected.length && zSelected.push(zLabel), 
                            zOptions.push({
                                value: zLabel,
                                available: null,
                                price: null,
                                priceFrom: !1,
                                stock: null,
                                image: /^https?:\/\//i.test(zThumb) ? zThumb.slice(0, 600) : null
                            });
                        }
                    }
                    if (zValues.length >= 2) {
                        pushVariantGroup("Couleur", zValues, zSelected, zOptions), matrixGroupNames.color = "Couleur";
                        break;
                    }
                }
            }
        } catch (e) {}
        var ldScopedCheck = ldScopedRows(jsonLd);
        if (ldScopedCheck.withFacts) {
            for (var allJsonLdRows = ldRows(jsonLd), colorGroupObj = null, cg = 0; cg < out.variantGroups.length; cg++) if (matrixGroupNames.color && out.variantGroups[cg].name === matrixGroupNames.color) {
                colorGroupObj = out.variantGroups[cg];
                break;
            }
            var allowedColors = null;
            if (colorGroupObj && colorGroupObj.values && colorGroupObj.values.length) {
                allowedColors = {};
                for (var aci = 0; aci < colorGroupObj.values.length; aci++) allowedColors[String(colorGroupObj.values[aci]).toLowerCase()] = colorGroupObj.values[aci];
            }
            for (var ldRowsForMatrix = colorGroupObj ? allJsonLdRows : ldScopedCheck.rows, lmr = 0; lmr < ldRowsForMatrix.length; lmr++) {
                var lRow = ldRowsForMatrix[lmr], mAttrs = {};
                if (colorGroupObj && lRow.color) {
                    var matchedColLabel = allowedColors ? allowedColors[lRow.color.toLowerCase()] : lRow.color;
                    if (!matchedColLabel) continue;
                    if (mAttrs[colorGroupObj.name] = matchedColLabel, lRow.image && colorGroupObj.options) for (var cgo = 0; cgo < colorGroupObj.options.length; cgo++) colorGroupObj.options[cgo].value.toLowerCase() !== matchedColLabel.toLowerCase() || colorGroupObj.options[cgo].image || (colorGroupObj.options[cgo].image = lRow.image);
                }
                if (lRow.size && (mAttrs[matrixGroupNames.size || "Taille"] = lRow.size), lRow.extraAttrs) for (var exk in lRow.extraAttrs) Object.prototype.hasOwnProperty.call(lRow.extraAttrs, exk) && lRow.extraAttrs[exk] && (mAttrs[exk] = lRow.extraAttrs[exk]);
                var resolvedUrl = "";
                if (lRow.url) try {
                    resolvedUrl = new URL(lRow.url, location.href).href;
                } catch (e) {
                    resolvedUrl = "";
                }
                var rowPrice = lRow.amount ? lRow.amount + (lRow.currency ? " " + lRow.currency : "") : null;
                pushMatrixEntry({
                    variantId: lRow.sku || null,
                    variantUrl: resolvedUrl || null,
                    attributes: mAttrs,
                    price: rowPrice,
                    priceFrom: !1,
                    available: lRow.available,
                    stock: lRow.stock,
                    image: lRow.image || null,
                    evidenceSource: "json_ld"
                });
            }
        }
        if (IS_ZALANDO) {
            var parseZalandoSimples = function(node, evSource, fallbackColor) {
                if (node && "object" == typeof node) {
                    var simples = node.simples || node.product && node.product.simples || node.data && node.data.product && node.data.product.simples || null;
                    if ("[object Array]" === Object.prototype.toString.call(simples)) for (var zCol = text(node.color && (node.color.label || node.color.name) || node.product && node.product.color && (node.product.color.label || node.product.color.name) || fallbackColor || ""), zs = 0; zs < simples.length && zs < 40; zs++) {
                        var sItem = simples[zs];
                        if (sItem && "object" == typeof sItem) {
                            var szName = text(sItem.size && (sItem.size.local || sItem.size.label || sItem.size) || sItem.sizeLabel || "");
                            if (szName) {
                                var sOffer = sItem.offer || ("[object Array]" === Object.prototype.toString.call(sItem.allOffers) ? sItem.allOffers[0] : null) || sItem, sPriceNode = sOffer && sOffer.price ? sOffer.price.promotional || sOffer.price.original || sOffer.price : null, sAmt = sPriceNode && void 0 !== sPriceNode.amount ? Number(sPriceNode.amount) : NaN, sFormatted = text(sPriceNode && (sPriceNode.formatted || sPriceNode.display) || ""), sCur = text(sPriceNode && sPriceNode.currency || out.currencyText || "").toUpperCase(), sPriceStr = "";
                                sFormatted && HAS_DIGIT.test(sFormatted) ? sPriceStr = CURRENCY_HINT.test(sFormatted) ? sFormatted : sCur ? sFormatted + " " + sCur : sFormatted : isFinite(sAmt) && sAmt > 0 && (sPriceStr = sAmt.toFixed(2) + (sCur ? " " + sCur : ""));
                                var stockStatus = String(sOffer && sOffer.stock && (sOffer.stock.status || sOffer.stock) || "").toUpperCase(), zAvail = "OUT_OF_STOCK" !== stockStatus && ("IN_STOCK" === stockStatus || "LOW_ON_STOCK" === stockStatus || null), zQty = sOffer && sOffer.stock && "number" == typeof sOffer.stock.quantity ? sOffer.stock.quantity : null, zAttrs = {};
                                matrixGroupNames.color && zCol && (zAttrs[matrixGroupNames.color] = zCol), zAttrs[matrixGroupNames.size || "Taille"] = szName, 
                                pushMatrixEntry({
                                    variantId: text(sItem.sku || ""),
                                    variantUrl: null,
                                    attributes: zAttrs,
                                    price: sPriceStr || null,
                                    priceFrom: !1,
                                    available: zAvail,
                                    stock: zQty,
                                    image: null,
                                    evidenceSource: evSource
                                });
                            }
                        }
                    }
                }
            };
            try {
                for (var zJsonScripts = document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__'), zjs = 0; zjs < zJsonScripts.length && zjs < 20; zjs++) {
                    var zRaw = zJsonScripts[zjs].textContent || "";
                    if (!(!zRaw || zRaw.length > 5e5 || zRaw.indexOf("simples") < 0)) {
                        var zParsed = null;
                        try {
                            zParsed = JSON.parse(zRaw);
                        } catch (e) {
                            zParsed = null;
                        }
                        zParsed && parseZalandoSimples(zParsed, "embedded_json", "");
                    }
                }
                var zNet = GLOBAL_WIN && GLOBAL_WIN.__aywebsNetPayloads;
                if ("[object Array]" === Object.prototype.toString.call(zNet)) for (var zni = 0; zni < zNet.length && zni < 25; zni++) zNet[zni] && zNet[zni].body && parseZalandoSimples(zNet[zni].body, "network_cache", "");
            } catch (e) {}
        }
    } catch (e) {}
    out.priceCandidates.length > 4 && (out.priceCandidates = out.priceCandidates.slice(0, 4)), 
    out.title || (out.title = null), out.capturedAt || (out.capturedAt = (new Date).toISOString());
    try {
        for (var serializedOut = JSON.stringify(out), byteCount = function(str) {
            try {
                return encodeURIComponent(str).replace(/%[0-9A-F]{2}/g, "x").length;
            } catch (e) {
                return 2 * str.length;
            }
        }; (out.variantMatrix && out.variantMatrix.length > 0 || out.aliexpress && out.aliexpress.skus && out.aliexpress.skus.length > 0) && (serializedOut.length > 56e3 || byteCount(serializedOut) > 56e3); ) out.variantMatrix && out.variantMatrix.length > 0 && (out.variantMatrix = out.variantMatrix.slice(0, Math.floor(.7 * out.variantMatrix.length))), 
        out.aliexpress && out.aliexpress.skus && out.aliexpress.skus.length > 0 && (out.aliexpress.skus = out.aliexpress.skus.slice(0, Math.floor(.7 * out.aliexpress.skus.length))), 
        serializedOut = JSON.stringify(out);
        return serializedOut;
    } catch (e) {
        return "{}";
    }
})();`;
