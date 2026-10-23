#!/usr/bin/env node
/**
 * AYWEBs — SONDE DE LISIBILITÉ PAR BOUTIQUE (23/10/2026).
 *
 * À quoi ça sert, en une phrase : répondre avec des CHIFFRES à la question
 * « un adaptateur par boutique, ou un adaptateur collectif ? ».
 *
 * Le serveur compte déjà, pour chaque domaine réellement capturé, combien de
 * captures ont été jugées / acceptées / refusées, et pourquoi
 * (`/api/v1/aywebs/health` → `webview_capture.stats.by_store`). Cette sonde lit
 * ces compteurs et rend un VERDICT par boutique, selon trois seuils :
 *
 *   • ≥ 90 % d'acceptation (≥ 3 captures) → le collectif suffit ;
 *   • 60–90 %                            → la page est lisible mais bruitée :
 *                                          un motif d'URL ou un sélecteur
 *                                          dédié peut suffire, pas une classe ;
 *   • < 60 %                             → la capture ne prouve rien sur cette
 *                                          boutique : adaptateur dédié, ou
 *                                          fermeture. On ne laisse pas ouvert.
 *
 * Utilisation :
 *   node scripts/aywebs-store-probe.mjs --base https://ayrovi-beta1.onrender.com
 *   node scripts/aywebs-store-probe.mjs --health /tmp/health.json      # hors ligne
 *   node scripts/aywebs-store-probe.mjs --min-samples 5 --json
 *
 * Options :
 *   --base          origine du site (défaut : AYROVI_BASE_URL, sinon localhost:3000)
 *   --health        fichier JSON déjà téléchargé (aucun réseau)
 *   --min-samples   captures minimum pour trancher (défaut 3)
 *   --threshold     taux d'acceptation jugé suffisant (défaut 0.9)
 *   --json          sortie machine (une ligne JSON)
 *
 * Code de sortie : 0 toujours, SAUF `--fail-under` fourni et une boutique
 * suffisamment mesurée passe sous ce seuil (utile en CI, jamais par défaut :
 * ces chiffres viennent du trafic réel, pas d'un test).
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);

function option(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
}

const base = option('base', process.env.AYROVI_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const healthFile = option('health', '');
const minSamples = Math.max(1, Number(option('min-samples', '3')) || 3);
const threshold = Math.min(1, Math.max(0.1, Number(option('threshold', '0.9')) || 0.9));
const failUnder = option('fail-under', '');
const asJson = args.includes('--json');

/** Libellés des raisons de refus : on lit un diagnostic, pas des codes. */
const REJECTION_LABELS = {
  NOT_AN_OBJECT: 'capture mal formée',
  BAD_VERSION: 'client trop ancien',
  TOO_LARGE: 'capture trop grosse',
  URL_HOST_MISMATCH: 'page d’un autre domaine',
  CANONICAL_HOST_MISMATCH: 'URL canonique d’un autre domaine',
  STALE_CAPTURE: 'capture trop vieille',
  FUTURE_CAPTURE: 'horloge du téléphone en avance',
  NO_PRICE_TEXT: 'aucun prix publié',
  PRICE_REJECTED: 'prix illisible',
  AMBIGUOUS_PRICE: 'deux prix qui se contredisent',
  PRICE_NOT_CORROBORATED: 'prix d’une seule source',
  OUT_OF_STOCK: 'rupture de stock',
  VARIANT_NOT_PROVEN: 'variante non prouvée',
};

function label(code) {
  return REJECTION_LABELS[code] || code;
}

