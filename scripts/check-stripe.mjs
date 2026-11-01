#!/usr/bin/env node
/**
 * check-stripe.mjs — vérifie la configuration Stripe AVANT de déployer.
 *
 * Pourquoi ce script : les erreurs de configuration Stripe ne se voient pas à
 * l'écran. Une clé absente donne `card_gateway_available: false` (bouton carte
 * simplement grisé), et un webhook au mauvais secret donne des 400 silencieux
 * côté Stripe — les paiements passent, mais l'état de la commande ne se met
 * jamais à jour tout seul. On vérifie donc ici, hors application :
 *
 *   1. présence et forme des variables (`sk_...`, `whsec_...`, URL https) ;
 *   2. validité RÉELLE de la clé secrète auprès de Stripe (appel réseau) ;
 *   3. cohérence test/live entre la clé et le secret webhook ;
 *   4. l'URL webhook exacte à enregistrer dans le Dashboard.
 *
 * Usage :
 *   node scripts/check-stripe.mjs                  # lit .env puis process.env
 *   node scripts/check-stripe.mjs --no-network     # sans appel à Stripe (CI)
 *
 * Aucune valeur secrète n'est jamais affichée : seulement des empreintes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const NO_NETWORK = process.argv.includes('--no-network');

/** Lecture minimale d'un .env (sans dépendance : le script doit tourner partout). */
function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return { loaded: false, file };
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    // Les variables déjà présentes dans l'environnement (Render) gagnent.
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return { loaded: true, file };
}

/** Empreinte courte : permet de comparer deux clés sans jamais les afficher. */
const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 8);

const problems = [];
const warnings = [];
const ok = [];

function fail(message) { problems.push(message); }
function warn(message) { warnings.push(message); }
function pass(message) { ok.push(message); }

const { loaded, file } = loadDotEnv();

// ---------- 1. Présence et forme ----------
const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const currency = String(process.env.STRIPE_CURRENCY || 'eur').trim().toLowerCase();
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');

// La clé publiable (pk_) est l'erreur la plus fréquente : elle est sur la même
// page que la secrète, et Stripe répond 401 sans dire pourquoi. On la nomme.
if (!secretKey) fail('STRIPE_SECRET_KEY est vide → cardGatewayAvailable() restera false.');
else if (/^pk_/.test(secretKey)) fail('STRIPE_SECRET_KEY contient une clé PUBLIABLE (pk_). Il faut la clé SECRÈTE (sk_test_… / sk_live_…).');
else if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+/.test(secretKey)) fail('STRIPE_SECRET_KEY ne ressemble pas à une clé Stripe (sk_test_… / sk_live_…).');
else pass(`STRIPE_SECRET_KEY présente (…${fingerprint(secretKey)}).`);

if (!webhookSecret) warn('STRIPE_WEBHOOK_SECRET est vide → le webhook signé sera refusé (le client devra vérifier manuellement).');
else if (!webhookSecret.startsWith('whsec_')) fail('STRIPE_WEBHOOK_SECRET doit commencer par whsec_.');
else pass(`STRIPE_WEBHOOK_SECRET présente (…${fingerprint(webhookSecret)}).`);

if (!publicBaseUrl) fail('PUBLIC_BASE_URL est vide → les URL de retour Checkout seraient invalides.');
else if (!publicBaseUrl.startsWith('https://')) fail(`PUBLIC_BASE_URL doit être en https (actuel : ${publicBaseUrl}).`);
else if (/\/api|\?|#/.test(publicBaseUrl)) fail('PUBLIC_BASE_URL doit être une origine nue, sans chemin ni query.');
else pass(`PUBLIC_BASE_URL = ${publicBaseUrl}`);

// Cohérence test / live : une clé de test avec un webhook live ne recevra rien.
const keyMode = secretKey.match(/^(?:sk|rk)_(test|live)_/)?.[1];
if (keyMode && webhookSecret) {
  const dashboardHint = keyMode === 'test' ? 'Mode test' : 'Mode production';
  pass(`Mode attendu dans le Dashboard Stripe : ${dashboardHint}.`);
  warn(`Vérifie que le webhook a été créé dans ce même mode (${keyMode}) : le secret whsec_ est propre à chaque mode.`);
}

// Devises sans décimales (aucune ne concerne la Tunisie, mais l'erreur est silencieuse).
const ZERO_DECIMAL = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);
if (ZERO_DECIMAL.has(currency)) warn(`STRIPE_CURRENCY=${currency} est sans décimales : le montant TND sera arrondi à l'unité.`);
if (currency === 'tnd') fail('TND n’est pas supportée par Stripe : choisis une devise (eur par défaut).');

// ---------- 2. Validité réelle de la clé ----------
async function checkKeyWithStripe() {
  if (!secretKey || NO_NETWORK) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.stripe.com/v1/balance', {
      headers: { authorization: `Bearer ${secretKey}` },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      const available = Array.isArray(body?.available) ? body.available : [];
      pass(`Clé acceptée par Stripe (solde ${available.length} devise(s) disponible(s)).`);
      return;
    }
    if (response.status === 401) fail('Stripe refuse la clé (401) : clé révoquée, mal copiée, ou d’un autre compte.');
    else if (response.status === 403) fail('Stripe refuse la clé (403) : droits insuffisants sur ce compte.');
    else fail(`Stripe a répondu ${response.status}${body?.error?.message ? ` — ${body.error.message}` : ''}.`);
  } catch (error) {
    warn(`Impossible de joindre Stripe (${error?.name === 'AbortError' ? 'timeout' : error?.message || error}) : vérification réseau ignorée.`);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- 3. Rapport ----------
await checkKeyWithStripe();

const webhookPath = '/api/customer/payments/stripe/webhook';
const webhookUrl = publicBaseUrl ? `${publicBaseUrl}${webhookPath}` : `https://<ton-domaine>${webhookPath}`;

console.log('\n=== Configuration Stripe — ZAYROVI ===\n');
if (loaded) console.log(`Source : ${file}`);
else console.log('Source : variables d’environnement (aucun .env trouvé)');

console.log('\nPour la carte bancaire, nous facturons le montant TND dans cette devise :');
if (currency === 'tnd') {
  console.log('  STRIPE_CURRENCY=tnd   → INVALIDE : Stripe ne traite pas le dinar tunisien.');
} else {
  console.log(`  STRIPE_CURRENCY=${currency}   → 118.000 TND = ${(118).toFixed(2)} ${currency.toUpperCase()} (équivalence numérique 1:1)`);
}

if (ok.length) {
  console.log('\n✔ OK');
  for (const line of ok) console.log(`  • ${line}`);
}
if (warnings.length) {
  console.log('\n! À vérifier');
  for (const line of warnings) console.log(`  • ${line}`);
}
if (problems.length) {
  console.log('\n✘ Bloquant');
  for (const line of problems) console.log(`  • ${line}`);
}

console.log('\n--- Webhook à enregistrer dans le Dashboard Stripe ---');
console.log(`  URL     : ${webhookUrl}`);
console.log('  Événements : checkout.session.completed · checkout.session.expired');
console.log('  Puis copier le « Secret de signature » (whsec_…) dans STRIPE_WEBHOOK_SECRET.\n');

if (problems.length) {
  console.log(`Résultat : ${problems.length} problème(s) bloquant(s) — la carte restera indisponible.\n`);
  process.exitCode = 1;
} else {
  console.log(warnings.length
    ? 'Résultat : configuration utilisable, mais relis les points « À vérifier ».\n'
    : 'Résultat : configuration prête. ✅\n');
}
