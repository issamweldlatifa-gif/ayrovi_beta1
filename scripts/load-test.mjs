#!/usr/bin/env node
/**
 * AYROVI — test de charge par paliers (audit d'architecture du 12/11/2026).
 *
 *   npm run loadtest -- --url https://staging.example.tn --stages 100,500,1000 --duration 30
 *
 * ── Ce que mesure ce script ──────────────────────────────────────────────────
 * Chaque palier ouvre N connexions simultanées qui rejouent, SANS temps de
 * réflexion, le mélange de lectures que fait réellement l'application mobile
 * (fil Reels paginé, catalogue, compteurs sociaux, stories, configuration…).
 * C'est donc un test de SATURATION : il donne le débit maximal soutenable
 * (req/s) et la latence à ce débit. Le nombre d'UTILISATEURS ACTIFS qu'un
 * serveur supporte s'en déduit (loi de Little) :
 *
 *     utilisateurs simultanés ≈ débit soutenable × secondes entre deux requêtes
 *
 * Un utilisateur mobile actif émet ~1 requête API toutes les 5 à 10 s (les
 * vidéos et images partent vers le CDN, pas vers l'API). Le rapport affiche
 * l'estimation avec 6 s par défaut (`--think 6`).
 *
 * ── Garde-fous ──────────────────────────────────────────────────────────────
 *  • LECTURES PUBLIQUES UNIQUEMENT : aucun compte, aucune commande, aucun SMS.
 *    On peut le lancer contre la préproduction sans rien polluer.
 *  • Ne JAMAIS viser la production aux paliers 5 000 / 10 000 : un seul poste
 *    ne génère pas une charge réaliste à ce niveau (limite de descripteurs et
 *    de CPU du générateur). Utiliser plusieurs générateurs contre la préprod.
 *  • Les limiteurs de débit sont par IP : depuis une seule machine, les routes
 *    limitées (média, mutations) renverraient 429. Le mélange les évite.
 *  • `--max-p99` (ms) arrête la montée dès qu'un palier dépasse la latence
 *    cible : inutile d'écraser un serveur déjà saturé.
 */
import autocannon from 'autocannon';
import fs from 'node:fs';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = String(arg('url', 'http://127.0.0.1:3000')).replace(/\/+$/, '');
const stages = String(arg('stages', '100,500,1000,5000,10000')).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
const duration = Number(arg('duration', '20'));
const think = Number(arg('think', '6'));
const maxP99 = Number(arg('max-p99', '2000'));
const out = arg('out', '');

/** Identifiants réels pris sur le serveur visé (aucun identifiant inventé). */
async function discover() {
  const get = async (path) => {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    return response.json();
  };
  const reels = await get('/api/public/social/reels?limit=12');
  const reelIds = (reels?.data?.items || []).map((row) => row.id).filter(Boolean);
  const products = await get('/api/public/products?limit=24');
  const productRows = Array.isArray(products?.data) ? products.data : (products?.data?.items || products?.data?.products || []);
  const productIds = productRows.map((row) => row.id).filter(Boolean).slice(0, 12);
  return { reelIds, productIds };
}

/**
 * Mélange pondéré (20 requêtes par cycle), calé sur les appels de
 * `apps/mobile/src/api` : ouvrir l'app, faire défiler les Reels, ouvrir un
 * produit. Les pondérations sont des hypothèses DOCUMENTÉES, à recaler sur les
 * journaux d'accès réels dès que la mesure de production existe.
 */
function requestMix({ reelIds, productIds }) {
  const counts = `/api/public/social/counts?ids=${encodeURIComponent(reelIds.join(','))}`;
  const product = (i) => productIds.length ? `/api/public/products/${encodeURIComponent(productIds[i % productIds.length])}` : '/api/public/products?limit=24';
  const weighted = [
    ['/api/public/social/reels?limit=12', 5],
    ['/api/public/products?limit=24', 4],
    [counts, 3],
    ['/api/public/commerce-config', 2],
    ['/api/public/stories', 2],
    ['/api/public/navigation', 1],
    [product(0), 1],
    [product(1), 1],
    ['/api/ready', 1],
  ];
  const cycle = [];
  for (const [path, weight] of weighted) for (let i = 0; i < weight; i++) cycle.push(path);
  // Ordre déterministe mais entrelacé : pas 5 fois la même route d'affilée.
  return cycle.map((path, i) => ({ path, key: (i * 7) % cycle.length }))
    .sort((a, b) => a.key - b.key)
    .map(({ path }) => ({ method: 'GET', path }));
}

function runStage(connections, requests) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: baseUrl,
      connections,
      duration,
      requests,
      timeout: 10,
      headers: { accept: 'application/json', 'user-agent': 'ayrovi-loadtest/1' },
    }, (error, result) => (error ? reject(error) : resolve(result)));
    process.once('SIGINT', () => instance.stop());
  });
}

const summary = [];
const ids = await discover();
const requests = requestMix(ids);
console.log(`AYROVI load test → ${baseUrl}`);
console.log(`mix: ${requests.length} requêtes/cycle · ${ids.reelIds.length} reels · ${ids.productIds.length} produits · ${duration}s par palier\n`);

for (const connections of stages) {
  const result = await runStage(connections, requests);
  const total = result.requests.total || 0;
  const errors = (result.errors || 0) + (result.timeouts || 0);
  const non2xx = result.non2xx || 0;
  const row = {
    connections,
    rps: Math.round(result.requests.average),
    p50: result.latency.p50,
    p90: result.latency.p90,
    p99: result.latency.p99,
    max: result.latency.max,
    errors,
    non2xx,
    errorRate: total ? +(((errors + non2xx) / total) * 100).toFixed(2) : 0,
    usersAtThink: Math.round(result.requests.average * think),
  };
  summary.push(row);
  console.log(`${String(connections).padStart(6)} conn · ${String(row.rps).padStart(6)} req/s · p50 ${row.p50} ms · p90 ${row.p90} ms · p99 ${row.p99} ms · erreurs ${row.errorRate}% · ≈ ${row.usersAtThink} utilisateurs actifs (1 req/${think}s)`);
  if (row.p99 > maxP99 || row.errorRate > 1) {
    console.log(`\n→ arrêt : p99 > ${maxP99} ms ou erreurs > 1 % — capacité atteinte au palier précédent.`);
    break;
  }
}

if (out) fs.writeFileSync(out, `${JSON.stringify({ baseUrl, duration, think, at: new Date().toISOString(), summary }, null, 2)}\n`);
