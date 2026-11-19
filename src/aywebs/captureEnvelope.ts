/**
 * AYWEBs — ENVELOPPE UNIQUE DES LECTEURS DE CAPTURE (12/11/2026).
 *
 * Avant : trois chemins de service différents (Amazon autonome, Zalando
 * autonome, profils injectés autour du cœur partagé) et le cœur nu pour les 12
 * autres boutiques. Maintenant chaque boutique enregistrée reçoit le MÊME
 * emballage, seule l'intégration interne change :
 *
 *   1. profil `{storeId, version, priceMode, integration, domains}` publié dans
 *      `window.__AYWEBS_CAPTURE_READER__` UNIQUEMENT si l'hôte courant est un
 *      domaine de la boutique (sinon `null` : le cœur retombe en générique) ;
 *   2. exécution de l'intégration (script dédié OU cœur partagé) ;
 *   3. restauration du global, même en cas d'exception ;
 *   4. tampon `contract` ajouté à la sortie JSON (version d'enveloppe, boutique,
 *      intégration, domaine reconnu) — lu par le serveur en notes de diagnostic,
 *      jamais utilisé pour décider d'un prix.
 *
 * Règles du cœur respectées : ES5, aucun backtick, aucune exception qui
 * remonte de l'étape 4, sortie bornée (pas de tampon si on frôle la limite).
 */
import type { AyWebsCaptureReaderDefinition } from './captureReaders/contract';
import { AYWEBS_CAPTURE_CONTRACT_VERSION } from './captureReaders/contract';

/** Au-delà, on n'ajoute pas le tampon : la limite de 64 000 du pont reste sûre. */
export const AYWEBS_CAPTURE_ENVELOPE_STAMP_MAX_CHARS = 63_000;

/**
 * Mode `selection` (19/11/2026) — « le client choisit, AYWEBs capte » :
 *   • le profil publié porte `mode: 'selection'` : les lecteurs sautent la
 *     matrice des combinaisons ;
 *   • la sortie est RÉDUITE au choix affiché : plus de `variantMatrix`, plus de
 *     SKU AliExpress, plus de prix/stock des valeurs non choisies ;
 *   • la QUANTITÉ affichée par le sélecteur du marchand est lue (`pageQuantity`) ;
 *   • DEUX LECTURES : la signature (prix + choix + identifiant) de chaque lecture
 *     est gardée 8 s dans la page ; la lecture suivante dit si elle concorde
 *     (`selection.stable`). Le client relit une fois ~400 ms après la première.
 */
export interface AyWebsCaptureEnvelopeOptions {
  mode?: 'selection' | 'matrix';
}

/** Durée pendant laquelle une première lecture sert de référence à la seconde. */
export const AYWEBS_SELECTION_DOUBLE_READ_WINDOW_MS = 8_000;

/* Code ES5 exécuté dans la page APRÈS la lecture, sur l'objet `out` (mode sélection). */
const SELECTION_REDUCER = [
  '    if (requested.mode === "selection") {',
  '      out.captureMode = "selection";',
  '      out.variantMatrix = [];',
  '      if (out.aliexpress && out.aliexpress.skus) out.aliexpress.skus = [];',
  '      var groups = out.variantGroups || [];',
  '      for (var g = 0; g < groups.length; g++) {',
  '        var sel = (groups[g].selected && groups[g].selected[0]) ? String(groups[g].selected[0]).toLowerCase() : null;',
  '        var opts = groups[g].options || [];',
  '        for (var o = 0; o < opts.length; o++) {',
  '          if (!opts[o] || (sel && String(opts[o].value || "").toLowerCase() === sel)) continue;',
  '          delete opts[o].price; delete opts[o].stock; delete opts[o].priceFrom;',
  '        }',
  '      }',
  '      var qty = null;',
  '      try {',
  '        var qsel = ["select#quantity", "select[name=quantity]", "#mobileQuantityDropDown", "select[name=qty]", "input[name=quantity]", "input#quantity", "input[name=qty]", "[data-testid*=quantity] input", "[class*=quantity] input", "[class*=Quantity] input", "[class*=input-number] input", "input[aria-label*=uantit]", "input[aria-label*=Qty]"];',
  '        for (var q = 0; q < qsel.length && qty === null; q++) {',
  '          var qe = document.querySelector(qsel[q]);',
  '          if (!qe) continue;',
  '          var qv = parseInt(String(qe.value || qe.getAttribute("value") || qe.textContent || "").replace(/[^0-9]/g, ""), 10);',
  '          if (qv >= 1 && qv <= 99) qty = qv;',
  '        }',
  '      } catch (e) {}',
  '      out.pageQuantity = qty;',
  '      var vid = (out.amazon && (out.amazon.selectedAsin || out.amazon.pageAsin)) || (out.aliexpress && out.aliexpress.selectedSkuId) || (out.temu && out.temu.selectedSkuId) || (out.shein && (out.shein.skuId || out.shein.pageGoodsId)) || null;',
  '      if (!vid) { var vm = String(loc.search || "").match(/[?&](?:sku_id|skuId|th_sku|variant|variantId)=([A-Za-z0-9:_-]{3,48})(?:&|$)/); if (vm) vid = vm[1]; }',
  '      var picked = [];',
  '      for (var p = 0; p < groups.length; p++) picked.push(String(groups[p].name || "") + "=" + String((groups[p].selected && groups[p].selected[0]) || ""));',
  '      var firstPrice = (out.priceCandidates && out.priceCandidates[0] && out.priceCandidates[0].text) || "";',
  '      var signature = [String(loc.pathname || ""), String(vid || ""), firstPrice, picked.join("|"), (out.selectedVariantTexts || []).join("|")].join("#");',
  '      var memoKey = "__AYWEBS_SELECTION_LAST__";',
  '      var prior = w[memoKey];',
  '      var now = new Date().getTime();',
  '      var proof = { reads: 1, variantId: vid ? String(vid).slice(0, 48) : null };',
  '      if (prior && prior.at && now - prior.at <= ' + AYWEBS_SELECTION_DOUBLE_READ_WINDOW_MS + ' && prior.path === String(loc.pathname || "")) {',
  '        proof.reads = 2;',
  '        proof.stable = prior.signature === signature;',
  '      }',
  '      try { w[memoKey] = { at: now, signature: signature, path: String(loc.pathname || "") }; } catch (e) {}',
  '      out.selection = proof;',
  '    }',
].join('\n');