async function readHealth() {
  if (healthFile) return JSON.parse(readFileSync(healthFile, 'utf8'));
  const response = await fetch(`${base}/api/v1/aywebs/health`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GET /health → HTTP ${response.status}`);
  return response.json();
}

/**
 * Verdict d'une boutique. Volontairement simple et explicite : trois issues,
 * aucune nuance cachée, et « à mesurer » quand on n'a pas assez de preuves.
 */
function verdictOf(bucket, samples) {
  const rate = bucket.acceptance_rate;
  if (samples < minSamples) return 'À MESURER';
  if (rate === null) return 'À MESURER';
  if (rate >= threshold) return 'COLLECTIF SUFFIT';
  if (rate >= 0.6) return 'MOTIF / SÉLECTEUR À REVOIR';
  return 'ADAPTATEUR DÉDIÉ OU FERMETURE';
}

function topRejection(bucket) {
  const entries = Object.entries(bucket.rejections || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';
  const [code, count] = entries[0];
  return `${label(code)} ×${count}`;
}

function worldOf(key) {
  if (key.startsWith('registre:')) return 'ouverte';
  if (key.startsWith('catalogue:')) return 'prévue';
  return 'hors cat.';
}

function nameOf(key) {
  const cut = key.indexOf(':');
  return cut >= 0 ? key.slice(cut + 1) : key;
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

function percent(rate) {
  return rate === null || rate === undefined ? '  —  ' : `${String(Math.round(rate * 100)).padStart(3)} %`;
}

const payload = await readHealth();
const stats = payload?.data?.webview_capture?.stats;
if (!stats || !stats.by_store) {
  console.error('Réponse /health inattendue : `data.webview_capture.stats.by_store` absent.');
  console.error('Le serveur déployé est-il à jour (vague 1 du catalogue, 23/10/2026) ?');
  process.exit(2);
}

const rows = Object.entries(stats.by_store)
  .map(([key, bucket]) => ({
    key,
    store: nameOf(key),
    world: worldOf(key),
    validated: bucket.validated || 0,
    accepted: bucket.accepted || 0,
    rejected: bucket.rejected || 0,
    rate: bucket.acceptance_rate,
    single_source: bucket.single_source || 0,
    variant_groups: bucket.variant_groups_seen || 0,
    reason: topRejection(bucket),
    verdict: verdictOf(bucket, bucket.validated || 0),
  }))
  .sort((a, b) => b.validated - a.validated || a.store.localeCompare(b.store));

if (asJson) {
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    thresholds: { min_samples: minSamples, accept: threshold },
    totals: { validated: stats.validated, accepted: stats.accepted, rejected: stats.rejected },
    stores: rows,
  }));
} else {
  console.log(`\nAYWEBs — lisibilité par boutique  (seuils : ≥ ${minSamples} captures, ≥ ${Math.round(threshold * 100)} % d’acceptation)\n`);
  const header = `${pad('boutique', 16)}${pad('monde', 11)}${pad('jugées', 8)}${pad('ok', 5)}${pad('taux', 7)}${pad('1 src', 7)}${pad('var.', 6)}verdict`;
  console.log(header);
  console.log('─'.repeat(header.length));
  for (const row of rows) {
    console.log(
      pad(row.store, 16) + pad(row.world, 11) + pad(row.validated, 8) + pad(row.accepted, 5)
      + pad(percent(row.rate), 7) + pad(row.single_source, 7) + pad(row.variant_groups, 6) + row.verdict,
    );
    if (row.reason && row.rejected) console.log(`${' '.repeat(16)}↳ refus principal : ${row.reason}`);
  }
  console.log(`\nGlobal : ${stats.accepted}/${stats.validated} captures acceptées (${stats.validated ? Math.round((stats.accepted / stats.validated) * 100) : 0} %).`);
  const decided = rows.filter((row) => row.verdict !== 'À MESURER');
  const collective = decided.filter((row) => row.verdict === 'COLLECTIF SUFFIT').length;
  if (decided.length) {
    console.log(`Verdict : ${collective}/${decided.length} boutiques mesurées passent le seuil avec l’adaptateur COLLECTIF seul.`);
    if (collective === decided.length) {
      console.log('→ Aucune classe dédiée n’est justifiée par les chiffres : continuer par vagues, en données.');
    } else {
      console.log('→ Les boutiques sous le seuil ci-dessus justifient un travail ciblé (motif, sélecteur ou classe).');
    }
  } else {
    console.log('Aucune boutique n’a encore assez de captures : rien à trancher (c’est une mesure, pas un avis).');
  }
  console.log('');
}

if (failUnder) {
  const floor = Number(failUnder);
  const offenders = rows.filter((row) => row.validated >= minSamples && row.rate !== null && row.rate < floor);
  if (offenders.length) {
    console.error(`Sous le plancher ${Math.round(floor * 100)} % : ${offenders.map((row) => row.store).join(', ')}`);
    process.exit(1);
  }
}
