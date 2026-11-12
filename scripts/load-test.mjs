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
 * ── Mode « utilisateurs simultanés » (`--mode users`) ─────────────────────────
 * Chaque utilisateur virtuel = UNE connexion à lui (son téléphone) qui envoie
 * une requête du mélange, « réfléchit » `--think` s en moyenne (tirage
 * uniforme 0,5×–1,5×), puis recommence. Les départs sont étalés sur `--ramp` s,
 * puis la mesure dure `--duration` s. C'est le test qui répond à la question
 * « 100 / 500 / 1 000 / 5 000 / 10 000 utilisateurs en même temps » :
 *
 *   npm run loadtest -- --mode users --stages 100,500,1000,5000,10000 --think 6 --duration 45
 *
 * Verdict par palier = grille de src/services/opsMetrics.ts (p95 ≤ 800 ms,
 * erreurs ≤ 1 %). Le générateur surveille sa PROPRE boucle d'événements : si
 * elle décroche (> 100 ms), le palier est marqué « générateur saturé » (mesure
 * non fiable — il faut plusieurs générateurs). `--ops-token` lit l'état du
 * serveur (CPU, mémoire, boucle) sur /api/ops/metrics à la fin de chaque palier.
 * Il faut des descripteurs de fichiers : `ulimit -n 65535` des deux côtés.
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
import http from 'node:http';
import https from 'node:https';
import { monitorEventLoopDelay } from 'node:perf_hooks';

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
const mode = String(arg('mode', 'saturation'));
const ramp = Number(arg('ramp', String(think)));
const opsToken = String(arg('ops-token', process.env.OPS_METRICS_TOKEN || ''));
const P95_LIMIT_MS = 800; // = OPS_THRESHOLDS.p95Ms
const ERROR_LIMIT_PERCENT = 1; // = OPS_THRESHOLDS.errorRatePercent

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

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

/** État du serveur (format Prometheus de /api/ops/metrics, fenêtre 1 min). */
async function serverMetrics() {
  if (!opsToken) return null;
  try {
    const response = await fetch(`${baseUrl}/api/ops/metrics`, { headers: { authorization: `Bearer ${opsToken}` } });
    if (!response.ok) return null;
    const values = {};
    for (const line of (await response.text()).split('\n')) {
      const match = line.match(/^(ayrovi_[a-z0-9_]+) (-?[\d.]+)$/);
      if (match) values[match[1]] = Number(match[2]);
    }
    return { cpuPercent: values.ayrovi_cpu_percent, rssMb: values.ayrovi_rss_mb, eventLoopP99Ms: values.ayrovi_event_loop_p99_ms, serverRps: values.ayrovi_requests_per_second };
  } catch { return null; }
}

