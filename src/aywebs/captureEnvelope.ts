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

export function wrapAyWebsCaptureIntegration(
  reader: AyWebsCaptureReaderDefinition,
  domains: readonly string[],
  integrationExpression: string,
): string {
  const profile = JSON.stringify({
    storeId: reader.storeId,
    version: reader.version,
    priceMode: reader.priceMode,
    integration: reader.integration,
    domains,
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
    '  if (typeof raw !== "string" || !raw || raw.length > ' + AYWEBS_CAPTURE_ENVELOPE_STAMP_MAX_CHARS + ') return raw;',
    '  try {',
    '    var out = JSON.parse(raw);',
    '    if (!out || typeof out !== "object" || out.__aywebs_error) return raw;',
    '    out.contract = { v: ' + AYWEBS_CAPTURE_CONTRACT_VERSION + ', store: requested.storeId, readerVersion: requested.version, integration: requested.integration, matched: matches };',
    '    var stamped = JSON.stringify(out);',
    '    return stamped.length > ' + AYWEBS_CAPTURE_ENVELOPE_STAMP_MAX_CHARS + ' ? raw : stamped;',
    '  } catch (e) { return raw; }',
    '})()',
  ].join('\n');
}
