#!/usr/bin/env node
/**
 * AYROVI — capture du SQL RÉEL exécuté par chaque endpoint du mélange de charge
 * (audit d'architecture 12/11/2026). Charge le serveur construit (`npm run build:server`)
 * sur une COPIE de base, instrumente better-sqlite3, appelle chaque endpoint de
 * `scripts/load-test.mjs` + la transaction d'une vue de Reel, et écrit pour chacun
 * la liste exacte des requêtes (SQL, paramètres, durée).
 *
 *   node scripts/sql-capture.cjs --db /chemin/copie.sqlite --out sql-capture.json [--port 3901]
 *
 * ⚠ La vue enregistrée est une VRAIE écriture : utiliser une copie, jamais la production.
 * Le fichier produit alimente `scripts/pg-capacity-bench.mjs`.
 */
const path = require('node:path');
const fs = require('node:fs');
const REPO = path.resolve(__dirname, '..');
const argOf = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const DB = path.resolve(argOf('db', ''));
const OUT = path.resolve(argOf('out', 'sql-capture.json'));
const PORT = argOf('port', '3901');
if (!argOf('db', '')) { console.error('--db requis (copie de base : la capture écrit une vue).'); process.exit(2); }
const Database = require(path.join(REPO, 'node_modules/better-sqlite3'));
const probe = new Database(':memory:');
const proto = Object.getPrototypeOf(probe.prepare('select 1'));
let log = null;
for (const m of ['get', 'all', 'run', 'iterate']) {
  const orig = proto[m];
  proto[m] = function (...args) {
    if (!log) return orig.apply(this, args);
    const t = process.hrtime.bigint();
    const r = orig.apply(this, args);
    log.push({ m, sql: this.source, params: args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] : args.flat(), ms: Number(process.hrtime.bigint() - t) / 1e6, rows: m === 'all' ? r.length : (r ? 1 : 0) });
    return r;
  };
}
process.chdir(REPO);
Object.assign(process.env, { DATABASE_PATH: DB, PORT, FX_RATES_ENABLED: 'false', AYROVI_LENS_LIVE_STOCK: 'false', AYROVI_BACKGROUND_JOBS: 'off', AYROVI_CACHE_ROOT: process.env.AYROVI_CACHE_ROOT || path.join(require('node:os').tmpdir(), 'ayrovi-capture-cache') });
require(path.join(REPO, 'dist/server.js'));
const base = `http://127.0.0.1:${PORT}`;
(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/ready')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  const reels = await (await fetch(base + '/api/public/social/reels?limit=12')).json();
  const reelIds = reels.data.items.map(r => r.id);
  const prods = await (await fetch(base + '/api/public/products?limit=24')).json();
  const rows = Array.isArray(prods.data) ? prods.data : (prods.data.items || prods.data.products);
  const productIds = rows.map(r => r.id).slice(0, 2);
  const endpoints = {
    reels: ['/api/public/social/reels?limit=12', 5],
    products: ['/api/public/products?limit=24', 4],
    counts: ['/api/public/social/counts?ids=' + encodeURIComponent(reelIds.join(',')), 3],
    commerceConfig: ['/api/public/commerce-config', 2],
    stories: ['/api/public/stories', 2],
    navigation: ['/api/public/navigation', 1],
    product: ['/api/public/products/' + encodeURIComponent(productIds[0]), 2],
    ready: ['/api/ready', 1],
  };
  const out = { reelIds, productIds, endpoints: {} };
  for (const [name, [url, weight]] of Object.entries(endpoints)) {
    await fetch(base + url); // chauffe (caches mémoire éventuels)
    log = [];
    const t = Date.now();
    const res = await fetch(base + url); await res.arrayBuffer();
    const queries = log; log = null;
    out.endpoints[name] = { url, weight, status: res.status, httpMs: Date.now() - t, queries };
    console.log(name.padEnd(15), 'status', res.status, 'queries', queries.length, 'sqliteMs', queries.reduce((a, q) => a + q.ms, 0).toFixed(2));
  }
  // Écriture représentative : une vue de Reel (la mutation la plus fréquente), route réelle de l'app.
  log = [];
  const v = await fetch(base + '/api/public/social/interact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-session-id': 'sess_capture_' + Date.now() }, body: JSON.stringify({ type: 'view', targetId: reelIds[3] }) });
  const vq = log; log = null;
  out.endpoints.view = { url: 'POST view', weight: 0, status: v.status, queries: vq, body: (await v.text()).slice(0, 200) };
  console.log('view'.padEnd(15), 'status', v.status, 'queries', vq.length, out.endpoints.view.body.slice(0, 120));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('→', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