/** Palier « N utilisateurs simultanés » : N connexions, temps de réflexion, mesure après la montée. */
async function runUsersStage(users, requests) {
  const target = new URL(baseUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const thinkMs = think * 1000;
  const startedAt = Date.now();
  const measureFrom = startedAt + ramp * 1000;
  const measureTo = measureFrom + duration * 1000;
  const latencies = [];
  const outcome = { ok: 0, non2xx: 0, network: 0, timeouts: 0 };
  const loop = monitorEventLoopDelay({ resolution: 20 });
  const cpuBefore = process.cpuUsage();
  const loopTimer = setTimeout(() => loop.enable(), ramp * 1000); // la montée (tous les départs) n'est pas jugée
  // État serveur relevé PENDANT la charge (1 s avant la fin de la mesure), pas après la décrue.
  const serverDuringLoad = new Promise((resolve) => setTimeout(() => serverMetrics().then(resolve), Math.max(0, measureTo - Date.now() - 1000)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = (agent, path) => new Promise((resolve) => {
    const began = performance.now();
    const req = transport.request({ host: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path, method: 'GET', agent,
      headers: { accept: 'application/json', 'user-agent': 'ayrovi-loadtest-users/1' }, timeout: 10_000 }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: performance.now() - began }));
      res.on('error', () => resolve({ error: 'network', ms: performance.now() - began }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (error) => resolve({ error: error.message === 'timeout' ? 'timeout' : 'network', ms: performance.now() - began }));
    req.end();
  });
  const user = async (index) => {
    const agent = new transport.Agent({ keepAlive: true, maxSockets: 1 }); // une connexion par utilisateur
    await sleep(Math.random() * ramp * 1000);
    let step = index;
    while (Date.now() < measureTo) {
      const sentAt = Date.now();
      const result = await send(agent, requests[step++ % requests.length].path);
      if (sentAt >= measureFrom && sentAt < measureTo) {
        if (result.error === 'timeout') outcome.timeouts++;
        else if (result.error) outcome.network++;
        else if (result.status >= 200 && result.status < 400) { outcome.ok++; latencies.push(result.ms); }
        else { outcome.non2xx++; latencies.push(result.ms); }
      }
      await sleep(thinkMs * (0.5 + Math.random()));
    }
    agent.destroy();
  };
  await Promise.all(Array.from({ length: users }, (_, i) => user(i)));
  clearTimeout(loopTimer);
  loop.disable();
  const cpu = process.cpuUsage(cpuBefore);
  const server = await serverDuringLoad;
  latencies.sort((a, b) => a - b);
  const total = outcome.ok + outcome.non2xx + outcome.network + outcome.timeouts;
  const errorRate = total ? +(((outcome.non2xx + outcome.network + outcome.timeouts) / total) * 100).toFixed(2) : 0;
  const generatorLagP99 = Math.round(loop.percentile(99) / 1e6);
  const row = {
    users,
    targetRps: Math.round(users / think),
    rps: Math.round(total / duration),
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    ...outcome,
    errorRate,
    generatorLagP99Ms: generatorLagP99,
    generatorCpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / (Date.now() - startedAt)) * 100),
    server,
  };
  row.verdict = generatorLagP99 > 100 ? 'générateur saturé (mesure non fiable)'
    : (row.p95 <= P95_LIMIT_MS && errorRate <= ERROR_LIMIT_PERCENT ? 'OK' : 'SATURÉ');
  return row;
}

const summary = [];
const ids = await discover();
const requests = requestMix(ids);
console.log(`AYROVI load test → ${baseUrl}`);
console.log(`mix: ${requests.length} requêtes/cycle · ${ids.reelIds.length} reels · ${ids.productIds.length} produits · ${duration}s par palier\n`);

if (mode === 'users') {
  console.log(`mode utilisateurs simultanés · réflexion ${think}s (0,5×–1,5×) · montée ${ramp}s · mesure ${duration}s · verdict p95 ≤ ${P95_LIMIT_MS} ms et erreurs ≤ ${ERROR_LIMIT_PERCENT} %\n`);
  for (const users of stages) {
    const row = await runUsersStage(users, requests);
    summary.push(row);
    const srv = row.server ? ` · serveur CPU ${row.server.cpuPercent}% RSS ${row.server.rssMb} Mo boucle p99 ${row.server.eventLoopP99Ms} ms` : '';
    console.log(`${String(users).padStart(6)} utilisateurs · cible ${String(row.targetRps).padStart(5)} req/s · obtenu ${String(row.rps).padStart(5)} req/s · p50 ${row.p50} ms · p95 ${row.p95} ms · p99 ${row.p99} ms · erreurs ${row.errorRate}% (non-2xx ${row.non2xx}, réseau ${row.network}, délais ${row.timeouts})${srv} · générateur CPU ${row.generatorCpuPercent}% boucle ${row.generatorLagP99Ms} ms → ${row.verdict}`);
  }
  if (out) fs.writeFileSync(out, `${JSON.stringify({ baseUrl, mode, think, ramp, duration, at: new Date().toISOString(), summary }, null, 2)}\n`);
  process.exit(0);
}

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
