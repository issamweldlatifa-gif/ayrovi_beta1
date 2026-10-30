/**
 * Isolated Amazon mobile reader, derived from ecaff12 (26 October).
 * Non-Amazon branches removed; host guard and mobile fixes added.
 * This module owns the executable reader and does not import other stores.
 */
export const AMAZON_MOBILE_CAPTURE_SCRIPT = String.raw`(function () {
    var LIMITS = { priceCandidates: 4, variantTexts: 30, selectedTexts: 5, images: 4, label: 60, text: 300, variantGroups: 4, variantValues: 20 };
    var out = {
        v: 1, url: '', canonicalUrl: null, title: null, brand: null,
        priceCandidates: [], currencyText: null, availabilityText: null,
        addToCartText: null, conditionText: null, selectedVariantTexts: [], variantTexts: [], variantGroups: [],
        images: [], capturedAt: null, pageLang: null, amazon: null, reader: { id: 'amazon', version: 2 }, diagnostics: []
    };
    /* Diagnostic BORNÉ : code court (ex. « price:buybox_asin_mismatch »), jamais de texte de page. */
    function diag(code) { if (out.diagnostics.length < 16)
        out.diagnostics.push(code); }
    function text(value) {
        if (value === null || value === undefined)
            return '';
        return String(value).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function cut(value, max) { return text(value).slice(0, max); }
    function pushUnique(list, value, max, size) {
        var v = cut(value, size);
        if (!v)
            return;
        for (var i = 0; i < list.length; i++) {
            if (list[i].toLowerCase() === v.toLowerCase())
                return;
        }
        if (list.length < max)
            list.push(v);
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
    try {
        host = String(location.hostname || '').toLowerCase().replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
    }
    catch (e) {
        host = '';
    }
    var IS_AMAZON = /^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
    if (!IS_AMAZON) return '{}';
    function hasSelector(selector) {
        try {
            return !!document.querySelector(selector);
        }
        catch (e) {
            return false;
        }
    }
    /* La coquille produit : une vraie fiche /dp en a toujours au moins un marqueur.
       Une page amazon.com qui n'en a aucun n'est pas une fiche produit (page de
       recherche, page de test) : elle garde le lecteur générique. */
    var AMAZON_STRICT = IS_AMAZON && (hasSelector('#dp-container') || hasSelector('#dp') || hasSelector('#ppd') || hasSelector('#centerCol')
        || hasSelector('#buybox') || hasSelector('#desktop_buybox') || hasSelector('#mobile_buybox') || hasSelector('#apex_desktop') || hasSelector('#apex_mobile')
        || hasSelector('#corePriceDisplay_desktop_feature_div') || hasSelector('#corePrice_desktop')
        || hasSelector('#corePrice_feature_div') || hasSelector('#corePrice_mobile_feature_div'));
    var AMAZON_ASIN = '';
    if (AMAZON_STRICT) {
        try {
            var asinMatch = String(location.pathname || '').match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
            if (asinMatch)
                AMAZON_ASIN = asinMatch[1].toUpperCase();
            if (!AMAZON_ASIN) {
                var canonicalLink = document.querySelector('link[rel="canonical"]');
                var canonicalHref = canonicalLink ? String(canonicalLink.getAttribute('href') || '') : '';
                var canonicalMatch = canonicalHref.match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
                if (canonicalMatch)
                    AMAZON_ASIN = canonicalMatch[1].toUpperCase();
            }
        }
        catch (e) { }
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
        }
        catch (e) {
            AMAZON_PRODUCT_ROOT = null;
        }
    }
    /** Requête bornée à la fiche quand elle existe ; document sinon. */
    function amazonRootQuery(selector) {
        var scope = AMAZON_PRODUCT_ROOT || document;
        try {
            return scope.querySelectorAll(selector);
        }
        catch (e) {
            return [];
        }
    }
    /** Un nœud appartient-il à la fiche ? (faux si une racine existe et l'exclut) */
    function amazonInsideProductRoot(node) {
        if (!AMAZON_PRODUCT_ROOT)
            return true;
        if (!node)
            return false;
        try {
            return AMAZON_PRODUCT_ROOT === node || AMAZON_PRODUCT_ROOT.contains(node);
        }
        catch (e) {
            return false;
        }
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
        if (/color|colour/.test(name))
            return 'color';
        if (/size|taille/.test(name))
            return 'size';
        if (/style|model/.test(name))
            return 'style';
        return name || fallback || 'option';
    }
    function amazonReadBalancedJson(source, start) {
        var first = source.charAt(start);
        if (first !== '{' && first !== '[')
            return null;
        var stack = [];
        var quote = '';
        var escaped = false;
        for (var i = start; i < source.length; i++) {
            var ch = source.charAt(i);
            if (quote) {
                if (escaped)
                    escaped = false;
                else if (ch === '\\')
                    escaped = true;
                else if (ch === quote)
                    quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }
            if (ch === '{' || ch === '[')
                stack.push(ch);
            else if (ch === '}' || ch === ']') {
                if (!stack.length)
                    return null;
                stack.pop();
                if (!stack.length) {
                    try {
                        return JSON.parse(source.slice(start, i + 1));
                    }
                    catch (e) {
                        return null;
                    }
                }
            }
        }
        return null;
    }
    function amazonReadJsonValue(source, key) {
        if (!source || source.indexOf(key) < 0)
            return null;
        var markers = ['"' + key + '"', "'" + key + "'", key];
        var searchFrom = 0;
        for (var attempt = 0; attempt < 24; attempt++) {
            var at = -1;
            var marker = '';
            for (var m = 0; m < markers.length; m++) {
                var found = source.indexOf(markers[m], searchFrom);
                if (found >= 0 && (at < 0 || found < at)) {
                    at = found;
                    marker = markers[m];
                }
            }
            if (at < 0)
                return null;
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
                if (joint === '\\' || joint === '"' || (/\s/.test(joint))) {
                    after++;
                    continue;
                }
                break;
            }
            var separator = source.charAt(after);
            if (separator === ':' || separator === '=') {
                after++;
                while (after < source.length && /\s/.test(source.charAt(after)))
                    after++;
                var parsed = amazonReadBalancedJson(source, after);
                if (parsed && typeof parsed === 'object')
                    return parsed;
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
        if (value)
            return value;
        if (!source || source.indexOf('\\"') < 0)
            return null;
        return amazonReadJsonValue(source.split('\\"').join('"'), key);
    }
    /* Un index (nombre, ou texte de chiffres dans une table d'index) n'est JAMAIS un nom d'option :
       il ne devient une valeur que s'il pointe vers une entrée texte de « variationValues » pour la
       MÊME dimension. Hors de cette table, il est écarté. */
    function amazonIndexedValue(variationValues, key, index) {
        if (!variationValues || typeof index !== 'number' || index % 1 !== 0 || index < 0)
            return '';
        var list = variationValues[key];
        if (Object.prototype.toString.call(list) !== '[object Array]' || index >= list.length)
            return '';
        return typeof list[index] === 'string' ? text(list[index]) : '';
    }
    function amazonValueFrom(value, key, variationValues, indexSource) {
        var isIndex = typeof value === 'number' || (indexSource && typeof value === 'string' && /^\d+$/.test(value));
        if (isIndex)
            return amazonIndexedValue(variationValues, key, Number(value));
        return typeof value === 'string' ? text(value) : '';
    }
    function amazonNormalizeDimensions(raw, dimensionKeys, variationValues, indexSource) {
        var dimensions = [];
        if (Object.prototype.toString.call(raw) === '[object Array]') {
            for (var i = 0; i < raw.length && dimensions.length < AMAZON_EVIDENCE_LIMITS.dimensions; i++) {
                var rawKey = dimensionKeys[i] || ('dimension_' + (i + 1));
                var label = amazonValueFrom(raw[i], rawKey, variationValues, indexSource);
                if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label)
                    continue;
                dimensions.push({ name: amazonDimensionName(rawKey, 'dimension_' + (i + 1)), value: label });
            }
        }
        else if (raw && typeof raw === 'object') {
            for (var key in raw) {
                if (!Object.prototype.hasOwnProperty.call(raw, key) || dimensions.length >= AMAZON_EVIDENCE_LIMITS.dimensions)
                    continue;
                var objectLabel = amazonValueFrom(raw[key], key, variationValues, indexSource);
                if (!objectLabel || objectLabel.length > AMAZON_EVIDENCE_LIMITS.label)
                    continue;
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
        try {
            scripts = document.querySelectorAll('script:not([src])');
        }
        catch (e) {
            return dims;
        }
        for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts && !dims.length; s++) {
            /* Un script DANS la fiche seulement : les blocs « sponsorisés » en
               contiennent aussi, avec les valeurs d'un autre produit. */
            if (!amazonInsideProductRoot(scripts[s]))
                continue;
            var source = scripts[s].textContent || '';
            if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars)
                continue;
            if (source.indexOf('sortedDimValuesForAllDims') < 0)
                continue;
            var raw = amazonReadScriptJson(source, 'sortedDimValuesForAllDims');
            if (!raw || typeof raw !== 'object')
                continue;
            for (var key in raw) {
                if (!Object.prototype.hasOwnProperty.call(raw, key))
                    continue;
                if (dims.length >= AMAZON_EVIDENCE_LIMITS.dimensions)
                    break;
                var list = raw[key];
                if (Object.prototype.toString.call(list) !== '[object Array]' || !list.length)
                    continue;
                var values = [];
                for (var i = 0; i < list.length && values.length < 60; i++) {
                    var entry = list[i];
                    if (!entry || typeof entry !== 'object')
                        continue;
                    var label = text(entry.dimensionValueDisplayText || entry.dimensionValueDisplayName);
                    if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label)
                        continue;
                    if (NOT_A_CHOICE.test(label))
                        continue;
                    var state = text(entry.dimensionValueState).toLowerCase();
                    values.push({
                        label: label,
                        asin: amazonValidAsin(entry.defaultAsin),
                        state: state === 'selected' ? 'selected' : state === 'available' ? 'available' : state === 'unavailable' ? 'unavailable' : 'unknown'
                    });
                }
                if (!values.length)
                    continue;
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
        try {
            scripts = document.querySelectorAll('script:not([src])');
        }
        catch (e) {
            return null;
        }
        for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts && !labels; s++) {
            var source = scripts[s].textContent || '';
            if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars)
                continue;
            if (source.indexOf('variationDisplayLabels') < 0)
                continue;
            var raw = amazonReadScriptJson(source, 'variationDisplayLabels');
            if (raw && typeof raw === 'object')
                labels = raw;
        }
        return labels;
    }
    /* Prix affiché SUR LA CARTE du choix (pastille couleur) : un seul montant
       distinct, jamais un prix barré. NULL quand la carte n'en publie pas —
       on ne prend pas le prix de la fiche à sa place. */
    function amazonCardPrice(element) {
        var nodes = [];
        try {
            nodes = element.querySelectorAll('.a-price:not(.a-text-price)');
        }
        catch (e) {
            return '';
        }
        var seen = {};
        var distinct = 0;
        var value = '';
        for (var i = 0; i < nodes.length && i < 4; i++) {
            var reading = amazonPriceText(nodes[i]);
            if (!reading || !amazonPlausible(reading))
                continue;
            var digits = reading.replace(/[^0-9]/g, '');
            if (!digits || seen[digits])
                continue;
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
        if (!raw || raw.length > 300)
            return false;
        return /sold\s*out|out\s*of\s*stock|unavailable|not available|\u00e9puis|epuise|rupture|ausverkauft|agotado|esaurito|non disponible/i.test(raw);
    }
    /* Stock annoncé SUR LA CARTE (« Only 6 left in stock », « nur noch 3 auf
       Lager ») : nombre borné, ou rien. */
    function amazonCardStock(element) {
        var raw = text(element.textContent);
        if (!raw || raw.length > 400)
            return null;
        var match = /(?:only\s+)?(\d{1,3})\s+(?:left in stock|remaining|available)/i.exec(raw)
            || /(?:il ne reste plus que|plus que)\s*(\d{1,3})/i.exec(raw)
            || /(?:nur noch|noch)\s*(\d{1,3})\s*(?:auf lager|verf\u00fcgbar|verfuegbar)/i.exec(raw)
            || /(?:\u0628\u0642\u064a|\u0645\u062a\u0628\u0642\u064a)\s*(\d{1,3})/.exec(raw);
        if (!match)
            return null;
        var count = Number(match[1]);
        return count > 0 && count <= 999 ? count : null;
    }
    function collectAmazonEvidence() {
        var result = { readerVersion: 2, pageAsin: AMAZON_ASIN || null, selectedAsin: null, selectedValues: [], options: [], variants: [] };
        if (!AMAZON_STRICT)
            return result;
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
                if (!Object.prototype.hasOwnProperty.call(displayLabels, dl))
                    continue;
                if (dimensionKeys.length >= AMAZON_EVIDENCE_LIMITS.dimensions)
                    break;
                if (!/^(?:variation_)?[a-z][a-z0-9_-]*(?:_name)?$/i.test(dl))
                    continue;
                dimensionKeys.push(dl);
                dimensionNames.push(amazonDimensionName(dl, 'dimension_' + (dimensionKeys.length)));
            }
        }
        var scripts = [];
        try {
            scripts = document.querySelectorAll('script:not([src])');
        }
        catch (e) {
            scripts = [];
        }
        for (var s = 0; s < scripts.length && s < AMAZON_EVIDENCE_LIMITS.scripts; s++) {
            var source = scripts[s].textContent || '';
            if (!source || source.length > AMAZON_EVIDENCE_LIMITS.scriptChars)
                continue;
            /* « variationValues : {} » n'est PAS une table : une table VIDE ne doit ni
               arrêter la recherche, ni empêcher de nommer les dimensions autrement. */
            if (!variationValues) {
                var foundVariation = amazonReadScriptJson(source, 'variationValues');
                if (foundVariation && typeof foundVariation === 'object') {
                    for (var fk in foundVariation) {
                        if (!Object.prototype.hasOwnProperty.call(foundVariation, fk))
                            continue;
                        variationValues = foundVariation;
                        break;
                    }
                }
            }
            if (variationValues && !variationKeysFromTable) {
                var tableKeys = [];
                for (var dimensionKey in variationValues) {
                    if (!Object.prototype.hasOwnProperty.call(variationValues, dimensionKey))
                        continue;
                    if (tableKeys.length >= AMAZON_EVIDENCE_LIMITS.dimensions)
                        break;
                    tableKeys.push(dimensionKey);
                }
                /* La table de valeurs fait foi pour l'ORDRE des colonnes ; les noms
                   viennent d'elle, à défaut du twister déjà lu. */
                if (tableKeys.length) {
                    dimensionKeys = tableKeys;
                    variationKeysFromTable = true;
                    dimensionNames = [];
                    for (var tn = 0; tn < tableKeys.length; tn++)
                        dimensionNames.push(amazonDimensionName(tableKeys[tn], 'dimension_' + (tn + 1)));
                }
            }
            var displayMap = amazonReadScriptJson(source, 'dimensionValuesDisplayData');
            if (displayMap && typeof displayMap === 'object') {
                for (var displayAsin in displayMap) {
                    if (!Object.prototype.hasOwnProperty.call(displayMap, displayAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants)
                        continue;
                    var validDisplayAsin = amazonValidAsin(displayAsin);
                    var displayDimensions = amazonNormalizeDimensions(displayMap[displayAsin], dimensionKeys, variationValues, false);
                    if (validDisplayAsin && displayDimensions.length)
                        amazonMergeVariant(result, validDisplayAsin, displayDimensions, 'dimensionValuesDisplayData');
                }
            }
            var asinMap = amazonReadScriptJson(source, 'asinVariationValues');
            if (asinMap && typeof asinMap === 'object') {
                for (var mappedAsin in asinMap) {
                    if (!Object.prototype.hasOwnProperty.call(asinMap, mappedAsin) || result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants)
                        continue;
                    var validMappedAsin = amazonValidAsin(mappedAsin);
                    var mappedDimensions = amazonNormalizeDimensions(asinMap[mappedAsin], dimensionKeys, variationValues, true);
                    if (validMappedAsin && mappedDimensions.length)
                        amazonMergeVariant(result, validMappedAsin, mappedDimensions, 'asinVariationValues');
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
                if (!twisterChosen)
                    continue;
                pushUnique(result.selectedValues, twisterValue.label, 6, AMAZON_EVIDENCE_LIMITS.label);
                if (twisterValue.asin)
                    pushUnique(twisterSelectedAsins, twisterValue.asin, 10, 10);
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
                if (kn === kb || blocks[kn] === blocks[kb])
                    continue;
                if (blocks[kn].contains && blocks[kn].contains(blocks[kb])) {
                    nested = true;
                    break;
                }
            }
            if (!nested)
                keptBlocks.push(blocks[kb]);
        }
        blocks = keptBlocks;
        var selectedAsins = [];
        for (var b = 0; b < blocks.length && b < 20; b++) {
            var block = blocks[b];
            var blockId = String(block.id || '');
            var dimension = amazonDimensionName(blockId, 'option_' + (b + 1));
            if (blockId.indexOf('inline-twister-row-') === 0)
                dimension = amazonDimensionName(blockId.replace('inline-twister-row-', ''), 'option_' + (b + 1));
            var items = [];
            try {
                items = block.querySelectorAll('li, select option, [role="radio"], [role="option"], [data-asin]');
            }
            catch (e) {
                items = [];
            }
            for (var o = 0; o < items.length && result.options.length < AMAZON_EVIDENCE_LIMITS.options; o++) {
                var item = items[o];
                /* data-value purement numérique = index de swatch : jamais un nom d'option. */
                var dataValue = text(item.getAttribute && item.getAttribute('data-value'));
                if (/^\d+$/.test(dataValue))
                    dataValue = '';
                var label = text(dataValue || (item.getAttribute && (item.getAttribute('title') || item.getAttribute('aria-label'))));
                if (!label) {
                    try {
                        var imageLabel = item.querySelector('img[alt]');
                        label = text(imageLabel && imageLabel.getAttribute('alt'));
                    }
                    catch (e) { }
                }
                /* Le libellé d'une carte est écrit DANS un enfant (« a-button-text ») :
                   prendre tout le texte du <li> ramenait « X-Small $99.00 Sold out »
                   comme NOM de taille. */
                if (!label) {
                    try {
                        var labelNode = item.querySelector('.a-button-text, .swatch-title-text, .a-size-base, .a-color-base');
                        if (labelNode)
                            label = text(labelNode.textContent);
                    }
                    catch (e) { }
                }
                if (!label)
                    label = text(item.textContent);
                label = text(label.replace(/^click to select\s*/i, ''));
                if (!label || label.length > AMAZON_EVIDENCE_LIMITS.label || NOT_A_CHOICE.test(label))
                    continue;
                var optionAsin = amazonAsinFromNode(item);
                var selected = amazonNodeIsSelected(item);
                /* Ancien tracé : le swatch CHOISI porte data-dp-url vide = la fiche ouverte elle-même. */
                if (selected && !optionAsin && AMAZON_ASIN && item.hasAttribute && item.hasAttribute('data-dp-url'))
                    optionAsin = AMAZON_ASIN;
                var state = amazonNodeAvailability(item);
                var addedOption = amazonAddOption(result, dimension, label, optionAsin, selected, state, 'twister_dom');
                /* Prix et stock AFFICHÉS SUR LA CARTE de ce choix. Ce sont des faits de
                   la page, pas un devis : le serveur recalcule (et le prix d'une carte
                   n'est jamais présenté comme le total en dinars). */
                if (addedOption) {
                    var cardPrice = amazonCardPrice(item);
                    if (cardPrice && !addedOption.price)
                        addedOption.price = cut(cardPrice, LIMITS.text);
                    /* « 5 options from $56.32 » : c'est un prix d'ENTRÉE de gamme, pas le
                       prix de cette couleur. La feuille l'affiche comme « à partir de » et
                       ne le présente jamais comme le prix de l'article. */
                    if (cardPrice)
                        addedOption.priceFrom = isFromPrice(item);
                    var cardStock = amazonCardStock(item);
                    if (cardStock) {
                        if (!addedOption.stock)
                            addedOption.stock = cardStock;
                        /* Un NOMBRE de pièces annoncé sur la carte est une preuve POSITIVE :
                           la page dit combien elle en a. Ce n'est pas une déduction. */
                        if (addedOption.availabilityEvidence === 'unknown')
                            addedOption.availabilityEvidence = 'available';
                    }
                    /* « Sold out » écrit sur la carte, sans marqueur de classe : c'est un
                       fait de la page, pas une absence de donnée. */
                    if (addedOption.availabilityEvidence === 'unknown' && amazonCardOutOfStock(item)) {
                        addedOption.availabilityEvidence = 'unavailable';
                    }
                }
                if (selected && optionAsin)
                    pushUnique(selectedAsins, optionAsin, 10, 10);
            }
        }
        var selectedField = null;
        try {
            selectedField = document.querySelector('#ASIN, input[name="ASIN"]');
        }
        catch (e) { }
        var fieldAsin = amazonValidAsin(selectedField && (selectedField.value || selectedField.getAttribute('value')));
        if (fieldAsin)
            result.selectedAsin = fieldAsin;
        else if (twisterSelectedAsins.length === 1)
            result.selectedAsin = twisterSelectedAsins[0];
        else if (selectedAsins.length === 1)
            result.selectedAsin = selectedAsins[0];
        for (var v = 0; v < result.variants.length; v++) {
            result.variants[v].selected = !!result.selectedAsin && result.variants[v].asin === result.selectedAsin;
        }
        return result;
    }
    function amazonMergeVariant(result, asin, dimensions, source) {
        if (!asin || !dimensions || !dimensions.length)
            return;
        var variant = null;
        for (var i = 0; i < result.variants.length; i++) {
            if (result.variants[i].asin === asin) {
                variant = result.variants[i];
                break;
            }
        }
        if (!variant) {
            if (result.variants.length >= AMAZON_EVIDENCE_LIMITS.variants)
                return;
            variant = { asin: asin, dimensions: [], source: source, selected: false };
            result.variants.push(variant);
        }
        for (var d = 0; d < dimensions.length && variant.dimensions.length < AMAZON_EVIDENCE_LIMITS.dimensions; d++) {
            var candidate = dimensions[d];
            if (!candidate || !candidate.name || !candidate.value)
                continue;
            var duplicate = false;
            for (var x = 0; x < variant.dimensions.length; x++) {
                if (variant.dimensions[x].name === candidate.name && variant.dimensions[x].value.toLowerCase() === candidate.value.toLowerCase())
                    duplicate = true;
            }
            if (!duplicate)
                variant.dimensions.push({ name: cut(candidate.name, 40), value: cut(candidate.value, AMAZON_EVIDENCE_LIMITS.label) });
        }
    }
    function amazonAsinFromNode(element) {
        var node = element;
        for (var hop = 0; node && hop < 5; hop++) {
            /* Liste déroulante Amazon : value = « <index>,<ASIN> ». L'index n'est jamais un nom ; seul l'ASIN est lu. */
            if (String(node.tagName || '').toLowerCase() === 'option' && node.getAttribute) {
                var pair = /^\d+,([A-Z0-9]{10})$/i.exec(node.getAttribute('value') || '');
                if (pair) {
                    var fromPair = amazonValidAsin(pair[1]);
                    if (fromPair)
                        return fromPair;
                }
            }
            if (node.getAttribute) {
                var asin = amazonValidAsin(node.getAttribute('data-asin') || node.getAttribute('data-defaultasin') || node.getAttribute('asin'));
                if (asin)
                    return asin;
                /* Ancien tracé : data-dp-url="/dp/<ASIN>/…" désigne la variante de ce swatch. */
                var dpUrl = node.getAttribute('data-dp-url') || '';
                var dpMatch = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[\/?#]|$)/i.exec(dpUrl);
                if (dpMatch) {
                    var fromDp = amazonValidAsin(dpMatch[1]);
                    if (fromDp)
                        return fromDp;
                }
                /* Tracé des cartes de choix actuelles : data-csa-c-item-id="asin.<ASIN>". */
                var csaId = String(node.getAttribute('data-csa-c-item-id') || node.getAttribute('data-csa-c-asin') || '');
                if (csaId) {
                    var csaAsin = amazonValidAsin(csaId.replace(/^asin\./i, ''));
                    if (csaAsin)
                        return csaAsin;
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
            if (/swatchselect|a-button-selected|\bselected\b/.test(className))
                return true;
            if (node.getAttribute && (node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-selected') === 'true'))
                return true;
            if (String(node.tagName || '').toLowerCase() === 'option' && node.selected === true)
                return true;
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
                    if (node.querySelector('.swatchUnavailable, .dropdownUnavailable, .a-button-disabled, [aria-disabled="true"]'))
                        return 'unavailable';
                    if (node.querySelector('.swatchAvailable, .dropdownAvailable, [aria-disabled="false"]'))
                        return 'available';
                }
                catch (e) { }
            }
            var className = String(node.className || '').toLowerCase();
            if (/swatchunavailable|dropdownunavailable|a-button-disabled|unavailable|outofstock/.test(className)
                || node.disabled === true || (node.getAttribute && node.getAttribute('aria-disabled') === 'true'))
                return 'unavailable';
            if (/swatchavailable|dropdownavailable/.test(className) || (node.getAttribute && node.getAttribute('aria-disabled') === 'false'))
                return 'available';
            node = node.parentNode;
        }
        return 'unknown';
    }
    /* Formulaire d'achat (zone d'achat) désignant un AUTRE ASIN que celui de l'URL : la zone affiche
       le prix d'un autre article ⇒ aucun prix Amazon n'est publié. */
    function amazonBuyboxAsinMismatch() {
        if (!AMAZON_ASIN)
            return false;
        var fields = [];
        try {
            fields = document.querySelectorAll('input#ASIN, input[name="ASIN"]');
        }
        catch (e) {
            return false;
        }
        for (var i = 0; i < fields.length && i < 4; i++) {
            var inBuybox = false;
            for (var n = fields[i]; n && n.nodeType === 1; n = n.parentNode) {
                var nodeId = String(n.id || '');
                if (String(n.tagName || '').toUpperCase() === 'FORM' || /^(buybox|desktop_buybox|apex_desktop|corePrice_feature_div|corePriceDisplay_desktop_feature_div|addToCart)/.test(nodeId)) {
                    inBuybox = true;
                    break;
                }
            }
            if (!inBuybox)
                continue;
            var fieldValue = String(fields[i].value || fields[i].getAttribute('value') || '').toUpperCase();
            if (/^[A-Z0-9]{10}$/.test(fieldValue) && fieldValue !== AMAZON_ASIN)
                return true;
        }
        return false;
    }
    /* Retourne l'option (nouvelle, ou déjà connue) : l'appelant peut y attacher le
       prix et le stock lus sur la carte, même si la valeur venait des données du
       twister. NULL quand la borne d'options est atteinte. */
    function amazonAddOption(result, dimension, value, asin, selected, state, source) {
        var key = dimension + '|' + value.toLowerCase() + '|' + (asin || '');
        for (var i = 0; i < result.options.length; i++) {
            var existing = result.options[i];
            if ((existing.dimension + '|' + existing.value.toLowerCase() + '|' + (existing.asin || '')) === key) {
                if (selected && !existing.selected)
                    existing.selected = true;
                if (state !== 'unknown' && existing.availabilityEvidence === 'unknown')
                    existing.availabilityEvidence = state;
                return existing;
            }
        }
        var added = null;
        if (result.options.length < AMAZON_EVIDENCE_LIMITS.options) {
            added = { dimension: cut(dimension, 40), value: cut(value, AMAZON_EVIDENCE_LIMITS.label), asin: asin || null, selected: !!selected, availabilityEvidence: state, source: source };
            result.options.push(added);
        }
        if (asin)
            amazonMergeVariant(result, asin, [{ name: dimension, value: value }], source);
        return added;
    }
    /** Élément de navigation / recherche — jamais un choix produit ni un achat. */
    function isInNavigation(el) {
        var node = el;
        for (var hops = 0; node && hops < 6; hops++) {
            var tag = String(node.tagName || '').toLowerCase();
            if (tag === 'header' || tag === 'nav')
                return true;
            var role = node.getAttribute && node.getAttribute('role');
            if (role === 'search')
                return true;
            var id = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
            if (/navbar|nav-|search|department/.test(id))
                return true;
            node = node.parentNode;
        }
        return false;
    }
    /** Prix barré (ancien prix) : attribut data-a-strike, balise <s>/<del>/<strike>, ou line-through en style inline. */
    function isStruckNode(node) {
        var tag = String(node.tagName || '').toLowerCase();
        if (tag === 's' || tag === 'del' || tag === 'strike')
            return true;
        if (node.getAttribute && node.getAttribute('data-a-strike') !== null)
            return true;
        var style = node.style;
        if (style && /line-through/i.test(String(style.textDecoration || '') + ' ' + String(style.textDecorationLine || '')))
            return true;
        return false;
    }
    /** Contexte publicitaire / navigation / prix barré / caché — jamais un prix vendu. */
    function amazonBlocked(element) {
        if (!element)
            return true;
        if (isInNavigation(element))
            return true;
        var node = element;
        for (var hops = 0; node && hops < 10; hops++) {
            if (isStruckNode(node))
                return true;
            var descriptor = String((node.id || '') + ' ' + (node.className || '')).toLowerCase();
            if (/sponsored|sp-sponsored|carousel|nav-assist|similar|recommendation|adplace|a-text-price|deal-badge|apex_desktop_right/.test(descriptor))
                return true;
            /* Offres annexes de la zone d'achat. Constaté sur une fiche US récupérée le
               18/10/2026 (texte rendu, pas le DOM) : « Add a protection plan » avec
               2-Year Protection Plan $39.99 et Complete Protect $16.99/month, affiché
               dans la colonne d'achat. Ces prix ne sont pas le prix vendu : sans ce
               filtre, deux montants distincts font abstenir le lecteur sur une fiche saine. */
            if (/attach|protection|warranty|insurance|popover|a-modal|upsell|add-?on|cross-?sell/.test(descriptor))
                return true;
            /* Amazon garde une COPIE responsive du prix dans le DOM (desktop/mobile).
               Lire le seul style inline ne suffit pas : la copie peut être masquée par
               une règle CSS ou un media query. On interroge donc le style CALCULÉ —
               mesuré le 06/10/2026 : deux prix dans la même page, l'un invisible. */
            if (node.nodeType === 1 && node.getAttribute) {
                if (node.getAttribute('aria-hidden') === 'true')
                    return true;
                if (node.hasAttribute && node.hasAttribute('hidden'))
                    return true;
                var inlineStyle = String(node.getAttribute('style') || '');
                if (/display:\s*none|visibility:\s*(?:hidden|collapse)/i.test(inlineStyle))
                    return true;
                try {
                    var view = document.defaultView;
                    var computed = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(node) : null;
                    if (computed && (computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse'))
                        return true;
                }
                catch (e) { }
            }
            node = node.parentNode;
        }
        return false;
    }
    /** Nombre de MONTANTS distincts dans un texte (« $29.99 - $38.99 » ⇒ 2). */
    function amazonAmountCount(value) {
        var normalized = String(value || '').replace(/[\s\u00a0\u202f]+/g, '');
        var found = normalized.match(/\d+(?:[.,]\d{2})?/g);
        if (!found)
            return 0;
        var seen = {};
        var count = 0;
        for (var i = 0; i < found.length; i++) {
            var key = found[i].replace(/[.,]/g, '');
            if (!key || seen[key])
                continue;
            seen[key] = true;
            count++;
        }
        return count;
    }
    /** « À partir de », « from », « ab » : un prix de départ n'est pas un prix vendu. */
    function amazonFromPrice(element, value) {
        if (/\b(?:from|ab|a partir de|à partir de|desde|da)\b\s*$/i.test(String(value || '').trim().replace(/\s+/g, ' ')))
            return true;
        var node = element;
        for (var hop = 0; node && hop < 2; hop++) {
            var descriptor = String((node.className || '') + ' ' + (node.id || '')).toLowerCase();
            if (/price-range|pricerange|from-price|basisprice/.test(descriptor))
                return true;
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
            if (String(node.id || '') === 'apex-pricetopay-accessibility-label')
                return 'a11y_label';
            node = node.parentNode;
        }
        return 'dom';
    }
    /** Prix d'un élément Amazon : «.a-offscreen» s'il est rempli, sinon reconstruction
        à partir des spans (le cas MESURÉ : «.a-offscreen» vide dans le bloc). */
    function amazonPriceText(element) {
        if (!element)
            return '';
        var offscreen = '';
        try {
            var off = element.querySelector('.a-offscreen');
            offscreen = text(off && off.textContent);
        }
        catch (e) { }
        if (offscreen && HAS_DIGIT.test(offscreen)) {
            /* Le libellé caché peut contenir une remise (« $179.98 with 10 percent
               savings ») ou deux montants : on n'en garde un que s'il est UNIQUE. */
            var offscreenAmount = amazonSingleAmount(offscreen) || amazonAccessibilityAmount(offscreen);
            if (offscreenAmount)
                return offscreenAmount;
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
        }
        catch (e) { }
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
        if (!raw || !CURRENCY_HINT.test(raw))
            return '';
        var match = amazonFindAmount(raw);
        if (!match || !CURRENCY_HINT.test(match[0]))
            return '';
        var rest = raw.slice(0, match.index) + raw.slice(match.index + match[0].length);
        if (HAS_DIGIT.test(rest))
            return '';
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
        if (!raw || !CURRENCY_HINT.test(raw))
            return '';
        var plain = amazonSingleAmount(raw);
        if (plain)
            return plain;
        var match = amazonFindAmount(raw);
        if (!match || !CURRENCY_HINT.test(match[0]))
            return '';
        var prefix = raw.slice(0, match.index);
        var suffix = raw.slice(match.index + match[0].length);
        if (HAS_DIGIT.test(prefix))
            return '';
        if (!/^\s*(?:with\s+)?\d{1,3}(?:[.,]\d+)?\s*(?:%|percent)\s+(?:savings|off|discount)\s*$/i.test(suffix))
            return '';
        return text(match[0]);
    }
    /** Texte manifestement inutilisable : le MÊME motif écrit deux fois
        (« $6.99$6.99 », mesuré sur mobile le 06/10/2026). Le verdict complet
        (devise, bornes, séparateurs) reste celui du SERVEUR — ici on évite
        seulement d'envoyer une évidence déjà cassée. */
    function amazonPlausible(value) {
        var normalized = String(value || '').replace(/[\s\u00a0\u202f]+/g, '');
        if (!normalized)
            return false;
        if (/^(.{3,})\1$/.test(normalized))
            return false;
        return true;
    }
    /** Tous les produits publiés (JSON-LD) — mode Amazon : on choisit par ASIN. */
    function collectProducts(node, depth, list) {
        depth = depth || 0;
        if (!node || depth > 6 || list.length > 8)
            return;
        if (Object.prototype.toString.call(node) === '[object Array]') {
            for (var i = 0; i < node.length; i++)
                collectProducts(node[i], depth + 1, list);
            return;
        }
        if (typeof node !== 'object')
            return;
        var type = node['@type'];
        var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
        for (var t = 0; t < types.length; t++) {
            if (String(types[t] || '').toLowerCase() === 'product') {
                list.push(node);
                break;
            }
        }
        var keys = ['@graph', 'mainEntity', 'itemListElement', 'item'];
        for (var k = 0; k < keys.length; k++) {
            if (node[keys[k]])
                collectProducts(node[keys[k]], depth + 1, list);
        }
    }
    function amazonProductMatchesAsin(product) {
        if (!AMAZON_ASIN || !product)
            return false;
        var hay = [];
        var keys = ['sku', 'mpn', 'productID', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'asin', 'url', '@id'];
        for (var i = 0; i < keys.length; i++) {
            if (product[keys[i]])
                hay.push(String(product[keys[i]]));
        }
        var offers = product.offers;
        var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
        for (var o = 0; o < list.length; o++) {
            var offer = list[o];
            if (!offer || typeof offer !== 'object')
                continue;
            if (offer.sku)
                hay.push(String(offer.sku));
            if (offer.url)
                hay.push(String(offer.url));
            if (offer['@id'])
                hay.push(String(offer['@id']));
        }
        return hay.join(' ').toUpperCase().indexOf(AMAZON_ASIN) >= 0;
    }
    /** Produit JSON-LD : celui de l'ASIN de la page ; sinon l'unique produit publié.
        Plusieurs produits et aucun ne porte l'ASIN ⇒ on ne choisit PAS. */
    function amazonPickProduct(products) {
        if (!products || !products.length)
            return null;
        if (AMAZON_ASIN) {
            for (var i = 0; i < products.length; i++) {
                if (amazonProductMatchesAsin(products[i]))
                    return products[i];
            }
        }
        return products.length === 1 ? products[0] : null;
    }
    /** Offre exploitable : un «Offer» UNIQUE. «AggregateOffer» (plusieurs vendeurs,
        fourchette lowPrice/highPrice) et les tableaux de plusieurs offres sont
        REFUSÉS : ce n'est pas le prix de la zone d'achat. */
    function amazonOffer(product) {
        if (!product)
            return null;
        var offers = product.offers;
        var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
        var plain = [];
        for (var i = 0; i < list.length; i++) {
            var offer = list[i];
            if (!offer || typeof offer !== 'object')
                continue;
            var type = offer['@type'];
            var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
            var aggregate = false;
            for (var t = 0; t < types.length; t++) {
                if (/aggregateoffer/i.test(String(types[t] || '')))
                    aggregate = true;
            }
            if (aggregate)
                continue;
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
            try {
                el = document.querySelector(selectors[i]);
            }
            catch (e) {
                continue;
            }
            var value = text(el && el.textContent);
            if (value && value.length <= LIMITS.text)
                return value;
        }
        return '';
    }
    try {
        out.url = cut(location && location.href, 600);
    }
    catch (e) {
        out.url = '';
    }
    try {
        out.capturedAt = new Date().toISOString();
    }
    catch (e) {
        out.capturedAt = null;
    }
    try {
        out.pageLang = cut(document.documentElement && document.documentElement.getAttribute('lang'), 20) || null;
    }
    catch (e) { }
    /* ── 1. JSON-LD : la seule donnée MACHINE publiée par le marchand ───────── */
    var jsonLd = null;
    var jsonProducts = [];
    try {
        var blocks = document.querySelectorAll('script[type="application/ld+json"]');
        for (var b = 0; b < blocks.length; b++) {
            var raw = blocks[b].textContent || '';
            if (!raw || raw.length > 400000)
                continue;
            var parsed = null;
            try {
                parsed = JSON.parse(raw);
            }
            catch (e) {
                continue;
            }
            if (AMAZON_STRICT) {
                collectProducts(parsed, 0, jsonProducts);
                if (jsonProducts.length > 8)
                    break;
            }
            else if (!jsonLd) {
                jsonLd = findProduct(parsed);
            }
        }
    }
    catch (e) { }
    /* Amazon : le produit retenu est celui de l'ASIN affiché — pas « le premier
       produit de la page » (une fiche Amazon publie souvent le JSON-LD de plusieurs
       articles : accessoires, versions, publicités). */
    if (AMAZON_STRICT)
        jsonLd = amazonPickProduct(jsonProducts);
    function findProduct(node, depth) {
        depth = depth || 0;
        if (!node || depth > 6)
            return null;
        if (Object.prototype.toString.call(node) === '[object Array]') {
            for (var i = 0; i < node.length; i++) {
                var found = findProduct(node[i], depth + 1);
                if (found)
                    return found;
            }
            return null;
        }
        if (typeof node !== 'object')
            return null;
        var type = node['@type'];
        var types = Object.prototype.toString.call(type) === '[object Array]' ? type : [type];
        for (var t = 0; t < types.length; t++) {
            /* « ProductGroup » est un produit PUBLIÉ (Zalando, SHEIN, TEMU) : le refuser
               revenait à ne rien lire du tout sur ces fiches. */
            var nodeType = String(types[t] || '').toLowerCase();
            if (nodeType === 'product' || nodeType === 'productgroup')
                return node;
        }
        var keys = ['@graph', 'mainEntity', 'itemListElement', 'item'];
        for (var k = 0; k < keys.length; k++) {
            if (node[keys[k]]) {
                var child = findProduct(node[keys[k]], depth + 1);
                if (child)
                    return child;
            }
        }
        return null;
    }
    function firstOffer(product) {
        if (!product)
            return null;
        var offers = product.offers;
        if (Object.prototype.toString.call(offers) === '[object Array]')
            return offers[0] || null;
        if (offers && typeof offers === 'object')
            return offers;
        /* Groupe de variantes : le prix vit sur les VARIANTES («hasVariant[].offers«).
           On ne le prend que s'il désigne UN SEUL montant ; plusieurs prix différents
           ⇒ aucune offre (le serveur refusera la capture, ce qui est le but). */
        var variants = Object.prototype.toString.call(product.hasVariant) === '[object Array]'
            ? product.hasVariant : (product.hasVariant ? [product.hasVariant] : []);
        var collected = [];
        var amounts = [];
        for (var v = 0; v < variants.length && v < 120 && collected.length < 30; v++) {
            var variant = variants[v];
            if (!variant || typeof variant !== 'object')
                continue;
            var nested = Object.prototype.toString.call(variant.offers) === '[object Array]'
                ? variant.offers : (variant.offers ? [variant.offers] : []);
            for (var n = 0; n < nested.length && collected.length < 30; n++) {
                var nestedOffer = nested[n];
                if (!nestedOffer || typeof nestedOffer !== 'object')
                    continue;
                if (/aggregateoffer/i.test(String(nestedOffer['@type'] || '')))
                    continue;
                collected.push(nestedOffer);
                var amount = String(nestedOffer.price === undefined || nestedOffer.price === null ? '' : nestedOffer.price);
                if (amount && amounts.indexOf(amount) < 0)
                    amounts.push(amount);
            }
        }
        if (collected.length && amounts.length === 1)
            return collected[0];
        return null;
    }
    function offerField(offer, names) {
        if (!offer)
            return '';
        for (var i = 0; i < names.length; i++) {
            var value = offer[names[i]];
            if (value === undefined || value === null)
                continue;
            if (typeof value === 'object') {
                if (value.value !== undefined)
                    return String(value.value);
                if (value.name !== undefined)
                    return String(value.name);
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
            if (Object.prototype.toString.call(brand) === '[object Array]')
                brand = brand[0];
            if (brand && typeof brand === 'object')
                brand = brand.name;
            out.brand = cut(brand, 120) || null;
            var images = jsonLd.image;
            if (Object.prototype.toString.call(images) !== '[object Array]')
                images = images ? [images] : [];
            for (var im = 0; im < images.length && out.images.length < LIMITS.images; im++) {
                var src = images[im];
                if (src && typeof src === 'object')
                    src = src.url || src.contentUrl;
                if (src && /^https?:\/\//i.test(String(src)))
                    pushUnique(out.images, src, LIMITS.images, 600);
            }
        }
        if (offer) {
            var priceText = offerField(offer, ['price', 'lowPrice', 'highPrice']);
            var currencyText = offerField(offer, ['priceCurrency', 'currency']);
            if (priceText && HAS_DIGIT.test(priceText)) {
                out.priceCandidates.push({ text: cut(priceText + ' ' + currencyText, LIMITS.text), source: 'json_ld' });
            }
            if (currencyText)
                out.currencyText = cut(currencyText, LIMITS.label);
            var availability = offerField(offer, ['availability', 'inventoryLevel']);
            if (availability)
                out.availabilityText = cut(availability, LIMITS.text);
            var condition = offerField(offer, ['itemCondition', 'condition']);
            if (condition)
                out.conditionText = cut(condition, 120);
        }
    }
    catch (e) { }
    /* ── 2. Métat-données (Open Graph / product) — deuxième source ──────────── */
    try {
        var meta = function (selectors) {
            for (var i = 0; i < selectors.length; i++) {
                var el = document.querySelector(selectors[i]);
                if (el) {
                    var value = text(el.getAttribute('content'));
                    if (value)
                        return value;
                }
            }
            return '';
        };
        var metaPrice = meta(['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]']);
        var metaCurrency = meta(['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]', 'meta[itemprop="priceCurrency"]']);
        if (metaPrice && HAS_DIGIT.test(metaPrice)) {
            out.priceCandidates.push({ text: cut(metaPrice + ' ' + metaCurrency, LIMITS.text), source: 'meta' });
        }
        if (metaCurrency && !out.currencyText)
            out.currencyText = cut(metaCurrency, LIMITS.label);
        if (!out.title)
            out.title = cut(meta(['meta[property="og:title"]']), LIMITS.text) || null;
        var ogImage = meta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
        if (ogImage && /^https?:\/\//i.test(ogImage))
            pushUnique(out.images, ogImage, LIMITS.images, 600);
        out.canonicalUrl = cut(meta(['meta[property="og:url"]']), 600) || null;
    }
    catch (e) { }
    try {
        var canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && canonical.getAttribute('href'))
            out.canonicalUrl = cut(canonical.getAttribute('href'), 600);
    }
    catch (e) { }
    /* Amazon pointe parfois son canonical vers un AUTRE domaine Amazon : mesuré le
       06/10/2026, une fiche amazon.de publiait «https://www.amazon.com/clp/<ASIN>».
       Le crible serveur refuse toute capture dont le canonical change d'hôte — à
       raison (anti-usurpation). La fiche n'y perd rien : son identité est l'ASIN.
       On ne transmet donc un canonical que s'il désigne le MÊME hôte. */
    if (AMAZON_STRICT && out.canonicalUrl) {
        try {
            var canonicalHost = String(new URL(out.canonicalUrl, location.href).hostname || '').toLowerCase().replace(/^(?:www|smile)\./, '');
            if (canonicalHost !== host)
                out.canonicalUrl = null;
        }
        catch (e) {
            out.canonicalUrl = null;
        }
    }
    /* ── 3. Microdonnées (schema.org itemprop) ─────────────────────────────── */
    try {
        var item = document.querySelector('[itemprop="price"]');
        if (item) {
            var itemPrice = text(item.getAttribute('content')) || text(item.textContent);
            var itemCurrency = '';
            var currencyEl = document.querySelector('[itemprop="priceCurrency"]');
            if (currencyEl)
                itemCurrency = text(currencyEl.getAttribute('content')) || text(currencyEl.textContent);
            if (itemPrice && HAS_DIGIT.test(itemPrice)) {
                out.priceCandidates.push({ text: cut(itemPrice + ' ' + itemCurrency, LIMITS.text), source: 'microdata' });
            }
            if (itemCurrency && !out.currencyText)
                out.currencyText = cut(itemCurrency, LIMITS.label);
        }
        var availabilityEl = document.querySelector('[itemprop="availability"]');
        if (availabilityEl && !out.availabilityText) {
            var availabilityText = text(availabilityEl.getAttribute('href')) || text(availabilityEl.getAttribute('content')) || text(availabilityEl.textContent);
            if (availabilityText)
                out.availabilityText = cut(availabilityText, LIMITS.text);
        }
    }
    catch (e) { }
    /* Amazon publie sa disponibilité en clair dans «#availability» (« In Stock »,
       « Currently unavailable »…) : c'est un TEXTE BRUT, que le vocabulaire fermé
       du serveur traduit. Elle compte surtout quand le bouton d'achat est
       désactivé — cas où aucun libellé d'achat n'est envoyé (voir §6). */
    if (AMAZON_STRICT && !out.availabilityText) {
        try {
            var amazonAvailability = amazonAvailabilityText();
            if (amazonAvailability)
                out.availabilityText = cut(amazonAvailability, LIMITS.text);
        }
        catch (e) { }
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
                ['#apex_mobile .a-price[data-a-color="base"]', 1],
                ['#apex_mobile .priceToPay', 1],
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
                try {
                    nodes = document.querySelectorAll(selector);
                }
                catch (e) {
                    continue;
                }
                for (var n = 0; n < nodes.length && amazonReadings.length < 6; n++) {
                    var el = nodes[n];
                    if (amazonNodes.indexOf(el) >= 0)
                        continue;
                    if (amazonBlocked(el))
                        continue;
                    var elSource = amazonReadingSource(el);
                    /* L'étiquette d'accessibilité est une CHAÎNE écrite par la page : elle
                       peut contenir une remise. Elle n'est jamais publiée seule — sans un
                       prix VISIBLE dans la zone d'achat, il n'y a pas de prix (une étiquette
                       peut décrire un prix absent de l'écran). */
                    var value = elSource === 'a11y_label' ? amazonAccessibilityAmount(text(el.textContent)) : amazonPriceText(el);
                    if (!value || !HAS_DIGIT.test(value) || !CURRENCY_HINT.test(value))
                        continue;
                    if (value.length > LIMITS.text)
                        continue;
                    /* Le montant lu par le span peut encore être un texte collé
                       (« $6.99$6.99 ») : le verdict de la Phase 0 est SERVEUR, mais on
                       n'envoie pas un texte manifestement dupliqué. */
                    if (!amazonPlausible(value))
                        continue;
                    /* Une FOURCHETTE (« $29.99 - $38.99 ») ou un prix « à partir de » n'est
                       pas un prix : c'est l'aveu que la page ne vend pas encore CETTE
                       combinaison. On ne le publie jamais (le serveur le refuserait, à
                       raison) ; on le DIT au client pour qu'il aille lire la fiche du
                       choix. Mesuré sur les fiches à variantes (23/10/2026). */
                    if (amazonAmountCount(value) > 1) {
                        diag('price:range');
                        continue;
                    }
                    if (amazonFromPrice(el, value)) {
                        diag('price:from');
                        continue;
                    }
                    if (tier === 2) {
                        diag('price:annex_amount');
                        continue;
                    }
                    amazonNodes.push(el);
                    amazonReadings.push(value);
                    amazonSources.push(amazonReadingSource(el));
                }
            }
            var amazonDistinct = {};
            for (var d = 0; d < amazonReadings.length; d++) {
                var keyText = amazonReadings[d].replace(/[\s\u00a0\u202f]+/g, '');
                // The same mobile price can use comma in the label and dot in reconstructed spans.
                // Normalize a decimal separator only, never collapse a range or change currency.
                var decimalMatch = keyText.match(/^(\D*)(\d+)[.,](\d{2})(\D*)$/);
                if (decimalMatch) keyText = (decimalMatch[1] + decimalMatch[4]).toUpperCase() + ':' + decimalMatch[2] + '.' + decimalMatch[3];
                amazonDistinct[keyText] = true;
            }
            var amazonDistinctCount = 0;
            for (var key in amazonDistinct) {
                if (Object.prototype.hasOwnProperty.call(amazonDistinct, key))
                    amazonDistinctCount++;
            }
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
            if (buyboxMismatch)
                diag('price:buybox_asin_mismatch');
            /* Plusieurs montants distincts dans la zone d'achat : abstention, motif explicite pour le serveur. */
            if (amazonDistinctCount > 1)
                diag('price:ambiguous_buybox:' + amazonDistinctCount);
            var visibleReading = false;
            for (var vr = 0; vr < amazonSources.length; vr++) {
                if (amazonSources[vr] !== 'a11y_label') {
                    visibleReading = true;
                    break;
                }
            }
            if (!visibleReading) {
                if (amazonReadings.length)
                    diag('price:a11y_label_alone');
            }
            if (amazonDistinctCount === 1 && !buyboxMismatch && visibleReading) {
                var publishedFamilies = {};
                for (var fr = 0; fr < amazonReadings.length && out.priceCandidates.length < LIMITS.priceCandidates; fr++) {
                    var family = amazonSources[fr] || 'dom';
                    if (publishedFamilies[family])
                        continue;
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
                        if (!amzCode || amzCode.length > 600000 || amzCode.indexOf('displayPrice') < 0)
                            continue;
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
                        if (!amzKey)
                            continue;
                        if (!amzAmounts[amzKey]) {
                            amzAmounts[amzKey] = true;
                            amzAmountCount++;
                        }
                    }
                    if (amzAmountCount === 1) {
                        var amzValue = '';
                        for (var amzV = 0; amzV < amzDisplay.length && !amzValue; amzV++) {
                            var amzCandidate = text(amzDisplay[amzV]);
                            if (HAS_DIGIT.test(amzCandidate) && CURRENCY_HINT.test(amzCandidate) && amazonPlausible(amzCandidate))
                                amzValue = amzCandidate;
                        }
                        if (amzValue)
                            out.priceCandidates.push({ text: cut(amzValue, LIMITS.text), source: 'embedded_json' });
                    }
                }
                catch (e) { }
            }
        }
        else
            ;
    }
    catch (e) { }
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
        var ADD_TEXT = /add\s*to\s*(cart|basket|bag)|buy\s*now|in\s*den\s*warenkorb|ajouter(?:\s+(?:au\s+)?panier|\s+le\s+produit)?|acheter|aggiungi(?:\s+al\s+carrello)?|a(?:ñ|n)adir(?:\s+(?:a\s+la\s+)?(?:cesta|carrito))?|أضف\s*إلى\s*السلة|أضف\s*للسلة|اشترِ/i;
        var NOT_ADD_TEXT = /wish\s*list|wishlist|favoris|favorites|liste\s+d'envies|merkliste|envies/i;
        if (AMAZON_STRICT) {
            /* Correction du 07/10/2026 : un contrôle d'achat DÉSACTIVÉ ne publie RIEN.
               Son libellé dit « Add to Cart » — un texte qui, lu seul, prouverait un
               stock qui n'existe pas. L'état vient de «#availability» ou du JSON-LD,
               jamais d'un bouton qu'on ne peut pas utiliser. */
            var amazonControls = document.querySelectorAll('#add-to-cart-button, input[name="submit.add-to-cart"], #buy-now-button, #buybox button, #buybox input[type="submit"], #desktop_buybox button, #desktop_buybox input[type="submit"], button, input[type="submit"], input[type="button"]');
            for (var i3 = 0; i3 < amazonControls.length && !out.addToCartText; i3++) {
                var amazonControl = amazonControls[i3];
                if (isInNavigation(amazonControl))
                    continue;
                var amazonLabel = text(amazonControl.value) || text(amazonControl.textContent) || text(amazonControl.getAttribute && amazonControl.getAttribute('aria-label'));
                if (!amazonLabel || !ADD_TEXT.test(amazonLabel) || NOT_ADD_TEXT.test(amazonLabel))
                    continue;
                amazonLabel = text(amazonLabel.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
                if (!amazonLabel)
                    continue;
                var amazonDisabled = amazonControl.disabled === true
                    || (amazonControl.getAttribute && (amazonControl.getAttribute('aria-disabled') === 'true' || amazonControl.getAttribute('disabled') !== null));
                if (amazonDisabled)
                    continue;
                out.addToCartText = cut(amazonLabel, LIMITS.text);
            }
        }
        else {
            var controls = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [data-testid*="add-to-cart" i], [id*="add-to-cart" i]');
            for (var i2 = 0; i2 < controls.length && !out.addToCartText; i2++) {
                var control = controls[i2];
                var label = text(control.value) || text(control.textContent) || text(control.getAttribute && control.getAttribute('aria-label'));
                if (!label || !ADD_TEXT.test(label) || NOT_ADD_TEXT.test(label))
                    continue;
                /* « Add to basket shift + ALT + K » est un libellé d'accessibilité, pas un
                   bouton : le raccourci clavier est retiré, et un libellé qui n'est QUE
                   cela est écarté (mesuré le 06/10/2026 sur une page amazon.de rendue). */
                label = text(label.replace(/\s*(?:shift|alt|ctrl|cmd|⌘|press)[^a-z0-9]*[+][^]*$/i, ''));
                if (!label)
                    continue;
                var disabled = control.disabled === true
                    || (control.getAttribute && (control.getAttribute('aria-disabled') === 'true' || control.getAttribute('disabled') !== null));
                out.addToCartText = cut(label + (disabled ? ' [disabled]' : ''), LIMITS.text);
            }
        }
    }
    catch (e) { }
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
            if (isInNavigation(option))
                continue;
            /* Une CARTE de variante (li aria-checked) contient son prix et son stock :
               son texte entier n'est pas un libellé. L'image porte le nom. */
            var optionImg = option.querySelector && option.querySelector('img[alt]');
            var optionText = text(option.getAttribute && option.getAttribute('title'))
                || text(option.getAttribute && option.getAttribute('aria-label'))
                || text(optionImg && optionImg.getAttribute('alt'))
                || text(option.textContent);
            if (!optionText || optionText.length > LIMITS.label)
                continue;
            if (NOT_A_CHOICE.test(optionText))
                continue;
            pushUnique(out.selectedVariantTexts, optionText, LIMITS.selectedTexts, LIMITS.label);
        }
        /* Les pastilles de variante « déjà choisies » (couleur/taille) ne portent pas
           toujours aria-checked : on accepte la classe « selected », mais seulement
           à l'intérieur d'un conteneur qui parle de variante. */
        var swatchSelected = document.querySelectorAll('[class*="selected" i]');
        for (var w = 0; w < swatchSelected.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; w++) {
            var swatch = swatchSelected[w];
            if (isInNavigation(swatch))
                continue;
            var context = swatch;
            var inVariants = false;
            for (var hop = 0; context && hop < 5; hop++) {
                var descriptor = String((context.id || '') + ' ' + (context.className || '')).toLowerCase();
                if (/variation|variant|swatch|twister|option|taille|size|color|couleur/.test(descriptor)) {
                    inVariants = true;
                    break;
                }
                context = context.parentNode;
            }
            if (!inVariants)
                continue;
            var swatchText = text(swatch.getAttribute && swatch.getAttribute('title')) || text(swatch.textContent) || text(swatch.getAttribute && swatch.getAttribute('aria-label'));
            if (!swatchText || swatchText.length > LIMITS.label || NOT_A_CHOICE.test(swatchText))
                continue;
            pushUnique(out.selectedVariantTexts, swatchText, LIMITS.selectedTexts, LIMITS.label);
        }
    }
    catch (e) { }
    try {
        var options = document.querySelectorAll('select option, [role="option"], [role="radio"]');
        for (var o = 0; o < options.length && out.variantTexts.length < LIMITS.variantTexts; o++) {
            if (isInNavigation(options[o]))
                continue;
            var candidate = text(options[o].textContent) || text(options[o].getAttribute && options[o].getAttribute('aria-label'));
            if (!candidate || candidate.length > LIMITS.label)
                continue;
            if (NOT_A_CHOICE.test(candidate))
                continue;
            pushUnique(out.variantTexts, candidate, LIMITS.variantTexts, LIMITS.label);
        }
    }
    catch (e) { }
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
                if (isInNavigation(twisterBlock))
                    continue;
                var chosenNodes = twisterBlock.querySelectorAll('.selection, .a-button-selected img[alt], li.swatchSelect img[alt], li.swatchSelect[title]');
                for (var tc = 0; tc < chosenNodes.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; tc++) {
                    var chosenNode = chosenNodes[tc];
                    var chosenText = text(chosenNode.getAttribute && (chosenNode.getAttribute('alt') || chosenNode.getAttribute('title'))) || text(chosenNode.textContent);
                    chosenText = text(String(chosenText).replace(/^click to select\s*/i, ''));
                    if (!chosenText || chosenText.length > LIMITS.label || NOT_A_CHOICE.test(chosenText))
                        continue;
                    pushUnique(out.selectedVariantTexts, chosenText, LIMITS.selectedTexts, LIMITS.label);
                }
                var twisterOptions = twisterBlock.querySelectorAll('li img[alt], li[title], select option');
                for (var to = 0; to < twisterOptions.length && out.variantTexts.length < LIMITS.variantTexts; to++) {
                    var optionNode = twisterOptions[to];
                    var optionLabel = text(optionNode.getAttribute && (optionNode.getAttribute('alt') || optionNode.getAttribute('title'))) || text(optionNode.textContent);
                    optionLabel = text(String(optionLabel).replace(/^click to select\s*/i, ''));
                    if (!optionLabel || optionLabel.length > LIMITS.label || NOT_A_CHOICE.test(optionLabel))
                        continue;
                    pushUnique(out.variantTexts, optionLabel, LIMITS.variantTexts, LIMITS.label);
                }
            }
        }
        catch (e) { }
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
    /**
     * Prix écrit SUR une valeur (« 88,00 € », « 12,95 € TVA incluse »).
     *
     * On ne compose rien : on prend le texte de l'élément de prix s'il existe,
     * sinon la première séquence « nombre + devise » du libellé. Un texte sans
     * devise ou sans chiffre n'est pas un prix.
     */
    function priceOnValue(node) {
        if (!node)
            return '';
        try {
            var priceNodes = node.querySelectorAll('[class*="price" i], [data-testid*="price" i], [itemprop="price"]');
            for (var pn = 0; pn < priceNodes.length && pn < 3; pn++) {
                var priceText = text(priceNodes[pn].getAttribute && priceNodes[pn].getAttribute('content')) || text(priceNodes[pn].textContent);
                if (priceText && HAS_DIGIT.test(priceText) && CURRENCY_HINT.test(priceText))
                    return cut(priceText, LIMITS.label);
            }
        }
        catch (e) { }
        var raw = text(node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || text(node.textContent);
        if (!raw || raw.length > 120)
            return '';
        var match = /([0-9][0-9\s.,\u00a0]*)\s*([$\u20ac\u00a3\u00a5]|\b(?:EUR|USD|GBP|TND|DT|MAD|AED|SAR)\b|\bd\.?t\b)/i.exec(raw);
        return match ? cut(match[0], LIMITS.label) : '';
    }
    /* Le libellé d'une pastille contient souvent son prix (« 150 ml 12,95 € »).
       On retire le prix du libellé quand on le publie à part — sinon la feuille
       l'écrirait deux fois. */
    function labelWithoutPrice(label, price) {
        if (!label || !price)
            return label;
        if (label.indexOf(price) < 0)
            return label;
        return text(label.replace(price, ' '));
    }
    /* « à partir de 56,32 $ » : le prix n'est pas encore celui de la valeur. */
    function isFromPrice(node) {
        var raw = text(node && node.textContent);
        return /\bfrom\b|\bà\s+partir\s+de\b|\bab\s|\bstart(?:ing)?\s+(?:at|from)\b/i.test(raw);
    }
    /* État publié pour UNE valeur : false seulement si la page la désactive. */
    function valueAvailability(node) {
        if (!node)
            return null;
        if (node.disabled === true)
            return false;
        var ariaDisabled = node.getAttribute && node.getAttribute('aria-disabled');
        if (ariaDisabled === 'true')
            return false;
        var descriptor = String((node.className && String(node.className)) || '');
        var dataState = (node.getAttribute && (node.getAttribute('data-state') || node.getAttribute('data-availability'))) || '';
        if (/disabled|unavailable|out[-_ ]?of[-_ ]?stock|sold[-_ ]?out|rupture|epuise/i.test(descriptor + ' ' + String(dataState)))
            return false;
        return null;
    }
    /* Doublon EXACT (casse ignoree). Un test en sous-chaine (indexOf sur un
       join) supprimait a tort une valeur reelle : « S » etait jugee duplicate de
       « XS », donc une taille valide disparaissait de la feuille. */
    function ciExactContains(list, candidate) {
        var needle = String(candidate === null || candidate === undefined ? '' : candidate).toLowerCase();
        for (var ci = 0; ci < list.length; ci++) {
            if (String(list[ci]).toLowerCase() === needle)
                return true;
        }
        return false;
    }
    function pushVariantGroup(name, values, selected, options) {
        if (!name || !values.length)
            return;
        var label = cut(name, LIMITS.label);
        if (!label || NOT_A_CHOICE.test(label) || NOT_A_VARIANT_GROUP.test(label))
            return;
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
            if (out.variantGroups[g].name.toLowerCase() === label.toLowerCase())
                return;
        }
        if (out.variantGroups.length >= LIMITS.variantGroups)
            return;
        var publishedValues = values.slice(0, LIMITS.variantValues);
        var publishedOptions = [];
        if (options && options.length) {
            for (var po = 0; po < options.length && publishedOptions.length < LIMITS.variantValues; po++) {
                var option = options[po];
                if (!option || !option.value)
                    continue;
                var known = false;
                for (var pv = 0; pv < publishedValues.length; pv++) {
                    if (publishedValues[pv].toLowerCase() === String(option.value).toLowerCase()) {
                        known = true;
                        break;
                    }
                }
                if (!known)
                    continue;
                var optionPrice = option.price ? cut(option.price, LIMITS.label) : null;
                var optionState = option.available === true ? true : option.available === false ? false : null;
                var optionStock = typeof option.stock === 'number' && option.stock > 0 && option.stock <= 999 ? option.stock : null;
                /* Rien de publié pour cette valeur (ni état, ni prix, ni stock) = pas de
                   ligne. Un état « inconnu » n'est pas un fait : le publier encombrerait
                   la capture sans rien prouver. */
                if (optionState === null && !optionPrice && optionStock === null)
                    continue;
                publishedOptions.push({
                    value: cut(option.value, LIMITS.label),
                    available: optionState,
                    price: optionPrice,
                    priceFrom: option.priceFrom === true,
                    stock: optionStock,
                });
            }
        }
        var groupEntry = {
            name: label,
            values: publishedValues,
            selected: selected.slice(0, LIMITS.variantValues),
        };
        /* Absent quand la page ne publie rien de plus que les libellés : un tableau
           vide ferait croire à une lecture qui n'a rien trouvé. */
        if (publishedOptions.length)
            groupEntry.options = publishedOptions;
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
        if (!evidence || Object.prototype.toString.call(evidence.options) !== '[object Array]')
            return groups;
        for (var i = 0; i < evidence.options.length; i++) {
            var option = evidence.options[i];
            if (!option || !option.value)
                continue;
            var name = cut(option.dimension, LIMITS.label);
            if (!name || NOT_A_CHOICE.test(name) || NOT_A_VARIANT_GROUP.test(name))
                continue;
            var group = null;
            for (var g = 0; g < groups.length; g++) {
                if (groups[g].name.toLowerCase() === name.toLowerCase()) {
                    group = groups[g];
                    break;
                }
            }
            if (!group) {
                if (groups.length >= LIMITS.variantGroups)
                    continue;
                group = { name: name, values: [], selected: [], options: [] };
                groups.push(group);
            }
            var value = cut(option.value, LIMITS.label);
            if (!value || value.length > LIMITS.label)
                continue;
            if (!ciExactContains(group.values, value) && group.values.length < LIMITS.variantValues)
                group.values.push(value);
            if (option.selected && !ciExactContains(group.selected, value))
                group.selected.push(value);
            var state = option.availabilityEvidence === 'available' ? true
                : option.availabilityEvidence === 'unavailable' ? false : null;
            var price = option.price ? cut(option.price, LIMITS.label) : '';
            var stock = typeof option.stock === 'number' && option.stock > 0 && option.stock <= 999 ? option.stock : null;
            if (state === null && !price && stock === null)
                continue;
            var row = null;
            for (var r = 0; r < group.options.length; r++) {
                if (String(group.options[r].value).toLowerCase() === value.toLowerCase()) {
                    row = group.options[r];
                    break;
                }
            }
            if (!row) {
                if (group.options.length >= LIMITS.variantValues)
                    continue;
                row = { value: value, available: null, price: null, priceFrom: false, stock: null };
                group.options.push(row);
            }
            /* Le NÉGATIF gagne : une valeur déclarée indisponible le reste. */
            if (state === false)
                row.available = false;
            else if (state === true && row.available !== false)
                row.available = true;
            if (price) {
                if (!row.price)
                    row.price = price;
                else if (row.price !== price)
                    row.price = null;
            }
            if (option.priceFrom === true && row.price)
                row.priceFrom = true;
            if (stock !== null && (row.stock === null || stock < row.stock))
                row.stock = stock;
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
        if (!variant || typeof variant !== 'object')
            return null;
        var offers = variant.offers;
        var list = Object.prototype.toString.call(offers) === '[object Array]' ? offers : (offers ? [offers] : []);
        for (var i = 0; i < list.length && i < 4; i++) {
            var offer = list[i];
            if (!offer || typeof offer !== 'object')
                continue;
            if (/aggregateoffer/i.test(String(offer['@type'] || '')))
                continue;
            return offer;
        }
        return null;
    }
    /** "availability" schema.org ⇒ true (en stock) / false (épuisé) / null (rien). */
    function ldAvailability(offer) {
        var raw = String(offerField(offer, ['availability']) || '').toLowerCase();
        if (!raw)
            return null;
        if (/outofstock|soldout|out_of_stock|discontinued/.test(raw))
            return false;
        if (/instock|limitedavailability|onlineonly|instoreonly|backorder|preorder|madeorder/.test(raw))
            return true;
        return null;
    }
    /** Toutes les variantes publiées, TELLES QUELLES (aucun choix encore). */
    function ldRows(product) {
        var rows = [];
        if (!product || typeof product !== 'object')
            return rows;
        var variants = Object.prototype.toString.call(product.hasVariant) === '[object Array]'
            ? product.hasVariant : (product.hasVariant ? [product.hasVariant] : []);
        for (var v = 0; v < variants.length && v < 120; v++) {
            var variant = variants[v];
            if (!variant || typeof variant !== 'object')
                continue;
            var offer = ldOfferOf(variant);
            var priceText = offer ? offerField(offer, ['price', 'lowPrice']) : '';
            var currencyText = offer ? offerField(offer, ['priceCurrency', 'currency']) : '';
            var stockNumber = offer ? Number(offerField(offer, ['inventoryLevel'])) : NaN;
            var url = variant.url || variant['@id'] || (offer && offer.url) || '';
            if (url && typeof url === 'object')
                url = url.url || url['@id'] || '';
            rows.push({
                size: cut(variant.size, LIMITS.label),
                color: cut(variant.color, LIMITS.label),
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
        if (!url)
            return '';
        var mark = url.search(/[?#]/);
        if (mark >= 0)
            url = url.slice(0, mark);
        if (url.slice(-1) === '/')
            url = url.slice(0, -1);
        return url;
    }
    function ldPageHref() {
        try {
            return ldNormUrl(location.href);
        }
        catch (e) {
            return '';
        }
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
                if (!/colour|color|couleur|farbe|colore|kleur|لون/i.test(groupName))
                    continue;
                var chosen = out.variantGroups[g].selected || [];
                if (chosen.length)
                    return String(chosen[0]);
            }
        }
        catch (e) { }
        var href = ldPageHref();
        if (href) {
            for (var r = 0; r < rows.length; r++) {
                if (rows[r].color && ldNormUrl(rows[r].url) === href)
                    return rows[r].color;
            }
        }
        var name = String((jsonLd && jsonLd.name) || out.title || '').toLowerCase();
        var best = '';
        if (name) {
            for (var i = 0; i < rows.length; i++) {
                var color = String(rows[i].color || '');
                if (color.length < 3 || name.indexOf(color.toLowerCase()) < 0)
                    continue;
                if (color.length > best.length)
                    best = color;
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
        if (!rows || !rows.length)
            return fact;
        var amounts = [];
        var currencies = [];
        var states = [];
        var stocks = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.amount)
                pushUnique(amounts, row.amount, 8, 40);
            if (row.amount && row.currency)
                pushUnique(currencies, row.currency, 4, 8);
            if (row.available === true || row.available === false)
                states.push(row.available);
            if (typeof row.stock === 'number' && row.stock > 0)
                stocks.push(row.stock);
        }
        if (currencies.length === 1)
            fact.currency = currencies[0];
        if (amounts.length === 1)
            fact.price = amounts[0] + (currencies.length === 1 ? ' ' + currencies[0] : '');
        else if (amounts.length > 1)
            fact.conflict = true;
        if (states.length) {
            var allTrue = true;
            var allFalse = true;
            for (var s = 0; s < states.length; s++) {
                if (states[s] !== true)
                    allTrue = false;
                if (states[s] !== false)
                    allFalse = false;
            }
            fact.available = allTrue ? true : (allFalse ? false : null);
            if (!allTrue && !allFalse)
                fact.conflict = true;
        }
        if (stocks.length) {
            var lowest = stocks[0];
            for (var k = 1; k < stocks.length; k++)
                if (stocks[k] < lowest)
                    lowest = stocks[k];
            fact.stock = lowest;
        }
        if (fact.conflict) {
            fact.price = null;
            fact.stock = null;
        }
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
            if (rows[i].color)
                pushUnique(colors, rows[i].color, 12, 60);
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
                if (!value || NOT_A_CHOICE.test(value) || ACTION_NOT_A_VALUE.test(value))
                    continue;
                var key = value.toLowerCase();
                if (!buckets[key]) {
                    buckets[key] = [];
                    values.push(value);
                }
                buckets[key].push(rows[r]);
            }
            var options = [];
            for (var v = 0; withFacts && v < values.length; v++) {
                var fact = ldConsensus(buckets[values[v].toLowerCase()] || []);
                if (fact.available === null && !fact.price && fact.stock === null)
                    continue;
                options.push({ value: values[v], available: fact.available, price: fact.price, priceFrom: false, stock: fact.stock });
            }
            if (values.length > 1)
                groups.push({ name: dimensions[d].name, values: values, selected: [], options: options });
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
        if (!pageColor)
            return { rows: rows, withFacts: !ldColorsMany(rows) };
        var scoped = [];
        for (var i = 0; i < rows.length; i++) {
            var color = String(rows[i].color || '');
            if (color && color.toLowerCase() !== pageColor.toLowerCase())
                continue;
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
        if (!jsonLd || IS_AMAZON)
            return;
        try {
            var scoped = ldScopedRows(jsonLd);
            LD_GROUPS = groupsFromRows(scoped.rows, scoped.withFacts);
            LD_OPTIONS = {};
            for (var i = 0; i < LD_GROUPS.length; i++) {
                LD_OPTIONS[LD_GROUPS[i].name.toLowerCase()] = LD_GROUPS[i].options;
            }
        }
        catch (e) {
            LD_GROUPS = [];
            LD_OPTIONS = {};
        }
    }
    /** Options publiées pour cette valeur par le JSON-LD (jamais pour une autre). */
    function ldOptionsFor(name) {
        var key = String(name || '').toLowerCase();
        var rows = LD_OPTIONS[key];
        /* Le groupe DOM peut porter son nom dans la langue de la page (« Größe ») :
           on retombe alors sur la dimension, jamais sur un autre attribut. */
        if (!rows && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key))
            rows = LD_OPTIONS['taille'];
        if (!rows && /colour|color|couleur|farbe|colore|kleur|لون/i.test(key))
            rows = LD_OPTIONS['couleur'];
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
            if (!row || !row.value)
                continue;
            var extra = null;
            for (var l = 0; l < published.length; l++) {
                if (String(published[l].value).toLowerCase() === String(row.value).toLowerCase()) {
                    extra = published[l];
                    break;
                }
            }
            var available = row.available === false || (extra && extra.available === false)
                ? false
                : (extra && extra.available === true) ? true
                    : (row.available === true ? true : null);
            var price = (extra && extra.price) || row.price || null;
            var stock = (extra && typeof extra.stock === 'number' && extra.stock > 0) ? extra.stock
                : (typeof row.stock === 'number' && row.stock > 0 ? row.stock : null);
            if (available === null && !price && stock === null)
                continue;
            out2.push({
                value: row.value,
                available: available,
                price: price,
                priceFrom: (extra && extra.priceFrom === true) || row.priceFrom === true,
                stock: stock,
            });
        }
        return out2;
    }
    function ldGroupAlreadyCovered(name) {
        var key = String(name || '').toLowerCase();
        var size = /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(key);
        var color = /colour|color|couleur|farbe|colore|kleur|لون/i.test(key);
        for (var gi = 0; gi < out.variantGroups.length; gi++) {
            var known = String(out.variantGroups[gi].name || '').toLowerCase();
            if (size && /size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس/i.test(known))
                return true;
            if (color && /colour|color|couleur|farbe|colore|kleur|لون/i.test(known))
                return true;
        }
        return false;
    }
    ;
    /* ── 8. Titre de secours et images visibles ─────────────────────────────── */
    /* Amazon : le titre VISIBLE de la fiche (#productTitle) est lu en premier — c'est le produit de cette page. */
    if (IS_AMAZON) {
        try {
            var amazonTitleEl = document.querySelector('#productTitle, h1#title, #title_feature_div h1, [data-hook="product-title"]');
            var amazonTitle = amazonTitleEl ? cut(amazonTitleEl.textContent, LIMITS.text) : '';
            if (amazonTitle)
                out.title = amazonTitle;
        }
        catch (e) { }
    }
    if (!out.title) {
        try {
            out.title = cut(document.title, LIMITS.text) || null;
        }
        catch (e) { }
    }
    if (AMAZON_STRICT) {
        /* Images PRODUIT d'abord. Mesuré le 06/10/2026 : la lecture générique
           («img[src^=http]») rapportait les sprites de la barre de navigation — donc
           une vignette d'interface à la place de la photo de l'article. L'ordre de la
           galerie est celui publié par «data-a-dynamic-image» (JSON ordonné). */
        try {
            var gallerySelectors = ['#landingImage', '[data-a-image-name="landingImage"]', '#main-image-container img', '#mobile-image-block img', '#immersive-main img', '#imgTagWrapperId img', '#imageBlock img', '#altImages img'];
            for (var gs = 0; gs < gallerySelectors.length && out.images.length < LIMITS.images; gs++) {
                var galleryNodes = [];
                try {
                    galleryNodes = document.querySelectorAll(gallerySelectors[gs]);
                }
                catch (e) {
                    continue;
                }
                for (var gn = 0; gn < galleryNodes.length && out.images.length < LIMITS.images; gn++) {
                    var galleryImage = galleryNodes[gn];
                    var hires = galleryImage.getAttribute && galleryImage.getAttribute('data-old-hires');
                    var src = hires || (galleryImage.getAttribute && galleryImage.getAttribute('src'));
                    if (src && /^https?:\/\//i.test(String(src)))
                        pushUnique(out.images, src, LIMITS.images, 600);
                }
            }
            var dynamicNodes = [];
            try {
                dynamicNodes = document.querySelectorAll('[data-a-dynamic-image]');
            }
            catch (e) { }
            for (var dn = 0; dn < dynamicNodes.length && out.images.length < LIMITS.images; dn++) {
                var dynamicRaw = dynamicNodes[dn].getAttribute && dynamicNodes[dn].getAttribute('data-a-dynamic-image');
                if (!dynamicRaw)
                    continue;
                var dynamicMap = null;
                try {
                    dynamicMap = JSON.parse(dynamicRaw);
                }
                catch (e) {
                    continue;
                }
                for (var dynamicKey in dynamicMap) {
                    if (!Object.prototype.hasOwnProperty.call(dynamicMap, dynamicKey))
                        continue;
                    if (/^https?:\/\//i.test(dynamicKey))
                        pushUnique(out.images, dynamicKey, LIMITS.images, 600);
                    if (out.images.length >= LIMITS.images)
                        break;
                }
            }
        }
        catch (e) { }
    }
    try {
        var images = document.querySelectorAll('img[src^="http"]');
        for (var g = 0; g < images.length && out.images.length < LIMITS.images; g++) {
            var width = parseInt(images[g].getAttribute('width') || '0', 10);
            if (width && width < 200)
                continue;
            pushUnique(out.images, images[g].getAttribute('src'), LIMITS.images, 600);
        }
    }
    catch (e) { }
    if (AMAZON_STRICT) {
        try {
            out.amazon = collectAmazonEvidence();
        }
        catch (e) {
            out.amazon = { readerVersion: 2, pageAsin: AMAZON_ASIN || null, selectedAsin: null, selectedValues: [], options: [], variants: [] };
        }
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
        }
        catch (e) { }
        if (out.amazon && out.amazon.selectedValues) {
            for (var sv = 0; sv < out.amazon.selectedValues.length && out.selectedVariantTexts.length < LIMITS.selectedTexts; sv++) {
                pushUnique(out.selectedVariantTexts, out.amazon.selectedValues[sv], LIMITS.selectedTexts, LIMITS.label);
            }
        }
    }
    /* ── 9. Bornes finales + sortie JSON ────────────────────────────────────── */
    if (out.priceCandidates.length > LIMITS.priceCandidates)
        out.priceCandidates = out.priceCandidates.slice(0, LIMITS.priceCandidates);
    if (!out.title)
        out.title = null;
    if (!out.capturedAt)
        out.capturedAt = new Date().toISOString();
    try {
        return JSON.stringify(out);
    }
    catch (e) {
        return '{}';
    }
})();
`;