export function wrapAyWebsCaptureIntegration(
  reader: AyWebsCaptureReaderDefinition,
  domains: readonly string[],
  integrationExpression: string,
  options: AyWebsCaptureEnvelopeOptions = {},
): string {
  const selection = options.mode === 'selection';
  const profile = JSON.stringify({
    storeId: reader.storeId,
    version: reader.version,
    priceMode: reader.priceMode,
    integration: reader.integration,
    domains,
    ...(selection ? { mode: 'selection' } : {}),
  });
  const expression = integrationExpression.trim().replace(/[\s;]+$/, '');
  return [
    '(function () {',
    '  var w = (typeof window !== "undefined" && window) || (typeof document !== "undefined" && document && document.defaultView) || {};',
    '  var loc = (typeof location !== "undefined" && location) || w.location || {};',
    '  var key = "__AYWEBS_CAPTURE_READER__";',
    '  var previous = w[key];',
    '  var requested = ' + profile + ';',
    '  var host = String(loc.hostname || "").toLowerCase().replace(/^(?:www\\d*|m\\d*|mobile|wap|touch|smile)\\./, "");',
    '  var matches = false;',
    '  for (var i = 0; i < requested.domains.length; i++) {',
    '    var domain = String(requested.domains[i] || "").toLowerCase();',
    '    if (host === domain || host.slice(-(domain.length + 1)) === "." + domain) { matches = true; break; }',
    '  }',
    '  w[key] = matches ? requested : null;',
    '  var raw;',
    '  try { raw = (' + expression + '); }',
    '  finally { if (previous === undefined) { try { delete w[key]; } catch (e) { w[key] = null; } } else { w[key] = previous; } }',
    '  if (typeof raw !== "string" || !raw || raw.length > ' + (selection ? 400_000 : AYWEBS_CAPTURE_ENVELOPE_STAMP_MAX_CHARS) + ') return raw;',
    '  try {',
    '    var out = JSON.parse(raw);',
    '    if (!out || typeof out !== "object" || out.__aywebs_error) return raw;',
    ...(selection ? [SELECTION_REDUCER] : []),
    '    out.contract = { v: ' + AYWEBS_CAPTURE_CONTRACT_VERSION + ', store: requested.storeId, readerVersion: requested.version, integration: requested.integration, matched: matches' + (selection ? ', mode: "selection"' : '') + ' };',
    '    var stamped = JSON.stringify(out);',
    /* Mode sélection : la sortie réduite est TOUJOURS préférée à la brute (qui porterait la matrice). */
    selection ? '    return stamped;' : '    return stamped.length > ' + AYWEBS_CAPTURE_ENVELOPE_STAMP_MAX_CHARS + ' ? raw : stamped;',
    '  } catch (e) { return raw; }',
    '})()',
  ].join('\n');
}
